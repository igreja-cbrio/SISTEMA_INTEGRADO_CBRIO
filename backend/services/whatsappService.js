// WhatsApp Cloud API (Meta) — envio de mensagens transacionais.
//
// Feature flag · so envia se WHATSAPP_ENABLED === 'true' E todas as credenciais
// estão presentes. Caso contrario, loga e retorna { sent: false }.
//
// Credenciais necessárias (env vars):
//   WHATSAPP_TOKEN              · access token permanente do app Meta
//   WHATSAPP_PHONE_NUMBER_ID    · ID do número registrado (não o número em si)
//   WHATSAPP_BUSINESS_ACCOUNT_ID · WABA ID (opcional · so para listar templates)
//
// Templates de utility precisam estar aprovados no Meta Business Manager
// antes de funcionar. Sugestão de template:
//
//   Nome:  pedido_atualizado
//   Idioma: pt_BR
//   Categoria: UTILITY
//   Corpo:
//     Olá {{1}}, sua solicitação "{{2}}" teve uma atualização:
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

// Normaliza telefone para E.164 brasileiro (55 + DDD + número, so digitos).
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

// Envia notificação de atualização de pedido (template `pedido_atualizado`).
// vars: { primeiroNome, tituloSolicitacao, statusLabel, detalhe, link }
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

// Envia devocional diario (template `devocional_diario`).
// Body esperado no template (3 params):
//   "Bom dia, {{1}}! Seu devocional de hoje: {{2}}. Leia em: {{3}}"
// vars: { primeiroNome, título, link }
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
// Token: usa WHATSAPP_ACCESS_TOKEN (o mesmo do bot, já em prod) ou WHATSAPP_TOKEN.
// ============================================================
const { supabase } = require('../utils/supabase');

const TEMPLATES_APP = {
  inscricao_confirmada: process.env.WHATSAPP_TEMPLATE_INSCRICAO,      // {{1}} nome · {{2}} tipo
  doacao_recebida:      process.env.WHATSAPP_TEMPLATE_DOACAO,         // {{1}} valor · {{2}} tipo
  kids_vinculo:         process.env.WHATSAPP_TEMPLATE_KIDS_VINCULO,   // {{1}} criança · {{2}} aprovado/recusado
  kids_precheckin:      process.env.WHATSAPP_TEMPLATE_KIDS_PRECHECKIN,// {{1}} responsável (ou código)
  batismo_lembrete:     process.env.WHATSAPP_TEMPLATE_BATISMO,        // {{1}} data · {{2}} hora
  escala_voluntario:    process.env.WHATSAPP_TEMPLATE_ESCALA,         // {{1}} ministério · {{2}} evento · {{3}} quando
  aniversario:          process.env.WHATSAPP_TEMPLATE_ANIVERSARIO,    // {{1}} nome (Marketing)
  pedido_atualizado:    process.env.WHATSAPP_TEMPLATE_PEDIDO,         // {{1}} nome {{2}} solicitação {{3}} status {{4}} detalhe {{5}} link
};
const TEMPLATES_MARKETING = new Set(['aniversario']);
const OPTIN_SEMPRE = process.env.WHATSAPP_OPTIN_OBRIGATORIO === '1';
const ENVIO_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || TOKEN;

// Dispara um template pra um membro. NUNCA quebra o fluxo chamador (fire-and-forget).
// Retorna {skipped:'...'} quando não há o que fazer (template não configurado,
// sem telefone, sem opt-in em Marketing, etc.).
async function notificarMembro(membroId, chave, params = [], { idioma = TEMPLATE_LANG } = {}) {
  try {
    const templateName = TEMPLATES_APP[chave];
    if (!templateName) return { skipped: 'template_nao_configurado' }; // no-op até aprovar + setar env
    if (!ENVIO_TOKEN || !PHONE_NUMBER_ID) return { skipped: 'wpp_nao_configurado' };
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

    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;
    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: idioma },
        components: params.length
          ? [{ type: 'body', parameters: params.map((tx) => ({ type: 'text', text: String(tx).slice(0, 1024) })) }]
          : undefined,
      },
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ENVIO_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[WPP] notificarMembro %s erro %d: %j', chave, res.status, json);
      return { sent: false, status: res.status };
    }
    return { sent: true, messageId: json.messages?.[0]?.id };
  } catch (e) {
    console.warn('[WPP] notificarMembro %s exception:', chave, e.message);
    return { error: e.message };
  }
}

module.exports = {
  configurado,
  normalizarTelefone,
  sendTemplate,
  sendPedidoAtualizado,
  sendDevocionalDiario,
  notificarMembro,
  TEMPLATES_APP,
};
