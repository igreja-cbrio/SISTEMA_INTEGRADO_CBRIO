'use strict';

// Quais mudanças de status do envio do Mercado Livre AVISAM o solicitante.
//
// Decisão do Matheus (19/08/2026), opção B: avisar só quando o pedido SAI para
// entrega e quando é ENTREGUE. O ciclo do ML tem 7 estados, e disparar em todos
// significaria ~7 mensagens para uma compra de fita adesiva — o caminho mais
// curto para a pessoa ignorar o aviso que importa.
//
// ⚠️ O campo `notify` já existia em STATUS_LABELS desde que o tracker foi
// escrito, e NUNCA ERA LIDO: `processarUpdates` chamava `notificarSolicitante`
// em qualquer mudança. O desenho previa isto e o encanamento nunca foi ligado.
//
// ⚠️⚠️ O EVENTO CONTINUA SENDO GRAVADO em `solicitacao_ml_eventos` para TODAS as
// mudanças — o que esta régua controla é só o DISPARO. A linha do tempo da
// solicitação segue completa; o que muda é quantas vezes o celular apita.

// ⚠️ `shipped` E `out_for_delivery` avisam, e não é redundância: nem todo
// vendedor emite `out_for_delivery` (é substatus de última milha e depende da
// transportadora). Avisar só nele faria o "saiu para entrega" nunca chegar na
// maioria dos pedidos — o dedup por status cuida de não repetir quando os dois
// vierem.
const AVISAM = Object.freeze(new Set([
  'shipped',           // saiu do vendedor
  'out_for_delivery',  // saiu para entrega (última milha)
  'delivered',         // entregue
  // ⚠️ Os dois abaixo NÃO estavam no pedido, e entram de propósito: são
  // EXCEÇÕES que exigem ação de quem pediu. Silenciar "não conseguiram
  // entregar" seria pior que qualquer excesso de mensagem que a opção B evita.
  'not_delivered',
  'cancelled',
]));

// Estados intermediários: ficam na linha do tempo, sem disparar.
const SILENCIOSOS = Object.freeze(new Set([
  'pending', 'handling', 'ready_to_ship', 'in_transit',
]));

/**
 * @param {string} status status do shipment vindo do ML
 * @returns {boolean} dispara aviso ao solicitante?
 *
 * ⚠️ Status DESCONHECIDO avisa (fail-open). O ML acrescenta estado sem avisar
 * ninguém, e o custo dos dois erros é assimétrico: uma mensagem a mais é
 * incômodo; uma entrega que ninguém soube que falhou é prejuízo. Quando um
 * status novo aparecer, ele entra numa das duas listas de propósito.
 */
function deveAvisar(status) {
  const s = String(status || '').trim().toLowerCase();
  if (!s) return false;               // sem status não há o que avisar
  if (SILENCIOSOS.has(s)) return false;
  return true;                        // AVISAM + desconhecidos
}

module.exports = { deveAvisar, AVISAM, SILENCIOSOS };
