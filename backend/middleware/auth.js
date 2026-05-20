const { supabase } = require('../utils/supabase');

// LEGADO · ROLE_MAP é usado apenas internamente por `authorizeCycle` (cycles.js).
// Manter ate `authorizeCycle` migrar pra autorizacao por modulo (`authorizeModule`).
// PERMISSIONS{} e `req.user.permissions` foram removidos em 2026-05-19 (sem
// consumidores no codigo). Ver CLAUDE.md "Limpeza de codigo morto de permissoes".
const ROLE_MAP = {
  'diretor': 'pmo', 'admin': 'lider_adm', 'assistente': 'membro_marketing',
  'pmo': 'pmo', 'lider_adm': 'lider_adm', 'lider_marketing': 'lider_marketing',
  'lider_area_adm': 'lider_area_adm', 'membro_marketing': 'membro_marketing',
};

// ── Mapeamento de rotas API → slugs dos modulos (matriz reuniao 2026-05-18) ──
// Source of truth: cargo_modulo_permissao (matriz padrao) + permissoes_modulo
// (overrides). Slugs definidos em supabase/migrations/20260518200000_*.sql
const ROUTE_MODULE_MAP = {
  // operacionais
  'rh':           ['rh'],
  'financeiro':   ['financeiro'],
  'logistica':    ['logistica'],
  'patrimonio':   ['patrimonio'],
  'eventos':      ['eventos'],
  'events':       ['eventos'],
  'projects':     ['projetos'],
  'expansion':    ['expansao'],
  'solicitacoes': ['solicitacoes'],
  // ministeriais
  'integracao':   ['integracao'],
  'cuidados':     ['cuidados'],
  'online':       ['online'],
  'next':         ['next'],
  'voluntariado': ['voluntariado'],
  'membresia':    ['membresia'],
  'grupos':       ['grupos'],
  'kids':         ['kids'],
  'ami':          ['ami'],
  'bridge':       ['bridge'],
  'painel-area':  ['kids', 'ami', 'bridge', 'online'],
  // estrategicos
  'gestao':       ['gestao'],
  'planejamento': ['planejamento'],
  'governanca':   ['governanca'],
  'painel':       ['painel-cbrio'],
  'revisoes':    ['revisao-estrategica'],
  // dados/IA/admin
  'dados-brutos': ['dados-brutos'],
  'dadosBrutos':  ['dados-brutos'],
  'nps':          ['nps'],
  'agents':       ['assistente-ia'],
  'notificacoes': ['notificacoes-config'],
  'permissoes':   ['permissoes-admin'],
  'cerebro':      ['cerebro'],
  'apresentacoes': ['apresentacoes'],
};

// Cache de módulos (carrega uma vez e reutiliza)
let modulosCache = null;
let modulosCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

async function getModulos() {
  if (modulosCache && Date.now() - modulosCacheTime < CACHE_TTL) return modulosCache;
  const { data } = await supabase
    .from('modulos')
    .select('id, nome, slug, categoria, rota, ordem')
    .eq('ativo', true);
  modulosCache = data || [];
  modulosCacheTime = Date.now();
  return modulosCache;
}

// Cache da matriz cargo×modulo (defaults por cargo)
let cargoMatrixCache = null;
let cargoMatrixCacheTime = 0;

async function getCargoMatrix() {
  if (cargoMatrixCache && Date.now() - cargoMatrixCacheTime < CACHE_TTL) return cargoMatrixCache;
  const { data } = await supabase
    .from('cargo_modulo_permissao')
    .select('cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio');
  cargoMatrixCache = data || [];
  cargoMatrixCacheTime = Date.now();
  return cargoMatrixCache;
}

// Mapa: nome de area (normalizado) → slug do modulo que recebe boost de nivel 5.
// Modelo: cargo `lider-ministerial` tem nivel 1 (so leitura) na matriz pra todos
// os modulos ministeriais; quando a pessoa tem a area correspondente, escala
// automaticamente pra nivel 5 (max) naquele modulo. Permite "1 cargo + N areas"
// em vez de criar cargo separado pra cada lider.
const AREA_MODULO_BOOST = {
  'cuidados':     'cuidados',
  'grupos':       'grupos',
  'integracao':   'integracao',
  'voluntariado': 'voluntariado',
  'next':         'next',
  'online':       'online',
  // Areas de culto (drill-down de KPIs) · modulos kids/ami/bridge
  'kids':         'kids',
  'ami':          'ami',
  'bridge':       'bridge',
};

