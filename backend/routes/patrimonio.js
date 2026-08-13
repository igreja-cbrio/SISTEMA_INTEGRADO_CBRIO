const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { escapePostgrestValue } = require('../utils/sanitize');
const { calcularDepreciacao } = require('../utils/patrimonioDepreciacao');

router.use(authenticate, authorizeModule('patrimonio'));

// Recalcula porCategoria/porLocalizacao só com bens ATIVOS (pedido do usuário
// 2026-08-03: os gráficos "Por Categoria"/"Por Localização" do dashboard
// somavam TODOS os status, incluindo baixado/extraviado/manutenção — inflava
// contagem de item que já nem está mais em uso). A função SQL
// `pat_dashboard_stats` é opaca (existe só no banco vivo, sem migration no
// repo) — em vez de arriscar reescrevê-la sem ver a definição atual, o
// recorte é feito aqui, sobrescrevendo só essas 2 chaves da resposta da RPC.
// Paginado (cap de 1000 do PostgREST).
async function porCategoriaLocalizacaoAtivos() {
  let all = [];
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase.from('pat_bens')
      .select('categoria_id, localizacao_id, pat_categorias(nome), pat_localizacoes(nome)')
      .eq('status', 'ativo')
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  const porCategoria = {};
  const porLocalizacao = {};
  for (const b of all) {
    const catNome = b.categoria_id ? (b.pat_categorias?.nome || 'Sem categoria') : 'Sem categoria';
    const locNome = b.localizacao_id ? (b.pat_localizacoes?.nome || 'Sem localização') : 'Sem localização';
    porCategoria[catNome] = (porCategoria[catNome] || 0) + 1;
    porLocalizacao[locNome] = (porLocalizacao[locNome] || 0) + 1;
  }
  return { porCategoria, porLocalizacao };
}

// ── DASHBOARD ──────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    // RPC dedicada (SECURITY DEFINER) · funciona no serverless e ignora o cap de
    // 1k linhas. (O antigo fallback via pool pg não conecta no Vercel · removido.)
    const { data, error } = await supabase.rpc('pat_dashboard_stats');
    if (error) throw error;
    try {
      const { porCategoria, porLocalizacao } = await porCategoriaLocalizacaoAtivos();
      data.porCategoria = porCategoria;
      data.porLocalizacao = porLocalizacao;
    } catch (e2) {
      console.error('[PAT] Recorte de ativos em porCategoria/porLocalizacao falhou (mantendo RPC crua):', e2.message);
    }
    res.json(data);
  } catch (e) {
    console.error('[PAT] Dashboard RPC falhou:', e.message);
    res.status(500).json({ error: 'Erro ao carregar dashboard patrimônio' });
  }
});

// Indicadores adicionais (saneamento de cadastro, risco de extravio,
// manutenção atrasada, tendência de baixas) — função separada de
// pat_dashboard_stats (ver migration 20260728180000).
router.get('/dashboard/indicadores', async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('pat_dashboard_indicadores');
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[PAT] Indicadores RPC falhou:', e.message);
    res.status(500).json({ error: 'Erro ao carregar indicadores de patrimônio' });
  }
});

// Agregado de depreciação (indicador GERENCIAL) pro dashboard — soma valor de
// aquisição × valor atual estimado dos bens não-baixados com categoria
// configurada; conta à parte quantos bens ficam de fora por falta de
// valor/data/vida útil. Paginado (lei do projeto · cap de 1000 do PostgREST).
router.get('/dashboard/depreciacao', async (req, res) => {
  try {
    let all = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase.from('pat_bens')
        .select('id, nome, valor_aquisicao, data_aquisicao, status, categoria_id, pat_categorias(nome, vida_util_meses)')
        .neq('status', 'baixado')
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }
    let valorAquisicaoTotal = 0, valorAtualTotal = 0, bensComDepreciacao = 0, bensSemConfiguracao = 0;
    // Agregado por categoria (pra gráfico aquisição × atual) — chave por
    // categoria_id (null vira "Sem categoria"), sem precisar de migration.
    const porCategoria = new Map();
    // Bens perto do fim da vida útil (pedido do usuário 2026-07-31) — lista
    // acionável pra planejamento de reposição, não só o total agregado.
    const bensFimVidaUtil = [];
    for (const bem of all) {
      const dep = calcularDepreciacao(bem);
      if (dep) {
        bensComDepreciacao++;
        valorAquisicaoTotal += Number(bem.valor_aquisicao);
        valorAtualTotal += dep.valor_atual_estimado;
        const chave = bem.categoria_id || '__sem__';
        const nome = bem.pat_categorias?.nome || 'Sem categoria';
        const atual = porCategoria.get(chave) || { categoria: nome, valor_aquisicao: 0, valor_atual: 0 };
        atual.valor_aquisicao += Number(bem.valor_aquisicao);
        atual.valor_atual += dep.valor_atual_estimado;
        porCategoria.set(chave, atual);
        if (dep.percentual_depreciado >= 80) {
          bensFimVidaUtil.push({
            id: bem.id, nome: bem.nome, categoria: nome,
            percentual_depreciado: dep.percentual_depreciado,
            valor_atual_estimado: dep.valor_atual_estimado,
          });
        }
      } else if (bem.valor_aquisicao != null) {
        bensSemConfiguracao++;
      }
    }

    // Aquisições por período (pedido do usuário 2026-07-31) — histórico de
    // COMPRA independe do status atual do bem, então busca à parte incluindo
    // baixados (a lista acima exclui baixado de propósito, pra depreciação).
    let aquisicoesRaw = [];
    {
      let offset2 = 0;
      while (true) {
        const { data, error } = await supabase.from('pat_bens')
          .select('data_aquisicao, valor_aquisicao')
          .not('data_aquisicao', 'is', null)
          .range(offset2, offset2 + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        aquisicoesRaw = aquisicoesRaw.concat(data);
        if (data.length < pageSize) break;
        offset2 += pageSize;
      }
    }
    const porMes = new Map();
    for (const b of aquisicoesRaw) {
      const mes = b.data_aquisicao.slice(0, 7); // YYYY-MM
      const atual = porMes.get(mes) || { mes, quantidade: 0, valor_total: 0 };
      atual.quantidade += 1;
      atual.valor_total += b.valor_aquisicao != null ? Number(b.valor_aquisicao) : 0;
      porMes.set(mes, atual);
    }

    res.json({
      valor_aquisicao_total: Math.round(valorAquisicaoTotal * 100) / 100,
      valor_atual_estimado_total: Math.round(valorAtualTotal * 100) / 100,
      bens_com_depreciacao: bensComDepreciacao,
      bens_sem_configuracao: bensSemConfiguracao,
      por_categoria: Array.from(porCategoria.values())
        .map(c => ({
          categoria: c.categoria,
          valor_aquisicao: Math.round(c.valor_aquisicao * 100) / 100,
          valor_atual: Math.round(c.valor_atual * 100) / 100,
        }))
        .sort((a, b) => b.valor_aquisicao - a.valor_aquisicao),
      bens_fim_vida_util: bensFimVidaUtil
        .sort((a, b) => b.percentual_depreciado - a.percentual_depreciado)
        .slice(0, 20),
      aquisicoes_por_mes: Array.from(porMes.values())
        .sort((a, b) => a.mes.localeCompare(b.mes))
        .map(m => ({ ...m, valor_total: Math.round(m.valor_total * 100) / 100 })),
    });
  } catch (e) {
    console.error('[PAT] Agregado de depreciação falhou:', e.message);
    res.status(500).json({ error: 'Erro ao calcular depreciação agregada' });
  }
});

