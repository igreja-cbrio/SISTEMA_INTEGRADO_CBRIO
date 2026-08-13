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
// Gate (revisto 2026-08-05 · achado da revisão do módulo Comunicação):
// - CREDENCIAL AUSENTE (dev/preview sem env de WhatsApp) → NÃO grava nada e
//   devolve { sent:false, reason:'disabled' } — ambiente sem WhatsApp não pode
//   encher a fila de produção com linha que o cron de prod enviaria depois.
// - CREDENCIAL PRESENTE + WHATSAPP_ENABLED desligado (kill-switch operacional)
//   → GRAVA como 'pendente' e NÃO tenta enviar: a mensagem espera e sai quando
//   religar (é o contrato documentado do notificarMembro — antes disso, o
//   kill-switch engolia confirmação de inscrição/kids/batismo SEM RASTRO).
//   O cron respeita o switch (processarFila retorna 'disabled' sem enviar).
const { supabase } = require('../utils/supabase');
const { sendTemplate, sendText, configurado } = require('./whatsappService');
const waSender = require('./waSender');
const { notificar } = require('./notificar');

// true = dá pra REGISTRAR (credencial existe), mesmo que o envio esteja
// bloqueado pelo kill-switch. false = ambiente sem WhatsApp, não grava.
function podeRegistrar() {
  return waSender.isConfigured();
}

const TEMPLATE_LANG = process.env.WHATSAPP_TEMPLATE_LANG || 'pt_BR';

// Backoff por tentativa (minutos): 30m → 2h → 6h → 12h → 24h.
const BACKOFF_MIN = [30, 120, 360, 720, 1440];

// ⚠️ NÃO DESISTIR ANTES DA JANELA DA META VIRAR (achado de 31/07/2026).
// A soma do backoff das 5 tentativas coloca a ÚLTIMA em t+20,5h da 1ª falha —
// e o teto do TIER_250 é uma janela MÓVEL de 24h. Cenário real do domingo de
// abertura: teto estoura às 11h (os 1ºs envios foram 9h, então a cota só começa
// a liberar 9h de segunda) → as 5 tentativas caem 11:00, 11:30, 13:30, 19:30 e
// 07:30 de segunda → a linha morria às 07:30, 1h30 ANTES de a cota liberar. Ou
// seja: a pessoa se inscrevia e o líder NUNCA recebia o link, e o plano do
// Marcos ("estourou o dia, sai no dia seguinte") não se cumpria.
// Correção: acabar as tentativas NÃO é motivo pra desistir enquanto a linha for
// mais nova que isto — segue pendente com nova tentativa a cada hora (o cron
// roda de hora em hora). Erro PERMANENTE continua desistindo na 1ª falha.
const IDADE_MIN_DESISTIR_H = 36;
const RETRY_APOS_ESGOTAR_MIN = 60;

// Rajada: quando a cota libera, o cron drena a fila de uma vez. Pessoa recebe 1
// mensagem, mas um LÍDER com N pedidos represados receberia N templates
// idênticos em segundos — que é exatamente o padrão que a Meta lê como spam e
// derruba a nota de qualidade (a nota é o que decide a subida de tier que a
// igreja quer). Máx 2 por telefone por rodada: 8 pedidos drenam em 4 horas.
const MAX_POR_TELEFONE_POR_RODADA = 2;

// Decisão de retry isolada em função PURA — é ela que decide se a pessoa recebe
// o link ou não, então precisa ser testável sem banco nem Meta.
// Devolve { status, tentativas, backoffMin, terminal }.
function decidirRetry({ reason, tentativas, maxTentativas, idadeHoras, permanente }) {
  // 'disabled' (env desligada no meio do caminho) nunca queima tentativa —
  // a linha espera o cron com a env de volta.
  if (reason === 'disabled') {
    return { status: 'pendente', tentativas, backoffMin: BACKOFF_MIN[0], terminal: false };
  }
  const n = tentativas + 1;
  if (permanente) return { status: 'erro', tentativas: n, backoffMin: BACKOFF_MIN[0], terminal: true };

  const acabaramTentativas = n >= (maxTentativas || 5);
  if (acabaramTentativas && idadeHoras >= IDADE_MIN_DESISTIR_H) {
    return { status: 'erro', tentativas: n, backoffMin: BACKOFF_MIN[0], terminal: true };
  }
  if (acabaramTentativas) {
    // Ainda dentro da janela em que faz sentido esperar a cota liberar.
    return { status: 'pendente', tentativas: n, backoffMin: RETRY_APOS_ESGOTAR_MIN, terminal: false };
  }
  return {
    status: 'pendente',
    tentativas: n,
    backoffMin: BACKOFF_MIN[Math.min(Math.max(n - 1, 0), BACKOFF_MIN.length - 1)],
    terminal: false,
  };
}

