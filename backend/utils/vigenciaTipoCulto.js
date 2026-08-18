/**
 * Um tipo de culto vale NESTE dia?
 *
 * `vol_service_types` tem `vigente_de` / `vigente_ate` desde que a igreja
 * começou a trocar a grade de domingo sem apagar o histórico: o culto das 10:00
 * existiu, tem escala e check-in atrás dele, e não pode sumir do passado só
 * porque saiu da grade.
 *
 * ⚠️⚠️ As duas colunas eram DECORATIVAS até 18/08/2026 — nenhuma consulta do
 * backend as lia. O sintoma tinha data marcada: em 24/08 a grade vira 09:30 /
 * 11:30 / 19:00, e o check-in da manhã continuaria oferecendo 08:30 e 10:00
 * (encerrados) ao lado do 09:30. O operador do totem veria quatro horários num
 * domingo que tem dois.
 *
 * ⚠️ `is_active` e vigência respondem perguntas DIFERENTES e as duas precisam
 * valer: `is_active=false` é "esse tipo não é pra usar" (desligado à mão);
 * vigência é "esse tipo vale nesta data". Um tipo futuro fica ativo e fora de
 * vigência até a data chegar — foi assim que o 09:30 foi cadastrado.
 *
 * Datas são strings `YYYY-MM-DD` em horário de Brasília (use `diaBRT`): o dia
 * em UTC vira à meia-noite de Londres, e um culto de domingo 19:00 já cairia
 * na segunda.
 */
function tipoVigenteNoDia(tipo, diaISO) {
  if (!tipo || tipo.is_active === false) return false;
  if (!diaISO) return true; // sem data de referência, não filtra por vigência
  if (tipo.vigente_de && diaISO < tipo.vigente_de) return false;
  if (tipo.vigente_ate && diaISO > tipo.vigente_ate) return false;
  return true;
}

/** Os tipos que valem no dia, preservando a ordem recebida. */
function filtrarVigentes(tipos, diaISO) {
  return (tipos || []).filter(t => tipoVigenteNoDia(t, diaISO));
}

module.exports = { tipoVigenteNoDia, filtrarVigentes };
