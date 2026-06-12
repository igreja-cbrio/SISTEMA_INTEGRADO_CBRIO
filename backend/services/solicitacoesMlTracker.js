// Tracker · processa solicitações com pedido ML vinculado.
//
// Chamado pelo cron a cada 15min. Para cada solicitação com ml_shipment_id e
// status != delivered/cancelled:
//   1. Busca shipment na API ML
//   2. Se status mudou: insere evento, atualiza solicitação, dispara notificação
//      in-app + WhatsApp (quando configurado)
//
// Também expoe linkOrder(): chamado quando o comprador cola URL/ID do ML.

const { supabase } = require('../utils/supabase');
const { getMLConfig, mlFetch } = require('./mercadoLivreService');
const { notificar } = require('./notificar');
const wpp = require('./whatsappService');

// ML shipment status → label pt-BR + emoji + se eh transicao "interessante"
const STATUS_LABELS = {
  pending:         { label: 'Pedido recebido',     emoji: '📋', notify: true  },
  handling:        { label: 'Preparando envio',    emoji: '📦', notify: true  },
  ready_to_ship:   { label: 'Pronto para envio',   emoji: '📮', notify: true  },
  shipped:         { label: 'Saiu para entrega',   emoji: '🚚', notify: true  },
  in_transit:      { label: 'A caminho',           emoji: '🚚', notify: true  },
  out_for_delivery:{ label: 'Saiu para entrega',   emoji: '🛵', notify: true  },
  delivered:       { label: 'Entregue',            emoji: '✅', notify: true  },
  not_delivered:   { label: 'Tentativa frustrada', emoji: '⚠️', notify: true  },
  cancelled:       { label: 'Cancelado',           emoji: '❌', notify: true  },
};

function statusLabel(status) {
  return STATUS_LABELS[status]?.label || status || 'atualizacao';
}

// Extrai ID do pedido ML de uma URL ou ID puro
// Aceita: "2000012345678", "https://www.mercadolivre.com.br/pedidos/2000012345678/detalhe", URLs do meli, etc.
function extractOrderId(input) {
  if (!input) return null;
  const s = String(input).trim();
  // Número puro
  if (/^\d{8,}$/.test(s)) return s;
  // URL com /pedidos/NUMERO/
  const m = s.match(/\/pedidos?\/(\d{8,})/);
  if (m) return m[1];
  // URL com order_id=NUMERO
  const m2 = s.match(/[?&]order_id=(\d{8,})/);
  if (m2) return m2[1];
  // Qualquer número de 10+ digitos na string
  const m3 = s.match(/\b(\d{10,})\b/);
  if (m3) return m3[1];
  return null;
}

