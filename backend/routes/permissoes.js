const router = require('express').Router();
const { authenticate, authorize, bustPermissionCaches } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate, authorize('admin', 'diretor'));

// ────────────────────────────────────────────────────────────────────────
// resolverUsuarioId · ponte entre profile (UUID) e usuarios (integer/UUID)
//
// Tabela usuarios em prod tem id INTEGER e linka com profile por email
// (legado da migration 20260410). Endpoints PUT/DELETE recebem profile.id
// do frontend (UUID), entao precisamos:
//   1. Se ja eh integer/numeric, retorna direto
//   2. Senao, busca o profile pelo UUID → pega email
//   3. Busca usuarios.email → se existir, retorna usuarios.id
//   4. Senao, cria registro novo em usuarios + retorna id criado
//
// Retorna { id, criado } ou null se profile nao existir.
// ────────────────────────────────────────────────────────────────────────
async function resolverUsuarioId(idParam) {
  if (idParam == null) return null;

  // Ja eh numero (legado · alguns clientes podem mandar int direto)
  if (/^\d+$/.test(String(idParam))) {
    return { id: Number(idParam), criado: false };
  }

  // E' UUID · busca o profile pra pegar email + nome
  const { data: profile } = await supabase.from('profiles')
    .select('id, email, name').eq('id', idParam).maybeSingle();
  if (!profile?.email) return null;

  const email = profile.email.toLowerCase().trim();

  // Procura usuario existente por email
  const { data: existing } = await supabase.from('usuarios')
    .select('id').eq('email', email).maybeSingle();
  if (existing?.id != null) {
    return { id: existing.id, criado: false };
  }

  // Cria registro novo
  const { data: novo, error } = await supabase.from('usuarios')
    .insert({ nome: profile.name || email, email }).select('id').single();
  if (error || !novo) return null;
  return { id: novo.id, criado: true };
}

