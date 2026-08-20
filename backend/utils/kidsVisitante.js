'use strict';

/**
 * Kids · quando a criança VISITANTE vira FREQUENTADORA, e por quanto tempo o
 * cadastro dela fica de pé.
 *
 * ⚠️⚠️ ESTA RÉGUA MUDOU EM 20/08/2026 (pedido do Matheus) e a mudança só é
 * segura porque veio ACOMPANHADA do prazo rolante. Registro do porquê:
 *
 *   ANTES (Marcos · 20/07/2026): promovia no 2º dia com check-in.
 *   AGORA  (Matheus · 20/08/2026): promove no 3º dia com check-in, E o prazo de
 *   4 semanas passa a ser RENOVADO a cada check-in.
 *
 * ⚠️⚠️ POR QUE O PRAZO ROLANTE NÃO É OPCIONAL. Visitante tem `data_limite`, e
 * quem passa do prazo é INATIVADA automaticamente. Medido em 20/08 antes de
 * mexer: a mediana entre o 1º e o 2º check-in é **7 dias**, então o 3º cai por
 * volta do 14º dia para quem vem toda semana — mas por volta do **28º–30º** para
 * quem vem de 15 em 15, que é comum. Com prazo FIXO de 4 semanas, exigir 3
 * check-ins desativaria a criança ANTES de ela conseguir ser promovida. Com o
 * prazo rolando a cada visita, a régua passa a ser "3 visitas, com no máximo 4
 * semanas entre elas" — que é o que se quer dizer.
 *
 * ⚠️ Contexto que pesa: nos GRUPOS a régua de "3 presenças → frequentador" foi
 * TENTADA e ABANDONADA pelo Marcos em 23/07/2026 (migration 20260723210000),
 * trocada por "1ª presença", porque com frequência mensal ela não fechava. Aqui
 * ela só se sustenta por causa do prazo rolante — se um dia o prazo voltar a ser
 * fixo, esta régua tem de voltar para 2.
 *
 * ⚠️ Promoção é DEFINITIVA: nada neste arquivo devolve alguém para visitante.
 * Quem já é frequentadora (as 104 que tinham exatamente 2 dias quando a régua
 * mudou) continua frequentadora — mudar o número não rebaixa ninguém.
 */

/** Dias distintos com check-in necessários para deixar de ser visitante. */
const DIAS_PARA_FREQUENTADORA = 3;

/** Janela, em dias, que o cadastro de uma visitante fica de pé sem novo check-in. */
const DIAS_DE_PRAZO = 28;

/**
 * A criança deve ser promovida a frequentadora?
 *
 * @param {number} diasComCheckin dias DISTINTOS em que houve check-in (o de hoje incluído)
 * @param {boolean} eVisitante estado atual
 *
 * ⚠️ Conta DIAS DISTINTOS, nunca linhas de `kids_checkins`: a mesma criança tem
 * check-in em mais de um culto no mesmo domingo (são 4 horários), e contar linha
 * promoveria numa única manhã.
 */
function devePromover(diasComCheckin, eVisitante = true) {
  if (eVisitante !== true) return false;                 // já é frequentadora
  const n = Number(diasComCheckin);
  if (!Number.isFinite(n)) return false;                 // ⚠️ Number(null) é 0, mas undefined é NaN
  return n >= DIAS_PARA_FREQUENTADORA;
}

/**
 * Prazo novo, contado a partir de `hojeISO` (BRT, `YYYY-MM-DD`).
 *
 * ⚠️ Recebe o dia de FORA em vez de ler o relógio: teste que depende da hora da
 * máquina foi o que mordeu no `faixaEtaria.test.ts`, e dia de operação da igreja
 * é BRT — em UTC, das 21h em diante o dia já virou e o culto de domingo à noite
 * cairia na segunda.
 */
function prazoDe(hojeISO) {
  const s = String(hojeISO || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;       // fail-closed: sem dia válido, sem prazo
  const d = new Date(`${s}T12:00:00Z`);                  // meio-dia evita virada de fuso
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + DIAS_DE_PRAZO);
  return d.toISOString().slice(0, 10);
}

/**
 * O que fazer com esta visitante depois de um check-in.
 * Devolve o patch a aplicar em `kids_criancas` — `null` quando não há nada a
 * mudar (já é frequentadora).
 *
 * ⚠️ Promover LIMPA o prazo e a relação: frequentadora não tem prazo, e deixar
 * `data_limite` preenchido faria a varredura de vencidos inativá-la depois.
 */
function patchAposCheckin({ eVisitante, diasComCheckin, hojeISO }) {
  if (eVisitante !== true) return null;

  if (devePromover(diasComCheckin, true)) {
    return { visitante: false, data_limite: null, visitante_relacao: null, promovida: true };
  }
  // Segue visitante: RENOVA o prazo (é isto que torna a régua de 3 viável).
  const prazo = prazoDe(hojeISO);
  return prazo ? { data_limite: prazo, promovida: false } : null;
}

module.exports = {
  DIAS_PARA_FREQUENTADORA,
  DIAS_DE_PRAZO,
  devePromover,
  prazoDe,
  patchAposCheckin,
};
