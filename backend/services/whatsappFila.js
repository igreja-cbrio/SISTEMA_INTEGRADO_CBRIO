// Fila de envios de template WhatsApp — registro + reenvio automático.
//
// Por que existe: o limite de envio da Meta é uma janela móvel de 24h por
// pessoas únicas (portfólio hoje em TIER_250). No pico das inscrições da
// temporada de grupos, o que passar do teto FALHA na hora — a fila guarda,
// o cron horário reprocessa com backoff e o envio sai quando a janela libera
// (plano do Marcos: "estourou o dia, sai no dia seguinte").
//
// Uso: enfileirar(...) grava e JÁ TENTA enviar (caminho feliz = tempo real,
// mesma latência de antes). Falhou → fica pendente com backoff crescente;
// processarFila() (cron /api/public/grupos/cron/whatsapp-fila) reenvia.
//
// Gate: mesma condição do whatsappService (WHATSAPP_ENABLED + credenciais).
// Desligado → NÃO grava nada e devolve { sent:false, reason:'disabled' } —
// o comportamento do sistema fica idêntico ao de hoje (e nenhum link
// tokenizado para em log/banco à toa).
const { supabase } = require('../utils/supabase');
const { sendTemplate, configurado } = require('./whatsappService');

const TEMPLATE_LANG = process.env.WHATSAPP_TEMPLATE_LANG || 'pt_BR';

// Backoff por tentativa (minutos): 30m → 2h → 6h → 12h → 24h.
const BACKOFF_MIN = [30, 120, 360, 720, 1440];

async function enfileirar({ telefone, template, params, contexto, refId, idioma }) {
  if (!configurado()) return { queued: false, sent: false, reason: 'disabled' };
  if (!telefone || !template) return { queued: false, sent: false, reason: 'dados_incompletos' };

  const { data: row, error } = await supabase.from('whatsapp_envios').insert({
    telefone,
    template,
    idioma: idioma || TEMPLATE_LANG,
    params: Array.isArray(params) ? params : [],
    contexto: contexto || null,
    ref_id: refId || null,
  }).select('id').single();

  if (error) {
    // Fila indisponível (ex.: migration ainda não aplicada) → degrada pro
    // envio direto, sem retry — melhor entregar do que travar o fluxo.
    console.error('[whatsappFila] insert falhou (envio direto):', error.message);
    const direto = await sendTemplate(telefone, template, idioma || TEMPLATE_LANG, params || []);
    return { queued: false, sent: direto.sent === true, reason: direto.sent ? null : (direto.reason || 'api_error'), messageId: direto.messageId || null };
  }

  const r = await tentarEnvio(row.id);
  return { queued: true, id: row.id, ...r };
}

// Tenta enviar UMA linha pendente da fila; atualiza status/tentativas/backoff.
async function tentarEnvio(id) {
  const { data: e, error } = await supabase.from('whatsapp_envios').select('*').eq('id', id).maybeSingle();
  if (error || !e) return { sent: false, reason: 'nao_encontrado' };
  if (e.status !== 'pendente') return { sent: false, reason: `status_${e.status}` };

  const r = await sendTemplate(e.telefone, e.template, e.idioma, Array.isArray(e.params) ? e.params : []);

  if (r.sent) {
    await supabase.from('whatsapp_envios').update({
      status: 'enviado',
      tentativas: (e.tentativas || 0) + 1,
      message_id: r.messageId || null,
      erro: null,
      enviado_em: new Date().toISOString(),
    }).eq('id', id);
    return { sent: true, messageId: r.messageId || null };
  }

  // 'disabled' (env desligada no meio do caminho) não queima tentativa —
  // a linha espera o cron com a env de volta.
  const razao = r.reason === 'api_error'
    ? (r.detail?.error?.message || `HTTP ${r.status || '?'}`)
    : (r.reason || 'erro_desconhecido');
  const tentativas = r.reason === 'disabled' ? (e.tentativas || 0) : (e.tentativas || 0) + 1;
  const esgotou = r.reason !== 'disabled' && tentativas >= (e.max_tentativas || 5);
  const backoffMin = BACKOFF_MIN[Math.min(Math.max(tentativas - 1, 0), BACKOFF_MIN.length - 1)];

  await supabase.from('whatsapp_envios').update({
    status: esgotou ? 'erro' : 'pendente',
    tentativas,
    erro: String(razao).slice(0, 500),
    proxima_tentativa_em: new Date(Date.now() + backoffMin * 60000).toISOString(),
  }).eq('id', id);

  return { sent: false, reason: razao };
}

// Reprocessa a fila (cron): envia o que está pendente e vencido, mais antigo
// primeiro. Cap por rodada — o excedente fica pra próxima hora (não adianta
// martelar a Meta com o teto diário estourado).
async function processarFila({ limite = 200 } = {}) {
  if (!configurado()) return { processados: 0, enviados: 0, motivo: 'disabled' };
  const agora = new Date().toISOString();
  const { data: pendentes, error } = await supabase.from('whatsapp_envios')
    .select('id')
    .eq('status', 'pendente')
    .lte('proxima_tentativa_em', agora)
    .order('criado_em', { ascending: true })
    .limit(limite);
  if (error) return { processados: 0, enviados: 0, erro: error.message };

  let enviados = 0;
  for (const p of pendentes || []) {
    const r = await tentarEnvio(p.id);
    if (r.sent) enviados += 1;
  }
  return { processados: (pendentes || []).length, enviados };
}

module.exports = { enfileirar, processarFila, tentarEnvio };
