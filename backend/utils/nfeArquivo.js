'use strict';

// Lê o NOME do arquivo de NF-e baixado, para saber A QUAL NOTA ele pertence.
//
// ⚠️⚠️ SÃO DOIS PADRÕES, e o segundo é o que vale no uso real.
//
// 1) DOWNLOAD UNITÁRIO, pela tela do Mercado Livre (um arquivo por vez):
//      invoice-2000017997981146.xml   → pedido 2000017997981146
//      invoice-2000018017722108.pdf
//
// 2) DOWNLOAD EM LOTE, pelo "Baixar NF-e disponíveis" (ZIP do período) —
//    formato COMPLETAMENTE diferente, e é este que a igreja usa:
//      xml/6782584994_35260819556063000157550050000250521618175805-procNFe.xml
//      pdf/6678924263_35260855521517000118550020001272081387068918-DANFE.pdf
//                     └──────────── 44 dígitos = CHAVE DE ACESSO ───────────┘
//
// ⚠️⚠️ EU HAVIA GENERALIZADO A PARTIR DE 2 ARQUIVOS e errei (19/08/2026). Tinha
// escrito aqui que o padrão "foi observado em 2 arquivos reais, não documentado
// pelo ML" e que nome fora do padrão "só significa que não sei de qual pedido
// é". Na prática o ZIP em lote NUNCA usa `invoice-`, então 100% dos DANFEs
// caíam fora e ficavam órfãos — 45 de 45 no primeiro uso real. O aviso na tela
// existia e não bastava: eu tinha declarado o risco e mantido a régua estreita
// como se fosse aceitável, quando o caso comum era justamente o que ela não
// cobria.
//
// ⚠️ A CHAVE DE ACESSO É A CHAVE MELHOR, e não é só um segundo padrão:
//   · é o identificador CANÔNICO da NF-e (44 dígitos, definido pela SEFAZ);
//   · `log_notas_fiscais.chave_acesso` já existe, é UNIQUE e vem preenchida
//     pelo próprio XML — não depende de nome de arquivo nenhum;
//   · logo o DANFE casa com a nota SEM precisar de backfill de `ml_order_id`.
// Por isso quem manda é a chave; o pedido do ML é o caminho alternativo, para
// o download unitário (e continua útil como dado da nota).

/** `invoice-<digitos>.xml|pdf`, com ou sem pasta na frente (download unitário). */
const PADRAO_PEDIDO = /(?:^|[\\/])invoice[-_](\d{6,})\.(xml|pdf)$/i;

/**
 * Chave de acesso da NF-e: exatamente 44 dígitos.
 *
 * ⚠️ As bordas `(?<!\d)` / `(?!\d)` não são enfeite: sem elas, uma sequência de
 * 50 dígitos casaria os 44 primeiros e produziria uma chave INVENTADA, que não
 * acha nota nenhuma (silencioso) ou — pior — acha a errada.
 */
const PADRAO_CHAVE = /(?<!\d)(\d{44})(?!\d)/;

/** Extensões que sabemos ler. */
function extensaoDe(s) {
  const b = String(s || '').toLowerCase();
  if (b.endsWith('.pdf')) return 'pdf';
  if (b.endsWith('.xml')) return 'xml';
  return null;
}

/**
 * @param {string} nome nome do arquivo (pode vir com caminho, do ZIP)
 * @returns {{orderId: string|null, chaveAcesso: string|null, tipo: 'xml'|'pdf'}|null}
 *   `null` só quando não é xml nem pdf. Os dois identificadores são
 *   independentes: um nome pode ter chave e não ter pedido, e vice-versa.
 */
function lerNomeArquivo(nome) {
  const s = String(nome || '').trim();
  if (!s) return null;

  const tipo = extensaoDe(s);
  if (!tipo) return null;

  const mPedido = s.match(PADRAO_PEDIDO);
  // ⚠️ A chave é procurada no nome INTEIRO (o prefixo `pdf/` e o id de 10
  // dígitos antes do `_` não atrapalham, porque exigimos exatamente 44).
  const mChave = s.match(PADRAO_CHAVE);

  return {
    orderId: mPedido ? mPedido[1] : null,
    chaveAcesso: mChave ? mChave[1] : null,
    tipo,
  };
}

/** Só o número do pedido do ML, quando o nome seguir o padrão unitário. */
function pedidoDoNome(nome) {
  return lerNomeArquivo(nome)?.orderId || null;
}

/** Só a chave de acesso, quando o nome a trouxer (padrão do ZIP em lote). */
function chaveDoNome(nome) {
  return lerNomeArquivo(nome)?.chaveAcesso || null;
}

module.exports = { lerNomeArquivo, pedidoDoNome, chaveDoNome };
