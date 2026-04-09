const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate, authorize('admin', 'diretor'));

// GET /api/permissoes/estrutura — setores, áreas, módulos, cargos
router.get('/estrutura', async (req, res) => {
  try {
    const [setores, areas, modulos, cargos] = await Promise.all([
      supabase.from('setores').select('*').eq('ativo', true).order('id'),
      supabase.from('areas').select('*, setores(nome)').eq('ativo', true).order('nome'),
      supabase.from('modulos').select('*').eq('ativo', true).order('nome'),
      supabase.from('cargos').select('*').order('id'),
    ]);
    res.json({
      setores: setores.data || [],
      areas: areas.data || [],
      modulos: modulos.data || [],
      cargos: cargos.data || [],
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/permissoes/usuario/:id — get permissions for a user
router.get('/usuario/:id', async (req, res) => {
  try {
    const userId = req.params.id;

    // Get user from usuarios table (permissions system)
    const { data: usuario } = await supabase.from('usuarios')
      .select('*, cargos(*)').eq('id', userId).single();

    // Get user areas
    const { data: userAreas } = await supabase.from('usuario_areas')
      .select('*, areas(nome, setor_id, setores(nome))').eq('usuario_id', userId);

    // Get module overrides
    const { data: overrides } = await supabase.from('permissoes_modulo')
      .select('*, modulos(nome)').eq('usuario_id', userId);

    // Get extra scope overrides
    const { data: extraScopes } = await supabase.from('permissoes_escopo_extra')
      .select('*, modulos(nome), areas(nome), setores(nome)').eq('usuario_id', userId);

    res.json({
      usuario: usuario || null,
      areas: userAreas || [],
      overrides: overrides || [],
      extraScopes: extraScopes || [],
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/permissoes/usuario-por-email/:email — find user by email
router.get('/usuario-por-email/:email', async (req, res) => {
  try {
    const { data } = await supabase.from('usuarios')
      .select('*, cargos(*)').eq('email', req.params.email).single();
    res.json(data || null);
  } catch (e) { res.json(null); }
});

// POST /api/permissoes/usuario — create or update user in permissions system
router.post('/usuario', async (req, res) => {
  try {
    const { nome, email, cargo_id } = req.body;
    if (!nome || !cargo_id) return res.status(400).json({ error: 'Nome e cargo são obrigatórios' });

    // Check if exists by email
    const { data: existing } = await supabase.from('usuarios')
      .select('id').eq('email', email || '').limit(1);

    let userId;
    if (existing?.length) {
      await supabase.from('usuarios').update({ nome, cargo_id }).eq('id', existing[0].id);
      userId = existing[0].id;
    } else {
      const { data, error } = await supabase.from('usuarios')
        .insert({ nome, email: email || null, cargo_id }).select().single();
      if (error) return res.status(400).json({ error: error.message });
      userId = data.id;
    }

    res.json({ id: userId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/permissoes/usuario/:id/cargo — update user cargo
router.put('/usuario/:id/cargo', async (req, res) => {
  try {
    const { cargo_id } = req.body;
    const { error } = await supabase.from('usuarios')
      .update({ cargo_id, updated_at: new Date().toISOString() }).eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/permissoes/usuario/:id/areas — set user areas
router.put('/usuario/:id/areas', async (req, res) => {
  try {
    const { area_ids } = req.body; // array of area IDs
    const userId = parseInt(req.params.id);

    // Delete existing
    await supabase.from('usuario_areas').delete().eq('usuario_id', userId);

    // Insert new
    if (area_ids?.length) {
      const rows = area_ids.map((aid, i) => ({ usuario_id: userId, area_id: aid, is_principal: i === 0 }));
      const { error } = await supabase.from('usuario_areas').insert(rows);
      if (error) return res.status(400).json({ error: error.message });
    }

    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/permissoes/usuario/:id/modulo — set module override
router.put('/usuario/:id/modulo', async (req, res) => {
  try {
    const { modulo_id, nivel_leitura, nivel_escrita, motivo } = req.body;
    const userId = parseInt(req.params.id);

    // If levels match cargo default, remove override
    const { data: user } = await supabase.from('usuarios')
      .select('cargo_id, cargos(nivel_padrao_leitura, nivel_padrao_escrita)').eq('id', userId).single();

    if (user?.cargos &&
        nivel_leitura === user.cargos.nivel_padrao_leitura &&
        nivel_escrita === user.cargos.nivel_padrao_escrita) {
      // Remove override (back to default)
      await supabase.from('permissoes_modulo')
        .delete().eq('usuario_id', userId).eq('modulo_id', modulo_id);
    } else {
      // Upsert override
      const { error } = await supabase.from('permissoes_modulo')
        .upsert({
          usuario_id: userId, modulo_id, nivel_leitura, nivel_escrita,
          motivo: motivo || null, updated_at: new Date().toISOString(),
        }, { onConflict: 'usuario_id,modulo_id' });
      if (error) return res.status(400).json({ error: error.message });
    }

    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
