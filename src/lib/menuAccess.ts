// Visibilidade de item de navegação · fonte única usada pelo menu (AppShell)
// e pela busca rápida ⌘K (CommandSearch), pra manter os dois em sincronia: um
// módulo que o usuário NÃO consegue acessar nunca aparece em nenhum dos dois.
//
// Duas camadas:
//   (1) Gate de acesso (perm/module) — espelha o ModuleGuard das rotas (App.tsx).
//   (2) Camada de PERFIL (declutter por domínio) — esconde do menu seções que
//       não são da pessoa, pra cada um ver "onde trabalha". Regras (Marcos · 2026-06-17):
//        1. Planejamento (Projetos · Planejamento Estratégico · Gestão Anual ·
//           Gestão PMO · Monitoramento OKR) → só diretores + admin.
//           OKR também aparece pra diretoria geral (ex.: Pr. Juninho).
//        2. Criativo (Marketing · Produção · Destaques · Fotos de Batismo) → só o
//           time Criativo + admin (NEM diretores de outras áreas).
//        3. Administração-Gestão (RH · Financeiro · Logística · Patrimônio ·
//           Permissões · Feedback · Analytics) → ninguém do Ministerial nem do
//           Criativo. (Solicitações fica de fora da regra · todo mundo vê.)
//        4. Ministerial → cada pessoa vê só o(s) módulo(s) da SUA área.
//
// A camada (2) é MENU-ONLY: declutter de menu/busca. NÃO bloqueia rota nem API —
// um diretor continua alcançando por URL o que tirarmos do menu dele (decisão do
// Marcos: "só sumir do menu"). admin/dev/coordenador-estrategia veem tudo.
//
// Convenções de gate no item (mesmas chaves do NAV_ITEMS / PAGES da busca):
//   - sem `perm` e sem `module`                  → público (qualquer logado)
//   - perm: 'canX' | 'isAdmin' | 'isColaborador' → exige o hook correspondente !== false
//   - module: 'slug' (+ moduleMin, default 1)    → exige modulePerms[slug].leitura >= moduleMin
//   - a camada de perfil usa o `path` do item (ver DOMINIO_POR_PATH abaixo)
//
// IMPORTANTE: deny explícito (perm false / módulo em modulosBloqueados) vence até
// o bypass de admin · idêntico ao ModuleGuard.

export interface NavGate {
  perm?: string;
  module?: string;
  moduleMin?: number;
  path?: string;
}

type AuthLike = Record<string, unknown>;

// ── Camada de perfil ────────────────────────────────────────────────────────

// Nome da área (usuario_areas) → slug do módulo · espelha AREA_MODULO_BOOST do
// backend (middleware/auth.js). Quem tem a área "X" vê o módulo "X".
function normalizar(s: string): string {
  // Remove acentos sem regex de char-class com diacríticos literais (frágil no
  // fonte): filtra os combining marks U+0300–U+036F por codepoint.
  return (s || '')
    .normalize('NFD')
    .split('')
    .filter((c) => { const n = c.charCodeAt(0); return n < 0x0300 || n > 0x036f; })
    .join('')
    .toLowerCase()
    .trim();
}
const AREA_PARA_SLUG: Record<string, string> = {
  integracao: 'integracao', grupos: 'grupos', cuidados: 'cuidados',
  voluntariado: 'voluntariado', next: 'next', online: 'online',
  kids: 'kids', ami: 'ami', bridge: 'bridge',
  marketing: 'marketing', producao: 'producao',
};
// Módulos "de área" ministeriais/cultos (entram na regra 4 · scoping por área).
const SLUGS_AREA_MINISTERIAL = new Set(['integracao', 'grupos', 'cuidados', 'voluntariado', 'next', 'online', 'kids', 'ami', 'bridge']);

