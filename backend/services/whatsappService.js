// whatsappService — WRAPPER de compatibilidade (deprecado · Módulo Comunicação C1).
// A camada HTTP real agora é services/waSender.js (Graph v21 única · antes este
// arquivo falava v18 com token legado). O que CONTINUA morando aqui — e é
// semântica deste wrapper, não da camada HTTP:
//   · gate WHATSAPP_ENABLED + DRY-RUN (transacionais só saem com a flag ligada;
//     a fila depende do reason 'disabled' pra não queimar tentativa);
//   · normalização STRICT de telefone (null quando não reconhece o padrão);
//   · notificarMembro (opt-in/Marketing + mapa TEMPLATES_APP por env);
//   · helpers sendPedidoAtualizado/sendDevocionalDiario.
// Call sites migram pro waSender por arquivo em fases seguintes.

const waSender = require('./waSender');

const ENABLED = process.env.WHATSAPP_ENABLED === 'true';
const TEMPLATE_PEDIDO = process.env.WHATSAPP_TEMPLATE_PEDIDO || 'pedido_atualizado';
const TEMPLATE_LANG = process.env.WHATSAPP_TEMPLATE_LANG || 'pt_BR';

function configurado() {
  return !!(ENABLED && waSender.isConfigured());
}

// Normaliza telefone para E.164 brasileiro (55 + DDD + número, só dígitos).
// STRICT (histórico deste arquivo): null quando não reconhece o padrão.
function normalizarTelefone(raw) {
  return waSender.normalizarTelefone(raw, { strict: true });
}

// opts (multi-número): { phoneNumberId } — responde pelo número da conversa;
// sem ele, sai pelo número default da env. Repassado cru pro waSender.
async function sendTemplate(toRaw, templateName, language, parameters, opts = {}) {
  const to = normalizarTelefone(toRaw);
  if (!to) {
    return { sent: false, reason: 'invalid_phone', raw: toRaw };
  }
  if (!configurado()) {
    console.log('[WPP][DRY-RUN] template=%s lang=%s to=%s params=%j',
      templateName, language, to, parameters);
    return { sent: false, reason: 'disabled', to };
  }
  return waSender.sendTemplate(to, templateName, language, parameters || [], opts);
}

// Texto livre (janela de 24h). Fora da janela, a Meta exige template.
async function sendText(toRaw, texto, opts = {}) {
  const to = normalizarTelefone(toRaw);
  if (!to) return { sent: false, reason: 'invalid_phone' };
  if (!configurado()) {
    console.log('[WPP][DRY-RUN] text to=%s: %s', to, texto);
    return { sent: false, reason: 'disabled', to };
  }
  return waSender.sendText(to, texto, opts);
}

// Mensagem INTERATIVA com botões (janela de 24h · máx 3 · title <= 20).
async function sendButtons(toRaw, corpo, botoes, opts = {}) {
  const to = normalizarTelefone(toRaw);
  if (!to) return { sent: false, reason: 'invalid_phone' };
  if (!configurado()) { console.log('[WPP][DRY-RUN] buttons to=%s: %s', to, corpo); return { sent: false, reason: 'disabled', to }; }
  return waSender.sendButtons(to, corpo, botoes, opts);
}

// Mídia (imagem/documento) por LINK público. `kind` = 'image'|'document'.
async function sendMedia(toRaw, kind, link, { filename, caption, ...opts } = {}) {
  const to = normalizarTelefone(toRaw);
  if (!to) return { sent: false, reason: 'invalid_phone' };
  if (!link) return { sent: false, reason: 'sem_link' };
  if (!configurado()) { console.log('[WPP][DRY-RUN] %s to=%s: %s', kind, to, link); return { sent: false, reason: 'disabled', to }; }
  return waSender.sendMedia(to, kind, link, { filename, caption, ...opts });
}

// Baixa a mídia recebida da Meta. Sem gate ENABLED (histórico · webhook usa).
async function baixarMedia(mediaId) {
  return waSender.baixarMedia(mediaId);
}

// Notificação de atualização de pedido (template `pedido_atualizado`).
async function sendPedidoAtualizado(telefone, vars) {
  const params = [
    vars.primeiroNome || 'Ola',
    vars.tituloSolicitacao || 'sua solicitação',
    vars.statusLabel || 'atualizado',
    vars.detalhe || '',
    vars.link || '',
  ];
  return sendTemplate(telefone, TEMPLATE_PEDIDO, TEMPLATE_LANG, params);
}

// Devocional diário (template `devocional_diario` · 3 params).
const TEMPLATE_DEVOCIONAL = process.env.WHATSAPP_TEMPLATE_DEVOCIONAL || 'devocional_diario';
async function sendDevocionalDiario(telefone, vars) {
  const params = [
    vars.primeiroNome || 'Ola',
    vars.titulo || 'devocional do dia',
    vars.link || '',
  ];
  return sendTemplate(telefone, TEMPLATE_DEVOCIONAL, TEMPLATE_LANG, params);
}

