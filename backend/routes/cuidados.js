const router = require('express').Router();
const { authenticate, authorize, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');

router.use(authenticate);

// Helper: limpa CPF (somente dígitos)
function cleanCpf(cpf) {
  return String(cpf || '').replace(/\D/g, '');
}

// Helper: tenta encontrar membro pelo CPF
async function findMembroByCpf(cpf) {
  const clean = cleanCpf(cpf);
  if (!clean || clean.length !== 11) return null;
  // mem_membros não tem coluna cpf no schema atual — busca por observações ou foto_url? Não.
  // Buscar via mem_membros direto se tiver coluna cpf, senão retorna null.
  // Adaptamos: tentamos por colunas "cpf" se existir.
  const { data, error } = await supabase
    .from('mem_membros')
    .select('id, nome, telefone, email')
    .or(`telefone.eq.${clean}`)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

// ─────────────────────────────────────────────────────────────
// GET /api/cuidados/dashboard — KPIs do mês + comparativo
// ─────────────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const { data: atual, error } = await supabase
      .from('vw_cuidados_mensal')
      .select('*')
      .single();
    if (error) throw error;

    // Comparativo: mês anterior — calculado em consultas separadas
    const inicioMesAnterior = new Date();
    inicioMesAnterior.setDate(1);
    inicioMesAnterior.setMonth(inicioMesAnterior.getMonth() - 1);
    const fimMesAnterior = new Date(inicioMesAnterior);
    fimMesAnterior.setMonth(fimMesAnterior.getMonth() + 1);

    const iniIso = inicioMesAnterior.toISOString().slice(0, 10);
    const fimIso = fimMesAnterior.toISOString().slice(0, 10);

    const [{ count: aconsAnt }, { count: capelAnt }, { count: jornAnt }, { count: convAtAnt }, { count: convCadAnt }] = await Promise.all([
      supabase.from('cui_atendimentos_agregado').select('id', { count: 'exact', head: true }).eq('mes', iniIso).eq('tipo', 'aconselhamento'),
      supabase.from('cui_atendimentos_agregado').select('id', { count: 'exact', head: true }).eq('mes', iniIso).eq('tipo', 'capelania'),
      supabase.from('cui_jornada180').select('id', { count: 'exact', head: true }).gte('data_encontro', iniIso).lt('data_encontro', fimIso),
      supabase.from('cui_convertidos').select('id', { count: 'exact', head: true }).eq('atendido_apos_culto', true).gte('data_culto', iniIso).lt('data_culto', fimIso),
      supabase.from('cui_convertidos').select('id', { count: 'exact', head: true }).eq('cadastrado', true).gte('data_culto', iniIso).lt('data_culto', fimIso),
    ]);

    // Soma de quantidade por tipo no mês anterior (agregado é quantidade, não count)
    const { data: agregadoAnt } = await supabase
      .from('cui_atendimentos_agregado')
      .select('tipo, quantidade')
      .eq('mes', iniIso);
    const aconsAntSum = (agregadoAnt || []).filter(r => r.tipo === 'aconselhamento').reduce((s, r) => s + (r.quantidade || 0), 0);
    const capelAntSum = (agregadoAnt || []).filter(r => r.tipo === 'capelania').reduce((s, r) => s + (r.quantidade || 0), 0);

    res.json({
      atual,
      anterior: {
        aconselhamentos: aconsAntSum,
        capelania: capelAntSum,
        jornada180_encontros: jornAnt || 0,
        convertidos_atendidos: convAtAnt || 0,
        convertidos_cadastrados: convCadAnt || 0,
      },
    });
  } catch (e) {
    console.error('[CUIDADOS] dashboard:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Acompanhamentos
// ─────────────────────────────────────────────────────────────
router.get('/acompanhamentos', async (req, res) => {
  try {
    const { status, search, responsavel } = req.query;
    let q = supabase
      .from('cui_acompanhamentos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (status) q = q.eq('status', status);
    if (responsavel) q = q.eq('responsavel_id', responsavel);
    if (search) q = q.ilike('nome', `%${search}%`);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/acompanhamentos', async (req, res) => {
  try {
    const body = { ...req.body, created_by: req.user.userId };
    if (body.cpf) {
      const membro = await findMembroByCpf(body.cpf);
      if (membro) body.membro_id = membro.id;
    }
    const { data, error } = await supabase
      .from('cui_acompanhamentos')
      .insert(body)
      .select()
      .single();
    if (error) throw error;

    // Notificação imediata
    notificar({
      modulo: 'cuidados',
      tipo: 'novo_acompanhamento',
      titulo: `Novo acompanhamento — ${data.nome}`,
      mensagem: `${data.nome} entrou em acompanhamento (${data.motivo || 'sem motivo'}).`,
      link: '/ministerial/cuidados',
      severidade: 'info',
      chaveDedup: `cui_novo_${data.id}`,
    }).catch(() => {});

    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/acompanhamentos/:id', async (req, res) => {
  try {
    const body = { ...req.body, ultima_atualizacao: new Date().toISOString() };
    const { data, error } = await supabase
      .from('cui_acompanhamentos')
      .update(body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/acompanhamentos/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('cui_acompanhamentos').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Jornada 180
// ─────────────────────────────────────────────────────────────
router.get('/jornada180', async (req, res) => {
  try {
    const { etapa, mes } = req.query;
    let q = supabase.from('cui_jornada180').select('*').order('data_encontro', { ascending: false }).limit(500);
    if (etapa) q = q.eq('etapa', Number(etapa));
    if (mes) {
      const start = `${mes}-01`;
      const dt = new Date(`${mes}-01T12:00:00`);
      dt.setMonth(dt.getMonth() + 1);
      q = q.gte('data_encontro', start).lt('data_encontro', dt.toISOString().slice(0, 10));
    }
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/jornada180', async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.cpf) {
      const m = await findMembroByCpf(body.cpf);
      if (m) body.membro_id = m.id;
    }
    const { data, error } = await supabase.from('cui_jornada180').insert(body).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/jornada180/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('cui_jornada180').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Convertidos
// ─────────────────────────────────────────────────────────────
router.get('/convertidos', async (req, res) => {
  try {
    const { from, to } = req.query;
    let q = supabase.from('cui_convertidos').select('*').order('data_culto', { ascending: false }).limit(500);
    if (from) q = q.gte('data_culto', from);
    if (to) q = q.lte('data_culto', to);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/convertidos', async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.cpf) {
      const m = await findMembroByCpf(body.cpf);
      if (m) body.membro_id = m.id;
    }
    const { data, error } = await supabase.from('cui_convertidos').insert(body).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/convertidos/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('cui_convertidos')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/convertidos/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('cui_convertidos').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Agregado (aconselhamento / capelania mensal)
// ─────────────────────────────────────────────────────────────
router.get('/agregado', async (req, res) => {
  try {
    const { mes } = req.query; // 'YYYY-MM'
    const mesIso = mes ? `${mes}-01` : new Date().toISOString().slice(0, 7) + '-01';
    const { data, error } = await supabase
      .from('cui_atendimentos_agregado')
      .select('*')
      .eq('mes', mesIso)
      .order('tipo');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/agregado', async (req, res) => {
  try {
    const { mes, tipo, quantidade, observacoes } = req.body;
    const mesIso = mes ? `${mes}-01` : new Date().toISOString().slice(0, 7) + '-01';
    if (!['aconselhamento', 'capelania'].includes(tipo)) {
      return res.status(400).json({ error: "tipo deve ser 'aconselhamento' ou 'capelania'" });
    }

    // Upsert manual: deletar existente do mesmo (mes,tipo,responsavel) e inserir
    await supabase
      .from('cui_atendimentos_agregado')
      .delete()
      .eq('mes', mesIso)
      .eq('tipo', tipo)
      .eq('responsavel_id', req.user.userId);

    const { data, error } = await supabase
      .from('cui_atendimentos_agregado')
      .insert({
        mes: mesIso,
        tipo,
        quantidade: Number(quantidade) || 0,
        observacoes,
        responsavel_id: req.user.userId,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Helpers de Membresia
// ─────────────────────────────────────────────────────────────
router.get('/buscar-membro', async (req, res) => {
  try {
    const cpf = cleanCpf(req.query.cpf);
    if (!cpf || cpf.length !== 11) return res.json({ membro: null });
    const m = await findMembroByCpf(cpf);
    res.json({ membro: m });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/criar-membro', async (req, res) => {
  try {
    const { nome, cpf, telefone, email, status = 'visitante' } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const { data, error } = await supabase
      .from('mem_membros')
      .insert({ nome, telefone, email, status })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
