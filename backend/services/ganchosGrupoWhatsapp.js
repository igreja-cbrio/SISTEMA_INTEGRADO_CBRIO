// ════════════════════════════════════════════════════════════════════════════
//  GANCHOS DETERMINÍSTICOS DE GRUPO no webhook do WhatsApp (26/09/2026)
//
//  Rodam ANTES do bot de IA, no bloco em que o menu está calado, e NÃO dependem
//  de `bot_ia.ativo` nem de crédito da Anthropic — são régua fechada:
//    1. `pedidoLinkGrupo`   — "cadê o link do meu grupo?" → avisa a liderança;
//    2. `trocaGrupoWhatsapp` — "quero trocar de grupo" → pedido PENDENTE à
//       coordenação (o bot NUNCA move ninguém de grupo).
//
//  ⚠️ A ordem é link → troca, e o gancho do link devolve a mensagem quando ela
//  TAMBÉM é pedido de troca — "qual o link do outro grupo?" é troca.
//  ⚠️ NUNCA lança: gancho quebrado não pode calar o bot de IA nem derrubar o
//  webhook. Qualquer falha antes de assumir a mensagem vira `{ tratado:false }`.
// ════════════════════════════════════════════════════════════════════════════

const { pedeLink } = require('../utils/pedidoLinkGrupo');
const { pedeTroca } = require('../utils/trocaGrupoConversa');

/**
 * @returns `{ tratado:false, motivo }` — o webhook segue pro bot de IA ·
 *   `{ tratado:true, gancho, acionarEquipe, ... }` — o gancho assumiu.
 */
async function tratarGanchos({ telefone, texto, messageId, phoneNumberId = null, enviarTexto } = {}) {
  try {
    // ⚠️ Régua pura PRIMEIRO: a imensa maioria das mensagens não é de nenhum
    // gancho, e ela não pode pagar uma ida ao banco por causa deles.
    const ehLink = pedeLink(texto);
    const ehTroca = !!pedeTroca(texto);
    if (!ehLink && !ehTroca) return { tratado: false, motivo: 'nenhum_gancho' };

    // A conversa já existe (o `registrarInbound` do webhook acabou de gravar a
    // mensagem). `acharOuCriarConversa` é o MESMO resolvedor — inclusive a
    // reconciliação do 9º dígito —, então não há 2ª régua de "qual conversa".
    const { acharOuCriarConversa } = require('./waInbox');
    const conversa = await acharOuCriarConversa(telefone, phoneNumberId);
    if (!conversa?.id) return { tratado: false, motivo: 'sem_conversa' };

    const args = { telefone, texto, messageId, phoneNumberId, enviarTexto, conversa };

    if (ehLink) {
      const r = await require('./pedidoLinkGrupo').tratarPedidoLink(args);
      if (r?.tratado) return { ...r, gancho: 'link' };
    }
    if (ehTroca) {
      const r = await require('./trocaGrupoWhatsapp').tratarPedidoTroca(args);
      if (r?.tratado) return { ...r, gancho: 'troca' };
      return { tratado: false, motivo: r?.motivo || 'troca_nao_tratada' };
    }
    return { tratado: false, motivo: 'link_nao_tratado' };
  } catch (e) {
    console.error('[ganchosGrupo] tratar:', e.message);
    return { tratado: false, motivo: 'erro' };
  }
}

module.exports = { tratarGanchos };
