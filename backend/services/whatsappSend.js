// Envio de mensagens via WhatsApp Cloud API (Graph API da Meta).
// Usado pra responder o líder dentro da janela de 24h (mensagem de
// serviço · gratis quando o líder iniciou a conversa).
//
// Envs necessárias:
//   WHATSAPP_PHONE_NUMBER_ID  · id do número (não eh o número em si)
//   WHATSAPP_ACCESS_TOKEN     · token do System User (permanente em prod)
//
// Versão da Graph API · estavel o suficiente; subir quando a Meta exigir.
const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';

function isConfigured() {
  return !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
}

// Normaliza telefone pra E.164 sem '+' (ex: 5521999998888).
// Aceita o que vier (com +, espacos, parenteses) e prefixa o DDI 55 quando o
// numero vem so com DDD + numero (10 ou 11 digitos). Idempotente pra numeros
// que ja vem com 55. Sem o 55 a Meta nao entrega e o filtro de destinatarios
// (>=12 digitos) barra a pessoa.
function normalizarTelefone(raw) {
  const d = (raw || '').toString().replace(/\D+/g, '');
  if (!d) return '';
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return d; // ja tem DDI
  if (d.length === 10 || d.length === 11) return '55' + d;                  // DDD + numero
  return d;
}

// Envia texto simples. Retorna { ok, message_id?, error? }.
async function enviarTexto(telefone, texto) {
  if (!isConfigured()) {
    console.warn('[whatsappSend] credenciais ausentes · pulando envio real');
    return { ok: false, error: 'whatsapp_nao_configurado' };
  }
  const to = normalizarTelefone(telefone);
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: texto, preview_url: false },
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error('[whatsappSend] erro Graph API:', resp.status, JSON.stringify(data));
      return { ok: false, error: data?.error?.message || `HTTP ${resp.status}` };
    }
    return { ok: true, message_id: data?.messages?.[0]?.id || null };
  } catch (e) {
    console.error('[whatsappSend] excecao:', e.message);
    return { ok: false, error: e.message };
  }
}

// Envia mensagem de TEMPLATE aprovado (proativa · fora da janela de 24h),
// usando as MESMAS credenciais do bot (WHATSAPP_ACCESS_TOKEN + PHONE_NUMBER_ID).
// params → vira o componente body ({{1}}, {{2}}, ...). Retorna { ok, message_id?, error? }.
async function enviarTemplate(telefone, templateName, language, params = []) {
  if (!isConfigured()) {
    console.warn('[whatsappSend] credenciais ausentes · pulando template');
    return { ok: false, error: 'whatsapp_nao_configurado' };
  }
  if (!templateName) return { ok: false, error: 'template_nao_configurado' };
  const to = normalizarTelefone(telefone);
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language || 'pt_BR' },
      components: params?.length
        ? [{ type: 'body', parameters: params.map(t => ({ type: 'text', text: String(t).slice(0, 1024) })) }]
        : undefined,
    },
  };
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error('[whatsappSend] erro template Graph API:', resp.status, JSON.stringify(data));
      return { ok: false, error: data?.error?.message || `HTTP ${resp.status}` };
    }
    return { ok: true, message_id: data?.messages?.[0]?.id || null };
  } catch (e) {
    console.error('[whatsappSend] excecao template:', e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = { enviarTexto, enviarTemplate, normalizarTelefone, isConfigured };
