// ============================================================================
// ESPELHO de backend/utils/inscricaoMenor.js — quem é menor de idade e o bloco
// do responsável (LGPD art. 14 §1º) · 2026-08-17
//
// ⚠️⚠️ Aqui vive SÓ a decisão de EXIBIÇÃO ("mostro o bloco do responsável?").
// Quem VALIDA é o servidor, sempre — o cliente pode ser um bundle antigo, e a
// exigência de autorização de responsável não pode depender do que a tela achou.
// `src/test/inscricaoMenor.test.ts` roda a mesma tabela de casos nos dois lados.
//
// ⚠️ A referência é HOJE (a data da inscrição), não a data do evento: é a COLETA
// que a LGPD governa, e "menor hoje" cobre "menor no evento" (quem tem 17 na
// viagem tem no máximo 17 hoje). Ver o comentário longo no arquivo do backend.
// ============================================================================

export const MAIORIDADE = 18;

export const PARENTESCOS = ['Mãe', 'Pai', 'Avó', 'Avô', 'Tia', 'Tio', 'Irmã', 'Irmão', 'Responsável legal', 'Outro'];

/**
 * Dia de hoje no fuso da igreja (BRT).
 *
 * ⚠️ Nunca `new Date().toISOString().slice(0,10)` cru: das 21h do Rio em diante o
 * dia UTC já virou, e quem completa 18 amanhã apareceria como maior hoje à noite.
 */
export function hojeBRT(agoraMs = Date.now()) {
  return new Date(agoraMs - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Idade em anos completos, comparando STRING `YYYY-MM-DD` (nunca `new Date`). */
export function idadeEmAnos(nascimentoISO, refISO) {
  const nasc = String(nascimentoISO || '').slice(0, 10);
  const ref = String(refISO || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nasc) || !/^\d{4}-\d{2}-\d{2}$/.test(ref)) return null;
  if (nasc > ref) return null;
  let anos = Number(ref.slice(0, 4)) - Number(nasc.slice(0, 4));
  if (ref.slice(5) < nasc.slice(5)) anos -= 1;
  return anos;
}

export function ehMenorDeIdade(nascimentoISO, refISO) {
  const idade = idadeEmAnos(nascimentoISO, refISO || hojeBRT());
  if (idade === null) return false;
  return idade < MAIORIDADE;
}

/** O bloco do responsável aparece? Evento marcado + pessoa menor. */
export function exigeResponsavel(evento, nascimentoISO, refISO) {
  if (!evento || !evento.exige_dados_menor) return false;
  return ehMenorDeIdade(nascimentoISO, refISO);
}
