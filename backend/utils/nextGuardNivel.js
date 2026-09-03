// ============================================================================
// Régua pura: qual NÍVEL o guard de módulo exige em cada método HTTP do
// `/api/next`. Mora em utils (e não solta dentro da rota) porque é uma porta
// que decide acesso — mesma lei do `lib/integracaoAbas.ts` no front.
//
// ⚠️⚠️ POR QUE ISTO EXISTE (03/09/2026). `backend/routes/next.js` estava
// montado em `/api/next` com ~40 endpoints e SÓ `router.use(authenticate)` —
// nenhum `authorizeModule`. Ou seja: qualquer usuário autenticado do ERP
// escrevia no Next. `POST /matriculas` chega a criar pessoa em `mem_membros`
// pelo matcher forte, sem checagem nenhuma. O único endpoint do arquivo que
// olhava permissão era `POST /matriculas/backfill-membros` (`podeBackfillNext`,
// que segue valendo e é mais estrito que este guard).
//
// Medido em produção ANTES de fechar (03/09/2026, 103 usuários ativos):
//   · 47 têm `next >= 1` OU `integracao >= 1` → continuam entrando
//   · 56 não têm nenhum dos dois → passavam a escrever e param de passar
//   · 2 têm SÓ `integracao` (Marcelo Soares e Jessica Salviano, ambos L5/E5)
//   · 1 tem SÓ `next` (Thiago Nogueira, sem cargo, nível 5 pelo boost da área)
// ⇒ Por isso o routeKey é `next-gestao` → ['next', 'integracao'], e NÃO
//   ['next'] sozinho: a aba Next vive DENTRO da Integração desde o #2856, e
//   quem tem só `integracao` tomaria 403 numa tela que sempre pôde abrir.
//
// ⚠️ `batismo` NÃO entra: quem só tem batismo cai no modo `soBatismo` do
// `integracaoAbas.ts`, que nem renderiza a aba Next — logo não chama /api/next.
//
// ⚠️ DELETE fica em 2, não em 3. Os quatro DELETEs do arquivo são reversíveis
// (`app_soft_delete` em turmas/matrículas) ou são desfazer (`/checkin`,
// `/convertidos/:id/resolver`) — subir pra 3 tiraria do operador de domingo o
// direito de corrigir o próprio erro, que é o oposto do objetivo.
// ============================================================================

const METODOS_ESCRITA = ['POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * @param {string} metodo Método HTTP da request.
 * @returns {1|2} Nível mínimo exigido em `next` OU `integracao`.
 */
function nivelGuardNext(metodo) {
  const m = String(metodo || '').toUpperCase();
  return METODOS_ESCRITA.includes(m) ? 2 : 1;
}

module.exports = { nivelGuardNext, METODOS_ESCRITA, ROUTE_KEY: 'next-gestao' };
