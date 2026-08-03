// ============================================================================
// Recorte "acumulado do ano até hoje" (YTD) · usado pelo /dashboard-semanal/ytd
//
// Funções PURAS (recebem o "agora", não leem o relógio por conta própria) —
// senão o teste do gate de deploy dependeria da hora da execução, que é o que
// mordeu no faixaEtaria.test.ts.
// ============================================================================

const { isoWeekOf, isoWeekRange } = require('./isoWeek');

// Dia de hoje NO FUSO DA IGREJA.
// ⚠️ NÃO trocar por getUTCDate(): entre 21h e meia-noite em Brasília o dia UTC já
// virou, e o corte passaria a incluir os cultos de AMANHÃ — que existem, porque o
// ano nasce todo pré-agendado com valor 0 — além de rotular o período errado.
function hojeBrt(agora = new Date()) {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora);
  const [ano, mes, dia] = s.split('-').map(Number);
  return { ano, mes, dia };
}

function ehBissexto(ano) {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
}

// Mesmo dia/mês em outro ano, como YYYY-MM-DD.
// ⚠️ 29/02 em ano não bissexto vira 28/02: '2025-02-29' é data inexistente e o
// Postgres recusa a QUERY INTEIRA (não descarta só a linha), então sem esta
// guarda o comparativo quebraria por completo um dia a cada quatro anos.
function corteDoAno(ano, mes, dia) {
  const d = (mes === 2 && dia === 29 && !ehBissexto(ano)) ? 28 : dia;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Última semana ISO FECHADA (a semana corrente só termina no domingo). É o corte
// do voluntariado, cuja view agrega por semana e não tem coluna de data: incluir
// a semana corrente compararia 1 dia de agosto com 7 dias dos outros anos.
function ultimaSemanaIsoCompleta(hoje) {
  const hojeStr = corteDoAno(hoje.ano, hoje.mes, hoje.dia);
  const { semana, ano } = isoWeekOf(new Date(`${hojeStr}T12:00:00Z`));
  const { fim } = isoWeekRange(ano, semana);
  return fim.toISOString().slice(0, 10) <= hojeStr ? semana : semana - 1;
}

module.exports = { hojeBrt, ehBissexto, corteDoAno, ultimaSemanaIsoCompleta };