// Máx N por telefone por rodada, preservando a ordem (mais antigo primeiro).
function limitarPorTelefone(pendentes, max = MAX_POR_TELEFONE_POR_RODADA) {
  const conta = new Map();
  const saida = [];
  for (const p of pendentes || []) {
    const k = String(p.telefone || '');
    const n = (conta.get(k) || 0) + 1;
    conta.set(k, n);
    if (n <= max) saida.push(p);
  }
  return saida;
}

// Erro PERMANENTE não ganha retry: reenviar não muda o resultado (telefone
// inválido/rejeitado, template inexistente, param errado). O retry com
// backoff fica só pra falha passageira — o teto diário da Meta, que é o
// motivo de a fila existir. (Marcos · 27/07: "enviado 1 vez; reenvia só se
// deu problema no envio" — e problema definitivo avisa gente, não martela.)
// invalid_phone = normalização local (whatsappService) · códigos = Meta.
const CODIGOS_META_PERMANENTES = new Set([100, 131026, 131030, 132000, 132001, 132005, 132007, 132012]);
function falhaPermanente(r) {
  if (r.reason === 'invalid_phone') return true;
  if (r.reason === 'link_local') return true; // URL de dev no corpo — reenviar nunca resolve
  if (r.reason === 'api_error') return CODIGOS_META_PERMANENTES.has(Number(r.detail?.error?.code));
  return false;
}

// Falha TERMINAL (permanente ou esgotou as tentativas) vira notificação pros
// responsáveis do módulo do contexto ('grupos.pedido_novo_lider' → grupos ·
// sem regra configurada, cai no fallback admin/diretor do notificar). Sem
// isso o envio morre em silêncio — no teste de 26/07 a líder ficou sem os
// links de aprovação e ninguém soube até olhar a fila na mão.
async function avisarFalhaTerminal(e, razao) {
  try {
    // ⚠️ Era `contexto.split('.')[0]`, que resolvia 'app' pro aniversário e pros
    // demais disparos do app — módulo inexistente ⇒ fallback de TODOS os
    // admin/diretor. A régua vive em whatsappContexto (compartilhada com o
    // webhook, que trata a recusa de entrega REPORTADA depois do envio).
    const { moduloDoContexto } = require('./whatsappContexto');
    const { modulo, link } = moduloDoContexto(e.contexto);
    await notificar({
      modulo,
      tipo: 'whatsapp_envio_falhou',
      titulo: 'Mensagem de WhatsApp não entregue',
      mensagem: `${e.tipo === 'texto' ? 'A mensagem de texto' : `O template "${e.template}"`} para o telefone ${e.telefone} falhou de vez (${String(razao).slice(0, 140)}). Contexto: ${e.contexto || '—'}. Confira o telefone no cadastro e reenvie.`,
      link,
      severidade: 'aviso',
      chaveDedup: `wpp_envio_falha_${e.id}`,
    });
  } catch (err) {
    console.warn('[whatsappFila] aviso de falha terminal:', err.message);
  }
}

// C2: aceita TEMPLATE (proativo) ou TEXTO (janela 24h · `texto`). Toda saída
// fica registrada — é a fila que dá o histórico universal do módulo Comunicação.
async function enfileirar({ telefone, template, texto, params, contexto, refId, idioma }) {
  if (!podeRegistrar()) return { queued: false, sent: false, reason: 'disabled' };
  if (!telefone || (!template && !texto)) return { queued: false, sent: false, reason: 'dados_incompletos' };
  const tipo = texto && !template ? 'texto' : 'template';

  const { data: row, error } = await supabase.from('whatsapp_envios').insert({
    telefone,
    tipo,
    template: tipo === 'template' ? template : null,
    texto: tipo === 'texto' ? String(texto) : null,
    idioma: idioma || TEMPLATE_LANG,
    params: Array.isArray(params) ? params : [],
    contexto: contexto || null,
    ref_id: refId || null,
  }).select('id').single();

  if (error) {
    // Fila indisponível (ex.: migration ainda não aplicada) → degrada pro
    // envio direto, sem retry — melhor entregar do que travar o fluxo.
    console.error('[whatsappFila] insert falhou (envio direto):', error.message);
    const direto = tipo === 'texto'
      ? await sendText(telefone, texto)
      : await sendTemplate(telefone, template, idioma || TEMPLATE_LANG, params || []);
    return { queued: false, sent: direto.sent === true, reason: direto.sent ? null : (direto.reason || 'api_error'), messageId: direto.messageId || null };
  }

  // Kill-switch desligado: registrado e esperando — NÃO tenta agora (a
  // tentativa devolveria 'disabled' sem queimar tentativa, mas é round-trip à toa).
  if (!configurado()) return { queued: true, id: row.id, sent: false, reason: 'disabled' };

  const r = await tentarEnvio(row.id);
  return { queued: true, id: row.id, ...r };
}

