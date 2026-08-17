// Régua PURA da exclusão EM LOTE de inscrições de um evento.
//
// ⚠️ Por que existe (17/08/2026): o Matheus precisa tirar da lista as inscrições
// que ele mesmo fez testando — e com 241 inscritos no Celebra, apagar uma a uma
// não é caminho. Excluir em massa é a operação em que o clique errado custa
// caro, então o que pode e o que não pode sair fica AQUI, testado, e o servidor
// reavalia tudo: o payload diz QUAIS, nunca SE PODE (mesma lei da aprovação em
// lote da Membresia e do `ligar-lote` das Entradas).
//
// ⚠️⚠️ INSCRIÇÃO COM PAGAMENTO NÃO SAI EM LOTE. Apagar quem pagou some com a
// pessoa da lista e do placar enquanto o dinheiro continua na conta da igreja —
// é esconder receita recebida do acompanhamento do evento, e ninguém revisa o
// que sumiu. Caso a caso a exclusão individual continua existindo (com a pessoa
// olhando a ficha); o que o lote recusa, ele DECLARA.

const TETO_LOTE = 200;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Normaliza a lista de ids que veio do cliente: só uuid, sem repetição, com
 * teto. Devolve `{ ids, ignorados }` — `ignorados` é o que veio malformado, e é
 * DECLARADO em vez de sumir (lista que encolhe em silêncio faz a pessoa achar
 * que apagou o que não apagou).
 */
function normalizarIds(bruto) {
  const lista = Array.isArray(bruto) ? bruto : [];
  const ids = [];
  const vistos = new Set();
  let ignorados = 0;
  for (const item of lista) {
    const id = String(item || '').trim();
    if (!UUID_RE.test(id)) { ignorados++; continue; }
    if (vistos.has(id)) continue;
    vistos.add(id);
    ids.push(id);
  }
  return { ids: ids.slice(0, TETO_LOTE), ignorados, acimaDoTeto: Math.max(0, ids.length - TETO_LOTE) };
}

/**
 * Decide o destino de cada id pedido, a partir do que o BANCO diz agora.
 *
 * @param {string[]} pedidos      ids que o cliente mandou (já normalizados)
 * @param {Array}    vivas        linhas vivas do evento: { id, nome_completo }
 * @param {string[]} comPagamento ids que têm pagamento pago/estornado (a razão
 *                                auxiliar do evento) — nunca entram no lote
 * @returns {{ excluir: string[], comPagamento: Array, naoEncontradas: string[] }}
 */
function separarExclusaoLote(pedidos, vivas, comPagamento) {
  const porId = new Map((vivas || []).filter(Boolean).map((l) => [l.id, l]));
  const bloqueados = new Set(comPagamento || []);

  const excluir = [];
  const bloqueadas = [];
  const naoEncontradas = [];

  for (const id of pedidos || []) {
    const linha = porId.get(id);
    // Não está viva neste evento: já apagada, de outro evento, ou id inventado.
    // ⚠️ Os três casos viram a MESMA resposta de propósito — dizer "essa
    // inscrição é de outro evento" a partir de um id que a pessoa não deveria
    // ter é vazar a existência de uma linha alheia.
    if (!linha) { naoEncontradas.push(id); continue; }
    if (bloqueados.has(id)) { bloqueadas.push({ id, nome: linha.nome_completo || null }); continue; }
    excluir.push(id);
  }

  return { excluir, comPagamento: bloqueadas, naoEncontradas };
}

/**
 * Frase de resultado pra tela. Existe porque "12 excluídas" não distingue
 * "apaguei as 12 que você pediu" de "apaguei 12 das 20 e as outras 8 tinham
 * pagamento" — e é essa diferença que faz a pessoa conferir ou não.
 */
function resumoDoLote({ excluidas = 0, comPagamento = 0, naoEncontradas = 0, falhas = 0 } = {}) {
  const partes = [];
  partes.push(excluidas === 1 ? '1 inscrição excluída' : `${excluidas} inscrições excluídas`);
  if (comPagamento) {
    partes.push(comPagamento === 1
      ? '1 tem pagamento e ficou de fora (exclua pela ficha, se for o caso)'
      : `${comPagamento} têm pagamento e ficaram de fora (exclua pela ficha, se for o caso)`);
  }
  if (naoEncontradas) {
    partes.push(naoEncontradas === 1 ? '1 já não estava na lista' : `${naoEncontradas} já não estavam na lista`);
  }
  if (falhas) {
    partes.push(falhas === 1 ? '1 falhou e continua na lista' : `${falhas} falharam e continuam na lista`);
  }
  return `${partes.join(' · ')}.`;
}

module.exports = { normalizarIds, separarExclusaoLote, resumoDoLote, TETO_LOTE };
