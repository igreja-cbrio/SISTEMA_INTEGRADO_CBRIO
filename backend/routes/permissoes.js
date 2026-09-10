const router = require('express').Router();
const {
  // varredura 2026-09 · B01: `authorize` saiu daqui — ele liberava por NÍVEL DE
  // CARGO (>=4) sem olhar a matriz; quem decide agora é `authorizeModule`.
  authenticate, authorizeModule, bustPermissionCaches,
  resolveEffectivePerms, getCargoMatrix, getModulos,
  AREA_MODULO_BOOST, _normalizarArea,
} = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

// varredura 2026-09 · B01: `authorize('admin','diretor')` passava com
// max(cargoNivelLeitura, cargoNivelEscrita) >= 4 — 20 contas ativas, 15 delas SEM
// nenhuma linha no módulo `permissoes-admin` — ou seja a matriz que a própria tela
// desenha não valia aqui. Com a routeKey mapeada (`permissoes` →
// ['permissoes-admin'] · auth.js:118) o ramo do nível padrão do cargo
// (auth.js:649) não roda e o gate passa a ser a matriz.
// ⚠️ Router-wide é seguro NESTE arquivo: nenhuma rota daqui alimenta agregado do
// /painel (a LEI do jornada.js:52-55) — todas servem a tela de Permissões.
// varredura 2026-09 · B01: nivel 4, nao 2. Na convencao da casa 2 e "pessoal", e
// este modulo CONCEDE acesso. Medido em 08/09: dos 45 cargos, so `Dev` e
// `Coord Estrategico` tem linha em `permissoes-admin`, os dois com nivel 5, e ha
// 1 unico override (tambem 5) — entao 4 nao tira ninguem que 2 deixaria passar,
// e fecha a faixa 2-3 que um override futuro poderia abrir sem querer.
router.use(authenticate, authorizeModule('permissoes', 4));

// Criar LOGIN é restrito a "devs" (você + Marcos Paulo) · mesmo critério do
// requireDev de agents.js (sobrescrevível por env DEV_EMAILS). Não confundir
// varredura 2026-09: comentário corrigido — o router NÃO usa mais
// authorize('admin','diretor') e sim authorizeModule('permissoes', 2); isto aqui
// restringe ainda mais. Comentário que mente engana a próxima sessão.
const DEV_EMAILS = (process.env.DEV_EMAILS || 'gestao@cbrio.com.br,infra@cbrio.com.br,matheus.toscano@cbrio.org,diego.assis@cbrio.org')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
// Dev = lista fixa (env) OU super-admin (app_super_admins) — robusto a qual
// e-mail o Matheus usa pra logar. Async por causa da consulta ao super-admin.
async function ehDev(req) {
  const email = (req.user?.email || '').toLowerCase();
  if (!email) return false;
  if (DEV_EMAILS.includes(email)) return true;
  try {
    const { data } = await supabase.from('app_super_admins')
      .select('email').ilike('email', email).eq('ativo', true).maybeSingle();
    return !!data;
  } catch { return false; }
}

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

// varredura 2026-09 · B01: role admin/diretor PULA o authorizeModule (auth.js:614),
// então a trava do router não segura as 17 contas com esse role. As rotas que mexem
// no CONTROLE DE ACESSO em si (matriz global e profiles.role) exigem, ALÉM do
// router: nível 5 de escrita em `permissoes-admin` OU dev/super-admin.
const NIVEL_TOTAL_PERMISSOES = 5;
async function podeMexerNoControleDeAcesso(req) {
  // varredura 2026-09 · B01: modulePerms é indexado por slug (auth.js:255) e o
  // gate é ESCRITA — leitura alta não autoriza mudar a régua de terceiros.
  const perm = req.user?.granular?.modulePerms?.['permissoes-admin'];
  if (perm && (perm.escrita ?? 0) >= NIVEL_TOTAL_PERMISSOES) return true;
  return ehDev(req);
}

