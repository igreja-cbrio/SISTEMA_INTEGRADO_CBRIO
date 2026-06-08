// ─────────────────────────────────────────────────────────────────────────
// Encaminhamentos da jornada · caixa de entrada das áreas receptoras
// ─────────────────────────────────────────────────────────────────────────
// O pastor encaminha o convertido (desfecho do encontro em /cuidados) e a
// área receptora (Grupos / Voluntários / Jornada 180) recebe aqui, faz o
// primeiro contato e registra a devolutiva. Auth por módulo do destino:
// quem tem leitura em 'cuidados' vê tudo; quem tem 'grupos'/'voluntariado'
// vê o seu destino. Tudo passa pelo backend (service_role) · RLS é defesa extra.
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

const DEVOLUTIVAS = ['nao_respondeu', 'em_duvida', 'engajou', 'sem_interesse'];
const STATUS_TODOS = ['pendente', ...DEVOLUTIVAS];

function nivel(req, slug) {
  if (['admin', 'diretor'].includes(req.user?.role)) return 5;
  return req.user?.granular?.modulePerms?.[slug]?.leitura ?? 0;
}
// Cuidados (origem pastoral) enxerga tudo · cada área enxerga o seu destino
function podeVerDestino(req, destino) {
  if (nivel(req, 'cuidados') >= 1) return true;
  if (destino === 'grupos' && nivel(req, 'grupos') >= 1) return true;
  if (destino === 'voluntarios' && nivel(req, 'voluntariado') >= 1) return true;
  return false;
}

// GET /api/encaminhamentos?destino=&status=
router.get('/', async (req, res) => {
  try {
    const { destino, status } = req.query;
    if (destino && !podeVerDestino(req, destino)) return res.status(403).json({ error: 'Sem acesso a esse destino' });
    if (!destino && nivel(req, 'cuidados') < 1) return res.status(400).json({ error: 'Informe um destino' });

    let q = supabase.from('jornada_encaminhamentos').select('*')
      .is('deleted_at', null).order('encaminhado_em', { ascending: false }).limit(500);
    if (destino) q = q.eq('destino', destino);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/encaminhamentos/resumo?destino=  → contagem (badge da aba)
router.get('/resumo', async (req, res) => {
  try {
    const { destino } = req.query;
    if (destino && !podeVerDestino(req, destino)) return res.status(403).json({ error: 'Sem acesso' });
    if (!destino && nivel(req, 'cuidados') < 1) return res.status(400).json({ error: 'Informe um destino' });
    let q = supabase.from('jornada_encaminhamentos').select('status').is('deleted_at', null);
    if (destino) q = q.eq('destino', destino);
    const { data, error } = await q;
    if (error) throw error;
    const counts = {};
    (data || []).forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
    // "a fazer" = ainda não engajou nem foi descartado
    const pendentes = (data || []).filter(r => ['pendente', 'nao_respondeu', 'em_duvida'].includes(r.status)).length;
    res.json({ total: (data || []).length, pendentes, counts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/encaminhamentos/:id  → encaminhamento + log de contatos (a ficha)
router.get('/:id', async (req, res) => {
  try {
    const { data: enc, error } = await supabase.from('jornada_encaminhamentos').select('*').eq('id', req.params.id).single();
    if (error) throw error;
    if (!enc || !podeVerDestino(req, enc.destino)) return res.status(403).json({ error: 'Sem acesso' });
    const { data: contatos } = await supabase
      .from('jornada_encaminhamento_contatos').select('*')
      .eq('encaminhamento_id', req.params.id).order('created_at', { ascending: false });
    res.json({ ...enc, contatos: contatos || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/encaminhamentos/:id/contato  → registra contato + atualiza status (devolutiva)
router.post('/:id/contato', async (req, res) => {
  try {
    const { canal, observacao, devolutiva, data_contato } = req.body;
    const userId = req.user.userId || req.user.id;
    const nome = req.user.name || req.user.nome || null;

    const { data: enc, error: eEnc } = await supabase.from('jornada_encaminhamentos').select('*').eq('id', req.params.id).single();
    if (eEnc) throw eEnc;
    if (!enc || !podeVerDestino(req, enc.destino)) return res.status(403).json({ error: 'Sem acesso' });
    if (devolutiva && !DEVOLUTIVAS.includes(devolutiva)) return res.status(400).json({ error: 'Devolutiva inválida' });
    if (!observacao && !devolutiva) return res.status(400).json({ error: 'Informe a observação ou a devolutiva' });

    const { data: contato, error } = await supabase.from('jornada_encaminhamento_contatos').insert({
      encaminhamento_id: req.params.id,
      data_contato: data_contato || new Date().toISOString().slice(0, 10),
      canal: canal || null,
      observacao: observacao || null,
      devolutiva: devolutiva || null,
      feito_por: userId,
      feito_por_nome: nome,
    }).select().single();
    if (error) throw error;

    // Atualiza o pai: 1º contato marca recebido · devolutiva vira o status · terminal resolve
    const patch = { updated_at: new Date().toISOString() };
    if (!enc.recebido_em) { patch.recebido_em = new Date().toISOString(); patch.recebido_por = userId; }
    if (devolutiva) {
      patch.status = devolutiva;
      patch.resolvido_em = ['engajou', 'sem_interesse'].includes(devolutiva) ? new Date().toISOString() : null;
    }
    await supabase.from('jornada_encaminhamentos').update(patch).eq('id', req.params.id);

    res.status(201).json(contato);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/encaminhamentos/:id  → ajuste manual de status
router.patch('/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (status && !STATUS_TODOS.includes(status)) return res.status(400).json({ error: 'Status inválido' });
    const { data: enc } = await supabase.from('jornada_encaminhamentos').select('destino').eq('id', req.params.id).single();
    if (!enc || !podeVerDestino(req, enc.destino)) return res.status(403).json({ error: 'Sem acesso' });
    const patch = { updated_at: new Date().toISOString() };
    if (status) {
      patch.status = status;
      patch.resolvido_em = ['engajou', 'sem_interesse'].includes(status) ? new Date().toISOString() : null;
    }
    const { data, error } = await supabase.from('jornada_encaminhamentos').update(patch).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