function _normalizarArea(nome) {
  if (!nome) return '';
  return nome.toString().toLowerCase().trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // remove acentos · "Integração" → "integracao"
}

// Resolve a permissao efetiva de um usuario por modulo:
//   override (permissoes_modulo) ?? default cargo (cargo_modulo_permissao) ?? zero
// + Boost por area: se a area da pessoa esta em AREA_MODULO_BOOST, escala
//   leitura+escrita pra 5 no modulo correspondente (e o boost so eleva,
//   nunca rebaixa um override mais alto).
function resolveEffectivePerms({ overrides, cargoMatrix, cargoId, modulos, areas = [] }) {
  const result = {};
  const overridesByMod = new Map();
  for (const o of overrides || []) overridesByMod.set(o.modulo_id, o);
  const defaultsByMod = new Map();
  for (const r of cargoMatrix || []) {
    if (r.cargo_id === cargoId) defaultsByMod.set(r.modulo_id, r);
  }

  // Quais modulos recebem boost via area da pessoa
  const slugsComBoost = new Set();
  for (const a of areas || []) {
    const slug = AREA_MODULO_BOOST[_normalizarArea(a)];
    if (slug) slugsComBoost.add(slug);
  }

  for (const m of modulos) {
    const o = overridesByMod.get(m.id);
    const d = defaultsByMod.get(m.id);
    let nivelL = o?.nivel_leitura ?? d?.nivel ?? 0;
    let nivelE = o?.nivel_escrita ?? d?.nivel ?? 0;
    const exp    = o?.pode_exportar ?? d?.pode_exportar ?? false;
    const apr    = o?.pode_aprovar  ?? d?.pode_aprovar  ?? false;
    const esc    = o?.escopo_proprio ?? d?.escopo_proprio ?? false;

    // Boost por area · so eleva, nunca rebaixa override existente
    if (m.slug && slugsComBoost.has(m.slug)) {
      nivelL = Math.max(nivelL, 5);
      nivelE = Math.max(nivelE, 5);
    }

    // Indexa por nome E por slug (legado: alguns lookups usam 'Financeiro', etc)
    const entry = {
      leitura: nivelL,
      escrita: nivelE,
      pode_exportar: exp,
      pode_aprovar: apr,
      escopo_proprio: esc,
    };
    if (m.nome) result[m.nome] = entry;
    if (m.slug) result[m.slug] = entry;
  }
  return result;
}

