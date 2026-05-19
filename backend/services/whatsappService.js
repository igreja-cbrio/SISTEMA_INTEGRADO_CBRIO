// WhatsApp Cloud API (Meta) — envio de mensagens transacionais.
//
// Feature flag · so envia se WHATSAPP_ENABLED === 'true' E todas as credenciais
// estao presentes. Caso contrario, loga e retorna { sent: false }.
//
// Credenciais necessarias (env vars):
//   WHATSAPP_TOKEN              · access token permanente do app Meta
//   WHATSAPP_PHONE_NUMBER_ID    · ID do numero registrado (nao o numero em si)
//   WHATSAPP_BUSINESS_ACCOUNT_ID · WABA ID (opcional · so para listar templates)
//
// Templates de utility precisam estar aprovados no Meta Business Manager
// antes de funcionar. Sugestao de template:
//
//   Nome:  pedido_atualizado
//   Idioma: pt_BR
//   Categoria: UTILITY
//   Corpo:
//     Ola {{1}}, sua solicitacao "{{2}}" teve uma atualizacao:
//
//     Status: {{3}}
//     {{4}}
//
//     Acompanhe em: {{5}}

const ENABLED = process.env.WHATSAPP_ENABLED === 'true';
const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v18.0';
const TEMPLATE_PEDIDO = process.env.WHATSAPP_TEMPLATE_PEDIDO || 'pedido_atualizado';
const TEMPLATE_LANG = process.env.WHATSAPP_TEMPLATE_LANG || 'pt_BR';

function configurado() {
  return !!(ENABLED && TOKEN && PHONE_NUMBER_ID);
}

// Normaliza telefone para E.164 brasileiro (55 + DDD + numero, so digitos).
// Aceita formatos: (21) 99999-9999, 21999999999, +5521999999999, 5521999999999
function normalizarTelefone(raw) {
  if (!raw) return null;
  const d = String(raw).replace(/\D+/g, '');
  if (d.length === 13 && d.startsWith('55')) return d;        // 55 21 99999 9999
  if (d.length === 12 && d.startsWith('55')) return d;        // 55 21 9999 9999 (fixo)
  if (d.length === 11) return '55' + d;                       // 21 99999 9999
  if (d.length === 10) return '55' + d;                       // 21 9999 9999
  return null;
}

async function sendTemplate(toRaw, templateName, language, parameters) {
  const to = normalizarTelefone(toRaw);
  if (!to) {
    return { sent: false, reason: 'invalid_phone', raw: toRaw };
  }
  if (!configurado()) {
    console.log('[WPP][DRY-RUN] template=%s lang=%s to=%s params=%j',
      templateName, language, to, parameters);
    return { sent: false, reason: 'disabled', to };
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language },
      components: parameters?.length
        ? [{ type: 'body', parameters: parameters.map(t => ({ type: 'text', text: String(t).slice(0, 1024) })) }]
        : undefined,
    },
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[WPP] erro %d: %s', res.status, JSON.stringify(json));
      return { sent: false, reason: 'api_error', status: res.status, detail: json };
    }
    return { sent: true, to, messageId: json.messages?.[0]?.id };
  } catch (err) {
    console.error('[WPP] exception:', err.message);
    return { sent: false, reason: 'exception', detail: err.message };
  }
}

// Envia notificacao de atualizacao de pedido (template `pedido_atualizado`).
// vars: { primeiroNome, tituloSolicitacao, statusLabel, detalhe, link }
async function sendPedidoAtualizado(telefone, vars) {
  const params = [
    vars.primeiroNome || 'Ola',
    vars.tituloSolicitacao || 'sua solicitacao',
    vars.statusLabel || 'atualizado',
    vars.detalhe || '',
    vars.link || '',
  ];
  return sendTemplate(telefone, TEMPLATE_PEDIDO, TEMPLATE_LANG, params);
}

module.exports = {
  configurado,
  normalizarTelefone,
  sendTemplate,
  sendPedidoAtualizado,
};