// ────────────────────────────────────────────────────────────────────────
// GET /api/permissoes/colaboradores
// Retorna profiles que sao colaboradores reais do sistema (nao membros).
// Exclui quem:
//   - existe em vol_profiles.auth_user_id (signup via voluntariado)
//   - tem email em mem_cadastros_pendentes (signup via formulario membresia)
// Usado pela tela de "Responsaveis por Solicitacao" no dropdown.
// ────────────────────────────────────────────────────────────────────────
router.get('/colaboradores', async (_req, res) => {
  try {
    // 1. Pega todos profiles ativos
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, name, email, role, avatar_url')
      .eq('active', true)
      .order('name');
    if (error) throw error;

    // 2. IDs que vieram do voluntariado
    const { data: volIds } = await supabase
      .from('vol_profiles')
      .select('auth_user_id')
      .not('auth_user_id', 'is', null);
    const volSet = new Set((volIds || []).map(v => v.auth_user_id));

    // 3. Emails que vieram do formulario publico de membresia
    const { data: cadEmails } = await supabase
      .from('mem_cadastros_pendentes')
      .select('email')
      .not('email', 'is', null);
    const cadSet = new Set((cadEmails || [])
      .map(c => (c.email || '').toLowerCase().trim())
      .filter(Boolean));

    // 4. Filtra
    const colaboradores = (profiles || []).filter(p => {
      if (volSet.has(p.id)) return false;
      if (p.email && cadSet.has(p.email.toLowerCase().trim())) return false;
      return true;
    });

    res.json(colaboradores);
  } catch (e) {
    console.error('[permissoes/colaboradores]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/permissoes/cache/bust · forca invalidacao dos caches de
// modulos + matriz cargo×modulo. Usar quando matriz foi alterada via
// SQL direto (fora do fluxo PUT /matriz/celula que ja faz bust auto).
router.post('/cache/bust', async (_req, res) => {
  try {
    bustPermissionCaches();
    res.json({ success: true, bustedAt: new Date().toISOString() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/permissoes/estrutura — setores, áreas, módulos, cargos
router.get('/estrutura', async (req, res) => {
  try {
    const [setores, areas, modulos, cargos] = await Promise.all([
      supabase.from('setores').select('*').eq('ativo', true).order('id'),
      supabase.from('areas').select('*, setores(nome)').eq('ativo', true).order('nome'),
      supabase.from('modulos').select('*').eq('ativo', true).order('ordem'),
      supabase.from('cargos').select('*').eq('ativo', true).order('ordem'),
    ]);
    res.json({
      setores: setores.data || [],
      areas: areas.data || [],
      modulos: modulos.data || [],
      cargos: cargos.data || [],
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ────────────────────────────────────────────────────────────────────────
// GET /api/permissoes/matriz
// Retorna a matriz cargo x modulo (defaults por cargo).
// Resposta: { cargos: [...], modulos: [...], celulas: [{cargo_id, modulo_id, nivel, ...}] }
// ────────────────────────────────────────────────────────────────────────
router.get('/matriz', async (_req, res) => {
  try {
    const [cargos, modulos, celulas] = await Promise.all([
      supabase.from('cargos').select('*').eq('ativo', true).order('ordem'),
      supabase.from('modulos').select('*').eq('ativo', true).order('ordem'),
      supabase.from('cargo_modulo_permissao').select('*'),
    ]);
    res.json({
      cargos: cargos.data || [],
      modulos: modulos.data || [],
      celulas: celulas.data || [],
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ────────────────────────────────────────────────────────────────────────
// PUT /api/permissoes/matriz/celula
// Atualiza uma celula da matriz cargo x modulo (default por cargo).
// Body: { cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio }
// ────────────────────────────────────────────────────────────────────────
router.put('/matriz/celula', async (req, res) => {
  try {
    const { cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio } = req.body;
    if (!cargo_id || !modulo_id) return res.status(400).json({ error: 'cargo_id e modulo_id sao obrigatorios' });
    if (typeof nivel !== 'number' || nivel < 0 || nivel > 5) return res.status(400).json({ error: 'nivel deve estar entre 0 e 5' });

    const { error } = await supabase.from('cargo_modulo_permissao').upsert({
      cargo_id, modulo_id, nivel,
      pode_exportar: !!pode_exportar,
      pode_aprovar: !!pode_aprovar,
      escopo_proprio: !!escopo_proprio,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'cargo_id,modulo_id' });
    if (error) return res.status(400).json({ error: error.message });

    bustPermissionCaches();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/permissoes/cargo/:id — detalhes de um cargo + matriz por modulo
router.get('/cargo/:id', async (req, res) => {
  try {
    const [cargo, celulas] = await Promise.all([
      supabase.from('cargos').select('*').eq('id', req.params.id).single(),
      supabase.from('cargo_modulo_permissao').select('*, modulos(slug, nome, categoria, ordem)').eq('cargo_id', req.params.id),
    ]);
    if (cargo.error) return res.status(404).json({ error: 'Cargo nao encontrado' });
    res.json({ cargo: cargo.data, celulas: celulas.data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/permissoes/usuario/:id — get permissions for a user
router.get('/usuario/:id', async (req, res) => {
  try {
    const resolved = await resolverUsuarioId(req.params.id);
    if (!resolved) {
      // Profile nao existe · retorna vazio (UI mostra "sem dados")
      return res.json({ usuario: null, areas: [], overrides: [], extraScopes: [] });
    }
    const userId = resolved.id;

    // Get user from usuarios table (permissions system)
    const { data: usuario } = await supabase.from('usuarios')
      .select('*, cargos(*)').eq('id', userId).maybeSingle();

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
    const resolved = await resolverUsuarioId(req.params.id);
    if (!resolved) return res.status(404).json({ error: 'Usuario nao encontrado' });

    const updatePayload = { cargo_id };
    // updated_at so seta se a coluna existir · em prod a tabela pode nao ter
    try {
      const { error } = await supabase.from('usuarios')
        .update({ ...updatePayload, updated_at: new Date().toISOString() }).eq('id', resolved.id);
      if (error) {
        // Fallback sem updated_at
        const { error: err2 } = await supabase.from('usuarios')
          .update(updatePayload).eq('id', resolved.id);
        if (err2) return res.status(400).json({ error: err2.message });
      }
    } catch {
      const { error: err3 } = await supabase.from('usuarios')
        .update(updatePayload).eq('id', resolved.id);
      if (err3) return res.status(400).json({ error: err3.message });
    }

    bustPermissionCaches();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/permissoes/usuario/:id/areas — set user areas
router.put('/usuario/:id/areas', async (req, res) => {
  try {
    const { area_ids } = req.body; // array of area IDs
    const resolved = await resolverUsuarioId(req.params.id);
    if (!resolved) return res.status(404).json({ error: 'Usuario nao encontrado' });
    const userId = resolved.id;

    // Delete existing
    await supabase.from('usuario_areas').delete().eq('usuario_id', userId);

    // Insert new
    if (area_ids?.length) {
      const rows = area_ids.map((aid, i) => ({ usuario_id: userId, area_id: aid, is_principal: i === 0 }));
      const { error } = await supabase.from('usuario_areas').insert(rows);
      if (error) return res.status(400).json({ error: error.message });
    }

    bustPermissionCaches();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/permissoes/usuario/:id/modulo — set/clear override por modulo
// Body: { modulo_id, nivel_leitura, nivel_escrita, pode_exportar?, pode_aprovar?,
//         escopo_proprio?, motivo?, expira_em? }
// Se os valores coincidirem com a matriz default do cargo, o override e' removido.
router.put('/usuario/:id/modulo', async (req, res) => {
  try {
    const {
      modulo_id, nivel_leitura, nivel_escrita,
      pode_exportar = false, pode_aprovar = false, escopo_proprio = false,
      motivo = null, expira_em = null,
    } = req.body;
    if (!req.params.id || !modulo_id) return res.status(400).json({ error: 'usuario e modulo sao obrigatorios' });
    const resolved = await resolverUsuarioId(req.params.id);
    if (!resolved) return res.status(404).json({ error: 'Usuario nao encontrado' });
    const userId = resolved.id;

    // Busca a celula default do cargo do usuario para o modulo
    const { data: user } = await supabase.from('usuarios')
      .select('cargo_id').eq('id', userId).maybeSingle();

    let cellDefault = null;
    if (user?.cargo_id) {
      const { data } = await supabase.from('cargo_modulo_permissao')
        .select('nivel, pode_exportar, pode_aprovar, escopo_proprio')
        .eq('cargo_id', user.cargo_id).eq('modulo_id', modulo_id).maybeSingle();
      cellDefault = data;
    }

    // Se override == default, remove (volta pro default)
    const equalsDefault = cellDefault
      && nivel_leitura === cellDefault.nivel
      && nivel_escrita === cellDefault.nivel
      && !!pode_exportar === !!cellDefault.pode_exportar
      && !!pode_aprovar === !!cellDefault.pode_aprovar
      && !!escopo_proprio === !!cellDefault.escopo_proprio
      && !expira_em;

    if (equalsDefault) {
      await supabase.from('permissoes_modulo')
        .delete().eq('usuario_id', userId).eq('modulo_id', modulo_id);
    } else {
      const { error } = await supabase.from('permissoes_modulo').upsert({
        usuario_id: userId,
        modulo_id,
        nivel_leitura,
        nivel_escrita,
        pode_exportar: !!pode_exportar,
        pode_aprovar: !!pode_aprovar,
        escopo_proprio: !!escopo_proprio,
        motivo,
        expira_em,
        criado_por: req.user?.userId || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'usuario_id,modulo_id' });
      if (error) return res.status(400).json({ error: error.message });
    }

    bustPermissionCaches();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/permissoes/usuario/:id/modulo/:moduloId — remove um override
router.delete('/usuario/:id/modulo/:moduloId', async (req, res) => {
  try {
    const resolved = await resolverUsuarioId(req.params.id);
    if (!resolved) return res.status(404).json({ error: 'Usuario nao encontrado' });
    const { error } = await supabase.from('permissoes_modulo')
      .delete()
      .eq('usuario_id', resolved.id)
      .eq('modulo_id', req.params.moduloId);
    if (error) return res.status(400).json({ error: error.message });
    bustPermissionCaches();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
