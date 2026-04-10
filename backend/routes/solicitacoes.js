const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');

router.use(authenticate);

// Map categoria → notification module
const CATEGORIA_MODULO = {
  ti: 'ti',
  compras: 'logistica',
  reembolso: 'financeiro',
  espaco: 'administrativo',
  infraestrutura: 'administrativo',
  ferias: 'rh',
  outro: 'administrativo',
};

// Map módulo → categorias (for granular permission filtering)
const MODULO_CATEGORIAS = {
  ti: ['ti'],
  logistica: ['compras'],
  financeiro: ['reembolso'],
  administrativo: ['espaco', 'infraestrutura', 'outro'],
  rh: ['ferias'],
};

// Map modulePerms key → backend modulo
const PERM_TO_MODULO = {
  'DP': 'rh',
  'Pessoas': 'rh',
  'Financeiro': 'financeiro',
  'Logística': 'logistica',
  'Patrimônio': 'administrativo',
  'Membresia': 'administrativo',
  'TI': 'ti',
};

// ── LIST (filtered by role) ─────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { categoria, status, mine } = req.query;
    let q = supabase
      .from('solicitacoes')
      .select('*, solicitante:profiles!solicitante_id(id,name,email), responsavel:profiles!responsavel_id(id,name,email)')
      .order('created_at', { ascending: false });

    if (categoria) q = q.eq('categoria', categoria);
    if (status) q = q.eq('status', status);

    // If 'mine' flag or user is not admin/diretor, filter to own
    const role = req.userProfile?.role;
    if (mine === 'true' || !['admin', 'diretor'].includes(role)) {
      q = q.eq('solicitante_id', req.userId);
    }

    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[SOLICITACOES] list error:', e.message);
    res.status(500).json({ error: 'Erro ao listar solicitações' });
  }
});

// ── CREATE ──────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { titulo, descricao, justificativa, categoria, urgencia, valor_estimado, area_solicitante } = req.body;
    if (!titulo || !categoria) return res.status(400).json({ error: 'Título e categoria são obrigatórios' });

    const { data, error } = await supabase
      .from('solicitacoes')
      .insert({
        titulo,
        descricao,
        justificativa,
        categoria,
        urgencia: urgencia || 'normal',
        valor_estimado,
        solicitante_id: req.userId,
        area_solicitante,
      })
      .select('*')
      .single();
    if (error) throw error;

    // Notify responsible people
    const modulo = CATEGORIA_MODULO[categoria] || 'administrativo';
    notificar({
      modulo,
      tipo: 'solicitacao',
      titulo: `Nova solicitação: ${titulo}`,
      mensagem: `${req.userProfile?.name || 'Usuário'} criou uma solicitação de ${categoria}`,
      link: '/solicitacoes',
      severidade: urgencia === 'critica' ? 'alta' : 'info',
      chaveDedup: `solicitacao_nova_${data.id}`,
    }).catch(err => console.error('[SOLICITACOES] notify error:', err.message));

    res.status(201).json(data);
  } catch (e) {
    console.error('[SOLICITACOES] create error:', e.message);
    res.status(500).json({ error: 'Erro ao criar solicitação' });
  }
});

// ── UPDATE (status, responsavel, observacoes) ───────────────
router.patch('/:id', async (req, res) => {
  try {
    const { status, responsavel_id, observacoes } = req.body;
    const update = {};
    if (status) update.status = status;
    if (responsavel_id !== undefined) update.responsavel_id = responsavel_id;
    if (observacoes !== undefined) update.observacoes = observacoes;

    if (!Object.keys(update).length) return res.status(400).json({ error: 'Nada para atualizar' });

    const { data, error } = await supabase
      .from('solicitacoes')
      .update(update)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;

    // Notify solicitante about status change
    if (status && data) {
      notificar({
        modulo: CATEGORIA_MODULO[data.categoria] || 'administrativo',
        tipo: 'solicitacao_status',
        titulo: `Solicitação atualizada: ${data.titulo}`,
        mensagem: `Status alterado para "${status}"`,
        link: '/solicitacoes',
        severidade: 'info',
        chaveDedup: `solicitacao_status_${data.id}_${status}`,
        targetIds: [data.solicitante_id],
      }).catch(err => console.error('[SOLICITACOES] notify error:', err.message));
    }

    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] update error:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar solicitação' });
  }
});

module.exports = router;