// ============================================================
// Camada de envio pra MEMBRO (eventos do app) · plug-and-play
// ------------------------------------------------------------
// Lê o NOME do template aprovado por env (quando vazio = no-op gracioso),
// resolve telefone + opt-in do membro, e respeita o consentimento
// (obrigatório p/ Marketing · opcional p/ Utility via WHATSAPP_OPTIN_OBRIGATORIO).
// ⚠️ NÃO passa pelo gate WHATSAPP_ENABLED (histórico): envia com credencial
// presente — os fluxos do app dependem disso.
// ============================================================
const { supabase } = require('../utils/supabase');

const TEMPLATES_APP = {
  inscricao_confirmada: process.env.WHATSAPP_TEMPLATE_INSCRICAO,      // {{1}} nome · {{2}} tipo
  doacao_recebida:      process.env.WHATSAPP_TEMPLATE_DOACAO,         // {{1}} valor · {{2}} tipo
  kids_vinculo:         process.env.WHATSAPP_TEMPLATE_KIDS_VINCULO,   // {{1}} criança · {{2}} aprovado/recusado
  kids_precheckin:      process.env.WHATSAPP_TEMPLATE_KIDS_PRECHECKIN,// {{1}} responsável (ou código)
  batismo_lembrete:     process.env.WHATSAPP_TEMPLATE_BATISMO,        // {{1}} data · {{2}} hora
  escala_voluntario:    process.env.WHATSAPP_TEMPLATE_ESCALA,         // {{1}} ministério · {{2}} evento · {{3}} quando
  // Aniversário do VOLUNTARIADO ({{1}} nome). Usa o env ...ANIVERSARIO2
  // (o ...ANIVERSARIO antigo, genérico do app, foi aposentado — fallback só por segurança).
  aniversario:          process.env.WHATSAPP_TEMPLATE_ANIVERSARIO2 || process.env.WHATSAPP_TEMPLATE_ANIVERSARIO,
  pedido_atualizado:    process.env.WHATSAPP_TEMPLATE_PEDIDO,         // {{1}} nome {{2}} solicitação {{3}} status {{4}} detalhe {{5}} link
  familia_convite_aceito: process.env.WHATSAPP_TEMPLATE_FAMILIA_ACEITO, // {{1}} nome de quem aceitou
  // Ajuda com o app (29/08): {{1}} nome · {{2}} telefone · {{3}} dúvida.
  suporte_app:          process.env.WHATSAPP_TEMPLATE_SUPORTE_APP,
};
// Templates de categoria MARKETING (Meta exige opt-in · compliance).
// O aniversário é MARKETING de forma inescapável (verificado 2026-07-16):
// envio automático só sai pra quem tem whatsapp_optin=true.
const TEMPLATES_MARKETING = new Set(['aniversario']);
const OPTIN_SEMPRE = process.env.WHATSAPP_OPTIN_OBRIGATORIO === '1';

// Dispara um template pra um membro. NUNCA quebra o fluxo chamador (fire-and-forget).
// Retorna {skipped:'...'} quando não há o que fazer.
async function notificarMembro(membroId, chave, params = [], { idioma = TEMPLATE_LANG } = {}) {
  try {
    const templateName = TEMPLATES_APP[chave];
    if (!templateName) return { skipped: 'template_nao_configurado' }; // no-op até aprovar + setar env
    if (!waSender.isConfigured()) return { skipped: 'wpp_nao_configurado' };
    if (!membroId) return { skipped: 'sem_membro' };

    const { data: m } = await supabase
      .from('mem_membros')
      .select('telefone, whatsapp_optin')
      .eq('id', membroId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!m?.telefone) return { skipped: 'sem_telefone' };

    const exigeOptin = TEMPLATES_MARKETING.has(chave) || OPTIN_SEMPRE;
    if (exigeOptin && !m.whatsapp_optin) return { skipped: 'sem_optin' };

    const to = normalizarTelefone(m.telefone);
    if (!to) return { skipped: 'telefone_invalido' };

    // C2: sai pela FILA (registro universal + retry + statuses do C0). O envio
    // continua imediato (enfileirar tenta na hora); com o kill-switch global
    // desligado (WHATSAPP_ENABLED) fica pendente e sai quando religar.
    // Require lazy: a fila importa este arquivo (evita ciclo no load).
    const { enfileirar } = require('./whatsappFila');
    const r = await enfileirar({
      telefone: to,
      template: templateName,
      params,
      idioma,
      contexto: `app.${chave}`,
      refId: membroId,
    });
    if (!r.sent) {
      console.warn('[WPP] notificarMembro %s não saiu na hora: %j', chave, { reason: r.reason, queued: r.queued });
    }
    return r;
  } catch (e) {
    console.warn('[WPP] notificarMembro %s exception:', chave, e.message);
    return { error: e.message };
  }
}

module.exports = {
  configurado,
  normalizarTelefone,
  sendTemplate,
  sendText,
  sendButtons,
  sendMedia,
  baixarMedia,
  sendPedidoAtualizado,
  sendDevocionalDiario,
  notificarMembro,
  TEMPLATES_APP,
};