// path do item → domínio da camada de perfil. Itens fora deste mapa são "comuns"
// (Solicitações, Minha Área, Painel, Dashboard Semanal, NPS, Assistente IA, etc.)
// e seguem governados só pelo gate perm/module.
type Dominio = 'planejamento' | 'estrategico' | 'criativo' | 'admin' | 'area' | 'membresia';
const DOMINIO_POR_PATH: Record<string, { dom: Dominio; slug?: string }> = {
  // 1 · Planejamento (diretores + admin)
  '/projetos': { dom: 'planejamento' },
  '/expansao': { dom: 'planejamento' },
  '/planejamento': { dom: 'planejamento' },
  '/gestao': { dom: 'planejamento' },
  '/monitoramento-okr': { dom: 'estrategico' }, // + diretoria geral (Juninho)
  '/jornada': { dom: 'estrategico' }, // Jornada da Igreja · liderança (+ diretoria geral)
  // 2 · Criativo (time criativo + admin)
  '/marketing': { dom: 'criativo' },
  '/producao': { dom: 'criativo' },
  '/admin/destaques': { dom: 'criativo' },
  '/admin/fotos-batismo': { dom: 'criativo' },
  // 3 · Administração-Gestão (não-ministerial e não-criativo)
  '/admin/rh': { dom: 'admin' },
  '/admin/financeiro': { dom: 'admin' },
  '/admin/logistica': { dom: 'admin' },
  '/admin/patrimonio': { dom: 'admin' },
  '/admin/permissoes': { dom: 'admin' },
  '/admin/feedback': { dom: 'admin' },
  '/admin/app-analytics': { dom: 'admin' },
  // 4 · Ministerial / Cultos · scoping por área
  '/ministerial/integracao': { dom: 'area', slug: 'integracao' },
  '/grupos': { dom: 'area', slug: 'grupos' },
  '/ministerial/cuidados': { dom: 'area', slug: 'cuidados' },
  '/ministerial/voluntariado': { dom: 'area', slug: 'voluntariado' },
  '/ministerial/next': { dom: 'area', slug: 'next' },
  '/online': { dom: 'area', slug: 'online' },
  '/kids': { dom: 'area', slug: 'kids' },
  '/ami': { dom: 'area', slug: 'ami' },
  '/bridge': { dom: 'area', slug: 'bridge' },
  '/ministerial/totem-kids': { dom: 'area', slug: 'kids' },
  // Membresia · CRM compartilhado · só liderança/membresia (regra 4 · "só a área")
  '/ministerial/membresia': { dom: 'membresia' },
};

// Sempre visíveis pra qualquer colaborador (decisão do Marcos · 2026-06-17):
// visão macro aberta a todos. A aba Financeira do Dashboard Semanal segue
// restrita DENTRO da própria página (admin + diretores + time financeiro).
const PUBLICO_TODOS = new Set(['/painel', '/dashboard-semanal']);

const CRIATIVO_CARGOS = new Set(['coordenador-marketing', 'assistente-marketing', 'lider-producao', 'assistente-producao', 'diretor-criativo']);
const MINISTERIAL_CARGOS = new Set(['lider-ministerial', 'assistente-ministerial', 'assistente-area', 'coordenador-voluntarios', 'supervisor-jornada', 'diretor-ministerial']);

interface Perfil {
  isTudo: boolean;        // vê tudo (admin · dev · coordenador-estrategia)
  isAdminRole: boolean;   // espelha auth.isAdmin (admin OU diretor)
  verPlanejamento: boolean;
  verEstrategico: boolean;
  verCriativo: boolean;
  verAdmin: boolean;
  scopeArea: boolean;     // restringe módulos ministeriais à área da pessoa
  areasSlugs: Set<string>;
}

