// ============================================================================
// Agente Batismo/Next 90d · fila de convite (API)
// ============================================================================
// O líder vê os convertidos chegando no prazo sem batismo/Next com o convite
// rascunhado, envia em 1 toque (wa.me no front) e marca. Modo seguro.
// ============================================================================

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { isAuthorizedCron } = require('../utils/cronAuth');
const { enfileirar } = require('../services/agenteBatismoNext');
const { garantirTurmasAutomaticas } = require('../services/nextTurmasAuto');

async function cronEnfileirar(req, res) {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const n = await enfileirar();

    // ⚠️ CARONA (26/08/2026): a abertura automática das turmas do Next roda aqui
    // em vez de ter cron próprio — a Vercel está com 46 crons e o teto do plano
    // é apertado. Este é o cron diário do domínio Next, então é o host certo.
    //
    // ⚠️ Em bloco protegido: falhar ao abrir turma NÃO pode derrubar a fila de
    // convites do agente, que é o trabalho principal deste cron.
    let turmas = null;
    try {
      turmas = await garantirTurmasAutomaticas();
      if (turmas.erros.length) console.error('[next/turmas-auto]', JSON.stringify(turmas.erros));
    } catch (e) {
      console.error('[next/turmas-auto]', e.message);
      turmas = { erro: e.message };
    }

    res.json({ ok: true, enfileirados: n, turmas_next: turmas });
  } catch (e) {
    console.error('[agente-batismo-next/cron]', e.message);
    res.status(500).json({ error: e.message });
  }
}
router.get('/cron/enfileirar', cronEnfileirar);
router.post('/cron/enfileirar', cronEnfileirar);

router.use(authenticate);

function contexto(req) {
  const perms = req.user?.granular?.modulePerms || {};
  const nivel = (slug) => perms[slug]?.leitura || 0;
  const escrita = (slug) => perms[slug]?.escrita || 0;
  const isAdmin = req.user?.role === 'admin' || req.user?.role === 'diretor' || req.user?.is_super_admin;
  const veTudo = isAdmin || nivel('cuidados') >= 1;
  const podeAgirTudo = isAdmin || escrita('cuidados') >= 2;
  const areasLeitura = ['ami', 'bridge', 'online'].filter((a) => nivel(a) >= 1);
  const areasEscrita = ['ami', 'bridge', 'online'].filter((a) => escrita(a) >= 2);
  return { veTudo, podeAgirTudo, areasLeitura, areasEscrita };
}

// GET / — fila pendente. Cuidados vê tudo; líder vê só a sua área.
router.get('/', async (req, res) => {
  try {
    const status = String(req.query.status || 'pendente');
    const { veTudo, areasLeitura } = contexto(req);
    let q = supabase
      .from('cui_batismo_next_fila')
      .select('id, convertido_id, area, responsavel_nome, falta_batismo, falta_next, dias, mensagem_rascunho, telefone, status, prazo, created_at, convertido:cui_convertidos(nome, data_culto)')
      .is('deleted_at', null)
      .order('dias', { ascending: false })
      .limit(200);
    if (status !== 'todos') q = q.eq('status', status);
    if (!veTudo) {
      if (areasLeitura.length === 0) return res.json([]);
      q = q.in('area', areasLeitura);
    }
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[agente-batismo-next] list:', e.message);
    res.status(500).json({ error: 'Erro ao carregar a fila' });
  }
});

async function podeAgir(req, item) {
  const { podeAgirTudo, areasEscrita } = contexto(req);
  if (podeAgirTudo) return true;
  return !!item.area && areasEscrita.includes(item.area);
}

router.post('/:id/enviado', async (req, res) => {
  try {
    const { data: item } = await supabase
      .from('cui_batismo_next_fila').select('id, area, status')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });
    if (!(await podeAgir(req, item))) return res.status(403).json({ error: 'Sem permissão nesta área.' });
    await supabase.from('cui_batismo_next_fila').update({
      status: 'enviado', enviado_em: new Date().toISOString(), enviado_por: req.user?.id || null,
      feedback: req.body?.editou ? 'editou' : 'aceitou', updated_at: new Date().toISOString(),
    }).eq('id', item.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('[agente-batismo-next] enviado:', e.message);
    res.status(500).json({ error: 'Erro ao registrar envio' });
  }
});

router.post('/:id/ignorar', async (req, res) => {
  try {
    const { data: item } = await supabase
      .from('cui_batismo_next_fila').select('id, area, status')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });
    if (!(await podeAgir(req, item))) return res.status(403).json({ error: 'Sem permissão nesta área.' });
    await supabase.from('cui_batismo_next_fila').update({
      status: 'ignorado',
      feedback: req.body?.motivo ? `ignorou: ${String(req.body.motivo).slice(0, 200)}` : 'ignorou',
      updated_at: new Date().toISOString(),
    }).eq('id', item.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('[agente-batismo-next] ignorar:', e.message);
    res.status(500).json({ error: 'Erro ao ignorar' });
  }
});

module.exports = router;
