// ============================================================================
// Helpers de semana ISO (SEG→DOM) · extraídos de routes/dashboardSemanal.js
// pra reuso na coleta (routes/integracao.js). Tudo em UTC.
//
// ⚠️ NÃO confundir com a semana FINANCEIRA (quarta→terça · fn_fin_semana_qua_ter)
// — as duas divergem de propósito (ver CLAUDE.md).
// ============================================================================

function isoWeekRange(ano, semana) {
  // Quinta da semana ISO determina o ano ISO · usar 4 de jan e ajustar
  const simple = new Date(Date.UTC(ano, 0, 4));
  const dow = simple.getUTCDay() || 7; // 1..7, segunda=1
  const isoWeek1Mon = new Date(simple);
  isoWeek1Mon.setUTCDate(simple.getUTCDate() - dow + 1);
  const inicio = new Date(isoWeek1Mon);
  inicio.setUTCDate(isoWeek1Mon.getUTCDate() + (semana - 1) * 7);
  const fim = new Date(inicio);
  fim.setUTCDate(inicio.getUTCDate() + 6);
  return { inicio, fim };
}

function isoWeekOf(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { ano: d.getUTCFullYear(), semana: week };
}

function fmtDateBr(d) {
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Semanas ISO cujo DOMINGO cai dentro do mês calendário (regra do Marcos no
// /metas/sugerir: a semana "conta" no mês em que os cultos de domingo caem).
// Pares podem ter ano_iso ≠ ano calendário nas bordas (S52/53 e S1).
function semanasDoMes(anoCal, mes) {
  const pares = [];
  const ultimoDia = new Date(Date.UTC(anoCal, mes, 0)).getUTCDate();
  for (let dia = 1; dia <= ultimoDia; dia++) {
    const d = new Date(Date.UTC(anoCal, mes - 1, dia));
    if (d.getUTCDay() !== 0) continue; // só domingos
    const w = isoWeekOf(d);
    pares.push({ ano_iso: w.ano, semana: w.semana });
  }
  return pares;
}

module.exports = { isoWeekRange, isoWeekOf, fmtDateBr, semanasDoMes };
