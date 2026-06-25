// ============================================================================
// Agente de Primeiro Contato · fila de revisão (API)
// ============================================================================
// O líder da área (ou a equipe de Cuidados) vê os convertidos sem contato com a
// mensagem já rascunhada, envia em 1 toque (wa.me no front) e marca como feito.
// Modo seguro: nada é enviado pelo servidor; o humano envia pelo WhatsApp dele.
// ============================================================================

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { isAuthorizedCron } = require('../utils/cronAuth');
const { enfileirarPrimeiroContato } = require('../services/agentePrimeiroContato');

// Cron (CRON_SECRET) — enfileira novos convertidos. Também roda no cron diário
// de notificações; este endpoint permite disparo manual/dedicado.
async function cronEnfileirar(req, res) {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const n = await enfileirarPrimeiroContato();
    res.json({ ok: true, enfileirados: n });
  } catch (e) {
    console.error('[agente-primeiro-contato/cron]', e.message);
    res.status(500).json({ error: e.message });
  }
}
router.get('/cron/enfileirar', cronEnfileirar);
router.post('/cron/enfileirar', cronEnfileirar);

router.use(authenticate);

// Áreas (módulos) que o usuário enxerga, p/ filtrar a fila quando não é Cuidados.
function contexto(req) {
  const perms = req.user?.granular?.modulePerms || {};
  const nivel = (slug) => perms[slug]?.leitura || 0;
  const escrita = (slug) => perms[slug]?.escrita || 0;
  const isAdmin = req.user?.role === 'admin' || req.user?.role === 'diretor' || req.user?.is_super_admin;
  const veTudo = isAdmin || nivel('cuidados') >= 1;
  const podeAgirTudo = isAdmin || escrita('cuidados') >= 2;
  // áreas de culto que são módulos próprios
  const areasLeitura = ['ami', 'bridge', 'online'].filter((a) => nivel(a) >= 1);
  const areasEscrita = ['ami', 'bridge', 'online'].filter((a) => escrita(a) >= 2);
  return { veTudo, podeAgirTudo, areasLeitura, areasEscrita };
}

// GET / — fila pendente (ou ?status=). Cuidados vê tudo; líder vê só a sua área.
router.get('/', async (req, res) => {
  try {
    const status = String(req.query.status || 'pendente');
    const { veTudo, areasLeitura } = contexto(req);

    let q = supabase
      .from('cui_primeiro_contato_fila')
      .select('id, convertido_id, area, responsavel_id, responsavel_nome, mensagem_rascunho, telefone, status, prazo, created_at, convertido:cui_convertidos(nome, data_culto, primeiro_contato_status)')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(200);
    if (status !== 'todos') q = q.eq('status', status);
    if (!veTudo) {
      if (areasLeitura.length === 0) return res.json([]); // não vê nada
      q = q.in('area', areasLeitura);
    }
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[agente-primeiro-contato] list:', e.message);
    res.status(500).json({ error: 'Erro ao carregar a fila' });
  }
});

// Confere se o usuário pode agir sobre um item (Cuidados ou líder da área dele).
async function podeAgir(req, item) {
  const { podeAgirTudo, areasEscrita } = contexto(req);
  if (podeAgirTudo) return true;
  return !!item.area && areasEscrita.includes(item.area);
}

// POST /:id/enviado — líder enviou a mensagem; marca contato feito no convertido
// e registra o feedback (aprendizagem). body: { editou?: boolean }
router.post('/:id/enviado', async (req, res) => {
  try {
    const { data: item } = await supabase
      .from('cui_primeiro_contato_fila')
      .select('id, area, convertido_id, status')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });
    if (!(await podeAgir(req, item))) return res.status(403).json({ error: 'Sem permissão nesta área.' });

    const agora = new Date().toISOString();
    await supabase.from('cui_primeiro_contato_fila').update({
      status: 'enviado',
      enviado_em: agora,
      enviado_por: req.user?.id || null,
      feedback: req.body?.editou ? 'editou' : 'aceitou',
      updated_at: agora,
    }).eq('id', item.id);

    // carimba o 1º contato no convertido (só se ainda não tinha) — fecha o loop
    await supabase.from('cui_convertidos')
      .update({ primeiro_contato_em: agora, primeiro_contato_por: req.user?.id || null })
      .eq('id', item.convertido_id).is('primeiro_contato_em', null);

    res.json({ ok: true });
  } catch (e) {
    console.error('[agente-primeiro-contato] enviado:', e.message);
    res.status(500).json({ error: 'Erro ao registrar envio' });
  }
});

// POST /:id/ignorar — líder dispensa o item (ex.: contato feito por outro canal,
// ou número inválido). body: { motivo? }
router.post('/:id/ignorar', async (req, res) => {
  try {
    const { data: item } = await supabase
      .from('cui_primeiro_contato_fila')
      .select('id, area, status').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });
    if (!(await podeAgir(req, item))) return res.status(403).json({ error: 'Sem permissão nesta área.' });

    await supabase.from('cui_primeiro_contato_fila').update({
      status: 'ignorado',
      feedback: req.body?.motivo ? `ignorou: ${String(req.body.motivo).slice(0, 200)}` : 'ignorou',
      updated_at: new Date().toISOString(),
    }).eq('id', item.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('[agente-primeiro-contato] ignorar:', e.message);
    res.status(500).json({ error: 'Erro ao ignorar' });
  }
});

module.exports = router;