// Verifica token Supabase JWT e injeta req.user (inclui permissões granulares)
async function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token não fornecido', reason: 'no_token' });

  if (!supabase) {
    console.error('[AUTH] Supabase client nao inicializado · verifique SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no Vercel');
    return res.status(500).json({ error: 'Backend nao configurado (Supabase env vars ausentes)', reason: 'no_supabase_client' });
  }

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    console.warn('[AUTH] Token rejeitado pelo Supabase:', error?.message || 'usuario null');
    return res.status(401).json({
      error: 'Token inválido ou expirado',
      reason: 'invalid_token',
      detail: error?.message || 'getUser retornou null · token pode ser de outro projeto Supabase',
    });
  }

  // Busca perfil do usuário (role, name, area etc.)
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, name, email, role, area, kpi_areas, kpi_valores, ministerio_id, ministerio_papel, is_diretoria_geral, funcao_diretoria, active, membro_id, is_membro_only')
    .eq('id', user.id)
    .single();

  if (profileError) {
    console.error('[AUTH] Erro ao buscar profile:', profileError.message);
    return res.status(500).json({ error: 'Erro ao carregar perfil', reason: 'profile_query_error', detail: profileError.message });
  }

  if (!profile) {
    return res.status(403).json({ error: 'Perfil nao encontrado pra este usuario', reason: 'no_profile', detail: `auth.uid=${user.id} email=${user.email}` });
  }

  if (!profile.active) {
    return res.status(403).json({ error: 'Usuario inativo', reason: 'inactive_profile' });
  }

  // Auto-sync: se profile não tem area, buscar no RH pelo email
  if (!profile.area && profile.email) {
    const { data: rh } = await supabase
      .from('rh_funcionarios')
      .select('area, cargo')
      .eq('email', profile.email)
      .eq('status', 'ativo')
      .limit(1)
      .maybeSingle();
    if (rh?.area) {
      await supabase.from('profiles').update({ area: rh.area }).eq('id', profile.id);
      profile.area = rh.area;
    }
  }

  // ── Carregar permissões granulares (se o usuário existe na tabela usuarios) ──
  let granular = null;
  if (profile.email) {
    let permUser = null;
    const { data: existing } = await supabase.from('usuarios')
      .select('id, cargo_id, cargos(nivel_padrao_leitura, nivel_padrao_escrita)')
      .eq('email', profile.email)
      .eq('ativo', true)
      .maybeSingle();

    permUser = existing;

    // Auto-provisionar: se o usuário não existe em usuarios, criar automaticamente
    // Default = cargo 'membro' (mais restritivo). Admin/diretor (legado) viram
    // 'diretor-administrativo' pra manter retrocompat sem expor dados sensiveis
    // por engano. O ajuste fino de cargo deve ser feito no /admin/permissoes.
    if (!permUser) {
      try {
        const roleSlugMap = {
          admin: 'diretor-administrativo',
          diretor: 'diretor-administrativo',
          assistente: 'membro',
          voluntario: 'voluntario',
          membro: 'membro',
        };
        const cargoSlug = roleSlugMap[profile.role] || 'membro';
        const { data: cargo } = await supabase.from('cargos')
          .select('id, nivel_padrao_leitura, nivel_padrao_escrita')
          .eq('slug', cargoSlug)
          .limit(1)
          .maybeSingle();

        const insertPayload = {
          email: profile.email,
          // `nome` eh NOT NULL em prod · fallback pra parte do email antes do @
          nome: (profile.name && profile.name.trim()) || profile.email.split('@')[0],
          cargo_id: cargo?.id || null,
          ativo: true,
        };

        const { data: created } = await supabase.from('usuarios')
          .insert(insertPayload)
          .select('id, cargo_id, cargos(nivel_padrao_leitura, nivel_padrao_escrita)')
          .single();

        if (created) {
          permUser = created;
          console.log(`[AUTH] Auto-provisionado usuario granular: ${profile.email} (cargo: ${cargoSlug})`);
        }
      } catch (autoErr) {
        console.error('[AUTH] Auto-provisionar usuario falhou:', autoErr.message);
      }
    }

    if (permUser) {
      // Buscar overrides por modulo (incluindo modificadores)
      const { data: overrides } = await supabase.from('permissoes_modulo')
        .select('modulo_id, nivel_leitura, nivel_escrita, pode_exportar, pode_aprovar, escopo_proprio, expira_em')
        .eq('usuario_id', permUser.id);

      // Filtra overrides expirados
      const now = Date.now();
      const validOverrides = (overrides || []).filter(o => !o.expira_em || new Date(o.expira_em).getTime() > now);

      const modulos = await getModulos();
      const cargoMatrix = await getCargoMatrix();

      // Carregar areas ANTES de resolver perms · boost por area precisa delas
      const { data: userAreas } = await supabase.from('usuario_areas')
        .select('area_id, is_principal, areas(nome, setor_id, setores(nome))')
        .eq('usuario_id', permUser.id);

      const areas = (userAreas || []).map(ua => ua.areas?.nome).filter(Boolean);
      const setores = [...new Set((userAreas || []).map(ua => ua.areas?.setores?.nome).filter(Boolean))];

      const modulePerms = resolveEffectivePerms({
        overrides: validOverrides,
        cargoMatrix,
        cargoId: permUser.cargo_id,
        modulos,
        areas,
      });

      granular = {
        usuarioId: permUser.id,
        cargoId: permUser.cargo_id,
        cargoNivelLeitura: permUser.cargos?.nivel_padrao_leitura ?? 1,
        cargoNivelEscrita: permUser.cargos?.nivel_padrao_escrita ?? 1,
        modulePerms,
        areas,    // ['Marketing', 'Louvor', ...]
        setores,  // ['Criativo', 'Administrativo', ...]
      };
    }
  }

  req.user = {
    userId: user.id,
    email: user.email,
    role: profile.role,
    name: profile.name,
    area: profile.area,
    kpi_areas: profile.kpi_areas || [],
    kpi_valores: profile.kpi_valores || [],
    ministerio_id: profile.ministerio_id || null,
    ministerio_papel: profile.ministerio_papel || null,
    is_diretoria_geral: !!profile.is_diretoria_geral,
    funcao_diretoria: profile.funcao_diretoria || null,
    membro_id: profile.membro_id || null,
    is_membro_only: !!profile.is_membro_only,
    id: user.id, // alias amigavel · req.user.id
    granular, // null se usuário não está no sistema granular
  };

  next();
}