// Atividade recente (pedido do usuário 2026-07-31) — volume de
// pat_movimentacoes nos últimos 30/90 dias por tipo, pra mostrar o quanto o
// patrimônio está circulando (hoje só aparece dentro do popup de cada bem).
router.get('/dashboard/atividade', async (req, res) => {
  try {
    const desde90 = new Date();
    desde90.setDate(desde90.getDate() - 90);
    let all = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase.from('pat_movimentacoes')
        .select('tipo, data_movimentacao')
        .gte('data_movimentacao', desde90.toISOString())
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }
    const desde30 = new Date();
    desde30.setDate(desde30.getDate() - 30);
    const porTipo = new Map();
    let total30 = 0;
    for (const m of all) {
      const atual = porTipo.get(m.tipo) || { tipo: m.tipo, total_30d: 0, total_90d: 0 };
      atual.total_90d += 1;
      if (new Date(m.data_movimentacao) >= desde30) { atual.total_30d += 1; total30++; }
      porTipo.set(m.tipo, atual);
    }
    res.json({
      total_30d: total30,
      total_90d: all.length,
      por_tipo: Array.from(porTipo.values()).sort((a, b) => b.total_90d - a.total_90d),
    });
  } catch (e) {
    console.error('[PAT] Atividade recente falhou:', e.message);
    res.status(500).json({ error: 'Erro ao calcular atividade recente' });
  }
});