// varredura 2026-09 · B02: mudança no controle de acesso não deixava rastro —
// depois do fato ninguém sabia quem promoveu quem. Grava em `app_audit_log`
// (tabela que já existe · migration 20260521230000, mesmo padrão do lgpd.js) e
// NUNCA derruba a operação: perder a trilha é ruim, desfazer o que o admin
// acabou de decidir é pior.
async function auditarAcesso(req, { rowId, action = 'UPDATE', changes }) {
  try {
    await supabase.from('app_audit_log').insert({
      table_name: 'permissoes_admin',
      row_id: String(rowId ?? '-'),
      action,
      user_id: req.user?.id || null,
      user_email: req.user?.email || null,
      changes: {
        rota: `${req.method} ${req.originalUrl}`,
        ator_nome: req.user?.name || null,
        ...changes,
      },
    });
  } catch (e) {
    console.error('[permissoes] auditoria falhou:', e.message);
  }
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

    // varredura 2026-09 · B01: a matriz é a régua de TODO MUNDO que tem o cargo —
    // mexer nela é o poder mais amplo do sistema, então exige nível total.
    if (!(await podeMexerNoControleDeAcesso(req))) {
      return res.status(403).json({ error: 'Só quem tem nível 5 em Permissões (ou o time de sistemas) pode alterar a matriz dos cargos.' });
    }
    // varredura 2026-09 · B02: sem esta guarda o ator elevava o PRÓPRIO cargo a 5
    // em qualquer módulo — a porta lateral que o bloqueiaAutoEdicao não cobria,
    // porque aqui não há :id de pessoa, só o cargo.
    // varredura 2026-09 · B02: MEDIDO em 08/09 — 5 contas ativas tem o cargo `Dev`.
    // Sem o escape abaixo, a linha desse cargo ficaria INEDITAVEL por todo mundo
    // (nao e "peca a outro administrador", e beco sem saida). O time de sistemas
    // (DEV_EMAILS + app_super_admins) mexe no proprio cargo; o resto, nao.
    if (req.user?.granular?.cargoId != null
        && String(cargo_id) === String(req.user.granular.cargoId)
        && !(await ehDev(req))) {
      return res.status(403).json({ error: 'Você não pode alterar a régua do seu próprio cargo. Peça a outro administrador.' });
    }

    const { error } = await supabase.from('cargo_modulo_permissao').upsert({
      cargo_id, modulo_id, nivel,
      pode_exportar: !!pode_exportar,
      pode_aprovar: !!pode_aprovar,
      escopo_proprio: !!escopo_proprio,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'cargo_id,modulo_id' });
    if (error) return res.status(400).json({ error: error.message });

    // varredura 2026-09 · B02: a matriz não tinha trilha nenhuma de quem mexeu.
    await auditarAcesso(req, {
      rowId: `${cargo_id}:${modulo_id}`,
      changes: { tipo: 'matriz_celula', cargo_id, modulo_id, nivel, pode_exportar: !!pode_exportar, pode_aprovar: !!pode_aprovar, escopo_proprio: !!escopo_proprio },
    });
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

    // E-mail é a CHAVE que casa usuarios ↔ profiles (login/permissões/aprovações).
    // Sem e-mail, a linha vira órfã (nunca loga, nunca recebe aprovação) e o
    // .eq('email','') abaixo nunca casa a de e-mail nulo → duplicava a cada save.
    const emailNorm = String(email || '').trim().toLowerCase();
    if (!emailNorm || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailNorm)) {
      return res.status(400).json({ error: 'É preciso um e-mail válido para criar o acesso deste colaborador.' });
    }

    // varredura 2026-09 · B02: esta rota casa por E-MAIL e gravava cargo_id sem
    // passar por bloqueiaAutoEdicao — o ator mandava o PRÓPRIO e-mail + o cargo
    // `dev` (5/5) e se auto-promovia. O e-mail do token barra também quem não tem
    // linha granular (aí o insert criaria a linha já no cargo escolhido).
    if (emailNorm === String(req.user?.email || '').trim().toLowerCase()) {
      return res.status(403).json({ error: 'Você não pode criar nem alterar o próprio cadastro de acesso. Peça a outro administrador.' });
    }

    // Check if exists by email
    const { data: existing } = await supabase.from('usuarios')
      .select('id').eq('email', emailNorm).limit(1);

    // varredura 2026-09 · B02: cobre quem tem outro e-mail no token e a mesma
    // linha em `usuarios` (o par que o bloqueiaAutoEdicao já conhece).
    if (existing?.length && bloqueiaAutoEdicao(req, { id: existing[0].id })) {
      return res.status(403).json({ error: 'Você não pode alterar o próprio cadastro de acesso. Peça a outro administrador.' });
    }

    let userId;
    let acaoAudit = 'UPDATE';
    if (existing?.length) {
      await supabase.from('usuarios').update({ nome, cargo_id }).eq('id', existing[0].id);
      userId = existing[0].id;
    } else {
      const { data, error } = await supabase.from('usuarios')
        .insert({ nome, email: emailNorm, cargo_id }).select().single();
      if (error) return res.status(400).json({ error: error.message });
      userId = data.id;
      acaoAudit = 'INSERT';
    }

    // varredura 2026-09 · B02: esta rota define CARGO, que é a régua base da pessoa.
    await auditarAcesso(req, { rowId: userId, action: acaoAudit, changes: { tipo: 'usuario_cargo', email: emailNorm, cargo_id } });
    res.json({ id: userId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/permissoes/criar-login — cria um LOGIN de verdade (Supabase Auth) +
// perfil de colaborador + cargo + áreas. RESTRITO a devs (você + Marcos Paulo).
// Diferente do POST /usuario (que só mexe na tabela usuarios da matriz e NÃO
// cria login). O usuário criado já entra confirmado (pode logar na hora).
router.post('/criar-login', async (req, res) => {
  if (!(await ehDev(req))) return res.status(403).json({ error: 'Acesso restrito.' });
  try {
    const { email, nome, senha, cargo_id, role, areas } = req.body || {};
    const em = String(email || '').trim().toLowerCase();
    if (!em || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
      return res.status(400).json({ error: 'E-mail inválido' });
    }
    if (!nome || String(nome).trim().length < 2) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }
    if (!senha || String(senha).length < 6) {
      return res.status(400).json({ error: 'A senha deve ter ao menos 6 caracteres' });
    }
    const roleFinal = ['assistente', 'diretor', 'admin'].includes(role) ? role : 'assistente';

    // 1) cria no Auth (email_confirm: já pode logar sem confirmar e-mail)
    const { data: created, error: authErr } = await supabase.auth.admin.createUser({
      email: em,
      password: String(senha),
      email_confirm: true,
      user_metadata: { nome: String(nome).trim(), origem: 'admin' },
    });
    if (authErr) {
      const dup = /already|exists|registered|duplicate/i.test(authErr.message || '');
      return res.status(400).json({ error: dup ? 'Já existe um usuário com esse e-mail.' : authErr.message });
    }
    const uid = created?.user?.id;
    if (!uid) return res.status(500).json({ error: 'Falha ao criar o usuário no Auth.' });

    // 2) perfil como COLABORADOR do sistema (o trigger handle_new_user já cria o
    // profile; aqui garantimos role + is_membro_only=false + nome)
    await supabase.from('profiles')
      .update({ name: String(nome).trim(), role: roleFinal, is_membro_only: false })
      .eq('id', uid);

    // 2b) o trigger cria um membro "visitante" pra e-mail fora do RH — como este é
    // um LOGIN de colaborador, remove esse membro-fantasma (só o criado por 'admin',
    // nunca um membro real) e desvincula do perfil pra não poluir a Membresia.
    try {
      const { data: prof } = await supabase.from('profiles').select('membro_id').eq('id', uid).maybeSingle();
      if (prof?.membro_id) {
        const { data: mem } = await supabase.from('mem_membros')
          .select('id, origem_cadastro, status').eq('id', prof.membro_id).maybeSingle();
        if (mem && mem.origem_cadastro === 'admin' && mem.status === 'visitante') {
          await supabase.rpc('app_soft_delete', { p_table_name: 'mem_membros', p_row_id: mem.id, p_deleted_by: req.user?.userId ?? null });
          await supabase.from('profiles').update({ membro_id: null }).eq('id', uid);
        }
      }
    } catch (limpErr) { console.warn('[permissoes] criar-login limpeza membro:', limpErr.message); }

    // 3) linha em usuarios (matriz) + cargo, e 4) áreas (boost de módulo)
    const resolved = await resolverUsuarioId(uid);
    if (resolved?.id != null) {
      const patch = { nome: String(nome).trim() };
      if (cargo_id) patch.cargo_id = cargo_id;
      await supabase.from('usuarios').update(patch).eq('id', resolved.id);

      if (Array.isArray(areas) && areas.length) {
        await supabase.from('usuario_areas').delete().eq('usuario_id', resolved.id);
        const rows = areas.map((aid, i) => ({ usuario_id: resolved.id, area_id: aid, is_principal: i === 0 }));
        const { error: aerr } = await supabase.from('usuario_areas').insert(rows);
        if (aerr) console.warn('[permissoes] criar-login áreas:', aerr.message);
      }
    }

    bustPermissionCaches();
    res.status(201).json({ id: uid, email: em });
  } catch (e) {
    console.error('[permissoes] criar-login:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao criar o usuário' });
  }
});

