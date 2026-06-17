// ============================================================================
// /api/coberturas · "minhas coberturas" pra QUALQUER usuário logado.
//
// O substituto de uma férias/licença pode NÃO ter acesso ao módulo RH (ex.: um
// líder de área cobrindo outro), então este endpoint fica FORA do router de
// /rh (que é gated por authorizeModule('rh')). Só autenticação · lê pela
// service_role (gating real = ser o próprio substituto, por e-mail).
// ============================================================================

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

// GET /api/coberturas/minhas → coberturas ativas onde EU sou o substituto
router.get('/minhas', async (req, res) => {
  try {
    const email = String(req.user?.email || '').toLowerCase().trim();
    if (!email) return res.json([]);
    const hoje = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('rh_cobertura')
      .select('id, titular_nome, data_inicio, data_fim, modulos_concedidos')
      .ilike('substituto_email', email)
      .eq('status', 'ativa')
      .gte('data_fim', hoje)
      .order('data_fim', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[coberturas/minhas]', e.message);
    res.status(500).json({ error: 'Erro ao buscar coberturas' });
  }
});

module.exports = router;