function perfilMenu(auth: AuthLike): Perfil {
  const profile = (auth?.profile as Record<string, unknown>) || {};
  const role = (auth?.role as string) ?? (profile?.role as string) ?? null;
  const cargo = (auth?.cargoSlug as string) || null;
  const isAdminRole = auth?.isAdmin === true || role === 'admin' || role === 'diretor';
  const diretoriaGeral = profile?.is_diretoria_geral === true;
  // "Vê tudo" = admin de verdade + dev + PMO (Marcos/Matheus). Diretores NÃO
  // entram aqui (caem nas regras por cargo) · assume diretor com role='diretor'.
  const isTudo = role === 'admin' || cargo === 'dev' || cargo === 'coordenador-estrategia';

  const areas = (auth?.userAreas as string[]) || [];
  const setores = (auth?.userSetores as string[]) || [];
  const mods = (auth?.modulePerms as Record<string, { leitura?: number }>) || {};

  const areasSlugs = new Set(
    areas.map((a) => AREA_PARA_SLUG[normalizar(a)]).filter(Boolean) as string[],
  );
  const setorTem = (s: string) => setores.some((x) => normalizar(x).includes(s));
  const temAreaMinisterial = [...areasSlugs].some((s) => SLUGS_AREA_MINISTERIAL.has(s));

  const isCriativoCargo = (!!cargo && CRIATIVO_CARGOS.has(cargo)) || setorTem('criativo');
  const isMinisterialCargo = (!!cargo && MINISTERIAL_CARGOS.has(cargo)) || setorTem('ministerial');
  const isCriativo = isTudo || isCriativoCargo
    || areasSlugs.has('marketing') || areasSlugs.has('producao')
    || (mods['marketing']?.leitura ?? 0) > 0 || (mods['producao']?.leitura ?? 0) > 0;

  return {
    isTudo,
    isAdminRole,
    verPlanejamento: isAdminRole,                       // regra 1
    verEstrategico: isAdminRole || diretoriaGeral,      // regra 1 (+ Juninho)
    verCriativo: !!isCriativo,                          // regra 2
    verAdmin: isTudo || (!isMinisterialCargo && !isCriativoCargo), // regra 3
    // regra 4 · só restringe quem tem área ministerial e não é admin/diretor.
    // (supervisor-jornada acompanha todas as áreas · não é restringido.)
    scopeArea: !isAdminRole && !isTudo && cargo !== 'supervisor-jornada' && temAreaMinisterial,
    areasSlugs,
  };
}

export function navItemAllowed(item: NavGate, auth: AuthLike): boolean {
  const isAdmin = auth?.isAdmin === true;
  const modulePerms = auth?.modulePerms as Record<string, { leitura?: number }> | null | undefined;
  const modulosBloqueados = (auth?.modulosBloqueados as string[] | undefined) || [];

  // Enquanto as permissões carregam (modulePerms ainda null e não é admin),
  // não esconde nada — evita "piscar" itens ao entrar.
  const permsLoaded = modulePerms != null || isAdmin;
  if (!permsLoaded) return true;

  // Deny explícito vence o bypass de admin (override nível 0 / perm negada).
  if (item.perm && auth[item.perm] === false) return false;
  if (item.module && modulosBloqueados.includes(item.module)) return false;

  // Visão macro aberta a todos (Painel CBRio · Dashboard Semanal). Fica DEPOIS
  // do deny explícito (um bloqueio nível-0 ainda vence) e ANTES do gate de
  // módulo — assim aparece mesmo pra quem não tem o módulo na matriz.
  if (item.path && PUBLICO_TODOS.has(item.path)) return true;

  // Camada de PERFIL (declutter por domínio) · MENU-ONLY · não bloqueia rota.
  const d = item.path ? DOMINIO_POR_PATH[item.path] : undefined;
  if (d) {
    const p = perfilMenu(auth);
    if (!p.isTudo) {
      if (d.dom === 'planejamento' && !p.verPlanejamento) return false;
      if (d.dom === 'estrategico' && !p.verEstrategico) return false;
      if (d.dom === 'criativo' && !p.verCriativo) return false;
      if (d.dom === 'admin' && !p.verAdmin) return false;
      if (d.dom === 'membresia' && !p.isAdminRole && (auth?.cargoSlug as string) !== 'supervisor-jornada') return false;
      if (d.dom === 'area' && p.scopeArea && (!d.slug || !p.areasSlugs.has(d.slug))) return false;
    }
  }

  if (isAdmin) return true;

  if (item.module && modulePerms) {
    const leitura = modulePerms[item.module]?.leitura ?? 0;
    if (leitura < (item.moduleMin ?? 1)) return false;
  }
  return true;
}
