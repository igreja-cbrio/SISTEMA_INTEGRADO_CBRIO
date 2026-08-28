const assert = require('node:assert/strict');
const { periodosAlvo, inicioDoPeriodoAnterior, periodoAtual } = require('./kpiAutoCollector');

const em = (iso) => new Date(`${iso}T12:00:00Z`);

// ── Sem fecharAnterior: comportamento antigo, intocado ──────────────────────
assert.deepEqual(periodosAlvo('mensal', em('2026-08-18'), false), ['2026-08'],
  'sem fecharAnterior deve devolver só o período corrente');

// ── Com fecharAnterior: o período fechado volta a ser reprocessado ──────────
assert.deepEqual(periodosAlvo('mensal', em('2026-08-18'), true), ['2026-08', '2026-07'],
  'com fecharAnterior o mês anterior entra na rodada');

// ⚠️ A ARMADILHA QUE MOTIVOU ESTE TESTE.
// Em 31/03, `setUTCMonth(mes-1)` sem zerar o dia cai em "31/02", que o JS
// normaliza para 03/03 — o mês anterior escaparia exatamente nos dias 29, 30 e
// 31. Como a coleta roda todo dia, o mês fechado deixaria de ser reprocessado
// justamente na virada, que é quando mais chega lançamento atrasado.
assert.deepEqual(periodosAlvo('mensal', em('2026-03-31'), true), ['2026-03', '2026-02'],
  'dia 31 não pode pular o mês anterior');
assert.deepEqual(periodosAlvo('mensal', em('2026-03-30'), true), ['2026-03', '2026-02'],
  'dia 30 não pode pular o mês anterior');
assert.deepEqual(periodosAlvo('mensal', em('2026-05-31'), true), ['2026-05', '2026-04'],
  'dia 31 em mês de 31 dias também');

// ── Viradas de ano ─────────────────────────────────────────────────────────
assert.deepEqual(periodosAlvo('mensal', em('2026-01-15'), true), ['2026-01', '2025-12'],
  'janeiro deve fechar dezembro do ano anterior');
assert.deepEqual(periodosAlvo('anual', em('2026-01-15'), true), ['2026', '2025'],
  'anual deve fechar o ano anterior');

// ── Demais periodicidades ──────────────────────────────────────────────────
const [semAtual, semAnterior] = periodosAlvo('semanal', em('2026-08-18'), true);
assert.equal(semAtual, periodoAtual('semanal', em('2026-08-18')));
assert.equal(semAnterior, periodoAtual('semanal', em('2026-08-11')),
  'semanal deve voltar exatamente uma semana ISO');
assert.notEqual(semAnterior, semAtual);

assert.deepEqual(periodosAlvo('trimestral', em('2026-08-18'), true), ['2026-Q3', '2026-Q2']);
assert.deepEqual(periodosAlvo('semestral', em('2026-08-18'), true), ['2026-S2', '2026-S1']);

// ── Nunca duplicar: gravaria o mesmo período duas vezes por rodada ─────────
for (const p of ['semanal', 'mensal', 'trimestral', 'semestral', 'anual']) {
  const lista = periodosAlvo(p, em('2026-08-18'), true);
  assert.equal(new Set(lista).size, lista.length, `${p} não pode repetir período`);
}

// ── A função não pode mexer na data que recebeu ────────────────────────────
const d = em('2026-08-18');
const antes = d.toISOString();
inicioDoPeriodoAnterior('mensal', d);
assert.equal(d.toISOString(), antes, 'inicioDoPeriodoAnterior não pode mutar a data recebida');

console.log('kpiPeriodos: coleta passa a fechar o período anterior — 15 cenários aprovados');
