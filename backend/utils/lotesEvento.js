// ============================================================================
// LOTES de preço por evento (2026-08-20 · pedido do Arthur pro AMI CAMP 2027)
//
// `insc_eventos.lotes` = [{ nome, vagas, valor_centavos }] (migration
// 20260821120000). O lote vira SOZINHO quando as vagas dele esgotam: as vagas
// são POSIÇÕES cumulativas na ordem de chegada — com [50, 100, 150], as
// inscrições 1..50 pagam o lote 1, 51..150 o lote 2, 151..300 o lote 3.
//
// ⚠️⚠️ Quem conta posição é a MESMA régua da vaga (`fn_insc_inscrever`): linha
// viva NÃO-cancelada ocupa posição; só `cancelada` devolve. Contar diferente da
// vaga faria o lote e o "restam N vagas" discordarem na mesma tela.
//
// ⚠️ Posição ALÉM do último lote devolve o ÚLTIMO lote, nunca null: quem limita
// a entrada é o `vagas` do EVENTO (a RPC recusa `sem_vaga`); se a igreja abrir
// mais vagas que a soma dos lotes, o excedente paga o preço final — devolver
// null aqui derrubaria a cobrança de uma inscrição que a RPC já aceitou.
//
// ⚠️ Régua PURA em utils/ pra entrar no gate (src/test/lotesEvento.test.ts).
// Quem lê o banco é o chamador.
// ============================================================================

const MAX_LOTES = 6;

/**
 * Normaliza a lista vinda do editor. Devolve `null` quando a entrada não é
 * array (campo ausente no PATCH = não mexer); array vazio é "sem lotes" e vale.
 * Item sem vagas ou sem valor POSITIVOS é descartado — lote de 0 vagas nunca
 * seria o atual e lote de R$ 0 cobraria nada por posição, os dois em silêncio.
 */
function sanitizarLotes(lista) {
  if (!Array.isArray(lista)) return null;
  return lista
    .map((l, i) => {
      if (!l || typeof l !== 'object') return null;
      const vagas = Math.trunc(Number(l.vagas));
      const valor = Math.trunc(Number(l.valor_centavos));
      if (!(vagas > 0) || !(valor > 0)) return null;
      return {
        nome: String(l.nome ?? '').trim().slice(0, 60) || `Lote ${i + 1}`,
        vagas,
        valor_centavos: valor,
      };
    })
    .filter(Boolean)
    .slice(0, MAX_LOTES);
}

/** Soma das vagas dos lotes (o "teto" que os lotes descrevem). */
function totalVagasLotes(lotes) {
  if (!Array.isArray(lotes)) return 0;
  return lotes.reduce((s, l) => s + (Number(l?.vagas) > 0 ? Math.trunc(Number(l.vagas)) : 0), 0);
}

/**
 * O lote da POSIÇÃO (1-based) na ordem de chegada, ou null sem lotes válidos.
 * Posição além da soma cai no último (ver cabeçalho).
 */
function loteDaPosicao(lotes, posicao) {
  const lista = sanitizarLotes(lotes) || [];
  if (!lista.length) return null;
  const pos = Math.trunc(Number(posicao));
  if (!(pos > 0)) return null;
  let acumulado = 0;
  for (let i = 0; i < lista.length; i++) {
    acumulado += lista[i].vagas;
    if (pos <= acumulado) return { ...lista[i], indice: i };
  }
  return { ...lista[lista.length - 1], indice: lista.length - 1 };
}

/**
 * O lote que a PRÓXIMA inscrição paga, dado quantas posições já estão ocupadas
 * (a régua da vaga: vivas não-canceladas). Devolve também quantas inscrições
 * ainda saem por este preço (`restantes_no_lote` · null no último lote, cujo
 * fim quem dá é o `vagas` do evento) e o próximo lote, pra tela dizer "depois
 * sobe pra R$ X".
 */
function loteAtual(lotes, ocupadas) {
  const oc = Number(ocupadas);
  const base = Number.isFinite(oc) && oc > 0 ? Math.trunc(oc) : 0;
  const atual = loteDaPosicao(lotes, base + 1);
  if (!atual) return null;
  const lista = sanitizarLotes(lotes) || [];
  let acumulado = 0;
  for (let i = 0; i <= atual.indice; i++) acumulado += lista[i].vagas;
  const ultimo = atual.indice === lista.length - 1;
  return {
    nome: atual.nome,
    valor_centavos: atual.valor_centavos,
    indice: atual.indice,
    restantes_no_lote: ultimo ? null : Math.max(0, acumulado - base),
    proximo: ultimo ? null : { nome: lista[atual.indice + 1].nome, valor_centavos: lista[atual.indice + 1].valor_centavos },
  };
}

module.exports = { MAX_LOTES, sanitizarLotes, totalVagasLotes, loteDaPosicao, loteAtual };
