const { supabase } = require('../utils/supabase');

// LEGADO · ROLE_MAP é usado apenas internamente por `authorizeCycle` (cycles.js).
// Manter até `authorizeCycle` migrar pra autorizacao por módulo (`authorizeModule`).
// PERMISSIONS{} e `req.user.permissions` foram removidos em 2026-05-19 (sem
// consumidores no código). Ver CLAUDE.md "Limpeza de código morto de permissões".
const ROLE_MAP = {
  'diretor': 'pmo', 'admin': 'lider_adm', 'assistente': 'membro_marketing',
  'pmo': 'pmo', 'lider_adm': 'lider_adm', 'lider_marketing': 'lider_marketing',
  'lider_area_adm': 'lider_area_adm', 'membro_marketing': 'membro_marketing',
};

// ── Mapeamento de rotas API → slugs dos módulos (matriz reunião 2026-05-18) ──
// Source of truth: cargo_modulo_permissao (matriz padrão) + permissoes_modulo
// (overrides). Slugs definidos em supabase/migrations/20260518200000_*.sql
const ROUTE_MODULE_MAP = {
  // operacionais
  'rh':           ['rh'],
  'financeiro':   ['financeiro'],
  'santander':    ['financeiro'],
  'logistica':    ['logistica'],
  'patrimonio':   ['patrimonio'],
  'eventos':      ['eventos'],
  'events':       ['eventos'],
  'eventos-externos': ['eventos-externos'],
  'projects':     ['projetos'],
  'expansion':    ['expansao'],
  'solicitacoes': ['solicitacoes'],
  // ministeriais
  'integracao':   ['integracao'],
  'relatorios':   ['relatorios'],
  'cuidados':     ['cuidados'],
  'online':       ['online'],
  'wifi':         ['wifi'],
  'next':         ['next'],
  'next-batismo': ['next-batismo'],
  'voluntariado': ['voluntariado'],
  'membresia':    ['membresia'],
  // Leitura de dados de PESSOA (nome/CPF/telefone) é legítima em vários módulos
  // ministeriais que trabalham com gente. Quem tem QUALQUER um destes em leitura
  // passa; quem não tem (ex.: conta só de logística/financeiro/produção/marketing,
  // ou membro/voluntário sem módulo ministerial) é bloqueado. Fecha o vazamento de
  // PII em rotas que antes eram só `authenticate`.
  'membros':      ['membresia','grupos','cuidados','integracao','next','next-batismo','voluntariado','kids','ami','bridge','online','face'],
  // Dado financeiro do membro (contribuições) · membresia OU financeiro, nível 2.
  'membros-financeiro': ['membresia','financeiro'],
  // Como 'membros', + a conta de quiosque do lounge (módulo totem-membro ·
  // matriz zerada + override por conta · login trava em /totem). Usado só nos
  // endpoints do fluxo do totem (ex.: cpf-lookup).
  'membros-totem': ['membresia','grupos','cuidados','integracao','next','next-batismo','voluntariado','kids','ami','bridge','online','face','totem-membro'],
  'totem-membro': ['totem-membro'],
  'face':         ['face'],
  'grupos':       ['grupos'],
  'kids':         ['kids'],
  'totem-kids':   ['kids'],
  'ami':          ['ami'],
  'bridge':       ['bridge'],
  'producao':     ['producao'],
  'marketing':    ['marketing'],
  'marketing-admin': ['marketing'],
  'painel-area':  ['kids', 'ami', 'bridge', 'online', 'producao'],
  'whatsapp-admin': ['integracao', 'grupos'],
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

// Cache de módulos · TTL CURTISSIMO (30s) pra balancear performance e
// frescor. Caches longos (era 5min) causam usuário novo perder acesso até
// o cache expirar em instancias Vercel que não receberam o bust.
const CACHE_TTL = 30 * 1000; // 30 segundos

let modulosCache = null;
let modulosCacheTime = 0;

// Cache da AUTENTICAÇÃO resolvida (token -> req.user) · evita 3-4 round-trips
// (getUser + profiles + usuarios + matriz) a CADA request — era o maior custo
// por chamada e a causa da lentidão ao trocar de aba. TTL curto (60s). Limpo no
// bustPermissionCaches (mudança de cargo/matriz reflete no máximo em 60s).
// Trade-off aceito: sessão revogada manualmente segue válida por até 60s.
const AUTH_CACHE_TTL = 60 * 1000;
const authUserCache = new Map(); // token -> { user, exp }

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

// Matriz cargo×módulo · SEM CACHE PERSISTENTE entre requests.
//
// IMPORTANTE · PostgREST do Supabase capa em 1000 linhas por response
// (`db-max-rows` no projeto). `.range(0, N)` não passa do cap. Solucao:
// filtrar por cargo direto no DB (`eq('cargo_id', cargoId)`) já que so
// precisamos das linhas do cargo do usuário. São ~30 linhas por cargo
// vs 1000+ na matriz inteira · query <20ms.
//
// Sem cargoId, retorna até o cap (uso legado / admin UI que precise
// agregar todos cargos · ai vai paginado via /api/permissoes/matriz).
async function getCargoMatrix(cargoId = null) {
  let query = supabase
    .from('cargo_modulo_permissao')
    .select('cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio');
  if (cargoId != null) query = query.eq('cargo_id', cargoId);
  const { data } = await query;
  return data || [];
}

// Mapa: nome de área (normalizado) → slug do módulo que recebe boost de nível 5.
// Modelo: cargo `lider-ministerial` tem nível 1 (so leitura) na matriz pra todos
// os módulos ministeriais; quando a pessoa tem a área correspondente, escala
// automaticamente pra nível 5 (max) naquele módulo. Permite "1 cargo + N áreas"
// em vez de criar cargo separado pra cada líder.
const AREA_MODULO_BOOST = {
  'cuidados':     'cuidados',
  'grupos':       'grupos',
  'integracao':   'integracao',
  'voluntariado': 'voluntariado',
  'next':         'next',
  'online':       'online',
  // Áreas de culto (drill-down de KPIs) · módulos kids/ami/bridge
  'kids':         'kids',
  'ami':          'ami',
  'bridge':       'bridge',
  // Marketing (Spec 003 · 2026-05-28) · Pedro Paiva + Allan/Caua/Leticia/Lorena
  // ganham nível 5 automático via área "Marketing" em usuario_areas.
  'marketing':    'marketing',
  // Produção de Culto (2026-06-02) · Pedro Fernandes (área "Produção") vira
  // admin nível 5 do módulo produção via boost.
  'producao':     'producao',
};

function _normalizarArea(nome) {
  if (!nome) return '';
  return nome.toString().toLowerCase().trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // remove acentos · "Integração" → "integração"
}

// Resolve a permissão efetiva de um usuário por módulo · REGRA ÚNICA (2026-06-25):
//   1. Se há override (permissoes_modulo) no módulo → o OVERRIDE VENCE (0–5; 0 = sem acesso).
//   2. Senão → acesso base = MAIOR entre o nível do cargo e o boost da área.
// O override é a exceção soberana: o cargo manda (base), o override é a exceção que vence
// até a área. (Antes a área fazia Math.max DEPOIS do override e o engolia — corrigido.)
function resolveEffectivePerms({ overrides, cargoMatrix, cargoId, modulos, areas = [] }) {
  const result = {};
  const overridesByMod = new Map();
  for (const o of overrides || []) overridesByMod.set(o.modulo_id, o);
  const defaultsByMod = new Map();
  for (const r of cargoMatrix || []) {
    if (r.cargo_id === cargoId) defaultsByMod.set(r.modulo_id, r);
  }

  // Quais módulos recebem boost via área da pessoa
  const slugsComBoost = new Set();
  for (const a of areas || []) {
    const slug = AREA_MODULO_BOOST[_normalizarArea(a)];
    if (slug) slugsComBoost.add(slug);
  }

  for (const m of modulos) {
    const o = overridesByMod.get(m.id);
    const d = defaultsByMod.get(m.id);
    let nivelL, nivelE, exp, apr, esc;

    if (o) {
      // Exceção SOBERANA · o override vence cargo E área (incl. 0 = sem acesso).
      nivelL = o.nivel_leitura ?? 0;
      nivelE = o.nivel_escrita ?? 0;
      exp = o.pode_exportar ?? false;
      apr = o.pode_aprovar ?? false;
      esc = o.escopo_proprio ?? false;
    } else {
      // Acesso base (sem exceção) = MAIOR entre o nível do cargo e o boost da área.
      nivelL = d?.nivel ?? 0;
      nivelE = d?.nivel ?? 0;
      exp = d?.pode_exportar ?? false;
      apr = d?.pode_aprovar ?? false;
      esc = d?.escopo_proprio ?? false;
      if (m.slug && slugsComBoost.has(m.slug)) {
        nivelL = Math.max(nivelL, 5);
        nivelE = Math.max(nivelE, 5);
      }
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
    console.error('[AUTH] Supabase client não inicializado · verifique SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no Vercel');
    return res.status(500).json({ error: 'Backend não configurado (Supabase env vars ausentes)', reason: 'no_supabase_client' });
  }

  // Cache hit · pula getUser + profile + usuarios + matriz (todos os round-trips)
  const cachedAuth = authUserCache.get(token);
  if (cachedAuth && cachedAuth.exp > Date.now()) {
    req.user = cachedAuth.user;
    return next();
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

  // Busca perfil do usuário (role, name, área etc.)
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
    return res.status(403).json({ error: 'Perfil não encontrado pra este usuário', reason: 'no_profile', detail: `auth.uid=${user.id} email=${user.email}` });
  }

  if (!profile.active) {
    return res.status(403).json({ error: 'Usuario inativo', reason: 'inactive_profile' });
  }

  // Auto-sync: se profile não tem área, buscar no RH pelo email
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

  // ── Carregar permissões granulares (se o usuário existe na tabela usuários) ──
  let granular = null;
  if (profile.email) {
    let permUser = null;
    const { data: existing } = await supabase.from('usuarios')
      .select('id, cargo_id, cargos(slug, nome, nome_completo, nivel_padrao_leitura, nivel_padrao_escrita)')
      .eq('email', profile.email)
      .eq('ativo', true)
      .maybeSingle();

    permUser = existing;

    // Auto-provisionar: se o usuário não existe em usuários, criar automaticamente
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
          .select('id, cargo_id, cargos(slug, nome, nome_completo, nivel_padrao_leitura, nivel_padrao_escrita)')
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
      // Buscar overrides por módulo (incluindo modificadores)
      const { data: overrides } = await supabase.from('permissoes_modulo')
        .select('modulo_id, nivel_leitura, nivel_escrita, pode_exportar, pode_aprovar, escopo_proprio, expira_em')
        .eq('usuario_id', permUser.id);

      // Filtra overrides expirados
      const now = Date.now();
      const validOverrides = (overrides || []).filter(o => !o.expira_em || new Date(o.expira_em).getTime() > now);

      const modulos = await getModulos();
      // Passa cargoId · DB filtra (so ~30 linhas vs 1000+ cap PostgREST)
      const cargoMatrix = await getCargoMatrix(permUser.cargo_id);

      // Carregar áreas ANTES de resolver perms · boost por área precisa delas
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

      // Módulos explicitamente BLOQUEADOS por override (nivel_leitura = 0).
      // É um "deny" intencional que vence até o bypass de admin/diretor —
      // permite esconder um módulo específico de alguém que vê o resto.
      const modulosById = new Map(modulos.map(m => [m.id, m]));
      const modulosBloqueados = validOverrides
        .filter(o => (o.nivel_leitura ?? 1) === 0)
        .map(o => modulosById.get(o.modulo_id)?.slug)
        .filter(Boolean);

      granular = {
        usuarioId: permUser.id,
        cargoId: permUser.cargo_id,
        cargoSlug: permUser.cargos?.slug ?? null,
        cargoNome: permUser.cargos?.nome_completo || permUser.cargos?.nome || null,
        cargoNivelLeitura: permUser.cargos?.nivel_padrao_leitura ?? 1,
        cargoNivelEscrita: permUser.cargos?.nivel_padrao_escrita ?? 1,
        modulePerms,
        modulosBloqueados, // ['rh', ...] · deny explícito (vence admin)
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

  // Cacheia a auth resolvida por 60s (guard de tamanho contra crescimento)
  if (authUserCache.size > 1000) authUserCache.clear();
  authUserCache.set(token, { user: req.user, exp: Date.now() + AUTH_CACHE_TTL });

  next();
}

// Verifica permissão: primeiro granular (nível do cargo), fallback pro profiles.role
// authorize('diretor') = exige nível >= 4
// authorize('admin') = exige nível >= 5
// authorize('diretor', 'admin') = exige nível >= 4
const ROLE_NIVEL = { admin: 5, diretor: 4, assistente: 2 };
function authorize(...roles) {
  const nivelMinimo = Math.min(...roles.map(r => ROLE_NIVEL[r] || 4));
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });

    // 1. Checar granular (nível do cargo na tabela usuários)
    if (req.user.granular) {
      const nivel = Math.max(req.user.granular.cargoNivelLeitura || 1, req.user.granular.cargoNivelEscrita || 1);
      if (nivel >= nivelMinimo) return next();
    }

    // 2. Fallback: checar profiles.role (retrocompatibilidade)
    if (roles.includes(req.user.role)) return next();

    return res.status(403).json({ error: 'Acesso negado para este perfil' });
  };
}

// Autoriza edicao/preenchimento de KPI por área:
// - admin/diretor sempre podem (qualquer area/valor)
// - líder de área (kpi_areas inclui a área do KPI) pode
// - líder de valor (kpi_valores tem intersecao com valores do KPI) pode
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

      // Fallback · permissão por valor (se informado)
      if (valoresExtractor) {
        const valores = (await valoresExtractor(req)) || [];
        const myValores = (req.user.kpi_valores || []).map(v => String(v).toLowerCase());
        if (valores.some(v => myValores.includes(String(v).toLowerCase()))) return next();
      }

      return res.status(403).json({ error: `Sem permissão para editar KPIs da área "${area || '?'}"` });
    } catch (e) {
      console.error('[authorizeKpiArea]', e.message);
      res.status(500).json({ error: 'Erro ao verificar permissão' });
    }
  };
}