// Tenta enviar UMA linha pendente da fila; atualiza status/tentativas/backoff.
async function tentarEnvio(id) {
  const { data: e, error } = await supabase.from('whatsapp_envios').select('*').eq('id', id).maybeSingle();
  if (error || !e) return { sent: false, reason: 'nao_encontrado' };
  if (e.status !== 'pendente') return { sent: false, reason: `status_${e.status}` };

  const r = e.tipo === 'texto'
    ? await sendText(e.telefone, e.texto)
    : await sendTemplate(e.telefone, e.template, e.idioma, Array.isArray(e.params) ? e.params : []);

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

  const razao = r.reason === 'api_error'
    ? (r.detail?.error?.message || `HTTP ${r.status || '?'}`)
    : (r.reason || 'erro_desconhecido');
  const idadeHoras = e.criado_em
    ? (Date.now() - new Date(e.criado_em).getTime()) / 3600000
    : 0;
  const d = decidirRetry({
    reason: r.reason,
    tentativas: e.tentativas || 0,
    maxTentativas: e.max_tentativas || 5,
    idadeHoras,
    permanente: falhaPermanente(r),
  });

  await supabase.from('whatsapp_envios').update({
    status: d.status,
    tentativas: d.tentativas,
    erro: String(razao).slice(0, 500),
    proxima_tentativa_em: new Date(Date.now() + d.backoffMin * 60000).toISOString(),
  }).eq('id', id);

  if (d.terminal) await avisarFalhaTerminal(e, razao);

  return { sent: false, reason: razao };
}

// Insere N envios de uma vez SEM tentativa imediata (nascem 'pendente' com
// proxima_tentativa_em = now() pelo default da coluna) — o cron horário da
// fila drena com o backoff/cap habituais. Pra remessa em massa (ex.: pedido
// mensal de frequência dos grupos): um loop síncrono de Meta API na function
// serverless estoura o tempo de execução conforme a base de grupos cresce.
async function enfileirarLote(itens) {
  if (!podeRegistrar()) return { queued: 0, motivo: 'disabled' };
  const linhas = (itens || [])
    .filter(i => i && i.telefone && (i.template || i.texto))
    .map(i => {
      const tipo = i.texto && !i.template ? 'texto' : 'template';
      return {
        telefone: i.telefone,
        tipo,
        template: tipo === 'template' ? i.template : null,
        texto: tipo === 'texto' ? String(i.texto) : null,
        idioma: i.idioma || TEMPLATE_LANG,
        params: Array.isArray(i.params) ? i.params : [],
        contexto: i.contexto || null,
        ref_id: i.refId || null,
      };
    });
  if (!linhas.length) return { queued: 0 };
  const { data, error } = await supabase.from('whatsapp_envios').insert(linhas).select('id');
  if (error) {
    // Fila indisponível → degrada pro caminho individual (que por sua vez
    // degrada pro envio direto) — melhor entregar do que travar o cron.
    console.error('[whatsappFila] lote falhou, caindo pro individual:', error.message);
    let ok = 0;
    for (const i of itens) {
      const r = await enfileirar(i);
      if (r.sent || r.queued) ok += 1;
    }
    return { queued: ok, degradado: true };
  }
  return { queued: (data || []).length };
}

// Reprocessa a fila (cron): envia o que está pendente e vencido, mais antigo
// primeiro. Cap por rodada — o excedente fica pra próxima hora (não adianta
// martelar a Meta com o teto diário estourado).
async function processarFila({ limite = 200 } = {}) {
  if (!configurado()) return { processados: 0, enviados: 0, motivo: 'disabled' };
  const agora = new Date().toISOString();
  const { data: pendentes, error } = await supabase.from('whatsapp_envios')
    .select('id, telefone')
    .eq('status', 'pendente')
    .lte('proxima_tentativa_em', agora)
    .order('criado_em', { ascending: true })
    .limit(limite);
  if (error) return { processados: 0, enviados: 0, erro: error.message };

  // Suaviza a rajada por destinatário (ver MAX_POR_TELEFONE_POR_RODADA). O que
  // ficou de fora não perde a vez: segue pendente e vencido, entra na próxima
  // hora — e como veio ordenado por criado_em, o mais antigo é o que passa.
  const naRodada = limitarPorTelefone(pendentes || []);
  let enviados = 0;
  for (const p of naRodada) {
    const r = await tentarEnvio(p.id);
    if (r.sent) enviados += 1;
  }
  return {
    processados: naRodada.length,
    enviados,
    adiadosPorTelefone: (pendentes || []).length - naRodada.length,
  };
}

module.exports = {
  enfileirar, enfileirarLote, processarFila, tentarEnvio,
  // Puras — exportadas pro teste (decidem se a pessoa recebe o link ou não).
  decidirRetry, limitarPorTelefone, falhaPermanente,
  IDADE_MIN_DESISTIR_H, MAX_POR_TELEFONE_POR_RODADA, BACKOFF_MIN,
};
