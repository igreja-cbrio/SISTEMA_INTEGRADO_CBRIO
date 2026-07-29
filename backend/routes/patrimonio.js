const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { escapePostgrestValue } = require('../utils/sanitize');

router.use(authenticate, authorizeModule('patrimonio'));

// Depreciação · indicador GERENCIAL interno (decisão do usuário 2026-07-29 ·
// NÃO é cálculo contábil oficial). Método linear simples, sempre derivado na
// hora — nunca gravado por período. Retorna null quando faltar algum dado
// necessário (valor de aquisição, data de aquisição ou vida útil da categoria).
function calcularDepreciacao(bem) {
  const vidaUtilMeses = bem?.pat_categorias?.vida_util_meses;
  const valor = bem?.valor_aquisicao != null ? Number(bem.valor_aquisicao) : null;
  if (!vidaUtilMeses || valor == null || !bem?.data_aquisicao) return null;
  const aquisicao = new Date(bem.data_aquisicao + 'T00:00:00');
  if (Number.isNaN(aquisicao.getTime())) return null;
  const agora = new Date();
  let mesesDecorridos = (agora.getFullYear() - aquisicao.getFullYear()) * 12 + (agora.getMonth() - aquisicao.getMonth());
  if (agora.getDate() < aquisicao.getDate()) mesesDecorridos -= 1;
  mesesDecorridos = Math.max(0, mesesDecorridos);
  const percentual = Math.min(100, (mesesDecorridos / vidaUtilMeses) * 100);
  const valorAtual = Math.max(0, valor * (1 - percentual / 100));
  return {
    vida_util_meses: vidaUtilMeses,
    meses_decorridos: mesesDecorridos,
    percentual_depreciado: Math.round(percentual * 10) / 10,
    valor_atual_estimado: Math.round(valorAtual * 100) / 100,
  };
}

