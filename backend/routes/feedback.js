// ============================================================================
// /api/feedback · Onda 0 · loop de feedback dos testadores (2026-06-09)
//
//   POST  /          · qualquer autenticado reporta (testador no piloto)
//   GET   /          · admin/diretor lista (filtros: ?status= &tipo=)
//   GET   /resumo    · admin/diretor · contagem por status/tipo
//   GET   /erros     · admin/diretor · erros 500 capturados (app_erros_servidor)
//   PATCH /:id       · admin/diretor · muda status/severidade (marca resolvido)
//
// A captura alimenta o agente Haiku de triagem (PR seguinte), que lê estas
// tabelas e manda o relatório diário.
// ============================================================================
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

const TIPOS = ['bug', 'confusao', 'sugestao', 'elogio'];
const SEVS = ['baixa', 'media', 'alta', 'critica'];
const STATUSES = ['novo', 'triado', 'em_andamento', 'resolvido', 'descartado'];

function textoSeguro(value, max) {
  return value == null ? null : String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) || null;
}

function contextoSeguro(contexto) {
  if (!contexto || typeof contexto !== 'object' || Array.isArray(contexto)) return null;
  const result = {};
  const userAgent = textoSeguro(contexto.user_agent, 300);
  const viewport = /^\d{2,5}x\d{2,5}$/.test(String(contexto.viewport || '')) ? String(contexto.viewport) : null;
  if (userAgent) result.user_agent = userAgent;
  if (viewport) result.viewport = viewport;
  return Object.keys(result).length ? result : null;
}

// ── Testador reporta (qualquer autenticado) ─────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { tipo, mensagem, rota, modulo, contexto, severidade } = req.body || {};
    if (!mensagem || String(mensagem).trim().length < 3) {
      return res.status(400).json({ error: 'Descreva o que aconteceu (mín. 3 caracteres).' });
    }
    const row = {
      user_id: req.user?.id || null,
      user_email: req.user?.email || null,
      user_nome: req.user?.granular?.cargoNome || null,
      user_role: req.user?.role || null,
      tipo: TIPOS.includes(tipo) ? tipo : 'bug',
      mensagem: textoSeguro(mensagem, 2000),
      rota: textoSeguro(String(rota || '').split('?')[0], 300),
      modulo: textoSeguro(modulo, 60),
      contexto: contextoSeguro(contexto),
      severidade: SEVS.includes(severidade) ? severidade : 'media',
      status: 'novo',
    };
    const { data, error } = await supabase.from('app_feedback').insert(row).select('id').single();
    if (error) throw error;
    res.status(201).json({ ok: true, id: data.id });
  } catch (e) {
    console.error('[feedback POST]', e.message);
    res.status(500).json({ error: 'Não foi possível enviar o feedback.' });
  }
});

// ── Daqui pra baixo: só admin/diretor ───────────────────────────────────────
router.use(authorize('admin', 'diretor'));

router.get('/', async (req, res) => {
  try {
    let q = supabase.from('app_feedback').select('*')
      .order('created_at', { ascending: false }).limit(500);
    if (STATUSES.includes(req.query.status)) q = q.eq('status', req.query.status);
    if (TIPOS.includes(req.query.tipo)) q = q.eq('tipo', req.query.tipo);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[feedback GET]', e.message);
    res.status(500).json({ error: 'Erro ao listar feedback.' });
  }
});

router.get('/resumo', async (req, res) => {
  try {
    const { data, error } = await supabase.from('app_feedback').select('status, tipo, severidade');
    if (error) throw error;
    const resumo = { total: (data || []).length, novos: 0, criticos: 0, por_tipo: {}, por_status: {} };
    for (const r of (data || [])) {
      if (r.status === 'novo') resumo.novos++;
      if (r.severidade === 'critica' && r.status !== 'resolvido' && r.status !== 'descartado') resumo.criticos++;
      resumo.por_tipo[r.tipo] = (resumo.por_tipo[r.tipo] || 0) + 1;
      resumo.por_status[r.status] = (resumo.por_status[r.status] || 0) + 1;
    }
    res.json(resumo);
  } catch (e) {
    console.error('[feedback resumo]', e.message);
    res.status(500).json({ error: 'Erro ao montar resumo.' });
  }
});

router.get('/erros', async (req, res) => {
  try {
    const { data, error } = await supabase.from('app_erros_servidor')
      .select('*').order('created_at', { ascending: false }).limit(300);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[feedback erros]', e.message);
    res.status(500).json({ error: 'Erro ao listar erros.' });
  }
});

// Relatórios diários do agente de triagem (piloto_triage_watcher · agent_runs)
router.get('/relatorios', async (req, res) => {
  try {
    const { data, error } = await supabase.from('agent_runs')
      .select('id, summary, actions_taken, status, cost_usd, created_at, completed_at')
      .eq('agent_type', 'piloto_triage_watcher')
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[feedback relatorios]', e.message);
    res.status(500).json({ error: 'Erro ao listar relatórios.' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const patch = {};
    if (STATUSES.includes(req.body.status)) {
      patch.status = req.body.status;
      if (req.body.status === 'resolvido') {
        patch.resolvido_em = new Date().toISOString();
        patch.resolvido_por = req.user?.id || null;
      }
    }
    if (SEVS.includes(req.body.severidade)) patch.severidade = req.body.severidade;
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada a atualizar.' });
    const { data, error } = await supabase.from('app_feedback')
      .update(patch).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[feedback PATCH]', e.message);
    res.status(500).json({ error: 'Erro ao atualizar.' });
  }
});

module.exports = router;