// PUT /api/permissoes/usuario/:id/email — troca o e-mail de LOGIN (Auth) e espelha
// em profiles/usuarios. RESTRITO a devs (mexe na identidade de login). :id = UUID
// do profile (== auth.users.id).
router.put('/usuario/:id/email', async (req, res) => {
  if (!(await ehDev(req))) return res.status(403).json({ error: 'Acesso restrito.' });
  try {
    const uid = req.params.id;
    const novo = String(req.body?.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(novo)) return res.status(400).json({ error: 'E-mail inválido' });

    // precisa ser um login de verdade (profile.id == auth.users.id)
    const { data: got, error: getErr } = await supabase.auth.admin.getUserById(uid);
    if (getErr || !got?.user) {
      return res.status(404).json({ error: 'Essa pessoa não tem login de sistema (só ficha) — não dá pra editar o e-mail.' });
    }
    const antigo = (got.user.email || '').toLowerCase();
    if (novo === antigo) return res.json({ success: true, email: novo });

    // e-mail já usado por outra conta?
    const { data: dupe } = await supabase.from('profiles').select('id').ilike('email', novo).neq('id', uid).maybeSingle();
    if (dupe) return res.status(400).json({ error: 'Já existe outra conta com esse e-mail.' });

    // 1) Auth (fonte de verdade do login)
    const { error: upErr } = await supabase.auth.admin.updateUserById(uid, { email: novo, email_confirm: true });
    if (upErr) {
      const dup = /already|exists|registered|duplicate/i.test(upErr.message || '');
      return res.status(400).json({ error: dup ? 'Já existe outra conta com esse e-mail.' : upErr.message });
    }
    // 2) espelha em profiles + usuarios (usuarios liga por email)
    await supabase.from('profiles').update({ email: novo }).eq('id', uid);
    if (antigo) await supabase.from('usuarios').update({ email: novo }).eq('email', antigo);

    bustPermissionCaches();
    res.json({ success: true, email: novo });
  } catch (e) {
    console.error('[permissoes] editar-email:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao editar o e-mail' });
  }
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

    // varredura 2026-09 · B02: cargo é a régua base — sem trilha, "quem mudou o
    // cargo dessa pessoa?" não tinha resposta.
    await auditarAcesso(req, { rowId: resolved.id, changes: { tipo: 'usuario_cargo', cargo_id, alvo_param: req.params.id } });
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
    // varredura 2026-09 · B01: role admin/diretor pula TODO authorizeModule
    // (auth.js:614) — conceder esse role é a promoção mais forte que existe aqui.
    if (!(await podeMexerNoControleDeAcesso(req))) {
      return res.status(403).json({ error: 'Só quem tem nível 5 em Permissões (ou o time de sistemas) pode mudar o acesso base de alguém.' });
    }
    // varredura 2026-09 · B02: lê o valor ANTERIOR antes de gravar — o update
    // devolve o novo, e sem o de-para a trilha não diz o que mudou.
    const { data: antes } = await supabase.from('profiles')
      .select('role').eq('id', req.params.id).maybeSingle();
    // O :id é o UUID do profile (vem de GET /colaboradores)
    const { data, error } = await supabase.from('profiles')
      .update({ role }).eq('id', req.params.id).select('id').maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Perfil não encontrado.' });

    await auditarAcesso(req, { rowId: req.params.id, changes: { tipo: 'profile_role', role: { old: antes?.role ?? null, new: role } } });
    bustPermissionCaches();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/permissoes/usuario/:id/ativo — liga/desliga o acesso de alguém
// varredura 2026-09: AUTH-02 — hoje existem DOIS cadastros de banimento que não
// conversam: `profiles.active` (o único portão do requireAuth · auth.js) e
// `auth.users.banned_until` (o GoTrue, que é onde quem opera o Auth clica). Mexer só
// num deixa a outra porta aberta: banir no painel do Supabase não desativava o
// profile, e desativar o profile não derruba a sessão do GoTrue. Esta rota é o gesto
// ÚNICO — grava nos dois no mesmo request. O `banned_until` só passou a valer depois
// da checagem nova em `auth.js` (reason: 'banned_user').
// ⚠️ O SDK só aceita DURAÇÃO em `ban_duration` (o painel grava a data): 876000h ≈ 100
// anos ≅ o 2999-12-31 que 2 dos 3 bans manuais já usam. 'none' desbane.
// ⚠️ O motivo vai pra `app_audit_log` (não existe coluna de motivo em profiles e este
// PR não cria migration) — é o que permite auditar depois por que alguém foi banido.
router.put('/usuario/:id/ativo', async (req, res) => {
  try {
    const uid = req.params.id;
    const ativo = req.body?.ativo;
    const motivo = String(req.body?.motivo || '').trim().slice(0, 500) || null;
    if (typeof ativo !== 'boolean') return res.status(400).json({ error: 'Informe `ativo` (true ou false).' });
    // Anti-tiro-no-pé e separação de funções · mesma régua do /role.
    if (bloqueiaAutoEdicao(req, null)) {
      return res.status(403).json({ error: 'Você não pode ativar/desativar a própria conta. Peça a outro administrador.' });
    }
    if (!(await podeMexerNoControleDeAcesso(req))) {
      return res.status(403).json({ error: 'Só quem tem nível 5 em Permissões (ou o time de sistemas) pode ativar/desativar uma conta.' });
    }

    const { data: antes } = await supabase.from('profiles')
      .select('id, email, active').eq('id', uid).maybeSingle();
    if (!antes) return res.status(404).json({ error: 'Perfil não encontrado.' });

    // 1) profiles.active — o portão do requireAuth
    const { error: upErr } = await supabase.from('profiles').update({ active: ativo }).eq('id', uid);
    if (upErr) return res.status(400).json({ error: upErr.message });

    // 2) GoTrue — ban/desban. Sem isso o refresh token segue vivo e o acesso direto
    //    ao PostgREST continua até o access token expirar.
    let authSincronizado = true;
    let authDetalhe = null;
    const { error: banErr } = await supabase.auth.admin.updateUserById(uid, { ban_duration: ativo ? 'none' : '876000h' });
    if (banErr) {
      authSincronizado = false;
      authDetalhe = banErr.message;
      console.error('[permissoes] ban/desban no Auth falhou:', banErr.message);
    }

    await auditarAcesso(req, { rowId: uid, changes: { tipo: 'profile_ativo', email: antes.email || null, active: { old: antes.active ?? null, new: ativo }, ban_sincronizado: authSincronizado, motivo } });
    bustPermissionCaches(); // zera o cache de auth por token (60s) · o corte vale na hora
    res.json({ success: true, ativo, auth_sincronizado: authSincronizado, detail: authDetalhe });
  } catch (e) {
    console.error('[permissoes] ativar/desativar:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao ativar/desativar a conta' });
  }
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

    // varredura 2026-09 · B02: área dá BOOST pra nível 5 no módulo da área
    // (AREA_MODULO_BOOST) — é concessão de acesso e precisa de trilha.
    await auditarAcesso(req, { rowId: userId, changes: { tipo: 'usuario_areas', area_ids: area_ids || [], alvo_param: req.params.id } });
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
    // varredura 2026-09 · B01: override no PROPRIO modulo de permissoes e conceder a
    // chave do cofre por procuracao — sem isto, quem passa no gate do router (4)
    // daria nivel 5 em `permissoes-admin` a um terceiro e voltaria por ele.
    try {
      const { data: mod } = await supabase.from('modulos').select('slug').eq('id', modulo_id).maybeSingle();
      if (mod?.slug === 'permissoes-admin' && !(await podeMexerNoControleDeAcesso(req))) {
        return res.status(403).json({ error: 'Conceder acesso ao módulo Permissões exige nível 5 (ou o time de sistemas).' });
      }
    } catch (e) { console.error('[permissoes] checagem de override em permissoes-admin falhou:', e.message); }
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
      // criado_por é INTEGER (id legado de usuarios) — usar o usuarioId granular
      // do ator, NUNCA req.user.userId (que é o UUID do profile → "invalid input
      // syntax for type integer"). Fallback null quando não houver id numérico.
      const criadoPor = /^\d+$/.test(String(req.user?.granular?.usuarioId ?? ''))
        ? Number(req.user.granular.usuarioId) : null;
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
        criado_por: criadoPor,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'usuario_id,modulo_id' });
      if (error) return res.status(400).json({ error: error.message });
    }

    // varredura 2026-09 · B02: override é a exceção SOBERANA (vence cargo e área,
    // inclusive o deny com nivel_leitura=0) — o de-para tem que ficar registrado.
    await auditarAcesso(req, {
      rowId: `${userId}:${modulo_id}`,
      changes: { tipo: equalsDefault ? 'override_removido_por_igualar_default' : 'override_definido', modulo_id, nivel_leitura, nivel_escrita, alvo_param: req.params.id },
    });
    bustPermissionCaches();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/permissoes/usuario/:id/modulo/:moduloId — remove um override
