const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

const STATUS_VALIDOS = [
  'novo', 'primeiro_contato', 'acompanhamento', 'discipulado',
  'batizado', 'membro_ativo', 'inativo', 'mudou_cidade',
];

const CAMPOS_VISITANTE = [
  'nome', 'telefone', 'email', 'idade', 'data_visita', 'culto_id',
  'origem', 'veio_acompanhado', 'fez_decisao', 'tipo_decisao',
  'responsavel_id', 'status', 'membresia_id', 'observacoes',
];

function sanitize(body, allowed) {
  const out = {};
  for (const k of allowed) if (body[k] !== undefined) out[k] = body[k];
  return out;
}

// ── GET /visitantes — lista com filtros ─────────────────────────────────────
router.get('/visitantes', async (req, res) => {
  try {
    const { status, responsavel_id, culto_id, search, fez_decisao } = req.query;
    let q = supabase
      .from('int_visitantes')
      .select(`
        *,
        responsavel:vol_profiles!int_visitantes_responsavel_id_fkey(id, full_name, avatar_url),
        culto:vol_services(id, name, scheduled_at)
      `)
      .order('data_visita', { ascending: false })
      .order('created_at', { ascending: false });

    if (status) q = q.eq('status', status);
    if (responsavel_id) q = q.eq('responsavel_id', responsavel_id);
    if (culto_id) q = q.eq('culto_id', culto_id);
    if (fez_decisao !== undefined) q = q.eq('fez_decisao', fez_decisao === 'true');
    if (search) q = q.or(`nome.ilike.%${search}%,telefone.ilike.%${search}%,email.ilike.%${search}%`);

    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    console.error('[INTEGRACAO] list visitantes', e.message);
    res.status(500).json({ error: 'Erro ao listar visitantes' });
  }
});

// ── GET /visitantes/:id — detalhe com acompanhamentos ───────────────────────
router.get('/visitantes/:id', async (req, res) => {
  try {
    const { data: visitante, error } = await supabase
      .from('int_visitantes')
      .select(`
        *,
        responsavel:vol_profiles!int_visitantes_responsavel_id_fkey(id, full_name, avatar_url),
        culto:vol_services(id, name, scheduled_at)
      `)
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!visitante) return res.status(404).json({ error: 'Visitante não encontrado' });

    const { data: acompanhamentos } = await supabase
      .from('int_acompanhamentos')
      .select('*, voluntario:vol_profiles(id, full_name, avatar_url)')
      .eq('visitante_id', req.params.id)
      .order('data_contato', { ascending: false });

    res.json({ ...visitante, acompanhamentos: acompanhamentos || [] });
  } catch (e) {
    console.error('[INTEGRACAO] get visitante', e.message);
    res.status(500).json({ error: 'Erro ao buscar visitante' });
  }
});

// ── POST /visitantes ────────────────────────────────────────────────────────
router.post('/visitantes', async (req, res) => {
  try {
    const payload = sanitize(req.body, CAMPOS_VISITANTE);
    if (!payload.nome || !payload.nome.trim()) {
      return res.status(400).json({ error: 'Nome obrigatório' });
    }
    if (payload.status && !STATUS_VALIDOS.includes(payload.status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }
    payload.created_by = req.user?.userId || null;

    const { data, error } = await supabase
      .from('int_visitantes')
      .insert(payload)
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
  } catch (e) {
    console.error('[INTEGRACAO] create visitante', e.message);
    res.status(500).json({ error: 'Erro ao cadastrar visitante' });
  }
});

// ── PUT /visitantes/:id ─────────────────────────────────────────────────────
router.put('/visitantes/:id', async (req, res) => {
  try {
    const payload = sanitize(req.body, CAMPOS_VISITANTE);
    if (payload.status && !STATUS_VALIDOS.includes(payload.status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }
    const { data, error } = await supabase
      .from('int_visitantes')
      .update(payload)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    console.error('[INTEGRACAO] update visitante', e.message);
    res.status(500).json({ error: 'Erro ao atualizar visitante' });
  }
});

// ── DELETE /visitantes/:id ──────────────────────────────────────────────────
router.delete('/visitantes/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('int_visitantes').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) {
    console.error('[INTEGRACAO] delete visitante', e.message);
    res.status(500).json({ error: 'Erro ao remover visitante' });
  }
});

