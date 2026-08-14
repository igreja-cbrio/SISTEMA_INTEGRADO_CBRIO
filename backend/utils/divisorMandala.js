/**
 * Divisor da média de FREQUÊNCIA da mandala (valor "Seguir a Jesus") · régua PURA
 *
 * Decisão do Marcos (2026-08-12): *"na frequência (seguir a Jesus) seja dividido
 * pela quantidade de domingos do mês, e não semanas"*. Escopo declarado por ele:
 * **só a média EXIBIDA, e só a frequência** — meta, semáforo e periodicidade de
 * KPI não são tocados.
 *
 * ⚠️ Por que o divisor por SEMANA distorcia: a semana ISO (seg→dom) das bordas do
 * mês entra na conta com o culto de QUARTA sem trazer o domingo dela. Medido em
 * produção (presencial, 2026): jan **5 semanas × 4 domingos** (a semana de 29/12
 * a 04/01 tem a quarta 01/01, e o domingo dela é 28/12 — dezembro), idem fev, abr
 * e jul. Efeito: média 25% MENOR nesses meses (jan 1.809 → 2.262 · abr 2.128 →
 * 2.660 · jul 1.649 → 2.061). Meses com 5 domingos (mar, mai, ago) não mudam.
 *
 * ⚠️ Evidência de que a régua nova é a que a equipe já usava: o único lançamento
 * MANUAL de `cultura_mensal` (abril/2026) tem `freq_presencial_semanal = 2660` —
 * exatamente a média por DOMINGO, não a média por semana (2.128). O automático é
 * que divergia do que a gente mesmo escrevia à mão.
 *
 * ⚠️ O NUMERADOR não muda: segue sendo a soma de TODOS os cultos do mês (domingo,
 * quarta, AMI, Bridge). É o pedido literal — o divisor é que passa a ser o nº de
 * domingos. Trocar o numerador junto seria outra métrica ("frequência de domingo"),
 * que ninguém pediu.
 *
 * Vive em `utils/` (sem Supabase) pra entrar no gate de deploy.
 */

/** 'YYYY-MM-DD' (ou timestamp) → true se cai num domingo. */
function ehDomingo(iso) {
  if (typeof iso !== 'string' || iso.length < 10) return false;
  const dia = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false;
  const d = new Date(`${dia}T00:00:00Z`);
  // ⚠️ getUTCDay(), NUNCA getDay(): o parse é UTC e, em fuso negativo (BRT),
  // getDay() devolveria o dia ANTERIOR — domingo viraria sábado e a contagem
  // sairia errada em todo mês.
  return !Number.isNaN(d.getTime()) && d.getUTCDay() === 0;
}

/** Quantos domingos o mês de calendário tem (4 ou 5). */
function domingosNoMes(ano, mes) {
  const y = Number(ano);
  const m = Number(mes);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return 0;
  const diasNoMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let n = 0;
  for (let d = 1; d <= diasNoMes; d++) {
    if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0) n++;
  }
  return n;
}

/**
 * Divisor a usar: domingos que de fato TIVERAM culto no mês; sem nenhum, cai no
 * calendário (nunca 0 — dividir por zero viraria Infinity na tela).
 *
 * @param {Array<{data?: string}|string>} cultos linhas de `cultos` (ou datas ISO)
 * @param {{ano:number, mes:number}} ref mês de referência (fallback)
 */
function divisorDomingos(cultos, { ano, mes } = {}) {
  const datas = new Set();
  for (const c of cultos || []) {
    const iso = typeof c === 'string' ? c : c?.data;
    if (ehDomingo(iso)) datas.add(iso.slice(0, 10));
  }
  return datas.size || domingosNoMes(ano, mes) || 1;
}

module.exports = { ehDomingo, domingosNoMes, divisorDomingos };