// Vincula um pedido ML a uma solicitação (chamado pelo POST /vincular-ml)
async function linkOrder({ solicitacaoId, mlOrderInput, profileId }) {
  const orderId = extractOrderId(mlOrderInput);
  if (!orderId) {
    return { ok: false, error: 'Não foi possível extrair o ID do pedido. Cole a URL completa ou apenas o número.' };
  }

  const config = await getMLConfig();
  if (!config?.access_token) {
    return { ok: false, error: 'Mercado Livre não esta conectado. Conecte em /logistica antes.' };
  }

  // 1. Busca o pedido
  let order;
  try {
    order = await mlFetch(config, `/orders/${orderId}`);
  } catch (e) {
    return { ok: false, error: `Pedido ${orderId} não encontrado no Mercado Livre: ${e.message}` };
  }

  // 2. Tenta buscar o shipment (pode não existir ainda se for pagamento pendente)
  let shipment = null;
  const shippingId = order.shipping?.id || null;
  if (shippingId) {
    try {
      shipment = await mlFetch(config, `/shipments/${shippingId}`);
    } catch (e) {
      console.error('[ML-TRACK] shipment fetch falhou:', e.message);
    }
  }

  const itemTitle = order.order_items?.[0]?.item?.title || null;
  const totalAmount = order.total_amount || null;
  const status = shipment?.status || order.status || 'pending';
  const trackingNumber = shipment?.tracking_number || null;
  const trackingUrl = shipment?.tracking_method
    ? `https://www.mercadolivre.com.br/envios/me/details/${shippingId}`
    : null;
  const estimatedDelivery = shipment?.shipping_option?.estimated_delivery_time?.date
    || shipment?.status_history?.date_first_visit
    || null;

  // 3. Atualiza solicitação
  const { data: updated, error: upErr } = await supabase
    .from('solicitacoes')
    .update({
      ml_order_id: String(orderId),
      ml_shipment_id: shippingId ? String(shippingId) : null,
      ml_tracking_number: trackingNumber,
      ml_tracking_url: trackingUrl,
      ml_item_title: itemTitle,
      ml_total_amount: totalAmount,
      ml_last_status: status,
      ml_last_status_changed_at: new Date().toISOString(),
      ml_last_checked_at: new Date().toISOString(),
      ml_linked_at: new Date().toISOString(),
      ml_linked_by: profileId,
      ml_estimated_delivery: estimatedDelivery,
    })
    .eq('id', solicitacaoId)
    .select('id, titulo, solicitante_id, ml_order_id, ml_last_status')
    .single();

  if (upErr) {
    return { ok: false, error: 'Erro ao salvar vinculacao: ' + upErr.message };
  }

  // 4. Insere evento inicial
  await supabase.from('solicitacao_ml_eventos').insert({
    solicitacao_id: solicitacaoId,
    status,
    descricao: itemTitle ? `Pedido vinculado: ${itemTitle}` : 'Pedido ML vinculado',
    raw_payload: { source: 'link', order_id: orderId, shipping_id: shippingId },
  }).then(() => {}).catch(e => console.error('[ML-TRACK] evento insert:', e.message));

  // 5. Notifica solicitante (in-app + WhatsApp)
  await notificarSolicitante({
    solicitacao: updated,
    status,
    descricao: itemTitle
      ? `Compra realizada · ${itemTitle}`
      : 'Sua solicitação foi comprada no Mercado Livre',
    isFirstLink: true,
  }).catch(e => console.error('[ML-TRACK] notify error:', e.message));

  return {
    ok: true,
    solicitacao: updated,
    order: { id: orderId, total: totalAmount, item: itemTitle, status },
    shipment: shipment
      ? { id: shippingId, status, tracking_number: trackingNumber, estimated_delivery: estimatedDelivery }
      : null,
  };
}

// Cron · varre solicitações pendentes, atualiza status, dispara notificações
async function processarUpdates({ batchSize = 30, throttleMs = 200 } = {}) {
  const config = await getMLConfig();
  if (!config?.access_token) {
    return { ok: false, error: 'ML não conectado', checked: 0, updated: 0 };
  }

  const { data: pendentes, error } = await supabase
    .from('vw_solicitacoes_ml_pendentes')
    .select('*')
    .limit(batchSize);

  if (error) {
    return { ok: false, error: error.message, checked: 0, updated: 0 };
  }

  let checked = 0;
  let updated = 0;
  const erros = [];

  for (const s of pendentes || []) {
    checked++;
    try {
      const shipment = await mlFetch(config, `/shipments/${s.ml_shipment_id}`);
      const novoStatus = shipment.status;

      // Sempre atualiza ml_last_checked_at
      const updatePayload = { ml_last_checked_at: new Date().toISOString() };

      const mudou = novoStatus && novoStatus !== s.ml_last_status;
      if (mudou) {
        updatePayload.ml_last_status = novoStatus;
        updatePayload.ml_last_status_changed_at = new Date().toISOString();
        if (shipment.tracking_number) updatePayload.ml_tracking_number = shipment.tracking_number;
      }

      await supabase.from('solicitacoes').update(updatePayload).eq('id', s.id);

      if (mudou) {
        updated++;
        // Insere evento
        await supabase.from('solicitacao_ml_eventos').insert({
          solicitacao_id: s.id,
          status: novoStatus,
          substatus: shipment.substatus || null,
          descricao: statusLabel(novoStatus),
          ocorrido_em: shipment.last_updated || new Date().toISOString(),
          raw_payload: {
            tracking_number: shipment.tracking_number,
            substatus: shipment.substatus,
            status_history: shipment.status_history,
          },
        });

        // Busca a solicitação completa para notificar
        const { data: full } = await supabase
          .from('solicitacoes')
          .select('id, titulo, solicitante_id, ml_order_id, ml_last_status, ml_tracking_number')
          .eq('id', s.id)
          .single();

        if (full) {
          await notificarSolicitante({
            solicitacao: full,
            status: novoStatus,
            descricao: shipment.tracking_number
              ? `Código de rastreio: ${shipment.tracking_number}`
              : '',
          }).catch(e => console.error('[ML-TRACK] notify cron error:', e.message));
        }
      }
    } catch (e) {
      erros.push({ solicitacao_id: s.id, erro: e.message });
      console.error('[ML-TRACK] erro %s: %s', s.id, e.message);
      // Marca como checada mesmo em erro pra não bloquear a fila
      await supabase.from('solicitacoes')
        .update({ ml_last_checked_at: new Date().toISOString() })
        .eq('id', s.id);
    }
    if (throttleMs) await new Promise(r => setTimeout(r, throttleMs));
  }

  return { ok: true, checked, updated, erros };
}