// ── POST /visitantes/:id/status — mudança explícita de status ───────────────
router.post('/visitantes/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!STATUS_VALIDOS.includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }
    const { data, error } = await supabase
      .from('int_visitantes')
      .update({ status })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    console.error('[INTEGRACAO] change status', e.message);
    res.status(500).json({ error: 'Erro ao alterar status' });
  }
});

// ── GET /acompanhamentos/pendentes — próximos contatos agendados ────────────
router.get('/acompanhamentos/pendentes', async (req, res) => {
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('int_acompanhamentos')
      .select(`
        *,
        visitante:int_visitantes(id, nome, status, telefone),
        voluntario:vol_profiles(id, full_name)
      `)
      .gte('data_proximo_contato', hoje)
      .order('data_proximo_contato', { ascending: true });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    console.error('[INTEGRACAO] pendentes', e.message);
    res.status(500).json({ error: 'Erro ao listar pendentes' });
  }
});

// ── POST /visitantes/:id/acompanhamentos — registra 1:1 ─────────────────────
router.post('/visitantes/:id/acompanhamentos', async (req, res) => {
  try {
    const { tipo, data_contato, resultado, observacoes, proximo_passo, data_proximo_contato, voluntario_id } = req.body;
    if (!tipo) return res.status(400).json({ error: 'Tipo obrigatório' });

    const payload = {
      visitante_id: req.params.id,
      voluntario_id: voluntario_id || null,
      tipo,
      data_contato: data_contato || new Date().toISOString(),
      resultado: resultado || null,
      observacoes: observacoes || null,
      proximo_passo: proximo_passo || null,
      data_proximo_contato: data_proximo_contato || null,
      created_by: req.user?.userId || null,
    };

    const { data, error } = await supabase
      .from('int_acompanhamentos')
      .insert(payload)
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
  } catch (e) {
    console.error('[INTEGRACAO] add acompanhamento', e.message);
    res.status(500).json({ error: 'Erro ao registrar acompanhamento' });
  }
});

// ── DELETE /acompanhamentos/:id ─────────────────────────────────────────────
router.delete('/acompanhamentos/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('int_acompanhamentos').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) {
    console.error('[INTEGRACAO] delete acompanhamento', e.message);
    res.status(500).json({ error: 'Erro ao remover acompanhamento' });
  }
});

// ── GET /dashboard — contadores do funil ────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const { data: visitantes, error } = await supabase
      .from('int_visitantes')
      .select('status, fez_decisao, data_visita');
    if (error) return res.status(400).json({ error: error.message });

    const porStatus = {};
    for (const s of STATUS_VALIDOS) porStatus[s] = 0;
    let decisoes = 0;
    let visitantesUltimos30 = 0;
    const hoje = new Date();
    const trintaDias = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);

    for (const v of visitantes || []) {
      if (v.status) porStatus[v.status] = (porStatus[v.status] || 0) + 1;
      if (v.fez_decisao) decisoes += 1;
      if (v.data_visita && new Date(v.data_visita) >= trintaDias) visitantesUltimos30 += 1;
    }

    const hojeStr = hoje.toISOString().slice(0, 10);
    const { data: pendentes } = await supabase
      .from('int_acompanhamentos')
      .select('id, data_proximo_contato')
      .gte('data_proximo_contato', hojeStr);

    const pendentesHoje = (pendentes || []).filter(p => p.data_proximo_contato === hojeStr).length;

    res.json({
      total: (visitantes || []).length,
      por_status: porStatus,
      total_decisoes: decisoes,
      visitantes_ultimos_30: visitantesUltimos30,
      acompanhamentos_pendentes: (pendentes || []).length,
      acompanhamentos_hoje: pendentesHoje,
    });
  } catch (e) {
    console.error('[INTEGRACAO] dashboard', e.message);
    res.status(500).json({ error: 'Erro ao montar dashboard' });
  }
});

module.exports = router;