// LEGADO · usado em cycles.js (ciclos criativo). Mantem ROLE_MAP por enquanto
// porque a lógica de papéis aqui ainda não tem equivalente direto na matriz
// cargo×módulo. TODO: migrar pra authorizeModule('eventos', nível) quando
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

// Padrões de URL "self-service" no módulo de voluntariado — qualquer usuário
// autenticado pode acessar (o próprio handler já filtra por auth_user_id).
// Isso garante que colaboradores/membros com role 'assistente' (sem granular)
// consigam fazer check-in, ver suas escalas, marcar disponibilidade etc.
//
// Cada item: { re: RegExp, methods?: string[] } — methods restringe verbos HTTP.
// Se methods não for informado, qualquer verbo e aceito.
const VOLUNTARIADO_SELF_SERVICE_PATTERNS = [
  { re: /^\/me(\/|$)/ },                      // /me, /me/wallet/google, /me/face, ...
  { re: /^\/my-/ },                           // /my-schedules, /my-availability, ...
  { re: /^\/self-checkin(\/|$)/ },            // /self-checkin, /self-checkin-qr/:id
  { re: /^\/qr-lookup(\/|$)/ },               // /qr-lookup
  { re: /^\/quero-servir(\/|$)/ },            // /quero-servir (inscrição inicial)
  { re: /^\/check-ins$/, methods: ['POST'] }, // criar próprio check-in (GET e admin)
  { re: /^\/face\/match$/, methods: ['POST'] }, // reconhecimento facial no totem
  { re: /^\/services\/(upcoming|today)$/, methods: ['GET'] }, // lista de cultos disponíveis
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

    // Bloqueio explícito de módulo (deny por usuário) · vence até admin/diretor.
    const bloqueados = req.user.granular?.modulosBloqueados || [];
    if (moduleNames.length && moduleNames.some(m => bloqueados.includes(m))) {
      return res.status(403).json({ error: 'Acesso bloqueado para este módulo.', modulos: moduleNames });
    }

    // Admin/Diretor sempre passam (backward compatibility com profiles.role)
    if (['admin', 'diretor'].includes(req.user.role)) return next();

    // Voluntários podem acessar rotas de voluntariado / membresia em leitura
    if (req.user.role === 'voluntario'
        && moduleNames.some(m => m === 'voluntariado' || m === 'membresia' || m === 'Membresia')
        && nivelMinimo <= 1) {
      return next();
    }

    // Self-service de voluntariado: qualquer autenticado pode acessar
    // os próprios dados (handler filtra por auth_user_id).
    if (isVoluntariadoSelfService(req, moduleNames)) {
      return next();
    }

    // Se não tem granular, bloquear
    if (!req.user.granular) {
      return res.status(403).json({ error: 'Acesso negado — permissões não configuradas' });
    }

    // Determinar tipo com base no método HTTP
    const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    const tipo = isWrite ? 'escrita' : 'leitura';

    // Verificar se tem nível suficiente em QUALQUER um dos módulos mapeados
    let hasAccess = false;
    for (const modName of moduleNames) {
      const perm = req.user.granular.modulePerms[modName];
      if (perm && perm[tipo] >= nivelMinimo) {
        hasAccess = true;
        break;
      }
    }

    // Se não tem módulos mapeados, usar o nível padrão do cargo
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

  // Inclui metadata dos módulos (slug, rota, categoria) para o frontend
  // saber montar o menu dinamicamente sem precisar de catalogo hardcoded.
  let modulosMeta = [];
  try {
    const modulos = await getModulos();
    modulosMeta = modulos.map(m => ({
      slug: m.slug, nome: m.nome, rota: m.rota, categoria: m.categoria, ordem: m.ordem,
    })).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  } catch (e) {
    console.warn('[AUTH] falha ao carregar metadata de módulos:', e.message);
  }

  res.json({
    role: req.user.role,
    area: req.user.area,
    name: req.user.name,
    modulos: modulosMeta,
    granular: req.user.granular ? {
      cargoId: req.user.granular.cargoId,
      cargoSlug: req.user.granular.cargoSlug || null,
      cargoNome: req.user.granular.cargoNome || null,
      cargoNivelLeitura: req.user.granular.cargoNivelLeitura,
      cargoNivelEscrita: req.user.granular.cargoNivelEscrita,
      modulePerms: req.user.granular.modulePerms,
      modulosBloqueados: req.user.granular.modulosBloqueados || [],
      areas: req.user.granular.areas || [],
      setores: req.user.granular.setores || [],
    } : null,
  });
}

