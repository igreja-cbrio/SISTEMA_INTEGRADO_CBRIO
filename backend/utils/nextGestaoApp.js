// ============================================================================
// Régua PURA: quem gerencia o Next pelo APP de membros.
//
// Mora em `utils/` (e não solta dentro de `routes/app.js`) porque é uma porta
// que decide acesso — mesma lei do `integracaoAbas.ts` no front e do
// `nextGuardNivel.js` no backend.
//
// ⚠️⚠️ POR QUE ISTO EXISTE (03/09/2026). O app já tinha a tela de gestão da
// turma (`app/(app)/next-turma.tsx`), e ela era **inalcançável em produção**:
// os 3 endpoints `/app/next/*` gateavam por POSSE (`next_turmas.responsavel_id
// = membro.id`) e **as turmas vivas têm `responsavel_id` NULO** (medido em
// 03/09: 9 abertas, 0 com dono). Ou seja `GET /app/next/papel` respondia
// `responsavel: false` pra TODO MUNDO, a seção "Turmas que você conduz" nunca
// renderizava, e a rotina que abre as turmas do mês
// (`services/nextTurmasAuto.js`) não preenche o campo.
//
// ⇒ Decisão do Marcos (03/09): o portão passa a ser a **MATRIZ DE PERMISSÃO**
// (módulo `next`), **EM UNIÃO** com a posse que já existia — não em
// substituição. Espelha o `autorizarGestaoBatismoApp`, que é o precedente da
// casa (o batismo no app é gateado por `permissaoModuloApp(req,'batismo')`).
//
// ⚠️ A posse continua valendo de propósito: o responsável de uma turma entra e
// AGE mesmo sem nível na matriz. Trocar união por substituição tiraria o
// acesso de quem hoje o tem por posse — e no dia em que alguém preencher
// `responsavel_id` (o que a tela do web permite) aquela pessoa esperaria entrar.
//
// ⚠️⚠️ LEITURA e ESCRITA são separadas, e isso NÃO é invenção: é o que o
// `authorizeModule` do web já faz (GET usa `leitura`, POST/PUT/PATCH/DELETE
// usam `escrita`) e o que o `nextGuardNivel.js` aplica no `/api/next`. Medido
// em 03/09: **12 pessoas passam por `max(leitura,escrita) >= 2` e 11 por
// `escrita >= 2`** — a única diferença é a conta **"Revisor App Store (Staff)"**
// (leitura 3 · escrita 0), que a Apple usa pra revisar o app. Sem a separação,
// ela marcaria presença e cadastraria walk-in na base VIVA do Next tendo
// escrita 0 na matriz. Com a separação ela VÊ a área (o revisor precisa ver que
// o app funciona) e não escreve nada.
//
// ⚠️ `AREA_MODULO_BOOST['next'] = 'next'` (backend/middleware/auth.js) escala
// leitura E escrita pra 5 quem tem a área "Next" em `usuario_areas` — então o
// líder do Next entra sem cadastro novo. Medido: Thiago Nogueira (sem cargo)
// tem `next` 5/5 só pelo boost da área.
// ============================================================================

/** Nível mínimo na matriz (módulo `next`) pra gerenciar pelo app. */
const NIVEL_MINIMO_NEXT_APP = 2;

function nivelNumero(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * ALCANÇA a área de gestão do Next no app? (ver a turma, a chamada, a fila)
 *
 * @param {{leitura?: number, escrita?: number, turmasProprias?: number}} ctx
 * @returns {boolean}
 */
function podeGerenciarNext({ leitura, escrita, turmasProprias } = {}) {
  const nivel = Math.max(nivelNumero(leitura), nivelNumero(escrita));
  if (nivel >= NIVEL_MINIMO_NEXT_APP) return true;
  return nivelNumero(turmasProprias) > 0;
}

/**
 * AGE no Next pelo app? (marcar presença, walk-in, alocar, direcionar)
 *
 * ⚠️ Só `escrita` conta na matriz — leitura alta não escreve, como no web.
 * A POSSE continua valendo: o responsável da turma age sem nível.
 *
 * @param {{escrita?: number, turmasProprias?: number}} ctx
 * @returns {boolean}
 */
function podeEscreverNext({ escrita, turmasProprias } = {}) {
  if (nivelNumero(escrita) >= NIVEL_MINIMO_NEXT_APP) return true;
  return nivelNumero(turmasProprias) > 0;
}

/**
 * Pode agir NESTA turma?
 *
 * ⚠️⚠️ A guarda que mais importa: `responsavel_id` NULO **nunca** casa com
 * `membroId` nulo/ausente. Sem ela, um membro que o `resolveMembroApp` não
 * conseguiu resolver passaria a gerenciar **todas as turmas sem dono** — que é
 * literalmente o estado da base hoje. `null === null` é `true` em JS, e é esse
 * o acidente que a guarda impede.
 *
 * @param {{leitura?: number, escrita?: number, escrever?: boolean,
 *          turma?: {responsavel_id?: string|null}|null, membroId?: string|null}} ctx
 * @returns {boolean}
 */
function podeGerenciarTurmaApp({ leitura, escrita, escrever = false, turma, membroId } = {}) {
  if (!turma) return false;                       // fail-closed
  const nivel = escrever
    ? nivelNumero(escrita)
    : Math.max(nivelNumero(leitura), nivelNumero(escrita));
  if (nivel >= NIVEL_MINIMO_NEXT_APP) return true;
  const dono = turma.responsavel_id;
  if (!dono || !membroId) return false;           // ⚠️ nulo não casa com nulo
  return String(dono) === String(membroId);
}

module.exports = {
  podeGerenciarNext,
  podeEscreverNext,
  podeGerenciarTurmaApp,
  NIVEL_MINIMO_NEXT_APP,
};
