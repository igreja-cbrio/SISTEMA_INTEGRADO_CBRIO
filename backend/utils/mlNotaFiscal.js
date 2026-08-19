'use strict';

// Converte um PEDIDO do Mercado Livre numa linha de `log_notas_fiscais`.
//
// ⚠️⚠️ LEI · o que vem do ML é PEDIDO, não nota fiscal. O ML não expõe o
// documento fiscal da COMPRA pela API: não há chave de acesso, não há XML e não
// há CNPJ do emitente — só o apelido do vendedor e o total do pedido. Foi assim
// que as 50 linhas de 02/04/2026 entraram, e é o máximo que dá pra afirmar.
//
// ⇒ `chave_acesso`, `xml_content` e `emitente_cnpj` ficam NULOS DE PROPÓSITO.
//   Preencher `chave_acesso` com o id do pedido seria gravar um número que não é
//   chave de NF-e numa coluna UNIQUE que o resto do sistema lê como documento
//   fiscal — e a partir daí ninguém distinguiria pedido de nota.
//
// A NF-e de verdade (com chave, XML e DANFE) vem do **Arquivei**, que puxa por
// CNPJ da igreja e alcança TODO fornecedor, não só o ML. São integrações
// complementares: o ML diz o que foi comprado, o Arquivei traz o documento.

/** Data de emissão em `YYYY-MM-DD`, a partir do `date_created` do pedido. */
function dataDoPedido(order) {
  const bruto = order?.date_closed || order?.date_created;
  if (!bruto) return null;
  const d = new Date(bruto);
  if (Number.isNaN(d.getTime())) return null;
  // ⚠️ Fatia o ISO em vez de usar getDate(): o campo é DATE e o fuso local
  // deslocaria a compra da meia-noite para o dia anterior.
  return d.toISOString().slice(0, 10);
}

/**
 * Valor total do pedido em número. `null` quando o ML não mandou.
 *
 * ⚠️⚠️ A guarda de ausência vem ANTES do `Number()`: `Number(null)` e
 * `Number('')` são **0**, então sem ela "o ML não informou o valor" viraria uma
 * compra de **R$ 0,00** gravada como fato — a mesma armadilha já registrada na
 * alçada de compra. Zero DE VERDADE (brinde, estorno) continua valendo.
 */
function valorDoPedido(order) {
  const bruto = order?.total_amount ?? order?.paid_amount;
  if (bruto === null || bruto === undefined || bruto === '') return null;
  const n = Number(bruto);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Monta a linha, ou devolve null quando o pedido não tem o mínimo que as colunas
 * NOT NULL exigem (`numero`, `valor`, `data_emissao`).
 *
 * ⚠️ Devolver null é melhor que "consertar" com zero/hoje: uma compra gravada com
 * R$ 0,00 ou com a data do import vira número errado no financeiro, e número
 * errado não é revisado — parece dado.
 */
function notaDeOrder(order, { createdBy = null } = {}) {
  const id = order?.id != null ? String(order.id) : null;
  const valor = valorDoPedido(order);
  const data = dataDoPedido(order);
  if (!id || valor === null || !data) return null;

  const itens = Array.isArray(order?.order_items) ? order.order_items : [];
  const descricao = itens
    .map((i) => i?.item?.title)
    .filter(Boolean)
    .join(' · ')
    .slice(0, 500) || null;

  return {
    numero: id,
    ml_order_id: id,
    origem: 'mercadolivre',
    status: 'registrada',
    valor,
    data_emissao: data,
    emitente_nome: order?.seller?.nickname || null,
    emitente_cnpj: null,
    chave_acesso: null,
    descricao,
    itens: itens.length ? itens : null,
    created_by: createdBy,
  };
}

/**
 * Filtra os pedidos que ainda não estão na base.
 * ⚠️ A tabela NÃO tem UNIQUE em `numero` nem em `ml_order_id` (conferido no
 * catálogo em 19/08/2026 — a única UNIQUE é `chave_acesso`, que aqui é sempre
 * nula). Logo a idempotência é OBRIGAÇÃO deste código: sem ela, cada clique em
 * "Importar" duplicaria as 50 linhas que já existem.
 */
function separarNovos(orders, idsExistentes, opts = {}) {
  const jaTem = idsExistentes instanceof Set ? idsExistentes : new Set(idsExistentes || []);
  const novas = [];
  let repetidos = 0;
  let ignorados = 0;
  for (const order of Array.isArray(orders) ? orders : []) {
    const linha = notaDeOrder(order, opts);
    if (!linha) { ignorados += 1; continue; }
    if (jaTem.has(linha.ml_order_id)) { repetidos += 1; continue; }
    jaTem.add(linha.ml_order_id); // o próprio lote não pode repetir
    novas.push(linha);
  }
  return { novas, repetidos, ignorados };
}

module.exports = { notaDeOrder, separarNovos, dataDoPedido, valorDoPedido };
