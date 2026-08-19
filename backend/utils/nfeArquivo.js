'use strict';

// Lê o NOME do arquivo baixado do Mercado Livre.
//
// ⚠️⚠️ ISTO RESOLVE UMA LIMITAÇÃO QUE EU HAVIA DECLARADO SEM SOLUÇÃO.
// Em 19/08/2026 escrevi que a NF-e não casava com o pedido do ML porque "o XML
// não traz o número do pedido" — o `id_pedido` do `<infCpl>` é o interno do
// VENDEDOR (ex.: 96918379), não o do ML. Verdade sobre o conteúdo, e eu concluí
// cedo demais: o número está no NOME DO ARQUIVO.
//
//   invoice-2000017997981146.xml   → pedido 2000017997981146
//   invoice-2000018017722108.pdf   → pedido 2000018017722108
//
// É o que permite (a) ligar a nota ao pedido do ML e (b) casar o PDF (DANFE)
// com o XML da mesma compra, já que os dois vêm com o mesmo número.
//
// ⚠️ O padrão foi observado em 2 arquivos reais, não documentado pelo ML. Por
// isso a régua é ESTREITA e falha em silêncio (devolve null) em vez de adivinhar:
// nome fora do padrão só significa "não sei de qual pedido é" — a nota entra
// mesmo assim, só não fica ligada.

// Aceita `invoice-<digitos>` com ou sem prefixo de pasta, extensão xml ou pdf.
const PADRAO = /(?:^|[\\/])invoice[-_](\d{6,})\.(xml|pdf)$/i;

/**
 * @param {string} nome nome do arquivo (pode vir com caminho, do ZIP)
 * @returns {{orderId: string, tipo: 'xml'|'pdf'}|null}
 */
function lerNomeArquivo(nome) {
  const s = String(nome || '').trim();
  if (!s) return null;
  const m = s.match(PADRAO);
  if (!m) {
    // Sem o padrão do ML, ainda dá pra saber o TIPO pela extensão — é o que
    // permite aceitar XML de outra origem (Arquivei, e-mail do fornecedor).
    const ext = s.toLowerCase().endsWith('.pdf') ? 'pdf'
      : s.toLowerCase().endsWith('.xml') ? 'xml' : null;
    return ext ? { orderId: null, tipo: ext } : null;
  }
  return { orderId: m[1], tipo: m[2].toLowerCase() };
}

/** Só o número do pedido, quando o nome seguir o padrão do ML. */
function pedidoDoNome(nome) {
  return lerNomeArquivo(nome)?.orderId || null;
}

module.exports = { lerNomeArquivo, pedidoDoNome };
