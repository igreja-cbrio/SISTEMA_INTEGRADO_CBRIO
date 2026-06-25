const router = require('express').Router();
const {
  authenticate, authorize, bustPermissionCaches,
  resolveEffectivePerms, getCargoMatrix, getModulos,
  AREA_MODULO_BOOST, _normalizarArea,
} = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate, authorize('admin', 'diretor'));

// Anti-escalacao de privilegio: ninguem altera o PROPRIO cargo/areas/overrides.
// Mudar o proprio cargo pra `dev` (nivel 5 em tudo), se auto-conceder areas (boost
// pra nivel 5) ou criar override pra si mesmo seria auto-promocao. Mudancas na
// propria conta tem que passar por OUTRO admin (separacao de funcoes).
function bloqueiaAutoEdicao(req, resolved) {
  const sameProfile = req.params.id && String(req.params.id) === String(req.user.userId);
  const sameUsuario = resolved?.id != null
    && req.user.granular?.usuarioId != null
    && String(resolved.id) === String(req.user.granular.usuarioId);
  return sameProfile || sameUsuario;
}

// ────────────────────────────────────────────────────────────────────────
// resolverUsuarioId · ponte entre profile (UUID) e usuários (integer/UUID)
//
// Tabela usuários em prod tem id INTEGER e linka com profile por email
// (legado da migration 20260410). Endpoints PUT/DELETE recebem profile.id
// do frontend (UUID), então precisamos:
//   1. Se já eh integer/numeric, retorna direto
//   2. Senao, busca o profile pelo UUID → pega email
//   3. Busca usuarios.email → se existir, retorna usuarios.id
//   4. Senao, cria registro novo em usuários + retorna id criado
//
// Retorna { id, criado } ou null se profile não existir.
// ────────────────────────────────────────────────────────────────────────
async function resolverUsuarioId(idParam) {
  if (idParam == null) return null;

  // Já eh número (legado · alguns clientes podem mandar int direto)
  if (/^\d+$/.test(String(idParam))) {
    return { id: Number(idParam), criado: false };
  }

  // E' UUID · busca o profile pra pegar email + nome
  let { data: profile } = await supabase.from('profiles')
    .select('id, email, name').eq('id', idParam).maybeSingle();

  // Fallback · pode ser id de rh_funcionarios (funcionário cadastrado pelo
  // RH antes do primeiro login · ver GET /colaboradores)
  if (!profile?.email) {
    const { data: func } = await supabase.from('rh_funcionarios')
      .select('id, email, nome').eq('id', idParam).maybeSingle();
    if (func?.email) {
      profile = { id: func.id, email: func.email, name: func.nome };
    }
  }

  if (!profile?.email) return null;

  const email = profile.email.toLowerCase().trim();

  // Procura usuário existente por email
  const { data: existing } = await supabase.from('usuarios')
    .select('id').eq('email', email).maybeSingle();
  if (existing?.id != null) {
    return { id: existing.id, criado: false };
  }

  // Cria registro novo
  const { data: novo, error } = await supabase.from('usuarios')
    .insert({
      nome: (profile.name && profile.name.trim()) || email.split('@')[0],
      email,
    }).select('id').single();
  if (error || !novo) return null;
  return { id: novo.id, criado: true };
}

