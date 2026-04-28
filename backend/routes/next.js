// ============================================================================
// Modulo NEXT - rotas autenticadas
//
// Eventos:
//   GET    /eventos                       - lista eventos (com contagem)
//   POST   /eventos                       - criar evento
//   PUT    /eventos/:id                   - atualizar
//   POST   /eventos/auto-create-mes       - cria 3 eventos do mes (1o-3o domingo)
//
// Inscricoes:
//   GET    /inscricoes                    - lista (filtros: evento_id, search, status)
//   GET    /inscricoes/:id                - detalhe
//   POST   /inscricoes                    - inscrever manualmente
//   PUT    /inscricoes/:id                - atualizar
//   POST   /inscricoes/:id/checkin        - marcar check-in
//   DELETE /inscricoes/:id/checkin        - desfazer check-in
//   POST   /inscricoes/:id/indicacoes     - { tipos: ['batismo', 'servir'...] }
//   GET    /indicacoes                    - lista de indicacoes pendentes
//   PUT    /indicacoes/:id                - atualizar status
//
// Dashboard:
//   GET    /dashboard                     - resumo do mes corrente
// ============================================================================

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const { coletarTodos } = require('../services/kpiAutoCollector');

// Re-calcula KPIs do NEXT em background (nao bloqueia a resposta).
// Chamado apos qualquer mudanca em inscricoes ou indicacoes.
function recalcularKpisNext() {
  setImmediate(async () => {
    try {
      await coletarTodos({ fontes: ['next.'] });
    } catch (e) {
      console.error('[next] erro ao recalcular KPIs:', e.message);
    }
  });
}

router.use(authenticate);

// ----------------------------------------------------------------------------
// Eventos
// ----------------------------------------------------------------------------
router.get('/eventos', async (req, res) => {
  const { ano, mes, status } = req.query;
  let q = supabase.from('next_eventos').select('*').order('data', { ascending: false });
  if (status) q = q.eq('status', status);
  if (ano) {
    const start = `${ano}-01-01`;
    const end = `${Number(ano) + 1}-01-01`;
    q = q.gte('data', start).lt('data', end);
  }
  if (mes && ano) {
    const m = String(mes).padStart(2, '0');
    const start = `${ano}-${m}-01`;
    const next = new Date(Date.UTC(Number(ano), Number(mes), 1)).toISOString().slice(0, 10);
    q = q.gte('data', start).lt('data', next);
  }
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  // Contagem de inscritos / check-ins por evento
  const ids = (data || []).map(e => e.id);
  let counts = {};
  if (ids.length) {
    const { data: rows } = await supabase
      .from('next_inscricoes')
      .select('evento_id, check_in_at')
      .in('evento_id', ids);
    for (const row of (rows || [])) {
      const k = row.evento_id;
      counts[k] = counts[k] || { inscritos: 0, checkins: 0 };
      counts[k].inscritos += 1;
      if (row.check_in_at) counts[k].checkins += 1;
    }
  }
  res.json((data || []).map(e => ({
    ...e,
    inscritos: counts[e.id]?.inscritos || 0,
    checkins: counts[e.id]?.checkins || 0,
  })));
});

router.post('/eventos', async (req, res) => {
  const { data, titulo, observacoes } = req.body || {};
  if (!data) return res.status(400).json({ error: 'data obrigatoria' });
  const { data: row, error } = await supabase
    .from('next_eventos')
    .insert({ data, titulo: titulo || null, observacoes: observacoes || null })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(row);
});

