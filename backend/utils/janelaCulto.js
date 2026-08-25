/**
 * "Hoje é o dia deste culto?" — a janela do check-in pelo supervisor no app.
 *
 * Decisão do Matheus (25/08/2026): DIA INTEIRO do culto, não uma faixa de horas
 * em volta. Simples de explicar pro voluntário; o preço é aceitar marcar às 23h
 * um culto das 8h, o que ele considerou aceitável.
 *
 * ⚠️⚠️ A COMPARAÇÃO É POR DATA EM BRT, NUNCA POR UTC. Culto de domingo 19h é
 * 22h UTC; das 21h BRT em diante o UTC já virou o dia seguinte. Comparar em UTC
 * (ou usar `toISOString().slice(0,10)`) fecharia a janela NO MEIO do culto da
 * noite — exatamente quando o supervisor está batendo os check-ins. É a mesma
 * armadilha que `dateSP`/`periodoSP` em routes/app.js já tratavam para o dedup,
 * e a que o `pcDateToBRT` do Planning Center trata na entrada.
 */

const TZ = 'America/Sao_Paulo';

/** Data (YYYY-MM-DD) de um instante, no fuso da igreja. */
function diaBRT(iso, tz = TZ) {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // 'en-CA' devolve YYYY-MM-DD, que ordena e compara como string.
  return d.toLocaleDateString('en-CA', { timeZone: tz });
}

/**
 * O culto agendado em `scheduledAt` acontece no mesmo dia BRT que `agora`?
 * `agora` é injetável para o teste não depender do relógio da máquina.
 */
function ehDiaDoCulto(scheduledAt, agora = new Date(), tz = TZ) {
  const dCulto = diaBRT(scheduledAt, tz);
  const dHoje = diaBRT(agora, tz);
  if (!dCulto || !dHoje) return { ok: false, motivo: 'sem_data', dia: dCulto, hoje: dHoje };
  return dCulto === dHoje
    ? { ok: true, dia: dCulto, hoje: dHoje }
    : { ok: false, motivo: 'fora_do_dia', dia: dCulto, hoje: dHoje };
}

module.exports = { diaBRT, ehDiaDoCulto, TZ };