// Invalida cache de módulos (chamado pela UI de admin após editar).
// cargoMatrix não tem mais cache · sempre fresco.
function bustPermissionCaches() {
  modulosCache = null;
  authUserCache.clear();
  modulosCacheTime = 0;
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
 * @param {object} opts - { areaColumn: 'área', ownerColumn: null, ownerEmail: false }
 * @returns {object} query com filtros aplicados
 */
function applyAccessFilter(query, req, routeKey, opts = {}) {
  const level = getEffectiveLevel(req, routeKey);
  const { areaColumn = 'area', ownerColumn = null, ownerEmail = false } = opts;

  if (level >= 4) return query; // admin/diretor vê tudo

  // Nível 3 = escopo por ÁREA. Com áreas atribuídas, filtra por elas.
  // SEM áreas, NÃO pode ver tudo (era fail-open · vazava todos os registros,
  // inclusive salário no payload) — cai pro escopo "próprio" via ownerColumn.
  if (level === 3 && areaColumn) {
    const areas = getUserAreas(req);
    if (areas.length > 0) return query.in(areaColumn, areas);
  }

  if ((level === 2 || level === 3) && ownerColumn) {
    const val = ownerEmail ? req.user.email : req.user.userId;
    return query.eq(ownerColumn, val);
  }

  // level 1, ou 3-sem-área-sem-owner: retorna nada
  return query.eq('id', '00000000-0000-0000-0000-000000000000');
}

module.exports = { authenticate, authorize, authorizeCycle, authorizeModule, authorizeKpiArea, getMyPermissions, getEffectiveLevel, getUserAreas, applyAccessFilter, bustPermissionCaches, ROLE_MAP, ROUTE_MODULE_MAP,
  // exports aditivos · reuso da resolução de permissão (ex.: cobertura de férias,
  // grade de acesso efetivo por módulo na tela de Permissões > Usuários)
  resolveEffectivePerms, getCargoMatrix, getModulos, AREA_MODULO_BOOST, _normalizarArea };