// Verifica permissão: primeiro granular (nivel do cargo), fallback pro profiles.role
// authorize('diretor') = exige nivel >= 4
// authorize('admin') = exige nivel >= 5
// authorize('diretor', 'admin') = exige nivel >= 4
const ROLE_NIVEL = { admin: 5, diretor: 4, assistente: 2 };
function authorize(...roles) {
  const nivelMinimo = Math.min(...roles.map(r => ROLE_NIVEL[r] || 4));
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });

    // 1. Checar granular (nivel do cargo na tabela usuarios)
    if (req.user.granular) {
      const nivel = Math.max(req.user.granular.cargoNivelLeitura || 1, req.user.granular.cargoNivelEscrita || 1);
      if (nivel >= nivelMinimo) return next();
    }

    // 2. Fallback: checar profiles.role (retrocompatibilidade)
    if (roles.includes(req.user.role)) return next();

    return res.status(403).json({ error: 'Acesso negado para este perfil' });
  };
}

// Autoriza edicao/preenchimento de KPI por area:
// - admin/diretor sempre podem (qualquer area/valor)
// - lider de area (kpi_areas inclui a area do KPI) pode
// - lider de valor (kpi_valores tem intersecao com valores do KPI) pode
// - resto e bloqueado
//
// Modo de uso:
//   authorizeKpiArea(req => req.body.area)
//   authorizeKpiArea(req => req.body.area, req => req.body.valores)
//   authorizeKpiArea(req => fetchAreaFromIndicadorId(req.params.id))
function authorizeKpiArea(areaExtractor, valoresExtractor = null) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
    if (['admin', 'diretor'].includes(req.user.role)) return next();
    try {
      const area = await areaExtractor(req);
      const myAreas = (req.user.kpi_areas || []).map(a => String(a).toLowerCase());
      if (area && myAreas.includes(String(area).toLowerCase())) return next();

      // Fallback · permissao por valor (se informado)
      if (valoresExtractor) {
        const valores = (await valoresExtractor(req)) || [];
        const myValores = (req.user.kpi_valores || []).map(v => String(v).toLowerCase());
        if (valores.some(v => myValores.includes(String(v).toLowerCase()))) return next();
      }

      return res.status(403).json({ error: `Sem permissao para editar KPIs da area "${area || '?'}"` });
    } catch (e) {
      console.error('[authorizeKpiArea]', e.message);
      res.status(500).json({ error: 'Erro ao verificar permissao' });
    }
  };
}

// LEGADO · usado em cycles.js (ciclos criativo). Mantem ROLE_MAP por enquanto
// porque a logica de papeis aqui ainda nao tem equivalente direto na matriz
// cargo×modulo. TODO: migrar pra authorizeModule('eventos', nivel) quando
// regras de ciclo forem revisadas.
function authorizeCycle(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
    const mr = ROLE_MAP[req.user.role] || req.user.role;
    if (roles.length > 0 && !roles.includes(mr)) {
      return res.status(403).json({ error: 'Acesso negado para este perfil' });
    }
    next();
  };
}