// ── CATEGORIAS ─────────────────────────────────────────────
router.get('/categorias', async (req, res) => {
  try {
    const { data, error } = await supabase.from('pat_categorias').select('*').order('nome');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar categorias' }); }
});

router.post('/categorias', authorizeModule('patrimonio', 3), async (req, res) => {
  try {
    const { nome, icone, pai_id, vida_util_meses } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const { data, error } = await supabase.from('pat_categorias')
      .insert({ nome, icone: icone || null, pai_id: pai_id || null, vida_util_meses: vida_util_meses || null }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar categoria' }); }
});

router.put('/categorias/:id', authorizeModule('patrimonio', 3), async (req, res) => {
  try {
    const { nome, icone, vida_util_meses } = req.body;
    const update = {};
    if (nome !== undefined) update.nome = nome;
    if (icone !== undefined) update.icone = icone || null;
    if (vida_util_meses !== undefined) update.vida_util_meses = vida_util_meses || null;
    const { data, error } = await supabase.from('pat_categorias')
      .update(update).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar categoria' }); }
});

router.delete('/categorias/:id', authorizeModule('patrimonio', 4), async (req, res) => {
  try {
    const { error } = await supabase.from('pat_categorias').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover categoria' }); }
});

// ── LOCALIZAÇÕES ───────────────────────────────────────────
router.get('/localizacoes', async (req, res) => {
  try {
    const { data, error } = await supabase.from('pat_localizacoes').select('*').order('nome');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar localizações' }); }
});

// Impede que pai_id crie um ciclo na árvore (ex: A vira pai de B que já é pai
// de A) — sobe a cadeia de ancestrais de p_pai_id e recusa se achar o próprio
// ownId no caminho. ownId é null na criação (não há como um nó novo já ser
// ancestral de ninguém).
async function paiCriaCiclo(paiId, ownId) {
  let atual = paiId;
  const vistos = new Set();
  while (atual) {
    if (atual === ownId) return true;
    if (vistos.has(atual)) return true; // ciclo já existente na base
    vistos.add(atual);
    const { data, error } = await supabase.from('pat_localizacoes').select('pai_id').eq('id', atual).single();
    if (error || !data) return false;
    atual = data.pai_id;
  }
  return false;
}

router.post('/localizacoes', authorizeModule('patrimonio', 3), async (req, res) => {
  try {
    const { nome, pai_id } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    if (pai_id && await paiCriaCiclo(pai_id, null)) {
      return res.status(400).json({ error: 'Localização pai inválida (criaria um ciclo)' });
    }
    const { data, error } = await supabase.from('pat_localizacoes')
      .insert({ nome, pai_id: pai_id || null }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar localização' }); }
});

// Intervalo e prazo de revisão são NULLABLE de propósito (pedido do usuário
// 2026-08-10): NULL mantém o comportamento legado (localização entra em todo
// ciclo · prazo distribuído proporcionalmente). Só grava número > 0.
function sanitizarDiasRevisao(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined; // undefined = inválido, distinto de null
  return Math.round(n);
}

router.put('/localizacoes/:id', authorizeModule('patrimonio', 3), async (req, res) => {
  try {
    const { nome, pai_id, revisao_intervalo_dias, revisao_prazo_dias } = req.body;
    const update = {};
    if (nome !== undefined) update.nome = nome;
    if (pai_id !== undefined) {
      if (pai_id && await paiCriaCiclo(pai_id, req.params.id)) {
        return res.status(400).json({ error: 'Localização pai inválida (criaria um ciclo)' });
      }
      update.pai_id = pai_id || null;
    }
    if (revisao_intervalo_dias !== undefined) {
      const v = sanitizarDiasRevisao(revisao_intervalo_dias);
      if (v === undefined) return res.status(400).json({ error: 'Intervalo de revisão precisa ser um número de dias maior que zero (ou vazio)' });
      update.revisao_intervalo_dias = v;
    }
    if (revisao_prazo_dias !== undefined) {
      const v = sanitizarDiasRevisao(revisao_prazo_dias);
      if (v === undefined) return res.status(400).json({ error: 'Prazo (tempo de análise) precisa ser um número de dias maior que zero (ou vazio)' });
      update.revisao_prazo_dias = v;
    }
    const { data, error } = await supabase.from('pat_localizacoes')
      .update(update).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar localização' }); }
});

router.delete('/localizacoes/:id', authorizeModule('patrimonio', 4), async (req, res) => {
  try {
    const { error } = await supabase.from('pat_localizacoes').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover localização' }); }
});

// ── BENS ───────────────────────────────────────────────────
router.get('/bens', async (req, res) => {
  try {
    const { status, categoria_id, localizacao_id, busca } = req.query;
    const montarQuery = (offset, pageSize) => {
      // .order('nome') sozinho não é estável entre páginas: bens com o mesmo
      // nome (comum aqui — ex. "10 Un Luminaria...") podem trocar de ordem
      // entre duas chamadas de range() separadas, fazendo a paginação repetir
      // um bem em 2 páginas e pular outro. `id` como desempate garante ordem
      // determinística (achado do usuário: "Selecionar todos" selecionava
      // menos ids que o total filtrado).
      let query = supabase.from('pat_bens').select('*, pat_categorias(nome, vida_util_meses), pat_localizacoes(nome), responsavel:profiles!responsavel_id(name), alerta:pat_revisao_itens!alerta_divergencia_item_id(data_revisao, localizacao_encontrada:pat_localizacoes!localizacao_encontrada_id(nome))').order('nome').order('id');
      if (status) query = query.eq('status', status);
      // Sentinela "__sem__" filtra bens SEM categoria/localização — pra
      // priorizar o saneamento de cadastro (pedido do usuário 2026-07-28).
      if (categoria_id === '__sem__') query = query.is('categoria_id', null);
      else if (categoria_id) query = query.eq('categoria_id', categoria_id);
      if (localizacao_id === '__sem__') query = query.is('localizacao_id', null);
      else if (localizacao_id) query = query.eq('localizacao_id', localizacao_id);
      // Busca por nome OU código de barras OU nº de série — permite achar o bem
      // pelo número, não só pelo nome (pedido do usuário 2026-07-27).
      if (busca) {
        const b = escapePostgrestValue(busca.trim());
        query = query.or(`nome.ilike.%${b}%,codigo_barras.ilike.%${b}%,numero_serie.ilike.%${b}%`);
      }
      return query.range(offset, offset + pageSize - 1);
    };
    // Paginado (lei do projeto · cap de 1000 do PostgREST) — o parque já passa
    // de 4 mil bens, então sem isso a aba Bens (e a exportação) truncava
    // silenciosamente nos primeiros 1000 (achado do usuário 2026-07-31).
    let all = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await montarQuery(offset, pageSize);
      if (error) return res.status(400).json({ error: error.message });
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }
    res.json(all.map(b => ({ ...b, depreciacao: calcularDepreciacao(b) })));
  } catch (e) { res.status(500).json({ error: 'Erro ao listar bens' }); }
});

// Buscar bem por código de barras (usado pelo scanner)
// IMPORTANTE: precisa vir ANTES de /bens/:id para não conflitar
router.get('/bens/barcode/:codigo', async (req, res) => {
  try {
    const codigo = decodeURIComponent(req.params.codigo).trim();
    if (!codigo) return res.status(400).json({ error: 'Código vazio' });

    // Normalização: etiquetas físicas têm '0' na frente mas planilha não.
    // Tenta variações do código: exato, sem zeros à esquerda, com zeros (8 dígitos).
    const variants = new Set();
    variants.add(codigo);                                   // exato ("012345")
    const semZeros = codigo.replace(/^0+/, '') || '0';
    variants.add(semZeros);                                 // sem zeros ("12345")
    // Padding comum de etiquetas (alguns lidos como 8-12 dígitos)
    if (/^\d+$/.test(codigo)) {
      for (const len of [6, 8, 10, 12, 13]) {
        variants.add(semZeros.padStart(len, '0'));
      }
    }

    const list = [...variants];
    console.log('[PATRIMONIO] barcode lookup variants:', list);

    const { data, error } = await supabase.from('pat_bens')
      .select('*, pat_categorias(nome, vida_util_meses), pat_localizacoes(nome), responsavel:profiles!responsavel_id(name), alerta:pat_revisao_itens!alerta_divergencia_item_id(data_revisao, localizacao_encontrada:pat_localizacoes!localizacao_encontrada_id(nome))')
      .in('codigo_barras', list);

    if (error) {
      console.error('[PATRIMONIO] barcode lookup error:', error.message);
      return res.status(500).json({ error: error.message });
    }
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Bem não encontrado', triedVariants: list });
    }

    // Se tiver múltiplos matches (improvável mas possível), pega o primeiro
    const bem = data[0];
    const { data: movs } = await supabase.from('pat_movimentacoes')
      .select('*, profiles!responsavel_id(name)')
      .eq('bem_id', bem.id)
      .order('data_movimentacao', { ascending: false });
    res.json({ ...bem, movimentacoes: movs || [], depreciacao: calcularDepreciacao(bem) });
  } catch (e) {
    console.error('[PATRIMONIO] barcode lookup exception:', e.message);
    res.status(500).json({ error: 'Erro ao buscar bem por código' });
  }
});

// Próximo(s) número(s) de patrimônio em sequência (pedido do usuário
// 2026-07-31: novo bem sempre segue a ordem — último 4433 → próximo 4434).
// Precisa vir ANTES de /bens/:id para não conflitar.
router.get('/bens/proximo-codigo', async (req, res) => {
  try {
    const qtd = Math.max(1, Number(req.query.qtd) || 1);
    const { data, error } = await supabase.rpc('pat_proximo_codigo_barras', { p_qtd: qtd });
    if (error) return res.status(400).json({ error: error.message });
    const codigos = (data || []).map(r => String(r.codigo));
    res.json({ proximo: codigos[0] || null, codigos });
  } catch (e) { res.status(500).json({ error: 'Erro ao calcular próximo número de patrimônio' }); }
});

router.get('/bens/:id', async (req, res) => {
  try {
    const { data: bem, error } = await supabase.from('pat_bens')
      .select('*, pat_categorias(nome, vida_util_meses), pat_localizacoes(nome), responsavel:profiles!responsavel_id(name), alerta:pat_revisao_itens!alerta_divergencia_item_id(data_revisao, localizacao_encontrada:pat_localizacoes!localizacao_encontrada_id(nome))').eq('id', req.params.id).single();
    if (error) return res.status(404).json({ error: 'Bem não encontrado' });
    const { data: movs } = await supabase.from('pat_movimentacoes')
      .select('*, profiles!responsavel_id(name)').eq('bem_id', req.params.id).order('data_movimentacao', { ascending: false });
    res.json({ ...bem, movimentacoes: movs || [], depreciacao: calcularDepreciacao(bem) });
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar bem' }); }
});

router.post('/bens', authorizeModule('patrimonio', 3), async (req, res) => {
  try {
    const { codigo_barras, nome, descricao, categoria_id, localizacao_id, numero_serie, marca, modelo, valor_aquisicao, data_aquisicao, observacoes, numero_nf, tem_garantia, garantia_ate, responsavel_id, origem_aquisicao, doador, doador_tipo } = req.body;
    if (!codigo_barras || !nome) return res.status(400).json({ error: 'Código de barras e nome são obrigatórios' });
    // Doação recebida (pedido do usuário 2026-07-31): "doado" exige quem doou —
    // "comprado" (default) ignora esses 2 campos mesmo que venham no payload.
    const origem = origem_aquisicao === 'doado' ? 'doado' : 'comprado';
    if (origem === 'doado' && (!doador || !doador.trim())) return res.status(400).json({ error: 'Informe quem doou o bem' });
    const { data, error } = await supabase.from('pat_bens')
      .insert({ codigo_barras, nome, descricao: descricao || null, categoria_id: categoria_id || null, localizacao_id: localizacao_id || null, numero_serie: numero_serie || null, marca: marca || null, modelo: modelo || null, valor_aquisicao: valor_aquisicao || null, data_aquisicao: data_aquisicao || null, observacoes: observacoes || null, numero_nf: numero_nf || null, tem_garantia: !!tem_garantia, garantia_ate: garantia_ate || null, responsavel_id: responsavel_id || null, created_by: req.user.userId, origem_aquisicao: origem, doador: origem === 'doado' ? doador.trim() : null, doador_tipo: origem === 'doado' ? (doador_tipo || null) : null })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao cadastrar bem' }); }
});

// Cadastro em massa (pedido do usuário 2026-07-31): vários bens do MESMO tipo
// e categoria, não necessariamente no mesmo local — ex. 10 lâmpadas iguais
// distribuídas em salas diferentes. Cada unidade recebe um número de
// patrimônio sequencial (ver pat_proximo_codigo_barras), calculado na hora do
// insert (não reservado antes — evita número "furado" se o usuário cancelar).
router.post('/bens/lote', authorizeModule('patrimonio', 3), async (req, res) => {
  try {
    const { nome, descricao, categoria_id, marca, modelo, valor_aquisicao, data_aquisicao, numero_nf, tem_garantia, garantia_ate, responsavel_id, distribuicao, origem_aquisicao, doador, doador_tipo } = req.body;
    if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
    const dist = Array.isArray(distribuicao) ? distribuicao.filter(d => Number(d?.quantidade) > 0) : [];
    const totalQtd = dist.reduce((s, d) => s + Number(d.quantidade), 0);
    if (!dist.length || totalQtd <= 0) return res.status(400).json({ error: 'Informe ao menos uma quantidade maior que zero' });
    if (totalQtd > 300) return res.status(400).json({ error: 'Máximo de 300 bens por lote' });
    // Doação recebida em lote (pedido do usuário 2026-07-31): mesmo doador pra
    // todo o lote — cobre o caso real "uma empresa doou 20 cadeiras de uma vez".
    // Doação heterogênea (doador diferente por item) segue pelo cadastro individual.
    const origem = origem_aquisicao === 'doado' ? 'doado' : 'comprado';
    if (origem === 'doado' && (!doador || !doador.trim())) return res.status(400).json({ error: 'Informe quem doou os bens' });

    const { data: codigosData, error: codigosErr } = await supabase.rpc('pat_proximo_codigo_barras', { p_qtd: totalQtd });
    if (codigosErr) return res.status(400).json({ error: codigosErr.message });
    const codigos = (codigosData || []).map(r => String(r.codigo));
    if (codigos.length < totalQtd) return res.status(500).json({ error: 'Falha ao gerar números de patrimônio para o lote' });

    const base = {
      nome: nome.trim(), descricao: descricao || null, categoria_id: categoria_id || null,
      marca: marca || null, modelo: modelo || null, valor_aquisicao: valor_aquisicao || null,
      data_aquisicao: data_aquisicao || null, numero_nf: numero_nf || null, tem_garantia: !!tem_garantia,
      garantia_ate: garantia_ate || null, responsavel_id: responsavel_id || null, created_by: req.user.userId,
      origem_aquisicao: origem, doador: origem === 'doado' ? doador.trim() : null, doador_tipo: origem === 'doado' ? (doador_tipo || null) : null,
    };
    const rows = [];
    let cursor = 0;
    for (const d of dist) {
      const qtd = Number(d.quantidade);
      const localizacao_id = d.localizacao_id || null;
      for (let i = 0; i < qtd; i++) {
        rows.push({ ...base, codigo_barras: codigos[cursor], localizacao_id });
        cursor += 1;
      }
    }
    const { data, error } = await supabase.from('pat_bens').insert(rows).select('id, codigo_barras, localizacao_id');
    if (error) return res.status(400).json({ error: error.message });
    res.json({ criados: data.length, codigo_inicial: codigos[0], codigo_final: codigos[codigos.length - 1], bens: data });
  } catch (e) { res.status(500).json({ error: 'Erro ao cadastrar bens em massa' }); }
});

router.put('/bens/:id', authorizeModule('patrimonio', 3), async (req, res) => {
  try {
    const { codigo_barras, nome, descricao, categoria_id, localizacao_id, numero_serie, marca, modelo, valor_aquisicao, data_aquisicao, status, observacoes, numero_nf, tem_garantia, garantia_ate, responsavel_id, data_baixa, origem_aquisicao, doador, doador_tipo } = req.body;
    // Reatribuir a localização (edição manual do cadastro) é decisão humana —
    // limpa o alerta de "localização pendente de reavaliação" (hierarquia
    // 2026-07-29). Se localizacao_id não veio no payload, o alerta é preservado.
    const origem = origem_aquisicao === 'doado' ? 'doado' : 'comprado';
    const update = { codigo_barras, nome, descricao: descricao || null, categoria_id: categoria_id || null, localizacao_id: localizacao_id || null, numero_serie: numero_serie || null, marca: marca || null, modelo: modelo || null, valor_aquisicao: valor_aquisicao || null, data_aquisicao: data_aquisicao || null, status, observacoes: observacoes || null, numero_nf: numero_nf || null, tem_garantia: !!tem_garantia, garantia_ate: garantia_ate || null, responsavel_id: responsavel_id || null, origem_aquisicao: origem, doador: origem === 'doado' ? (doador || null) : null, doador_tipo: origem === 'doado' ? (doador_tipo || null) : null };
    if (localizacao_id !== undefined) { update.localizacao_pendente = false; update.alerta_divergencia_item_id = null; }
    // Data de baixa acompanha o status editado direto no cadastro (item 4 ·
    // 2026-07-29): entra em "baixado" grava a data (a informada ou hoje);
    // sai de "baixado" limpa — não fica data de baixa órfã num bem reativado.
    if (status === 'baixado') update.data_baixa = data_baixa || new Date().toISOString().slice(0, 10);
    else if (status !== undefined) update.data_baixa = null;
    const { data, error } = await supabase.from('pat_bens')
      .update(update)
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar bem' }); }
});

// "Dar baixa" (não é exclusão): grava a movimentação de baixa e marca o bem
// como baixado, preservando cadastro e histórico — NUNCA hard-delete aqui.
router.delete('/bens/:id', authorizeModule('patrimonio', 4), async (req, res) => {
  try {
    const { error: movErr } = await supabase.from('pat_movimentacoes')
      .insert({ bem_id: req.params.id, tipo: 'baixa', responsavel_id: req.user.userId, motivo: req.body?.motivo || null, created_by: req.user.userId });
    if (movErr) return res.status(400).json({ error: movErr.message });
    const { error } = await supabase.from('pat_bens').update({ status: 'baixado', data_baixa: new Date().toISOString().slice(0, 10) }).eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao dar baixa no bem' }); }
});

// ── EDIÇÃO E MOVIMENTAÇÃO EM MASSA ─────────────────────────
// Pedido do usuário 2026-07-31: muitos bens foram lançados de uma vez com
// erro de digitação no nome, e faltava um jeito de corrigir/mover vários bens
// juntos sem editar um por um. Rotas com path fixo "bulk" — não conflitam com
// GET/PUT/DELETE /bens/:id porque são métodos e sub-paths diferentes.

// Trava contra descompasso com revisão ativa (pedido do usuário 2026-07-31):
// um ciclo de revisão tira uma FOTOGRAFIA dos bens esperados em cada
// localização quando é criado (pat_revisao_itens). Mudar localização ou dar
// baixa em bens que estão nessa fotografia enquanto a convocação ainda está
// pendente/em_andamento deixa a conferência física desatualizada — o revisor
// continuaria esperando achar ali um bem que já saiu por fora, contra a
// minúcia que a revisão busca. Bloqueia em vez de deixar acontecer em
// silêncio (mesmo risco já existia editando 1 bem por vez; em massa é mais
// fácil atingir vários sem perceber).
async function bensEmRevisaoAtiva(ids) {
  const { data, error } = await supabase.from('pat_revisao_itens')
    .select('bem_id, pat_bens(nome), convocacao:pat_revisao_convocacoes(status, pat_localizacoes(nome))')
    .in('bem_id', ids);
  if (error) throw new Error(error.message);
  const vistos = new Set();
  const conflitos = [];
  for (const item of data || []) {
    if (!item.convocacao || !['pendente', 'em_andamento'].includes(item.convocacao.status)) continue;
    if (vistos.has(item.bem_id)) continue;
    vistos.add(item.bem_id);
    conflitos.push({ bem_id: item.bem_id, nome: item.pat_bens?.nome || item.bem_id, localizacao: item.convocacao.pat_localizacoes?.nome || null });
  }
  return conflitos;
}

function mensagemBensEmRevisao(conflitos) {
  const nomes = conflitos.slice(0, 5).map(c => c.nome).join(', ');
  const resto = conflitos.length > 5 ? ` e mais ${conflitos.length - 5}` : '';
  return `${conflitos.length} bem(ns) selecionado(s) está(ão) numa convocação de revisão ainda em andamento (${nomes}${resto}) — mudar localização ou dar baixa agora deixaria a conferência física desatualizada. Aguarde a revisão concluir ou remova-os da seleção.`;
}

// Define um valor comum (categoria/localização/responsável/status) pra N bens
// de uma vez. Cada campo é opcional — só atualiza o que veio no body.
router.put('/bens/bulk', authorizeModule('patrimonio', 3), async (req, res) => {
  try {
    const { ids, categoria_id, localizacao_id, responsavel_id, status } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Selecione ao menos um bem' });
    if (localizacao_id !== undefined || status === 'baixado') {
      const conflitos = await bensEmRevisaoAtiva(ids);
      if (conflitos.length > 0) return res.status(409).json({ error: mensagemBensEmRevisao(conflitos), bens_em_revisao: conflitos });
    }
    const update = {};
    if (categoria_id !== undefined) update.categoria_id = categoria_id || null;
    // Reatribuir localização em massa também é decisão humana — limpa o
    // alerta de divergência/pendência, mesma regra do PUT individual.
    if (localizacao_id !== undefined) { update.localizacao_id = localizacao_id || null; update.localizacao_pendente = false; update.alerta_divergencia_item_id = null; }
    if (responsavel_id !== undefined) update.responsavel_id = responsavel_id || null;
    if (status !== undefined) {
      update.status = status;
      update.data_baixa = status === 'baixado' ? new Date().toISOString().slice(0, 10) : null;
    }
    if (Object.keys(update).length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    const { data, error } = await supabase.from('pat_bens').update(update).in('id', ids).select('id');
    if (error) return res.status(400).json({ error: error.message });
    res.json({ atualizados: (data || []).length });
  } catch (e) { res.status(500).json({ error: 'Erro ao editar bens em massa' }); }
});

// Corrige erro de digitação repetido no nome de vários bens de uma vez
// (busca um trecho e substitui, igual pra todos os selecionados) — "definir
// valor comum" acima não resolve isso porque cada bem tem um nome diferente.
router.put('/bens/bulk/renomear', authorizeModule('patrimonio', 3), async (req, res) => {
  try {
    const { ids, buscar, substituir } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Selecione ao menos um bem' });
    if (!buscar) return res.status(400).json({ error: 'Informe o texto a buscar' });
    const { data: bensAlvo, error: fetchErr } = await supabase.from('pat_bens').select('id, nome').in('id', ids);
    if (fetchErr) return res.status(400).json({ error: fetchErr.message });
    let atualizados = 0;
    let semOcorrencia = 0;
    for (const b of bensAlvo || []) {
      if (!b.nome || !b.nome.includes(buscar)) { semOcorrencia++; continue; }
      const novoNome = b.nome.split(buscar).join(substituir ?? '');
      const { error } = await supabase.from('pat_bens').update({ nome: novoNome }).eq('id', b.id);
      if (!error) atualizados++;
    }
    res.json({ atualizados, sem_ocorrencia: semOcorrencia });
  } catch (e) { res.status(500).json({ error: 'Erro ao renomear bens em massa' }); }
});

// Movimentação (entrada/saída/transferência/manutenção) pra N bens de uma vez
// — chama a MESMA RPC atômica do fluxo individual, bem por bem (não é uma
// transação única entre bens; reporta quem falhou em vez de abortar tudo).
router.post('/bens/bulk/movimentar', authorizeModule('patrimonio', 3), async (req, res) => {
  try {
    const { ids, tipo, localizacao_origem_id, localizacao_destino_id, motivo } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Selecione ao menos um bem' });
    if (!tipo) return res.status(400).json({ error: 'Tipo é obrigatório' });
    const conflitos = await bensEmRevisaoAtiva(ids);
    if (conflitos.length > 0) return res.status(409).json({ error: mensagemBensEmRevisao(conflitos), bens_em_revisao: conflitos });
    const falhas = [];
    let sucesso = 0;
    for (const bemId of ids) {
      const { error } = await supabase.rpc('pat_registrar_movimentacao', {
        p_bem_id: bemId, p_tipo: tipo,
        p_localizacao_origem_id: localizacao_origem_id || null, p_localizacao_destino_id: localizacao_destino_id || null,
        p_responsavel_id: req.user.userId, p_motivo: motivo || null, p_revisao_item_id: null, p_created_by: req.user.userId,
      });
      if (error) falhas.push({ id: bemId, erro: error.message });
      else sucesso++;
    }
    res.json({ sucesso, falhas });
  } catch (e) { res.status(500).json({ error: 'Erro ao movimentar bens em massa' }); }
});

// Dar baixa em N bens de uma vez — mesma lógica do DELETE individual (nunca
// hard-delete: grava a movimentação de baixa e marca o status).
router.post('/bens/bulk/baixa', authorizeModule('patrimonio', 4), async (req, res) => {
  try {
    const { ids, motivo } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Selecione ao menos um bem' });
    const conflitos = await bensEmRevisaoAtiva(ids);
    if (conflitos.length > 0) return res.status(409).json({ error: mensagemBensEmRevisao(conflitos), bens_em_revisao: conflitos });
    const falhas = [];
    let sucesso = 0;
    const hoje = new Date().toISOString().slice(0, 10);
    for (const bemId of ids) {
      const { error: movErr } = await supabase.from('pat_movimentacoes')
        .insert({ bem_id: bemId, tipo: 'baixa', responsavel_id: req.user.userId, motivo: motivo || null, created_by: req.user.userId });
      if (movErr) { falhas.push({ id: bemId, erro: movErr.message }); continue; }
      const { error } = await supabase.from('pat_bens').update({ status: 'baixado', data_baixa: hoje }).eq('id', bemId);
      if (error) { falhas.push({ id: bemId, erro: error.message }); continue; }
      sucesso++;
    }
    res.json({ sucesso, falhas });
  } catch (e) { res.status(500).json({ error: 'Erro ao dar baixa em massa' }); }
});

// ── MOVIMENTAÇÕES ──────────────────────────────────────────
// Histórico central de TODAS as movimentações de TODOS os bens (pedido do
// usuário 2026-07-29, item 1) — local antigo/novo, item, motivo, e destaque
// de quem veio de uma revisão agendada (revisao_item_id preenchido). Paginado
// server-side (lei do projeto · cap de 1000 do PostgREST).
router.get('/movimentacoes', async (req, res) => {
  try {
    const { tipo, bem_id, localizacao_id, busca, data_inicio, data_fim, page, pageSize } = req.query;
    const pg = Math.max(1, parseInt(page, 10) || 1);
    const ps = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 50));

    let query = supabase.from('pat_movimentacoes')
      .select(`
        id, tipo, motivo, data_movimentacao, revisao_item_id,
        bem:pat_bens!bem_id(id, nome, codigo_barras),
        origem:pat_localizacoes!localizacao_origem_id(nome),
        destino:pat_localizacoes!localizacao_destino_id(nome),
        responsavel:profiles!responsavel_id(name)
      `, { count: 'exact' })
      .order('data_movimentacao', { ascending: false });

    if (tipo) query = query.eq('tipo', tipo);
    if (bem_id) query = query.eq('bem_id', bem_id);
    if (localizacao_id) query = query.or(`localizacao_origem_id.eq.${localizacao_id},localizacao_destino_id.eq.${localizacao_id}`);
    if (data_inicio) query = query.gte('data_movimentacao', data_inicio);
    if (data_fim) query = query.lte('data_movimentacao', data_fim + 'T23:59:59');

    // Busca por nome/código/série do BEM — resolve os ids primeiro (embed não
    // é filtrável direto via supabase-js sem !inner, e !inner mudaria o shape).
    if (busca) {
      const b = escapePostgrestValue(busca.trim());
      const { data: bensAchados, error: bensErr } = await supabase.from('pat_bens')
        .select('id').or(`nome.ilike.%${b}%,codigo_barras.ilike.%${b}%,numero_serie.ilike.%${b}%`);
      if (bensErr) return res.status(400).json({ error: bensErr.message });
      const ids = (bensAchados || []).map(b => b.id);
      if (ids.length === 0) return res.json({ data: [], total: 0, page: pg, pageSize: ps });
      query = query.in('bem_id', ids);
    }

    const from = (pg - 1) * ps;
    const { data, error, count } = await query.range(from, from + ps - 1);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ data: data || [], total: count || 0, page: pg, pageSize: ps });
  } catch (e) {
    console.error('[PAT] Erro ao listar movimentações:', e.message);
    res.status(500).json({ error: 'Erro ao listar movimentações' });
  }
});

// Registro da movimentação + atualização de localização/status do bem numa
// única transação via RPC (`pat_registrar_movimentacao`) — antes eram 2
// escritas separadas; se a 2ª falhasse no meio, a aba de Movimentações
// passava a mentir sobre onde o bem está de verdade (dívida técnica
// corrigida a pedido do usuário 2026-07-29).
router.post('/bens/:id/movimentacoes', authorizeModule('patrimonio', 3), async (req, res) => {
  try {
    const { tipo, localizacao_origem_id, localizacao_destino_id, motivo } = req.body;
    if (!tipo) return res.status(400).json({ error: 'Tipo é obrigatório' });
    const { data, error } = await supabase.rpc('pat_registrar_movimentacao', {
      p_bem_id: req.params.id, p_tipo: tipo,
      p_localizacao_origem_id: localizacao_origem_id || null, p_localizacao_destino_id: localizacao_destino_id || null,
      p_responsavel_id: req.user.userId, p_motivo: motivo || null, p_revisao_item_id: null, p_created_by: req.user.userId,
    });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao registrar movimentação' }); }
});

// ── INVENTÁRIOS ────────────────────────────────────────────
router.get('/inventarios', async (req, res) => {
  try {
    const { data, error } = await supabase.from('pat_inventarios').select('*, profiles!responsavel_id(name)').order('data_inicio', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar inventários' }); }
});

router.post('/inventarios', async (req, res) => {
  try {
    const { nome, data_inicio, observacoes } = req.body;
    if (!nome || !data_inicio) return res.status(400).json({ error: 'Nome e data início são obrigatórios' });
    const { data, error } = await supabase.from('pat_inventarios')
      .insert({ nome, data_inicio, responsavel_id: req.user.userId, observacoes: observacoes || null })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar inventário' }); }
});

router.patch('/inventarios/:id', async (req, res) => {
  try {
    const { status, data_fim, observacoes } = req.body;
    const update = {};
    if (status) update.status = status;
    if (data_fim) update.data_fim = data_fim;
    if (observacoes !== undefined) update.observacoes = observacoes;
    const { data, error } = await supabase.from('pat_inventarios')
      .update(update).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar inventário' }); }
});

// ── REVISÃO PERIÓDICA ──────────────────────────────────────
// Ciclo trimestral único para toda a igreja; UM funcionário responsável faz
// todas as conferências físicas (não há "atribuído por localização" — decisão
// do usuário 2026-07-28). Métricas de pontualidade (cumpriu o prazo?) e
// velocidade (tempo de execução, clock só a partir de "iniciar") ficam
// SEMPRE separadas — velocidade sozinha não vira ranking (conselho).

router.get('/revisao/aux/responsaveis', async (req, res) => {
  try {
    const { data, error } = await supabase.from('profiles').select('id, name, email').eq('active', true).order('name');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar responsáveis' }); }
});

router.get('/revisao/ciclos', async (req, res) => {
  try {
    const { data: ciclos, error } = await supabase.from('pat_revisao_ciclos')
      .select('*, profiles!responsavel_id(name)').order('data_inicio', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    const ids = (ciclos || []).map((c) => c.id);
    let convocacoes = [];
    if (ids.length) {
      const { data } = await supabase.from('pat_revisao_convocacoes')
        .select('*, pat_localizacoes(nome)').in('ciclo_id', ids);
      convocacoes = data || [];
    }
    const result = (ciclos || []).map((c) => {
      const convs = convocacoes.filter((v) => v.ciclo_id === c.id);
      return {
        ...c,
        convocacoes: convs,
        total_convocacoes: convs.length,
        total_concluidas: convs.filter((v) => v.status === 'concluida').length,
      };
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar ciclos de revisão' }); }
});

router.post('/revisao/ciclos', authorizeModule('patrimonio', 4), async (req, res) => {
  try {
    const { responsavel_id, data_inicio } = req.body;
    if (!responsavel_id || !data_inicio) return res.status(400).json({ error: 'Responsável e data de início são obrigatórios' });

    const inicio = new Date(`${data_inicio}T00:00:00`);
    if (isNaN(inicio.getTime())) return res.status(400).json({ error: 'Data de início inválida' });
    const fim = new Date(inicio);
    fim.setMonth(fim.getMonth() + 3);
    fim.setDate(fim.getDate() - 1);

    const ano = inicio.getFullYear();
    const { count } = await supabase.from('pat_revisao_ciclos').select('id', { count: 'exact', head: true })
      .gte('data_inicio', `${ano}-01-01`).lte('data_inicio', `${ano}-12-31`);
    const nome = `${ano}/${(count || 0) + 1}`;

    const { data: ciclo, error } = await supabase.from('pat_revisao_ciclos')
      .insert({ nome, data_inicio, data_fim: fim.toISOString().slice(0, 10), responsavel_id, created_by: req.user.userId })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });

    const { data: localizacoes } = await supabase.from('pat_localizacoes')
      .select('id, revisao_intervalo_dias, revisao_prazo_dias');
    const { data: bens } = await supabase.from('pat_bens').select('id, localizacao_id')
      .eq('status', 'ativo').not('localizacao_id', 'is', null);
    const bensPorLoc = new Map();
    for (const b of bens || []) {
      if (!bensPorLoc.has(b.localizacao_id)) bensPorLoc.set(b.localizacao_id, []);
      bensPorLoc.get(b.localizacao_id).push(b.id);
    }
    const todasComBens = (localizacoes || []).filter((l) => bensPorLoc.has(l.id));

    // Intervalo variável (pedido do usuário 2026-08-10): localização com
    // `revisao_intervalo_dias` preenchido só entra neste ciclo se já passou
    // esse número de dias desde a ÚLTIMA convocação concluída dela (em
    // qualquer ciclo anterior). Nunca revisada = sempre entra (não tem "última
    // vez" pra contar). Sem `revisao_intervalo_dias` = comportamento legado
    // (entra em todo ciclo).
    const idsComIntervalo = todasComBens.filter((l) => l.revisao_intervalo_dias).map((l) => l.id);
    const ultimaConclusaoPorLoc = new Map();
    if (idsComIntervalo.length) {
      const { data: concluidas } = await supabase.from('pat_revisao_convocacoes')
        .select('localizacao_id, data_conclusao')
        .in('localizacao_id', idsComIntervalo).eq('status', 'concluida').not('data_conclusao', 'is', null);
      for (const c of concluidas || []) {
        const atual = ultimaConclusaoPorLoc.get(c.localizacao_id);
        if (!atual || c.data_conclusao > atual) ultimaConclusaoPorLoc.set(c.localizacao_id, c.data_conclusao);
      }
    }
    const locsComBens = todasComBens.filter((l) => {
      if (!l.revisao_intervalo_dias) return true; // legado: sempre entra
      const ultima = ultimaConclusaoPorLoc.get(l.id);
      if (!ultima) return true; // nunca revisada: sempre entra
      const diasDesde = Math.floor((inicio.getTime() - new Date(ultima).getTime()) / 86400000);
      return diasDesde >= l.revisao_intervalo_dias;
    });

    const spanMs = fim.getTime() - inicio.getTime();
    const n = locsComBens.length;
    for (let i = 0; i < n; i++) {
      const loc = locsComBens[i];
      const bensIds = bensPorLoc.get(loc.id);
      // Prazo variável (pedido do usuário 2026-08-10): localização com
      // `revisao_prazo_dias` preenchido usa prazo próprio (data_inicio + N
      // dias, no lugar dos limites do ciclo). Sem isso, cai no legado
      // (distribuído proporcionalmente dentro do período do ciclo).
      const prazoMs = loc.revisao_prazo_dias
        ? inicio.getTime() + loc.revisao_prazo_dias * 86400000
        : (n > 1 ? inicio.getTime() + Math.round((spanMs * (i + 1)) / n) : fim.getTime());
      const { data: conv, error: convErr } = await supabase.from('pat_revisao_convocacoes')
        .insert({ ciclo_id: ciclo.id, localizacao_id: loc.id, prazo: new Date(prazoMs).toISOString().slice(0, 10), total_bens_esperados: bensIds.length })
        .select().single();
      if (convErr) continue;
      const itens = bensIds.map((bid) => ({ convocacao_id: conv.id, bem_id: bid }));
      if (itens.length) await supabase.from('pat_revisao_itens').insert(itens);
    }
    res.json(ciclo);
  } catch (e) { console.error('[PAT] criar ciclo revisão:', e.message); res.status(500).json({ error: 'Erro ao criar ciclo de revisão' }); }
});

router.get('/revisao/convocacoes/:id', async (req, res) => {
  try {
    const { data: conv, error } = await supabase.from('pat_revisao_convocacoes')
      .select('*, pat_localizacoes(nome), pat_revisao_ciclos(nome, responsavel_id)')
      .eq('id', req.params.id).single();
    if (error) return res.status(404).json({ error: 'Convocação não encontrada' });
    const { data: itens } = await supabase.from('pat_revisao_itens')
      .select('*, pat_bens(nome, codigo_barras, numero_serie)')
      .eq('convocacao_id', req.params.id).order('created_at');
    res.json({ ...conv, itens: itens || [] });
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar convocação' }); }
});

router.post('/revisao/convocacoes/:id/iniciar', authorizeModule('patrimonio', 4), async (req, res) => {
  try {
    const { data, error } = await supabase.from('pat_revisao_convocacoes')
      .update({ status: 'em_andamento', data_inicio: new Date().toISOString() })
      .eq('id', req.params.id).eq('status', 'pendente').select().single();
    if (error || !data) return res.status(400).json({ error: 'Convocação já iniciada ou inexistente' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao iniciar convocação' }); }
});

// Divergência de localização (pedido do usuário 2026-07-29, item 2): o item
// NUNCA move o bem sozinho — só quando divergencia_acao === 'movido' o
// revisor decidiu explicitamente mover de fato. 'alerta' mantém o bem onde
// está, só liga um aviso nele. Ausência de divergencia_acao (conferência sem
// divergência, ou ainda não decidida) não toca em pat_bens.
router.put('/revisao/itens/:id', async (req, res) => {
  try {
    const { encontrado, status_fisico, observacao, localizacao_encontrada_id, divergencia_acao } = req.body;
    if (divergencia_acao && !['movido', 'alerta'].includes(divergencia_acao)) {
      return res.status(400).json({ error: 'divergencia_acao inválida' });
    }
    const { data: item, error } = await supabase.from('pat_revisao_itens')
      .update({
        encontrado: !!encontrado, status_fisico: status_fisico || null, observacao: observacao || null,
        data_revisao: new Date().toISOString(),
        localizacao_encontrada_id: localizacao_encontrada_id || null,
        divergencia_acao: divergencia_acao || null,
      })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });

    if (divergencia_acao === 'movido' && localizacao_encontrada_id) {
      const { data: bem } = await supabase.from('pat_bens').select('localizacao_id').eq('id', item.bem_id).single();
      const { error: movErr } = await supabase.rpc('pat_registrar_movimentacao', {
        p_bem_id: item.bem_id, p_tipo: 'transferencia',
        p_localizacao_origem_id: bem?.localizacao_id || null, p_localizacao_destino_id: localizacao_encontrada_id,
        p_responsavel_id: req.user.userId, p_revisao_item_id: item.id,
        p_motivo: 'Divergência encontrada na revisão periódica — bem estava em local diferente do esperado e foi realocado de fato.',
        p_created_by: req.user.userId,
      });
      if (movErr) return res.status(400).json({ error: movErr.message });
    } else if (divergencia_acao === 'alerta') {
      await supabase.from('pat_bens').update({ alerta_divergencia_item_id: item.id }).eq('id', item.bem_id);
    }

    // Recálculo atômico via RPC — evita "lost update" de duas conferências
    // concorrentes na mesma convocação (dívida técnica corrigida 2026-07-29).
    await supabase.rpc('pat_recalcular_convocacao', { p_convocacao_id: item.convocacao_id });
    res.json(item);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar item de revisão' }); }
});

// Dispensar o alerta de divergência ligado num bem (mantido no lugar mas
// sinalizado) — decisão humana explícita, nunca automática.
router.post('/bens/:id/dispensar-alerta', authorizeModule('patrimonio', 3), async (req, res) => {
  try {
    const { error } = await supabase.from('pat_bens').update({ alerta_divergencia_item_id: null }).eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao dispensar alerta' }); }
});

router.post('/revisao/convocacoes/:id/concluir', authorizeModule('patrimonio', 4), async (req, res) => {
  try {
    const { data, error } = await supabase.from('pat_revisao_convocacoes')
      .update({ status: 'concluida', data_conclusao: new Date().toISOString() })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao concluir convocação' }); }
});

// Pontualidade (cumpriu o prazo) e velocidade (tempo de execução) SEMPRE
// separadas + sinal de qualidade (divergência) ao lado — decisão do conselho:
// velocidade sozinha não vira ranking de desempenho.
router.get('/revisao/indicadores', async (req, res) => {
  try {
    const { data: convs, error } = await supabase.from('pat_revisao_convocacoes')
      .select('*, pat_localizacoes(nome)').eq('status', 'concluida');
    if (error) return res.status(400).json({ error: error.message });
    const lista = convs || [];
    const pontuais = lista.filter((c) => c.data_conclusao && c.prazo && c.data_conclusao.slice(0, 10) <= c.prazo);
    const comTempo = lista.filter((c) => c.data_inicio && c.data_conclusao);
    const tempoMedioMin = comTempo.length
      ? Math.round(comTempo.reduce((s, c) => s + (new Date(c.data_conclusao) - new Date(c.data_inicio)), 0) / comTempo.length / 60000)
      : null;
    const totalItens = lista.reduce((s, c) => s + (c.total_bens_esperados || 0), 0);
    const totalDivergencias = lista.reduce((s, c) => s + (c.total_divergencias || 0), 0);
    res.json({
      total_convocacoes_concluidas: lista.length,
      pontualidade_pct: lista.length ? Math.round((pontuais.length / lista.length) * 100) : null,
      tempo_medio_minutos: tempoMedioMin,
      divergencia_pct: totalItens ? Math.round((totalDivergencias / totalItens) * 100) : null,
    });
  } catch (e) { res.status(500).json({ error: 'Erro ao calcular indicadores de revisão' }); }
});

module.exports = router;