router.put('/eventos/:id', async (req, res) => {
  const allowed = ['data', 'titulo', 'observacoes', 'status'];
  const update = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(req.body || {})) {
    if (allowed.includes(k)) update[k] = v;
  }
  const { data, error } = await supabase
    .from('next_eventos').update(update).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Cria os 3 primeiros domingos do mes informado (idempotente)
router.post('/eventos/auto-create-mes', async (req, res) => {
  const ano = Number(req.body?.ano) || new Date().getFullYear();
  const mes = Number(req.body?.mes) || (new Date().getMonth() + 1);

  const datas = [];
  let cursor = new Date(Date.UTC(ano, mes - 1, 1));
  // primeiro domingo
  while (cursor.getUTCDay() !== 0) cursor.setUTCDate(cursor.getUTCDate() + 1);
  for (let i = 0; i < 3; i++) {
    datas.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  const created = [];
  for (const d of datas) {
    const { data: row, error } = await supabase
      .from('next_eventos')
      .upsert({ data: d, titulo: `NEXT ${d}` }, { onConflict: 'data', ignoreDuplicates: true })
      .select();
    if (!error && row && row[0]) created.push(row[0]);
  }
  res.json({ ano, mes, datas, created: created.length });
});

// ----------------------------------------------------------------------------
// Inscricoes
// ----------------------------------------------------------------------------
router.get('/inscricoes', async (req, res) => {
  const { evento_id, search, com_checkin, com_indicacao } = req.query;
  let q = supabase.from('next_inscricoes').select('*, evento:next_eventos(id, data, titulo)')
    .order('created_at', { ascending: false }).limit(500);
  if (evento_id) q = q.eq('evento_id', evento_id);
  if (com_checkin === 'true') q = q.not('check_in_at', 'is', null);
  if (com_checkin === 'false') q = q.is('check_in_at', null);
  if (com_indicacao === 'true') {
    q = q.or('indicou_batismo.eq.true,indicou_servir.eq.true,indicou_grupo.eq.true,indicou_dizimo.eq.true');
  }
  if (search) {
    const s = `%${search}%`;
    q = q.or(`nome.ilike.${s},sobrenome.ilike.${s},email.ilike.${s},cpf.ilike.${s}`);
  }
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

router.get('/inscricoes/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('next_inscricoes')
    .select('*, evento:next_eventos(*), indicacoes:next_indicacoes(*)')
    .eq('id', req.params.id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Inscricao nao encontrada' });
  res.json(data);
});

router.post('/inscricoes', async (req, res) => {
  const { evento_id, nome, sobrenome, cpf, telefone, email, data_nascimento, observacoes } = req.body || {};
  if (!nome || !evento_id) return res.status(400).json({ error: 'nome e evento_id obrigatorios' });
  const cleanCpf = cpf ? String(cpf).replace(/\D/g, '') : null;
  const { data, error } = await supabase
    .from('next_inscricoes')
    .insert({
      evento_id, nome, sobrenome: sobrenome || null, cpf: cleanCpf,
      telefone: telefone || null, email: email ? String(email).toLowerCase() : null,
      data_nascimento: data_nascimento || null, observacoes: observacoes || null,
      origem: 'manual', registered_by: req.user?.id || null,
    })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.put('/inscricoes/:id', async (req, res) => {
  const allowed = [
    'nome', 'sobrenome', 'cpf', 'telefone', 'email', 'data_nascimento',
    'observacoes', 'evento_id', 'ja_batizado', 'ja_voluntario', 'ja_doador',
  ];
  const update = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(req.body || {})) {
    if (allowed.includes(k)) update[k] = v;
  }
  const { data, error } = await supabase
    .from('next_inscricoes').update(update).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ----------------------------------------------------------------------------
// Check-in
// ----------------------------------------------------------------------------
router.post('/inscricoes/:id/checkin', async (req, res) => {
  const { data, error } = await supabase
    .from('next_inscricoes')
    .update({
      check_in_at: new Date().toISOString(),
      check_in_by: req.user?.id || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/inscricoes/:id/checkin', async (req, res) => {
  const { error } = await supabase
    .from('next_inscricoes')
    .update({ check_in_at: null, check_in_by: null, updated_at: new Date().toISOString() })
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ----------------------------------------------------------------------------
// Indicacoes (batismo, servir, grupo, dizimo)
// ----------------------------------------------------------------------------
const TIPOS_AREA = {
  batismo: { area: 'integracao', flag: 'indicou_batismo', titulo: 'Nova indicacao de batismo no NEXT' },
  servir: { area: 'voluntariado', flag: 'indicou_servir', titulo: 'Nova indicacao para servir no NEXT' },
  grupo: { area: 'grupos', flag: 'indicou_grupo', titulo: 'Nova indicacao de grupo no NEXT' },
  dizimo: { area: 'generosidade', flag: 'indicou_dizimo', titulo: 'Nova indicacao de dizimo no NEXT' },
};

router.post('/inscricoes/:id/indicacoes', async (req, res) => {
  try {
    const { tipos = [], observacoes } = req.body || {};
    if (!Array.isArray(tipos) || tipos.length === 0) {
      return res.status(400).json({ error: 'Informe ao menos um tipo' });
    }
    const validos = tipos.filter(t => TIPOS_AREA[t]);
    if (validos.length === 0) return res.status(400).json({ error: 'Nenhum tipo valido' });

    // Atualiza flags na inscricao
    const update = {
      indicacao_observacoes: observacoes || null,
      indicacao_marcada_em: new Date().toISOString(),
      indicacao_marcada_por: req.user?.id || null,
      updated_at: new Date().toISOString(),
    };
    for (const t of validos) update[TIPOS_AREA[t].flag] = true;

    const { data: insc, error: e1 } = await supabase
      .from('next_inscricoes')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (e1) return res.status(500).json({ error: e1.message });

    // Cria/atualiza indicacoes (1 por tipo)
    const linhas = validos.map(t => ({
      inscricao_id: req.params.id,
      tipo: t,
      area_destino: TIPOS_AREA[t].area,
      observacoes: observacoes || null,
      status: 'pendente',
    }));

    for (const linha of linhas) {
      await supabase
        .from('next_indicacoes')
        .upsert(linha, { onConflict: 'inscricao_id,tipo' });
    }

    // Notificar areas
    for (const t of validos) {
      try {
        await notificar({
          modulo: TIPOS_AREA[t].area,
          titulo: TIPOS_AREA[t].titulo,
          mensagem: `${insc.nome} ${insc.sobrenome || ''} indicou ${t} no NEXT.`,
          link: '/ministerial/next?tab=indicacoes',
        });
      } catch (e) { console.error('[next] notificar:', e.message); }
    }

    // Recalcula KPIs do NEXT em background (nao bloqueia)
    recalcularKpisNext();

    res.json({ ok: true, indicacoes: linhas.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/indicacoes', async (req, res) => {
  const { tipo, status, area } = req.query;
  let q = supabase
    .from('next_indicacoes')
    .select('*, inscricao:next_inscricoes(id, nome, sobrenome, email, telefone, evento_id, evento:next_eventos(data))')
    .order('created_at', { ascending: false })
    .limit(500);
  if (tipo) q = q.eq('tipo', tipo);
  if (status) q = q.eq('status', status);
  if (area) q = q.eq('area_destino', area);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

router.put('/indicacoes/:id', async (req, res) => {
  const allowed = ['status', 'observacoes', 'atendido_por', 'atendido_em'];
  const update = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(req.body || {})) {
    if (allowed.includes(k)) update[k] = v;
  }
  if (req.body?.status === 'concluido' && !update.atendido_em) {
    update.atendido_em = new Date().toISOString();
    update.atendido_por = req.user?.id || null;
  }
  const { data, error } = await supabase
    .from('next_indicacoes').update(update).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ----------------------------------------------------------------------------
// Dashboard
// ----------------------------------------------------------------------------
router.get('/dashboard', async (_req, res) => {
  const hoje = new Date();
  const inicioMes = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), 1)).toISOString().slice(0, 10);
  const inicioProxMes = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth() + 1, 1)).toISOString().slice(0, 10);

  const [eventos, inscricoesMes, checkinsMes, indicPendentes] = await Promise.all([
    supabase.from('next_eventos').select('id, data, status').gte('data', inicioMes).lt('data', inicioProxMes),
    supabase.from('next_inscricoes').select('id', { count: 'exact', head: true })
      .gte('created_at', inicioMes).lt('created_at', inicioProxMes),
    supabase.from('next_inscricoes').select('id', { count: 'exact', head: true })
      .not('check_in_at', 'is', null)
      .gte('check_in_at', inicioMes).lt('check_in_at', inicioProxMes),
    supabase.from('next_indicacoes').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
  ]);

  res.json({
    eventos_mes: eventos.data || [],
    inscricoes_mes: inscricoesMes.count || 0,
    checkins_mes: checkinsMes.count || 0,
    indicacoes_pendentes: indicPendentes.count || 0,
  });
});

module.exports = router;