async function notificarSolicitante({ solicitacao, status, descricao, isFirstLink = false }) {
  if (!solicitacao?.solicitante_id) return;

  const meta = STATUS_LABELS[status] || { label: status, emoji: '📦' };
  const tituloNotif = isFirstLink
    ? `${meta.emoji} Pedido confirmado · ${solicitacao.titulo}`
    : `${meta.emoji} ${meta.label} · ${solicitacao.titulo}`;
  const mensagemNotif = descricao || meta.label;

  // 1. In-app (sempre)
  await notificar({
    modulo: 'logistica',
    tipo: 'solicitacao_ml_status',
    titulo: tituloNotif,
    mensagem: mensagemNotif,
    link: '/solicitacoes',
    severidade: ['cancelled', 'not_delivered'].includes(status) ? 'alta' : 'info',
    chaveDedup: `sol_ml_${solicitacao.id}_${status}`,
    targetIds: [solicitacao.solicitante_id],
  });

  // 2. WhatsApp (so se configurado E perfil tem telefone)
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, telefone')
    .eq('id', solicitacao.solicitante_id)
    .maybeSingle();

  if (profile?.telefone) {
    const primeiroNome = (profile.name || 'Voce').split(/\s+/)[0];
    const link = (process.env.FRONTEND_URL || '').replace(/\/+$/, '') + '/solicitacoes';
    await wpp.sendPedidoAtualizado(profile.telefone, {
      primeiroNome,
      tituloSolicitacao: solicitacao.titulo,
      statusLabel: meta.label,
      detalhe: descricao || '',
      link,
    });
  }

  // 3. Quando a encomenda é ENTREGUE, avisa também a EQUIPE de logística
  //    (destinatários vêm das regras do módulo 'logistica' em /admin/notificacao-regras;
  //    sem regra, cai no fallback admin/diretor). Sem targetIds de propósito.
  if (status === 'delivered') {
    const rastreio = solicitacao.ml_tracking_number ? ` (rastreio ${solicitacao.ml_tracking_number})` : '';
    await notificar({
      modulo: 'logistica',
      tipo: 'encomenda_entregue',
      titulo: `📦 Encomenda entregue · ${solicitacao.titulo}`,
      mensagem: `Foi marcada como ENTREGUE no rastreamento do Mercado Livre${rastreio}. Confira o recebimento.`,
      link: '/solicitacoes',
      severidade: 'info',
      chaveDedup: `sol_ml_entregue_equipe_${solicitacao.id}`,
    }).catch(e => console.error('[ML-TRACK] notify equipe entrega:', e.message));
  }
}

module.exports = {
  linkOrder,
  processarUpdates,
  extractOrderId,
  STATUS_LABELS,
  statusLabel,
};