router.delete('/usuario/:id/modulo/:moduloId', async (req, res) => {
  try {
    const resolved = await resolverUsuarioId(req.params.id);
    if (!resolved) return res.status(404).json({ error: 'Usuário não encontrado' });
    // varredura 2026-09 · B02: era a 3ª porta lateral — sem esta guarda o ator
    // apagava o PRÓPRIO deny (override com nivel_leitura=0, que um admin impôs) e
    // voltava a ver o módulo. O PUT irmão já bloqueava; o DELETE não.
    if (bloqueiaAutoEdicao(req, resolved)) {
      return res.status(403).json({ error: 'Você não pode alterar as próprias permissões. Peça a outro administrador.' });
    }
    // varredura 2026-09 · B02: lê o override ANTES de apagar — depois do delete não
    // há como saber o que foi removido.
    const { data: antes } = await supabase.from('permissoes_modulo')
      .select('nivel_leitura, nivel_escrita, motivo')
      .eq('usuario_id', resolved.id).eq('modulo_id', req.params.moduloId).maybeSingle();
    const { error } = await supabase.from('permissoes_modulo')
      .delete()
      .eq('usuario_id', resolved.id)
      .eq('modulo_id', req.params.moduloId);
    if (error) return res.status(400).json({ error: error.message });
    await auditarAcesso(req, {
      rowId: `${resolved.id}:${req.params.moduloId}`,
      action: 'DELETE',
      changes: { tipo: 'override_removido', modulo_id: req.params.moduloId, removido: antes ?? null, alvo_param: req.params.id },
    });
    bustPermissionCaches();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
