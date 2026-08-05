// ════════════════════════════════════════════════════════════════════════════
//  WhatsApp · de que MÓDULO é este envio, e quem avisar quando ele não chega
//
//  Existe porque a falha de entrega tem DOIS caminhos, e os dois precisavam da
//  mesma régua:
//
//   1. A Meta RECUSA na hora (`whatsappFila.avisarFalhaTerminal`) — telefone
//      inválido, código permanente. A mensagem nunca sai.
//   2. A Meta ACEITA e depois reporta `failed` no webhook
//      (`publicWhatsapp.processarStatuses`) — é aqui que cai "Message
//      undeliverable", o número brasileiro válido SEM WhatsApp. Este caminho
//      gravava `failed_at` e **não avisava ninguém**.
//
//  Duplicar o mapa nos dois lados era garantir que eles divergissem.
// ════════════════════════════════════════════════════════════════════════════

const { supabase } = require('../utils/supabase');
const { notificar } = require('./notificar');

const { moduloDoContexto, diaBrt } = require('../utils/whatsappModulo');

/**
 * A Meta aceitou e depois recusou a entrega. Avisa o módulo dono.
 *
 * ⚠️ DEDUP É POR (MÓDULO, DIA), não por envio — diferente da falha terminal da
 * fila, e de propósito. É neste caminho que caem os DISPAROS EM MASSA: o envio
 * é aceito pra 200 pessoas e os `failed` chegam depois, um por um. Um aviso por
 * mensagem, com o fallback de 16 admin/diretor, viraria centenas de linhas e
 * enterraria o sino — a lição do censo ("aviso é pra trabalho PENDENTE") e a do
 * lote de aprovação (um aviso com o resumo, nunca um por pessoa). O detalhe
 * completo vive em `whatsapp_envios.failed_at/erro_status`.
 * ⚠️ O dedup do `notificar` só vale enquanto a notificação está NÃO LIDA — então
 * depois que a equipe trata, uma falha nova volta a avisar. É o desejado.
 *
 * Best-effort: nunca lança. Falhar aqui não pode derrubar o processamento do
 * webhook (a Meta reentrega e, após falhas consecutivas, DESATIVA o webhook).
 */
async function avisarNaoEntregue(envio, motivo) {
  try {
    const { modulo, link } = moduloDoContexto(envio?.contexto);

    // Nome de gente quando dá — "o telefone 21..." não diz a quem avisar. Nos
    // contextos de `notificarMembro` o `ref_id` É o membro.
    let quem = '';
    if (envio?.ref_id) {
      const { data: m } = await supabase
        .from('mem_membros').select('nome')
        .eq('id', envio.ref_id).is('deleted_at', null).maybeSingle();
      if (m?.nome) quem = m.nome;
    }

    const alvo = quem ? `${quem} (${envio.telefone})` : `o telefone ${envio?.telefone}`;
    await notificar({
      modulo,
      tipo: 'whatsapp_nao_entregue',
      titulo: 'WhatsApp não entregue',
      mensagem: `A mensagem para ${alvo} foi aceita pela Meta mas NÃO foi entregue (${String(motivo || 'falha na entrega').slice(0, 140)}). Normalmente é número sem WhatsApp ou número errado — confira o cadastro. Se houve mais falhas hoje, elas estão no histórico de envios.`,
      link,
      severidade: 'aviso',
      chaveDedup: `wpp_nao_entregue_${modulo}_${diaBrt()}`,
    });
  } catch (e) {
    console.warn('[whatsappContexto] aviso de não-entrega:', e.message);
  }
}

module.exports = { moduloDoContexto, avisarNaoEntregue, diaBrt };