// Padroes de URL "self-service" no modulo de voluntariado — qualquer usuario
// autenticado pode acessar (o proprio handler ja filtra por auth_user_id).
// Isso garante que colaboradores/membros com role 'assistente' (sem granular)
// consigam fazer check-in, ver suas escalas, marcar disponibilidade etc.
//
// Cada item: { re: RegExp, methods?: string[] } — methods restringe verbos HTTP.
// Se methods nao for informado, qualquer verbo e aceito.
const VOLUNTARIADO_SELF_SERVICE_PATTERNS = [
  { re: /^\/me(\/|$)/ },                      // /me, /me/wallet/google, /me/face, ...
  { re: /^\/my-/ },                           // /my-schedules, /my-availability, ...
  { re: /^\/self-checkin(\/|$)/ },            // /self-checkin, /self-checkin-qr/:id
  { re: /^\/qr-lookup(\/|$)/ },               // /qr-lookup
  { re: /^\/quero-servir(\/|$)/ },            // /quero-servir (inscricao inicial)
  { re: /^\/check-ins$/, methods: ['POST'] }, // criar proprio check-in (GET e admin)
  { re: /^\/face\/match$/, methods: ['POST'] }, // reconhecimento facial no totem
  { re: /^\/services\/(upcoming|today)$/, methods: ['GET'] }, // lista de cultos disponiveis
];

function isVoluntariadoSelfService(req, moduleNames) {
  if (!moduleNames.some((m) => m === 'Membresia')) return false;
  const p = req.path || '';
  const method = req.method;
  return VOLUNTARIADO_SELF_SERVICE_PATTERNS.some(({ re, methods }) => {
    if (!re.test(p)) return false;
    if (methods && !methods.includes(method)) return false;
    return true;
  });
}

/**
 * Middleware de autorização granular por módulo.
 *
 * Verifica se o usuário tem nível suficiente para acessar o módulo.
 * tipo: 'leitura' (GET) ou 'escrita' (POST/PUT/DELETE)
 * nivelMinimo: nível mínimo necessário (default 2 = pelo menos pessoal)
 *
 * Lógica:
 * 1. Se o usuário tem role 'admin' ou 'diretor' → permitido (backward compat)
 * 2. Se a rota e self-service de voluntariado → qualquer autenticado passa
 * 3. Se o usuário está no sistema granular → verificar nível do módulo
 * 4. Se NÃO está no sistema granular → bloqueia (assistente sem granular = sem acesso)
 */
function authorizeModule(routeKey, nivelMinimo = 2) {
  const moduleNames = ROUTE_MODULE_MAP[routeKey] || [];

  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });

    // Admin/Diretor sempre passam (backward compatibility com profiles.role)
    if (['admin', 'diretor'].includes(req.user.role)) return next();

    // Voluntarios podem acessar rotas de voluntariado / membresia em leitura
    if (req.user.role === 'voluntario'
        && moduleNames.some(m => m === 'voluntariado' || m === 'membresia' || m === 'Membresia')
        && nivelMinimo <= 1) {
      return next();
    }

    // Self-service de voluntariado: qualquer autenticado pode acessar
    // os proprios dados (handler filtra por auth_user_id).
    if (isVoluntariadoSelfService(req, moduleNames)) {
      return next();
    }

    // Se nao tem granular, bloquear
    if (!req.user.granular) {
      return res.status(403).json({ error: 'Acesso negado — permissões não configuradas' });
    }

    // Determinar tipo com base no metodo HTTP
    const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    const tipo = isWrite ? 'escrita' : 'leitura';

    // Verificar se tem nivel suficiente em QUALQUER um dos modulos mapeados
    let hasAccess = false;
    for (const modName of moduleNames) {
      const perm = req.user.granular.modulePerms[modName];
      if (perm && perm[tipo] >= nivelMinimo) {
        hasAccess = true;
        break;
      }
    }

    // Se nao tem modulos mapeados, usar o nivel padrao do cargo
    if (moduleNames.length === 0) {
      const nivel = isWrite ? req.user.granular.cargoNivelEscrita : req.user.granular.cargoNivelLeitura;
      hasAccess = nivel >= nivelMinimo;
    }

    if (!hasAccess) {
      return res.status(403).json({
        error: `Acesso negado ao módulo. Nível insuficiente para ${tipo}.`,
        modulos: moduleNames,
      });
    }

    next();
  };
}