// ────────────────────────────────────────────────────────────────────────
// GET /api/permissoes/colaboradores
// Retorna profiles que são colaboradores reais do sistema (não membros).
// Exclui quem:
//   - existe em vol_profiles.auth_user_id (signup via voluntariado)
//   - tem email em mem_cadastros_pendentes (signup via formulário membresia)
// Usado pela tela de "Responsáveis por Solicitação" no dropdown.
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

    // 3. Emails que vieram do formulário público de membresia
    const { data: cadEmails } = await supabase
      .from('mem_cadastros_pendentes')
      .select('email')
      .not('email', 'is', null);
    const cadSet = new Set((cadEmails || [])
      .map(c => (c.email || '').toLowerCase().trim())
      .filter(Boolean));

    // 4. Cargos por email · enriquece com cargo_id, cargo_slug, cargo_nome
    //    (LEFT JOIN simulado: pessoa sem registro em usuários fica com cargo null)
    const { data: usuariosRows } = await supabase
      .from('usuarios')
      .select('email, cargo_id, cargos(id, slug, nome, nome_completo)')
      .eq('ativo', true);
    const cargoByEmail = new Map();
    for (const u of usuariosRows || []) {
      if (!u.email) continue;
      cargoByEmail.set(u.email.toLowerCase().trim(), {
        cargo_id: u.cargo_id,
        cargo_slug: u.cargos?.slug || null,
        cargo_nome: u.cargos?.nome_completo || u.cargos?.nome || null,
      });
    }

    // 5. Filtra + enriquece
    const colaboradores = (profiles || [])
      .filter(p => {
        if (volSet.has(p.id)) return false;
        if (p.email && cadSet.has(p.email.toLowerCase().trim())) return false;
        return true;
      })
      .map(p => {
        const cargoInfo = cargoByEmail.get((p.email || '').toLowerCase().trim()) || {
          cargo_id: null, cargo_slug: null, cargo_nome: null,
        };
        return { ...p, ...cargoInfo, origem: 'profile' };
      });

    // 6. Funcionários ativos sem profile ainda (ex: cadastrados pelo RH
    //    antes do primeiro login). Aparecem na lista com origem='funcionário'
    //    pra Marcos atribuir cargo/areas mesmo antes do signup do Supabase.
    const profileEmails = new Set(
      (profiles || [])
        .map(p => (p.email || '').toLowerCase().trim())
        .filter(Boolean)
    );
    const { data: funcionariosRows } = await supabase
      .from('rh_funcionarios')
      .select('id, nome, email, cargo, area')
      .eq('status', 'ativo')
      .not('email', 'is', null);

    for (const f of funcionariosRows || []) {
      const emailKey = (f.email || '').toLowerCase().trim();
      if (!emailKey) continue;
      if (profileEmails.has(emailKey)) continue; // já veio via profile
      const cargoInfo = cargoByEmail.get(emailKey) || {
        cargo_id: null, cargo_slug: null, cargo_nome: null,
      };
      colaboradores.push({
        id: f.id, // funcionario_id (UUID, mesmo schema de profile.id)
        name: f.nome,
        email: f.email,
        role: 'funcionario',
        avatar_url: null,
        ...cargoInfo,
        origem: 'funcionario',
      });
    }

    // Reordena por nome pra ficar previsivel na UI
    colaboradores.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    res.json(colaboradores);
  } catch (e) {
    console.error('[permissoes/colaboradores]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/permissoes/cache/bust · forca invalidacao dos caches de
// módulos + matriz cargo×módulo. Usar quando matriz foi alterada via
// SQL direto (fora do fluxo PUT /matriz/celula que já faz bust auto).
router.post('/cache/bust', async (_req, res) => {
  try {
    bustPermissionCaches();
    res.json({ success: true, bustedAt: new Date().toISOString() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/permissoes/diagnostico/:email · simula em profundidade a
// computacao de permissões pra um usuário, com TODOS os intermediarios
// expostos. Usado pra debug quando alguém não consegue acessar um módulo
// apesar do banco estar correto.
router.get('/diagnostico/:email', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase().trim();

    const { data: profile } = await supabase.from('profiles')
      .select('id, name, email, role, active, area, kpi_areas')
      .ilike('email', email)
      .maybeSingle();

    const { data: funcionario } = await supabase.from('rh_funcionarios')
      .select('id, nome, email, cargo, area, status')
      .ilike('email', email)
      .maybeSingle();

    const { data: usuario } = await supabase.from('usuarios')
      .select('id, email, nome, ativo, cargo_id, cargos(id, slug, nome, nome_completo, nivel_padrao_leitura, nivel_padrao_escrita)')
      .ilike('email', email)
      .maybeSingle();

    const { data: areas } = usuario?.id ? await supabase.from('usuario_areas')
      .select('areas(nome, setor_id, setores(nome))')
      .eq('usuario_id', usuario.id) : { data: [] };

    const { data: overrides } = usuario?.id ? await supabase.from('permissoes_modulo')
      .select('modulo_id, nivel_leitura, nivel_escrita, escopo_proprio, motivo, expira_em, modulos(slug, nome)')
      .eq('usuario_id', usuario.id) : { data: [] };

    // RAW · igual ao que o middleware le
    const { data: modulosRaw } = await supabase
      .from('modulos')
      .select('id, nome, slug, categoria, rota, ordem')
      .eq('ativo', true);
    // Paginacao manual pra contornar o cap PostgREST de 1000 linhas
    let cargoMatrixRaw = [];
    {
      let offset = 0;
      const pageSize = 1000;
      while (true) {
        const { data: page } = await supabase
          .from('cargo_modulo_permissao')
          .select('cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio')
          .range(offset, offset + pageSize - 1);
        if (!page || page.length === 0) break;
        cargoMatrixRaw = cargoMatrixRaw.concat(page);
        if (page.length < pageSize) break;
        offset += pageSize;
      }
    }

    const cargoId = usuario?.cargo_id;
    const cargoIdType = typeof cargoId;

    // Simula resolveEffectivePerms passo a passo
    const matrixRowsForUser = (cargoMatrixRaw || []).filter(r => r.cargo_id === cargoId);
    const matrixRowsForUserLoose = (cargoMatrixRaw || []).filter(r => Number(r.cargo_id) === Number(cargoId));

    const sampleMatrixRow = (cargoMatrixRaw || [])[0] || null;
    const sampleModulo = (modulosRaw || [])[0] || null;

    const defaultsByMod = new Map();
    for (const r of matrixRowsForUser) {
      defaultsByMod.set(r.modulo_id, r);
    }

    const modulosLookup = (modulosRaw || []).map(m => ({
      slug: m.slug,
      nome: m.nome,
      id: m.id,
      id_type: typeof m.id,
      tem_matriz: defaultsByMod.has(m.id),
      nivel_matriz: defaultsByMod.get(m.id)?.nivel ?? null,
    }));

    // Compara tipos: id de módulos vs modulo_id na matriz
    const tipoModulosId = sampleModulo ? typeof sampleModulo.id : null;
    const tipoCmpModuloId = sampleMatrixRow ? typeof sampleMatrixRow.modulo_id : null;
    const tipoCmpCargoId = sampleMatrixRow ? typeof sampleMatrixRow.cargo_id : null;

    res.json({
      email_query: email,
      profile,
      funcionario,
      usuario: usuario ? {
        ...usuario,
        cargo_id_type: typeof usuario.cargo_id,
      } : null,
      areas_list: (areas || []).map(a => a.areas?.nome).filter(Boolean),
      overrides: overrides || [],
      cargo_id: cargoId,
      cargo_id_type: cargoIdType,
      matrix_stats: {
        cargoMatrix_total_rows: (cargoMatrixRaw || []).length,
        rows_for_user_strict: matrixRowsForUser.length,
        rows_for_user_loose: matrixRowsForUserLoose.length,
        defaultsByMod_size: defaultsByMod.size,
      },
      type_check: {
        modulos_id: tipoModulosId,
        cmp_modulo_id: tipoCmpModuloId,
        cmp_cargo_id: tipoCmpCargoId,
        sample_modulo_id_value: sampleModulo?.id,
        sample_cmp_modulo_id_value: sampleMatrixRow?.modulo_id,
        sample_cmp_cargo_id_value: sampleMatrixRow?.cargo_id,
      },
      modulos_resolvidos: modulosLookup.sort((a, b) => (a.slug || '').localeCompare(b.slug || '')),
    });
  } catch (e) { console.error('[PERMISSOES] diagnostico:', e.stack || e.message); res.status(500).json({ error: e.message }); }
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
// Retorna a matriz cargo x módulo (defaults por cargo).
// Resposta: { cargos: [...], módulos: [...], celulas: [{cargo_id, modulo_id, nível, ...}] }
// ────────────────────────────────────────────────────────────────────────
router.get('/matriz', async (_req, res) => {
  try {
    const [cargos, modulos] = await Promise.all([
      supabase.from('cargos').select('*').eq('ativo', true).order('ordem'),
      supabase.from('modulos').select('*').eq('ativo', true).order('ordem'),
    ]);

    // PostgREST capa em 1000 linhas por response · paginamos via .range()
    // até exaurir. Matriz tem ~1073 linhas hoje (29 cargos × 37 módulos).
    let celulas = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('cargo_modulo_permissao')
        .select('*')
        .range(offset, offset + pageSize - 1);
      if (error) return res.status(400).json({ error: error.message });
      if (!data || data.length === 0) break;
      celulas = celulas.concat(data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }
    res.json({
      cargos: cargos.data || [],
      modulos: modulos.data || [],
      celulas,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ────────────────────────────────────────────────────────────────────────
// PUT /api/permissoes/matriz/celula
// Atualiza uma celula da matriz cargo x módulo (default por cargo).
// Body: { cargo_id, modulo_id, nível, pode_exportar, pode_aprovar, escopo_proprio }
// ────────────────────────────────────────────────────────────────────────
router.put('/matriz/celula', async (req, res) => {
  try {
    const { cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio } = req.body;
    if (!cargo_id || !modulo_id) return res.status(400).json({ error: 'cargo_id e modulo_id são obrigatórios' });
    if (typeof nivel !== 'number' || nivel < 0 || nivel > 5) return res.status(400).json({ error: 'nível deve estar entre 0 e 5' });

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

// GET /api/permissoes/cargo/:id — detalhes de um cargo + matriz por módulo
router.get('/cargo/:id', async (req, res) => {
  try {
    const [cargo, celulas] = await Promise.all([
      supabase.from('cargos').select('*').eq('id', req.params.id).single(),
      supabase.from('cargo_modulo_permissao').select('*, modulos(slug, nome, categoria, ordem)').eq('cargo_id', req.params.id),
    ]);
    if (cargo.error) return res.status(404).json({ error: 'Cargo não encontrado' });
    res.json({ cargo: cargo.data, celulas: celulas.data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/permissoes/usuario/:id — get permissions for a user
router.get('/usuario/:id', async (req, res) => {
  try {
    const resolved = await resolverUsuarioId(req.params.id);
    if (!resolved) {
      // Profile não existe · retorna vazio (UI mostra "sem dados")
      return res.json({ usuario: null, areas: [], overrides: [], extraScopes: [] });
    }
    const userId = resolved.id;

    // Get user from usuários table (permissions system)
    const { data: usuario } = await supabase.from('usuarios')
      .select('*, cargos(*)').eq('id', userId).maybeSingle();

    // Get user áreas
    const { data: userAreas } = await supabase.from('usuario_areas')
      .select('*, areas(nome, setor_id, setores(nome))').eq('usuario_id', userId);

    // Get module overrides
    const { data: overrides } = await supabase.from('permissoes_modulo')
      .select('*, modulos(nome)').eq('usuario_id', userId);

    // Get extra scope overrides
    const { data: extraScopes } = await supabase.from('permissoes_escopo_extra')
      .select('*, modulos(nome), areas(nome), setores(nome)').eq('usuario_id', userId);

    // ── Grade de acesso EFETIVO por módulo (cargo + área + override) ──
    // Espelha a resolução do middleware (resolveEffectivePerms) e expõe, por
    // módulo, o nível efetivo + a ORIGEM (cargo / área / override / bloqueio),
    // pra a tela ajustar "ver/mexer" por módulo de qualquer pessoa.
    let grade = [];
    try {
      const cargoId = usuario?.cargo_id ?? null;
      const modulos = await getModulos();
      const cargoMatrix = cargoId != null ? await getCargoMatrix(cargoId) : [];
      const areaNames = (userAreas || []).map(a => a.areas?.nome).filter(Boolean);

      // Slugs elevados pela área (mesma lógica do resolveEffectivePerms)
      const slugsComBoost = new Set();
      for (const a of areaNames) {
        const slug = AREA_MODULO_BOOST[_normalizarArea(a)];
        if (slug) slugsComBoost.add(slug);
      }

      const efetivas = resolveEffectivePerms({
        overrides: overrides || [],
        cargoMatrix,
        cargoId,
        modulos,
        areas: areaNames,
      });
      const overrideByMod = new Map((overrides || []).map(o => [o.modulo_id, o]));
      const cargoByMod = new Map();
      for (const r of cargoMatrix || []) {
        if (r.cargo_id === cargoId) cargoByMod.set(r.modulo_id, r);
      }

      grade = (modulos || []).map(m => {
        const ov = overrideByMod.get(m.id) || null;
        const cargoCell = cargoByMod.get(m.id) || null;
        const boost = !!(m.slug && slugsComBoost.has(m.slug));
        // Bloqueio explícito = override com nivel_leitura 0 (mesma regra que o
        // middleware usa pra montar modulosBloqueados · vence boost de área e admin).
        const blocked = !!ov && (ov.nivel_leitura ?? 1) === 0;
        const eff = (m.slug && efetivas[m.slug]) || (m.nome && efetivas[m.nome]) || { leitura: 0, escrita: 0 };
        // Override é soberano (vence cargo/área) · por isso é checado primeiro.
        let origem;
        if (ov) origem = blocked ? 'bloqueio' : 'override';
        else if (boost) origem = 'area';
        else if (cargoCell && (cargoCell.nivel ?? 0) > 0) origem = 'cargo';
        else origem = 'nenhum';
        return {
          modulo_id: m.id,
          slug: m.slug,
          nome: m.nome,
          categoria: m.categoria || 'outros',
          ordem: m.ordem ?? 0,
          rota: m.rota || null,
          leitura: blocked ? 0 : (eff.leitura ?? 0),
          escrita: blocked ? 0 : (eff.escrita ?? 0),
          origem,
          area_boost: boost,
          blocked,
          cargo_nivel: cargoCell?.nivel ?? 0,
          // modificadores efetivos (override > cargo) · preserva ao gravar o nível
          pode_exportar: ov?.pode_exportar ?? cargoCell?.pode_exportar ?? false,
          pode_aprovar: ov?.pode_aprovar ?? cargoCell?.pode_aprovar ?? false,
          escopo_proprio: ov?.escopo_proprio ?? cargoCell?.escopo_proprio ?? false,
          override: ov ? {
            nivel_leitura: ov.nivel_leitura,
            nivel_escrita: ov.nivel_escrita,
            motivo: ov.motivo || null,
            expira_em: ov.expira_em || null,
          } : null,
        };
      }).sort((a, b) => (a.ordem - b.ordem) || (a.nome || '').localeCompare(b.nome || ''));
    } catch (gradeErr) {
      console.error('[permissoes/usuario grade]', gradeErr.message);
      grade = [];
    }

    res.json({
      usuario: usuario || null,
      areas: userAreas || [],
      overrides: overrides || [],
      extraScopes: extraScopes || [],
      grade,
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
    if (bloqueiaAutoEdicao(req, resolved)) {
      return res.status(403).json({ error: 'Você não pode alterar o próprio cargo. Peça a outro administrador.' });
    }

    const updatePayload = { cargo_id };
    // updated_at so seta se a coluna existir · em prod a tabela pode não ter
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

// PUT /api/permissoes/usuario/:id/role — muda o "acesso base" (profiles.role)
// role ∈ {assistente, admin, diretor} (CHECK profiles_role_check). admin/diretor
// viram `isAdmin` no frontend (veem tudo, ignoram a matriz); assistente segue só
// o que cargo + áreas + overrides liberam. O :id é o UUID do profile (a lista de
// colaboradores vem de profiles). Permite promover/rebaixar sem SQL.
const ROLES_VALIDOS = ['assistente', 'admin', 'diretor'];
router.put('/usuario/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    if (!ROLES_VALIDOS.includes(role)) {
      return res.status(400).json({ error: `Acesso base inválido. Use: ${ROLES_VALIDOS.join(', ')}.` });
    }
    // Anti-autoescalação · ninguém muda o próprio acesso base (separação de funções).
    if (bloqueiaAutoEdicao(req, null)) {
      return res.status(403).json({ error: 'Você não pode alterar o próprio acesso base. Peça a outro administrador.' });
    }
    // O :id é o UUID do profile (vem de GET /colaboradores)
    const { data, error } = await supabase.from('profiles')
      .update({ role }).eq('id', req.params.id).select('id').maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Perfil não encontrado.' });

    bustPermissionCaches();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/permissoes/usuario/:id/areas — set user áreas
router.put('/usuario/:id/areas', async (req, res) => {
  try {
    const { area_ids } = req.body; // array of área IDs
    const resolved = await resolverUsuarioId(req.params.id);
    if (!resolved) return res.status(404).json({ error: 'Usuario nao encontrado' });
    if (bloqueiaAutoEdicao(req, resolved)) {
      return res.status(403).json({ error: 'Você não pode alterar as próprias áreas. Peça a outro administrador.' });
    }
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

// PUT /api/permissoes/usuario/:id/modulo — set/clear override por módulo
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
    if (!req.params.id || !modulo_id) return res.status(400).json({ error: 'usuário e módulo são obrigatórios' });
    const resolved = await resolverUsuarioId(req.params.id);
    if (!resolved) return res.status(404).json({ error: 'Usuario nao encontrado' });
    if (bloqueiaAutoEdicao(req, resolved)) {
      return res.status(403).json({ error: 'Você não pode alterar as próprias permissões. Peça a outro administrador.' });
    }
    const userId = resolved.id;

    // Busca a celula default do cargo do usuário para o módulo
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
    if (!resolved) return res.status(404).json({ error: 'Usuário não encontrado' });
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
