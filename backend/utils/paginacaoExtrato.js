// ============================================================================
//  A paginação do extrato do Santander AVANÇOU? · régua PURA (sem rede, sem banco)
//
//  ⚠️⚠️ POR QUE ISTO EXISTE (03/09/2026 · medido em produção). O laço de
//  paginação pedia páginas de 50 (`_limit`/`_offset`) e só parava quando vinha
//  página PARCIAL. Em 01 e 02/09 o cron falhou 4× seguidas, sempre em ~60 s, com
//  `[BANK_SYNC_FAILED] Limite de paginacao do extrato Santander excedido`.
//
//  O log `santander_sync_log` nomeia o culpado sem margem para dúvida — as
//  chamadas do endpoint `/transactions/`, por dia pedido:
//
//    28/08 →   2 chamadas · offset 0            · 200
//    29/08 →   4 chamadas · offset 0            · 200
//    30/08 →   6 chamadas · offset 0            · 200
//    31/08 → 402 chamadas · offset 0 … 4950     · 200 em TODAS
//
//  ⚠️ 5.000 lançamentos num dia nesta conta é absurdo (o recorde histórico da
//  igreja, via OFX e em OUTRO banco, é 564). E a latência é PLANA (449–482 ms)
//  do offset 0 ao 4950 — varredura real de offset profundo não é plana. Ou seja:
//  **a página não avança**. O gateway devolve 200 com página cheia para sempre.
//
//  ⚠️⚠️ E o laço só descobria isso DEPOIS de 100 chamadas, com uma mensagem que
//  culpa o "limite de paginação" (nosso teto) em vez de nomear a causa (o
//  gateway). 60 segundos para dizer a coisa errada.
//
//  ⚠️⚠️ ESTA RÉGUA NUNCA DESCARTA LANÇAMENTO. Ela decide QUANDO PARAR, não o que
//  entra. A tentação era filtrar item fora da janela pedida (há a hipótese de o
//  gateway ignorar o filtro de data no offset profundo) — mas descartar linha de
//  extrato bancário por causa de uma suposição minha sobre formato de data é
//  exatamente a classe de erro que a lei contábil da casa proíbe: número errado
//  é pior que número ausente, e linha sumida é o pior dos dois. Item fora da
//  janela apenas NÃO CONTA COMO PROGRESSO — se a página inteira for de fora, a
//  paginação não avançou e o laço para, sem importar nada.
// ============================================================================

// ⚠️ Importa do módulo PURO, nunca de `services/pixExtratoParser` — aquele
// requer `xlsx` e o CI do gate quebra com `Cannot find module 'xlsx'`.
const { parseDateBR } = require('./dataBr');

/**
 * Identidade do lançamento para efeito de "já vi esta página".
 *
 * ⚠️ `transactionId` quando existe. Sem ele, uma impressão digital do ITEM
 * INTEIRO — nunca "sem id é sempre novo", que desarmaria a guarda justamente na
 * hipótese em que o gateway devolve páginas sem id (o laço queimaria as 100
 * chamadas achando que está progredindo).
 */
function chaveItem(t) {
  const id = t && typeof t === 'object' ? t.transactionId : null;
  if (typeof id === 'string' && id.trim()) return `id:${id.trim()}`;
  try {
    return `raw:${JSON.stringify(t)}`;
  } catch {
    return `raw:${String(t)}`;
  }
}

/**
 * O lançamento cai na janela pedida?
 *
 * ⚠️ Data ilegível conta como DENTRO (fail-safe): tratar como fora faria a
 * régua concluir "não avançou" e abortar um sync que estava funcionando. Na
 * dúvida, o extrato continua; quem para o laço é a ausência de item novo.
 */
function dentroDaJanela(t, inicio, fim) {
  const d = parseDateBR(t && typeof t === 'object' ? t.transactionDate : null);
  if (!d) return true;
  if (typeof inicio === 'string' && inicio && d < inicio) return false;
  if (typeof fim === 'string' && fim && d > fim) return false;
  return true;
}

/**
 * Avalia UMA página do extrato.
 *
 * @param {object} p
 * @param {any[]}  p.itens     — `_content` da resposta
 * @param {Set}    p.vistos    — chaves já contabilizadas (mutado pelo chamador)
 * @param {number} p.limite    — `_limit` pedido
 * @param {string} [p.inicio]  — janela pedida (YYYY-MM-DD)
 * @param {string} [p.fim]
 * @returns {{novos:any[], novosNaJanela:number, encerrar:boolean, travou:boolean, motivo:string|null}}
 */
function avaliarPagina({ itens, vistos, limite, inicio, fim } = {}) {
  const lista = Array.isArray(itens) ? itens : [];
  const conhecidos = vistos instanceof Set ? vistos : new Set();

  const novos = [];
  let novosNaJanela = 0;
  for (const t of lista) {
    const k = chaveItem(t);
    if (conhecidos.has(k)) continue;
    conhecidos.add(k);
    novos.push(t);
    if (dentroDaJanela(t, inicio, fim)) novosNaJanela += 1;
  }

  // ⚠️ Página PARCIAL encerra o lote — é o contrato que já existia, e é o
  // caminho de 100% das execuções bem-sucedidas da história deste sync.
  const encerrar = lista.length < Number(limite);

  // ⚠️ Só é travamento em página CHEIA: página parcial que não trouxe novidade
  // é fim de lote, não defeito.
  const travou = !encerrar && novosNaJanela === 0;

  return {
    novos,
    novosNaJanela,
    encerrar,
    travou,
    motivo: travou
      ? 'a paginação do extrato não avançou: a página veio cheia e não trouxe nenhum lançamento novo dentro da janela pedida — o gateway do Santander não está respeitando o `_offset`'
      : null,
  };
}

module.exports = { chaveItem, dentroDaJanela, avaliarPagina };
