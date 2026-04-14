const { supabase } = require('../utils/supabase');

// Mapeamento de roles antigas para novas
const ROLE_MAP = {
  'diretor': 'pmo', 'admin': 'lider_adm', 'assistente': 'membro_marketing',
  'pmo': 'pmo', 'lider_adm': 'lider_adm', 'lider_marketing': 'lider_marketing',
  'lider_area_adm': 'lider_area_adm', 'membro_marketing': 'membro_marketing',
};

const PERMISSIONS = {
  pmo:              { canEditAll: true, canEditMarketing: true, canEditAdm: true, canViewAll: true, canManageBudget: true, label: 'PMO' },
  lider_adm:        { canEditAdm: true, canViewAll: true, label: 'Líder Administrativo' },
  lider_marketing:  { canEditMarketing: true, canViewMarketing: true, label: 'Líder de Marketing' },
  lider_area_adm:   { canViewAdm: true, canMarkChecklist: true, label: 'Líder de Área ADM' },
  membro_marketing: { canViewMarketing: true, canMarkChecklist: true, label: 'Membro de Marketing' },
};

// ── Mapeamento de rotas API → nome do módulo na tabela modulos ──
const ROUTE_MODULE_MAP = {
  'rh':          ['DP', 'Pessoas'],
  'financeiro':  ['Financeiro'],
  'logistica':   ['Logística'],
  'patrimonio':  ['Patrimônio'],
  'membresia':   ['Membresia'],
  'events':      ['Agenda'],
  'projects':    ['Projetos'],
  'agents':      ['IA / Agentes'],
  'tasks':       ['Tarefas'],
  'notificacoes':['Comunicação'],
  'expansion':   ['Projetos'],
};

// Cache de módulos (carrega uma vez e reutiliza)
let modulosCache = null;
let modulosCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

async function getModulos() {
  if (modulosCache && Date.now() - modulosCacheTime < CACHE_TTL) return modulosCache;
  const { data } = await supabase.from('modulos').select('id, nome').eq('ativo', true);
  modulosCache = data || [];
  modulosCacheTime = Date.now();
  return modulosCache;
}

// Verifica token Supabase JWT e injeta req.user (inclui permissões granulares)
async function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }

  // Busca perfil do usuário (role, name, area etc.)
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name, email, role, area, active')
    .eq('id', user.id)
    .single();

  if (!profile || !profile.active) {
    return res.status(403).json({ error: 'Usuário inativo ou sem perfil' });
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

  const mappedRole = ROLE_MAP[profile.role] || profile.role;

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
    if (!permUser) {
      try {
        // Buscar cargo compatível pelo nome do role
        const roleCargoMap = { admin: 'Admin', diretor: 'Líder', assistente: 'Assistente' };
        const cargoNome = roleCargoMap[profile.role] || 'Assistente';
        const { data: cargo } = await supabase.from('cargos')
          .select('id, nivel_padrao_leitura, nivel_padrao_escrita')
          .ilike('nome', `%${cargoNome}%`)
          .limit(1)
          .maybeSingle();

        const insertPayload = {
          email: profile.email,
          cargo_id: cargo?.id || null,
          ativo: true,
        };

        const { data: created } = await supabase.from('usuarios')
          .insert(insertPayload)
          .select('id, cargo_id, cargos(nivel_padrao_leitura, nivel_padrao_escrita)')
          .single();

        if (created) {
          permUser = created;
          console.log(`[AUTH] Auto-provisionado usuario granular: ${profile.email} (cargo: ${cargoNome})`);

          // Para admin/diretor: criar overrides com nível alto em todos os módulos
          if (['admin', 'diretor'].includes(profile.role)) {
            const nivel = profile.role === 'admin' ? 5 : 4;
            const modulos = await getModulos();
            const overrides = modulos.map(m => ({
              usuario_id: created.id,
              modulo_id: m.id,
              nivel_leitura: nivel,
              nivel_escrita: nivel,
            }));
            if (overrides.length > 0) {
              await supabase.from('permissoes_modulo').insert(overrides);
            }
          }
        }
      } catch (autoErr) {
        console.error('[AUTH] Auto-provisionar usuario falhou:', autoErr.message);
      }
    }

    if (permUser) {
      // Buscar overrides por módulo
      const { data: overrides } = await supabase.from('permissoes_modulo')
        .select('modulo_id, nivel_leitura, nivel_escrita')
        .eq('usuario_id', permUser.id);

      const modulos = await getModulos();
      const modulePerms = {};

      for (const mod of modulos) {
        const override = (overrides || []).find(o => o.modulo_id === mod.id);
        // Sem override explícito → nível 1 (acesso apenas aos próprios dados).
        // O nível padrão do cargo NÃO é propagado para todos os módulos, evitando
        // que colaboradores vejam módulos de áreas que não são as suas.
        modulePerms[mod.nome] = {
          leitura: override ? override.nivel_leitura : 1,
          escrita: override ? override.nivel_escrita : 1,
        };
      }

      // Carregar áreas do usuário (para filtragem por setor/área)
      const { data: userAreas } = await supabase.from('usuario_areas')
        .select('area_id, is_principal, areas(nome, setor_id, setores(nome))')
        .eq('usuario_id', permUser.id);

      const areas = (userAreas || []).map(ua => ua.areas?.nome).filter(Boolean);
      const setores = [...new Set((userAreas || []).map(ua => ua.areas?.setores?.nome).filter(Boolean))];

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
    mappedRole,
    permissions: PERMISSIONS[mappedRole] || {},
    name: profile.name,
    area: profile.area,
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

// Autoriza por mappedRole (compatível com roles novas e antigas)
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

/**
 * Middleware de autorização granular por módulo.
 *
 * Verifica se o usuário tem nível suficiente para acessar o módulo.
 * tipo: 'leitura' (GET) ou 'escrita' (POST/PUT/DELETE)
 * nivelMinimo: nível mínimo necessário (default 2 = pelo menos pessoal)
 *
 * Lógica:
 * 1. Se o usuário tem role 'admin' ou 'diretor' → permitido (backward compat)
 * 2. Se o usuário está no sistema granular → verificar nível do módulo
 * 3. Se NÃO está no sistema granular → fallback para authorize simples (bloqueia assistente)
 */
function authorizeModule(routeKey, nivelMinimo = 2) {
  const moduleNames = ROUTE_MODULE_MAP[routeKey] || [];

  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });

    // Admin/Diretor sempre passam (backward compatibility)
    if (['admin', 'diretor'].includes(req.user.role)) return next();

    // Se não tem granular, bloquear (assistente sem granular = sem acesso)
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

  res.json({
    role: req.user.role,
    area: req.user.area,
    name: req.user.name,
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

module.exports = { authenticate, authorize, authorizeCycle, authorizeModule, getMyPermissions, getEffectiveLevel, getUserAreas, applyAccessFilter, ROLE_MAP, PERMISSIONS, ROUTE_MODULE_MAP };
