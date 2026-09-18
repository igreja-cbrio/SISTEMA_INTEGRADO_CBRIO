import { useAuth } from '@/contexts/AuthContext';

// varredura 2026-09: B08 — espelho EXATO da régua nova do servidor.
//
// O backend passou a exigir `authorizeModule('voluntariado', 3)` em cada rota de
// escrita de `backend/routes/voluntariado.js`. O `VoluntariadoGuard` (App.tsx)
// libera a ÁREA por `leitura >= 1` — de propósito, porque as telas de leitura
// (escalas, relatórios, frequência) são servidas com `membresia >= 1` e há gente
// que só consulta. O buraco era no meio: quem entra com voluntariado 1 ou 2
// enxergava TODOS os botões de escrita e cada um devolvia 403.
//
// ⚠️ Não usar `getAccessLevel(['voluntariado'])`: ele devolve o máximo da
// LEITURA (AuthContext.jsx:349, `perm.leitura`), e o servidor decide POST/PUT/
// PATCH/DELETE por `perm.escrita`. Régua diferente = tela mentindo de novo.
//
// ⚠️ Isto NÃO substitui guard de tela nem régua de rota — SOMA. As telas com
// régua própria continuam com a delas: `/frequencia` (membresia 2), inscrições
// e antecedentes (nivelTriagem), acessos (soAdmin), tipos de culto e papéis
// (voluntariado 5). Este hook cobre só o piso de escrita do módulo.
// `nivelMinimo` existe porque nem toda escrita do módulo é 3: `/service-types/*`
// e `/roles/*` pedem `voluntariado>=5` no servidor. Passe 5 nesses controles.
export function useVolPodeEscrever(nivelMinimo = 3): boolean {
  const { canAccessModule, modulePerms } = useAuth() as {
    canAccessModule: (nomes: string[], tipo?: string, nivelMinimo?: number) => boolean;
    modulePerms: Record<string, unknown> | null | undefined;
  };
  // ⚠️ Enquanto as permissões não chegaram, NÃO desabilita nada — mesma lei do
  // menu e do VoluntariadoGuard (`auth.modulePerms &&`): tela em carregamento
  // não pode parecer tela sem permissão. Quem tentar escrever antes disso leva
  // o 403 do servidor, que é a régua de verdade.
  if (!modulePerms) return true;
  // `canAccessModule` já devolve true pra admin/diretor e false quando o módulo
  // está bloqueado por deny explícito — mesma ordem do authorizeModule.
  return canAccessModule(['voluntariado', 'Voluntariado'], 'escrita', nivelMinimo);
}