// ── Endpoint para o frontend buscar suas permissões ──
// Exposto via GET /api/auth/my-permissions
async function getMyPermissions(req, res) {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado' });

  // Inclui metadata dos modulos (slug, rota, categoria) para o frontend
  // saber montar o menu dinamicamente sem precisar de catalogo hardcoded.
  let modulosMeta = [];
  try {
    const modulos = await getModulos();
    modulosMeta = modulos.map(m => ({
      slug: m.slug, nome: m.nome, rota: m.rota, categoria: m.categoria, ordem: m.ordem,
    })).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  } catch (e) {
    console.warn('[AUTH] falha ao carregar metadata de modulos:', e.message);
  }

  res.json({
    role: req.user.role,
    area: req.user.area,
    name: req.user.name,
    modulos: modulosMeta,
    granular: req.user.granular ? {
      cargoId: req.user.granular.cargoId,
      cargoNivelLeitura: req.user.granular.cargoNivelLeitura,
      cargoNivelEscrita: req.user.granular.cargoNivelEscrita,
      modulePerms: req.user.granular.modulePerms,
      areas: req.user.granular.areas || [],
      setores: req.user.granular.setores || [],
    } : null,
  });
}

// Invalida caches de modulos e matriz (chamado pela UI de admin apos editar)
function bustPermissionCaches() {
  modulosCache = null;
  modulosCacheTime = 0;
  cargoMatrixCache = null;
  cargoMatrixCacheTime = 0;
}

/**
 * Retorna o nível efetivo de acesso (1-5) de um usuário para um routeKey.
 * Útil para filtrar dados no handler ao invés de bloquear o request inteiro.
 */
function getEffectiveLevel(req, routeKey) {
  if (!req.user) return 0;
  if (req.user.role === 'admin') return 5;
  if (req.user.role === 'diretor') return 4;
  if (!req.user.granular) return 1;

  const moduleNames = ROUTE_MODULE_MAP[routeKey] || [];
  let maxLevel = req.user.granular.cargoNivelLeitura || 1;
  for (const mod of moduleNames) {
    const perm = req.user.granular.modulePerms?.[mod];
    if (perm) maxLevel = Math.max(maxLevel, perm.leitura);
  }
  return maxLevel;
}

/**
 * Retorna as áreas do usuário (para filtragem de dados por área).
 * Combina áreas granulares + profile.area como fallback.
 */
function getUserAreas(req) {
  const areas = [];
  if (req.user?.granular?.areas?.length) {
    areas.push(...req.user.granular.areas);
  }
  if (req.user?.area && !areas.includes(req.user.area)) {
    areas.push(req.user.area);
  }
  return areas;
}

/**
 * Aplica filtro de nível de acesso em uma Supabase query.
 * - Nível 5/4: sem filtro (admin/diretor vê tudo)
 * - Nível 3: filtra por áreas do usuário
 * - Nível 2: filtra por dados próprios (userId)
 * - Nível 1: não deveria chegar aqui (bloqueado por authorizeModule)
 *
 * @param {object} query - Supabase query builder
 * @param {object} req - Express request (com req.user)
 * @param {string} routeKey - Chave do módulo ('rh', 'financeiro', etc.)
 * @param {object} opts - { areaColumn: 'area', ownerColumn: null, ownerEmail: false }
 * @returns {object} query com filtros aplicados
 */
function applyAccessFilter(query, req, routeKey, opts = {}) {
  const level = getEffectiveLevel(req, routeKey);
  const { areaColumn = 'area', ownerColumn = null, ownerEmail = false } = opts;

  if (level >= 4) return query; // admin/diretor vê tudo

  if (level === 3 && areaColumn) {
    const areas = getUserAreas(req);
    if (areas.length > 0) {
      query = query.in(areaColumn, areas);
    }
    return query;
  }

  if (level === 2 && ownerColumn) {
    const val = ownerEmail ? req.user.email : req.user.userId;
    query = query.eq(ownerColumn, val);
    return query;
  }

  // level 1 ou sem owner column: retorna nada
  query = query.eq('id', '00000000-0000-0000-0000-000000000000');
  return query;
}

module.exports = { authenticate, authorize, authorizeCycle, authorizeModule, authorizeKpiArea, getMyPermissions, getEffectiveLevel, getUserAreas, applyAccessFilter, bustPermissionCaches, ROLE_MAP, ROUTE_MODULE_MAP };
