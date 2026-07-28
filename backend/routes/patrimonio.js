const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { escapePostgrestValue } = require('../utils/sanitize');

router.use(authenticate, authorizeModule('patrimonio'));

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
    const { nome, icone, pai_id } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const { data, error } = await supabase.from('pat_categorias')
      .insert({ nome, icone: icone || null, pai_id: pai_id || null }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar categoria' }); }
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
    const { data, error } = await supabase.from('pat_localizacoes')
      .select('*, profiles!coordenador_id(name)').order('nome');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar localizações' }); }
});

router.post('/localizacoes', async (req, res) => {
  try {
    const { nome, pai_id } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const { data, error } = await supabase.from('pat_localizacoes')
      .insert({ nome, pai_id: pai_id || null }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar localização' }); }
});

// Coordenador da área acompanha os indicadores/revisões da própria localização.
router.put('/localizacoes/:id', async (req, res) => {
  try {
    const { nome, pai_id, coordenador_id } = req.body;
    const update = {};
    if (nome !== undefined) update.nome = nome;
    if (pai_id !== undefined) update.pai_id = pai_id || null;
    if (coordenador_id !== undefined) update.coordenador_id = coordenador_id || null;
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
    let query = supabase.from('pat_bens').select('*, pat_categorias(nome), pat_localizacoes(nome)').order('nome');
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
    res.json(data);
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
      .select('*, pat_categorias(nome), pat_localizacoes(nome)')
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
    res.json({ ...bem, movimentacoes: movs || [] });
  } catch (e) {
    console.error('[PATRIMONIO] barcode lookup exception:', e.message);
    res.status(500).json({ error: 'Erro ao buscar bem por código' });
  }
});

router.get('/bens/:id', async (req, res) => {
  try {
    const { data: bem, error } = await supabase.from('pat_bens')
      .select('*, pat_categorias(nome), pat_localizacoes(nome)').eq('id', req.params.id).single();
    if (error) return res.status(404).json({ error: 'Bem não encontrado' });
    const { data: movs } = await supabase.from('pat_movimentacoes')
      .select('*, profiles!responsavel_id(name)').eq('bem_id', req.params.id).order('data_movimentacao', { ascending: false });
    res.json({ ...bem, movimentacoes: movs || [] });
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar bem' }); }
});

router.post('/bens', async (req, res) => {
  try {
    const { codigo_barras, nome, descricao, categoria_id, localizacao_id, numero_serie, marca, modelo, valor_aquisicao, data_aquisicao, observacoes } = req.body;
    if (!codigo_barras || !nome) return res.status(400).json({ error: 'Código de barras e nome são obrigatórios' });
    const { data, error } = await supabase.from('pat_bens')
      .insert({ codigo_barras, nome, descricao: descricao || null, categoria_id: categoria_id || null, localizacao_id: localizacao_id || null, numero_serie: numero_serie || null, marca: marca || null, modelo: modelo || null, valor_aquisicao: valor_aquisicao || null, data_aquisicao: data_aquisicao || null, observacoes: observacoes || null, created_by: req.user.userId })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao cadastrar bem' }); }
});

router.put('/bens/:id', async (req, res) => {
  try {
    const { codigo_barras, nome, descricao, categoria_id, localizacao_id, numero_serie, marca, modelo, valor_aquisicao, data_aquisicao, status, observacoes } = req.body;
    const { data, error } = await supabase.from('pat_bens')
      .update({ codigo_barras, nome, descricao: descricao || null, categoria_id: categoria_id || null, localizacao_id: localizacao_id || null, numero_serie: numero_serie || null, marca: marca || null, modelo: modelo || null, valor_aquisicao: valor_aquisicao || null, data_aquisicao: data_aquisicao || null, status, observacoes: observacoes || null })
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
    const { error } = await supabase.from('pat_bens').update({ status: 'baixado' }).eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao dar baixa no bem' }); }
});

// ── MOVIMENTAÇÕES ──────────────────────────────────────────
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
      await supabase.from('pat_bens').update({ localizacao_id: localizacao_destino_id }).eq('id', req.params.id);
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

router.put('/revisao/itens/:id', async (req, res) => {
  try {
    const { encontrado, status_fisico, observacao } = req.body;
    const { data: item, error } = await supabase.from('pat_revisao_itens')
      .update({ encontrado: !!encontrado, status_fisico: status_fisico || null, observacao: observacao || null, data_revisao: new Date().toISOString() })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    const { data: todos } = await supabase.from('pat_revisao_itens')
      .select('encontrado, status_fisico').eq('convocacao_id', item.convocacao_id);
    const conferidos = (todos || []).filter((i) => i.encontrado !== null).length;
    const divergencias = (todos || []).filter((i) => i.encontrado === false || i.status_fisico === 'danificado' || i.status_fisico === 'nao_encontrado').length;
    await supabase.from('pat_revisao_convocacoes')
      .update({ total_bens_conferidos: conferidos, total_divergencias: divergencias }).eq('id', item.convocacao_id);
    res.json(item);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar item de revisão' }); }
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
      .select('*, pat_localizacoes(nome, coordenador_id)').eq('status', 'concluida');
    if (error) return res.status(400).json({ error: error.message });
    let lista = convs || [];
    if (req.query.minhas === '1') {
      lista = lista.filter((c) => c.pat_localizacoes?.coordenador_id === req.user.userId);
    }
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
