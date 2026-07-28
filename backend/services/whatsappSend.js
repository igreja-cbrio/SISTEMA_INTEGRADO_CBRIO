// whatsappSend — WRAPPER de compatibilidade (deprecado · Módulo Comunicação C1).
// A camada HTTP real agora é services/waSender.js (Graph v21 única). Este
// arquivo mantém a assinatura antiga ({ ok, message_id, error }) pros call
// sites do bot/triagem/nota/alertas — que migram pro waSender por arquivo em
// fases seguintes. Não adicionar função nova aqui; usar o waSender.
const waSender = require('./waSender');

function isConfigured() {
  return waSender.isConfigured();
}

// Normalização "loose" (comportamento histórico deste arquivo): devolve os
// dígitos mesmo quando o tamanho não casa — a Meta rejeita e o erro volta.
function normalizarTelefone(raw) {
  return waSender.normalizarTelefone(raw); // default loose · '' quando vazio
}

// Traduz o contrato novo ({ sent, messageId, reason, detail }) pro antigo
// ({ ok, message_id, error }) que os chamadores deste wrapper esperam.
function traduz(r) {
  if (r.sent) return { ok: true, message_id: r.messageId || null };
  const error = r.reason === 'sem_credencial'
    ? 'whatsapp_nao_configurado'
    : (r.detail?.error?.message || (r.status ? `HTTP ${r.status}` : null) || r.detail || r.reason || 'erro');
  return { ok: false, error };
}

// Envia texto simples. Retorna { ok, message_id?, error? }.
async function enviarTexto(telefone, texto) {
  return traduz(await waSender.sendText(telefone, texto));
}

// Envia TEMPLATE aprovado. Retorna { ok, message_id?, error? }.
async function enviarTemplate(telefone, templateName, language, params = []) {
  if (!templateName) return { ok: false, error: 'template_nao_configurado' };
  return traduz(await waSender.sendTemplate(telefone, templateName, language, params));
}

module.exports = { enviarTexto, enviarTemplate, normalizarTelefone, isConfigured };
