// waSender — camada HTTP ÚNICA da WhatsApp Cloud API (Módulo Comunicação · C1).
//
// Antes existiam DUAS camadas fazendo a mesma coisa em versões diferentes da
// Graph (whatsappSend v21 × whatsappService v18, com token legado). Esta é a
// única que fala com a Meta; as duas antigas viraram wrappers finos que
// delegam pra cá (mantendo suas assinaturas — os ~23 call sites migram por
// arquivo em fases seguintes, não de uma vez).
//
// Decisões de design:
// - SEM feature-flag aqui: o gate WHATSAPP_ENABLED/dry-run é semântica do
//   whatsappService (transacional) e fica NO wrapper — o bot (whatsappSend)
//   nunca teve gate e não pode ganhar um.
// - Remetente por PARÂMETRO (opts.phoneNumberId · default env) — pronto pro
//   multi-número da tabela wa_numeros (C3) sem tocar aqui de novo.
// - Contrato de retorno único: { sent, messageId, to, status?, reason?, detail? }.
//   'reason' códigos: invalid_phone · sem_credencial · template_nao_configurado ·
//   api_error (com status + detail = json cru da Meta, que a fila usa pra
//   classificar erro permanente) · exception.
// - Token: WHATSAPP_ACCESS_TOKEN (vivo). WHATSAPP_TOKEN legado ainda é aceito
//   como fallback com aviso — remover quando confirmado que só o vivo existe.

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';

let avisouTokenLegado = false;
function token() {
  if (process.env.WHATSAPP_ACCESS_TOKEN) return process.env.WHATSAPP_ACCESS_TOKEN;
  if (process.env.WHATSAPP_TOKEN) {
    if (!avisouTokenLegado) {
      console.warn('[waSender] usando WHATSAPP_TOKEN legado — migrar pra WHATSAPP_ACCESS_TOKEN');
      avisouTokenLegado = true;
    }
    return process.env.WHATSAPP_TOKEN;
  }
  return null;
}

function isConfigured() {
  return !!(process.env.WHATSAPP_PHONE_NUMBER_ID && token());
}

// Normaliza telefone pra E.164 sem '+' (5521999998888). Dois sabores:
// - loose (default · comportamento do whatsappSend): devolve os dígitos mesmo
//   quando o tamanho não casa (a Meta rejeita e o erro aparece no retorno).
// - strict (comportamento do whatsappService): devolve null quando não
//   reconhece o padrão (o chamador trata como invalid_phone antes do POST).
function normalizarTelefone(raw, { strict = false } = {}) {
  const d = (raw || '').toString().replace(/\D+/g, '');
  if (!d) return strict ? null : '';
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return d; // já tem DDI
  if (d.length === 10 || d.length === 11) return '55' + d;                  // DDD + número
  return strict ? null : d;
}

// POST cru na Graph. Retorna o contrato único.
async function postMessages(payload, { phoneNumberId, timeoutMs = 15000, rotulo = 'msg' } = {}) {
  const tk = token();
  const pnid = phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!tk || !pnid) {
    console.warn('[waSender] credenciais ausentes · pulando envio (%s)', rotulo);
    return { sent: false, reason: 'sem_credencial' };
  }
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pnid}/messages`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs), // Graph lenta não pode prender o handler
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[waSender] %s erro %d: %s', rotulo, res.status, JSON.stringify(json));
      return { sent: false, reason: 'api_error', status: res.status, detail: json, to: payload.to };
    }
    return { sent: true, to: payload.to, messageId: json.messages?.[0]?.id || null };
  } catch (err) {
    console.error('[waSender] %s exception: %s', rotulo, err.message);
    return { sent: false, reason: 'exception', detail: err.message, to: payload.to };
  }
}

// Texto livre (janela de 24h). Cap 4096 chars (limite da Meta).
async function sendText(toRaw, texto, opts = {}) {
  const to = normalizarTelefone(toRaw);
  if (!to) return { sent: false, reason: 'invalid_phone' };
  return postMessages({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: String(texto).slice(0, 4096), preview_url: false },
  }, { ...opts, rotulo: 'text' });
}

// Template aprovado (proativo · fora da janela). params → body {{1}}..{{n}}.
async function sendTemplate(toRaw, templateName, language, params = [], opts = {}) {
  if (!templateName) return { sent: false, reason: 'template_nao_configurado' };
  const to = normalizarTelefone(toRaw);
  if (!to) return { sent: false, reason: 'invalid_phone' };
  return postMessages({
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
  }, { ...opts, rotulo: `template:${templateName}` });
}

// Botões de resposta (janela de 24h · máx 3 · title <= 20 · id <= 256).
async function sendButtons(toRaw, corpo, botoes, opts = {}) {
  const to = normalizarTelefone(toRaw);
  if (!to) return { sent: false, reason: 'invalid_phone' };
  const buttons = (botoes || []).slice(0, 3).map(b => ({
    type: 'reply', reply: { id: String(b.id).slice(0, 256), title: String(b.title).slice(0, 20) },
  }));
  return postMessages({
    messaging_product: 'whatsapp', to, type: 'interactive',
    interactive: { type: 'button', body: { text: String(corpo).slice(0, 1024) }, action: { buttons } },
  }, { ...opts, rotulo: 'buttons' });
}

// Mídia (imagem/documento) por LINK público.
async function sendMedia(toRaw, kind, link, { filename, caption, ...opts } = {}) {
  const to = normalizarTelefone(toRaw);
  if (!to) return { sent: false, reason: 'invalid_phone' };
  if (!link) return { sent: false, reason: 'sem_link' };
  const midia = kind === 'document'
    ? { link, ...(filename ? { filename } : {}), ...(caption ? { caption } : {}) }
    : { link, ...(caption ? { caption } : {}) };
  return postMessages({
    messaging_product: 'whatsapp', to, type: kind, [kind]: midia,
  }, { ...opts, timeoutMs: 20000, rotulo: kind });
}

// Baixa mídia recebida (2 fetches: metadados → binário). Cap 16MB.
async function baixarMedia(mediaId) {
  const tk = token();
  if (!mediaId || !tk) return null;
  try {
    const meta = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
      headers: { Authorization: `Bearer ${tk}` }, signal: AbortSignal.timeout(15000),
    }).then(r => r.json()).catch(() => null);
    if (!meta?.url) return null;
    const resp = await fetch(meta.url, { headers: { Authorization: `Bearer ${tk}` }, signal: AbortSignal.timeout(20000) });
    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.length > 16 * 1024 * 1024) return null;
    return { buffer, mime: meta.mime_type || resp.headers.get('content-type') || 'application/octet-stream' };
  } catch (err) { console.error('[waSender] baixarMedia:', err.message); return null; }
}

module.exports = {
  GRAPH_VERSION,
  isConfigured,
  normalizarTelefone,
  sendText,
  sendTemplate,
  sendButtons,
  sendMedia,
  baixarMedia,
};
