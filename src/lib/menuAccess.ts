// Visibilidade de item de navegação · fonte única usada pelo menu (AppShell)
// e pela busca rápida ⌘K (CommandSearch), pra manter os dois em sincronia: um
// módulo que o usuário NÃO consegue acessar nunca aparece em nenhum dos dois.
//
// A regra espelha o ModuleGuard das rotas (src/App.tsx): um item só aparece se
// a rota correspondente for de fato acessível. Convenções de gate no item (as
// mesmas chaves do NAV_ITEMS):
//   - sem `perm` e sem `module`         → público (qualquer usuário logado)
//   - perm: 'canX' | 'isAdmin' | 'isColaborador' → exige o hook correspondente !== false
//   - module: 'slug' (+ moduleMin, default 1)    → exige modulePerms[slug].leitura >= moduleMin
//   - quando a ROTA é guardada por um hook diferente do módulo (ex.:
//     /ministerial/integracao e /grupos usam canMembresia, mas o item declara
//     module:'integracao'/'grupos' pra esconder de quem não é da área), declare
//     AMBOS perm e module — a interseção garante "aparece ⇒ acessível".
//
// IMPORTANTE: deny explícito (perm false ou módulo em modulosBloqueados) vence
// até o bypass de admin · idêntico ao ModuleGuard.

export interface NavGate {
  perm?: string;
  module?: string;
  moduleMin?: number;
}

type AuthLike = Record<string, unknown>;

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

  if (isAdmin) return true;

  if (item.module && modulePerms) {
    const leitura = modulePerms[item.module]?.leitura ?? 0;
    if (leitura < (item.moduleMin ?? 1)) return false;
  }
  return true;
}