// ── DASHBOARD ──────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    // RPC dedicada (SECURITY DEFINER) · funciona no serverless e ignora o cap de
    // 1k linhas. (O antigo fallback via pool pg não conecta no Vercel · removido.)
    const { data, error } = await supabase.rpc('pat_dashboard_stats');
    if (error) throw error;
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
        .select('valor_aquisicao, data_aquisicao, status, pat_categorias(vida_util_meses)')
        .neq('status', 'baixado')
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }
    let valorAquisicaoTotal = 0, valorAtualTotal = 0, bensComDepreciacao = 0, bensSemConfiguracao = 0;
    for (const bem of all) {
      const dep = calcularDepreciacao(bem);
      if (dep) {
        bensComDepreciacao++;
        valorAquisicaoTotal += Number(bem.valor_aquisicao);
        valorAtualTotal += dep.valor_atual_estimado;
      } else if (bem.valor_aquisicao != null) {
        bensSemConfiguracao++;
      }
    }
    res.json({
      valor_aquisicao_total: Math.round(valorAquisicaoTotal * 100) / 100,
      valor_atual_estimado_total: Math.round(valorAtualTotal * 100) / 100,
      bens_com_depreciacao: bensComDepreciacao,
      bens_sem_configuracao: bensSemConfiguracao,
    });
  } catch (e) {
    console.error('[PAT] Agregado de depreciação falhou:', e.message);
    res.status(500).json({ error: 'Erro ao calcular depreciação agregada' });
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

router.post('/categorias', async (req, res) => {
  try {
    const { nome, icone, pai_id, vida_util_meses } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const { data, error } = await supabase.from('pat_categorias')
      .insert({ nome, icone: icone || null, pai_id: pai_id || null, vida_util_meses: vida_util_meses || null }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar categoria' }); }
});

router.put('/categorias/:id', async (req, res) => {
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

router.delete('/categorias/:id', async (req, res) => {
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

router.post('/localizacoes', async (req, res) => {
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

router.put('/localizacoes/:id', async (req, res) => {
  try {
    const { nome, pai_id } = req.body;
    const update = {};
    if (nome !== undefined) update.nome = nome;
    if (pai_id !== undefined) {
      if (pai_id && await paiCriaCiclo(pai_id, req.params.id)) {
        return res.status(400).json({ error: 'Localização pai inválida (criaria um ciclo)' });
      }
      update.pai_id = pai_id || null;
    }
    const { data, error } = await supabase.from('pat_localizacoes')
      .update(update).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar localização' }); }
});

router.delete('/localizacoes/:id', async (req, res) => {
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
    let query = supabase.from('pat_bens').select('*, pat_categorias(nome, vida_util_meses), pat_localizacoes(nome), responsavel:profiles!responsavel_id(name), alerta:pat_revisao_itens!alerta_divergencia_item_id(data_revisao, localizacao_encontrada:pat_localizacoes!localizacao_encontrada_id(nome))').order('nome');
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
    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json((data || []).map(b => ({ ...b, depreciacao: calcularDepreciacao(b) })));
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

router.post('/bens', async (req, res) => {
  try {
    const { codigo_barras, nome, descricao, categoria_id, localizacao_id, numero_serie, marca, modelo, valor_aquisicao, data_aquisicao, observacoes, numero_nf, tem_garantia, garantia_ate, responsavel_id } = req.body;
    if (!codigo_barras || !nome) return res.status(400).json({ error: 'Código de barras e nome são obrigatórios' });
    const { data, error } = await supabase.from('pat_bens')
      .insert({ codigo_barras, nome, descricao: descricao || null, categoria_id: categoria_id || null, localizacao_id: localizacao_id || null, numero_serie: numero_serie || null, marca: marca || null, modelo: modelo || null, valor_aquisicao: valor_aquisicao || null, data_aquisicao: data_aquisicao || null, observacoes: observacoes || null, numero_nf: numero_nf || null, tem_garantia: !!tem_garantia, garantia_ate: garantia_ate || null, responsavel_id: responsavel_id || null, created_by: req.user.userId })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao cadastrar bem' }); }
});

router.put('/bens/:id', async (req, res) => {
  try {
    const { codigo_barras, nome, descricao, categoria_id, localizacao_id, numero_serie, marca, modelo, valor_aquisicao, data_aquisicao, status, observacoes, numero_nf, tem_garantia, garantia_ate, responsavel_id, data_baixa } = req.body;
    // Reatribuir a localização (edição manual do cadastro) é decisão humana —
    // limpa o alerta de "localização pendente de reavaliação" (hierarquia
    // 2026-07-29). Se localizacao_id não veio no payload, o alerta é preservado.
    const update = { codigo_barras, nome, descricao: descricao || null, categoria_id: categoria_id || null, localizacao_id: localizacao_id || null, numero_serie: numero_serie || null, marca: marca || null, modelo: modelo || null, valor_aquisicao: valor_aquisicao || null, data_aquisicao: data_aquisicao || null, status, observacoes: observacoes || null, numero_nf: numero_nf || null, tem_garantia: !!tem_garantia, garantia_ate: garantia_ate || null, responsavel_id: responsavel_id || null };
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
router.delete('/bens/:id', async (req, res) => {
  try {
    const { error: movErr } = await supabase.from('pat_movimentacoes')
      .insert({ bem_id: req.params.id, tipo: 'baixa', responsavel_id: req.user.userId, motivo: req.body?.motivo || null, created_by: req.user.userId });
    if (movErr) return res.status(400).json({ error: movErr.message });
    const { error } = await supabase.from('pat_bens').update({ status: 'baixado', data_baixa: new Date().toISOString().slice(0, 10) }).eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao dar baixa no bem' }); }
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

router.post('/bens/:id/movimentacoes', async (req, res) => {
  try {
    const { tipo, localizacao_origem_id, localizacao_destino_id, motivo } = req.body;
    if (!tipo) return res.status(400).json({ error: 'Tipo é obrigatório' });
    const { data, error } = await supabase.from('pat_movimentacoes')
      .insert({ bem_id: req.params.id, tipo, localizacao_origem_id: localizacao_origem_id || null, localizacao_destino_id: localizacao_destino_id || null, responsavel_id: req.user.userId, motivo: motivo || null, created_by: req.user.userId })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    // Atualizar localização do bem se for transferência
    if (tipo === 'transferencia' && localizacao_destino_id) {
      await supabase.from('pat_bens').update({ localizacao_id: localizacao_destino_id, localizacao_pendente: false, alerta_divergencia_item_id: null }).eq('id', req.params.id);
    }
    if (tipo === 'manutencao') {
      await supabase.from('pat_bens').update({ status: 'manutencao' }).eq('id', req.params.id);
    }
    if (tipo === 'baixa') {
      await supabase.from('pat_bens').update({ status: 'baixado' }).eq('id', req.params.id);
    }
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

router.post('/revisao/ciclos', async (req, res) => {
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

    const { data: localizacoes } = await supabase.from('pat_localizacoes').select('id');
    const { data: bens } = await supabase.from('pat_bens').select('id, localizacao_id')
      .eq('status', 'ativo').not('localizacao_id', 'is', null);
    const bensPorLoc = new Map();
    for (const b of bens || []) {
      if (!bensPorLoc.has(b.localizacao_id)) bensPorLoc.set(b.localizacao_id, []);
      bensPorLoc.get(b.localizacao_id).push(b.id);
    }
    const locsComBens = (localizacoes || []).filter((l) => bensPorLoc.has(l.id));
    const spanMs = fim.getTime() - inicio.getTime();
    const n = locsComBens.length;
    for (let i = 0; i < n; i++) {
      const loc = locsComBens[i];
      const bensIds = bensPorLoc.get(loc.id);
      const prazoMs = n > 1 ? inicio.getTime() + Math.round((spanMs * (i + 1)) / n) : fim.getTime();
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

router.post('/revisao/convocacoes/:id/iniciar', async (req, res) => {
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
      await supabase.from('pat_movimentacoes').insert({
        bem_id: item.bem_id, tipo: 'transferencia',
        localizacao_origem_id: bem?.localizacao_id || null, localizacao_destino_id: localizacao_encontrada_id,
        responsavel_id: req.user.userId, revisao_item_id: item.id,
        motivo: 'Divergência encontrada na revisão periódica — bem estava em local diferente do esperado e foi realocado de fato.',
        created_by: req.user.userId,
      });
      await supabase.from('pat_bens').update({ localizacao_id: localizacao_encontrada_id, localizacao_pendente: false, alerta_divergencia_item_id: null }).eq('id', item.bem_id);
    } else if (divergencia_acao === 'alerta') {
      await supabase.from('pat_bens').update({ alerta_divergencia_item_id: item.id }).eq('id', item.bem_id);
    }

    const { data: todos } = await supabase.from('pat_revisao_itens')
      .select('encontrado, status_fisico').eq('convocacao_id', item.convocacao_id);
    const conferidos = (todos || []).filter((i) => i.encontrado !== null).length;
    const divergencias = (todos || []).filter((i) => i.encontrado === false || i.status_fisico === 'danificado' || i.status_fisico === 'nao_encontrado').length;
    await supabase.from('pat_revisao_convocacoes')
      .update({ total_bens_conferidos: conferidos, total_divergencias: divergencias }).eq('id', item.convocacao_id);
    res.json(item);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar item de revisão' }); }
});

// Dispensar o alerta de divergência ligado num bem (mantido no lugar mas
// sinalizado) — decisão humana explícita, nunca automática.
router.post('/bens/:id/dispensar-alerta', async (req, res) => {
  try {
    const { error } = await supabase.from('pat_bens').update({ alerta_divergencia_item_id: null }).eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao dispensar alerta' }); }
});

router.post('/revisao/convocacoes/:id/concluir', async (req, res) => {
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
