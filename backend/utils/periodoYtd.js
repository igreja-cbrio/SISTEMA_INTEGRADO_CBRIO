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

const MES_NOMES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                         'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MES_NOMES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
                         'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// Último dia de cada mês. Fevereiro entra como 29 DE PROPÓSITO: quem resolve o
// ano bissexto é o corteDoAno(), que já clampa 29→28 e é testado pra isso —
// duplicar a regra aqui daria duas réguas pra decidir a mesma coisa.
const ULTIMO_DIA_DO_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Traduz os meses marcados no filtro em UM período, aplicado igual em todos os
// anos comparados.
//
// ⚠️ A regra que faz a comparação continuar justa: o período só é PARCIAL (corte
// no dia de hoje) quando o ano corrente está entre os comparados E os meses
// escolhidos alcançam o mês de hoje. Fora disso o período está fechado em todos
// os anos e vale até o último dia do último mês escolhido.
//   · jan…dez com 2026 na lista, hoje 03/08 → 1º de janeiro a 3 de agosto
//   · jan…jun (qualquer ano)                → 1º de janeiro a 30 de junho
//   · jan…dez comparando só 2024 × 2025     → 1º de janeiro a 31 de dezembro
// Sem isso, "ano inteiro" compararia 12 meses de 2025 com 7 de 2026.
//
// Mês marcado DEPOIS do corte é descartado (não existe dado pra ele em nenhum
// ano do recorte) — é o que mantém a curva acumulada terminando no corte.
function resolverPeriodo({ meses, anos = [], hoje }) {
  const informados = (Array.isArray(meses) ? meses : [])
    .map(Number).filter(m => Number.isInteger(m) && m >= 1 && m <= 12);
  const sel = [...new Set(informados.length ? informados : [1,2,3,4,5,6,7,8,9,10,11,12])]
    .sort((a, b) => a - b);

  const inicioMes = sel[0];
  const ultimoMes = sel[sel.length - 1];
  const parcial = anos.includes(hoje.ano) && ultimoMes >= hoje.mes;
  const fimMes = parcial ? hoje.mes : ultimoMes;
  const dia = parcial ? hoje.dia : ULTIMO_DIA_DO_MES[fimMes - 1];

  const mesesNoPeriodo = sel.filter(m => m <= fimMes);
  const contiguo = mesesNoPeriodo.length === (fimMes - inicioMes + 1);

  let rotulo = `1º de ${MES_NOMES_LONGO[inicioMes - 1]} a ${dia} de ${MES_NOMES_LONGO[fimMes - 1]}`;
  if (!contiguo) {
    rotulo += ` (só ${mesesNoPeriodo.map(m => MES_NOMES_CURTO[m - 1]).join(', ')})`;
  }

  return { meses: mesesNoPeriodo, inicioMes, fimMes, dia, parcial, contiguo, rotulo };
}

module.exports = {
  hojeBrt, ehBissexto, corteDoAno, ultimaSemanaIsoCompleta, resolverPeriodo,
  MES_NOMES_LONGO, MES_NOMES_CURTO,
};
