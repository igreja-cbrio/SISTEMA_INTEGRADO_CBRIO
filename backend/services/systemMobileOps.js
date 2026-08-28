const crypto = require('node:crypto');
const { supabase } = require('../utils/supabase');
const { notificar } = require('./notificar');

const PLATFORMS = new Set(['android', 'ios']);
/**
 * Whitelist de `props` — o que não está aqui é DESCARTADO em silêncio (é a
 * trava de PII da telemetria). Medido em 04/08/2026: das 10 chaves que o app
 * mandava, só `message` passava; `{grupo: id}`, `{tipo}`, `{criado}` e
 * `{encontrado}` iam pro lixo sem erro. O app foi ajustado pra usar estas
 * chaves e ganhou duas:
 *  · `entity_id` — id de COISA (grupo, vídeo, comunicado). **Nunca de pessoa.**
 *  · `label` — rótulo curto e não-identificante, de enum NOSSO (tipo de decisão,
 *    parentesco). **Nunca texto que a pessoa digitou.**
 * Chave nova aqui exige a mesma decisão: ela pode identificar alguém?
 */
const ALLOWED_PROPS = new Set([
  'message', 'fatal', 'screen', 'route', 'action', 'reason', 'status_code',
  'endpoint', 'permission', 'notification_type', 'source', 'entity_id', 'label',
]);

function cleanText(value, max = 120) {
  if (value === undefined || value === null) return null;
  return String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) || null;
}

function normalizePlatform(value) {
  const platform = cleanText(value, 20)?.toLowerCase();
  return PLATFORMS.has(platform) ? platform : null;
}

function safeTimestamp(value) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  const now = Date.now();
  if (parsed.getTime() > now + 5 * 60 * 1000 || parsed.getTime() < now - 30 * 86400000) return null;
  return parsed.toISOString();
}

function sanitizeEndpoint(value) {
  const text = cleanText(value, 300);
  if (!text) return null;
  try {
    const parsed = new URL(text, 'https://mobile.invalid');
    return cleanText(parsed.pathname, 180);
  } catch {
    return cleanText(text.split('?')[0].split('#')[0], 180);
  }
}

function sanitizeProps(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const result = {};
  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED_PROPS.has(key)) continue;
    if (key === 'fatal') result.fatal = value === true || value === 1 || value === 'true';
    else if (key === 'status_code') {
      const status = Number.parseInt(value, 10);
      if (Number.isFinite(status) && status >= 100 && status <= 599) result.status_code = status;
    } else if (key === 'endpoint') {
      const endpoint = sanitizeEndpoint(value);
      if (endpoint) result.endpoint = endpoint;
    } else {
      const cleaned = cleanText(value, key === 'message' || key === 'reason' ? 500 : 160);
      if (cleaned) result[key] = cleaned;
    }
  }
  return Object.keys(result).length ? result : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * ⚠️⚠️ `event_id` SEMPRE preenchido AQUI — foi a ausência dele que matou a
 * telemetria do app inteira (04/08/2026 · último evento gravado: 31/07, o dia
 * em que a `20260731143000` criou a coluna).
 *
 * A coluna nasceu `NOT NULL DEFAULT gen_random_uuid()` e o DEFAULT existe em
 * produção (conferido: insert cru SEM a chave → 201). O que quebrava era o
 * CLIENTE: o app não manda `event_id`, o normalizador devolvia
 * `event_id: undefined` e `Object.keys()` **inclui** chave com undefined →
 * o supabase-js monta `?columns=…,event_id` → o PostgREST vê a coluna listada
 * e ausente no JSON e insere **NULL** → 23502, todo lote descartado. E o
 * handler responde `{ok:false}` com HTTP 200 ("telemetria não pode quebrar o
 * app"), então falhou em silêncio por 5 dias.
 *
 * Régua que fica: em upsert com `onConflict`, **toda linha tem que ter a chave
 * de conflito preenchida** — nem `undefined` (vira NULL pelo `?columns=`) nem
 * ausente em algumas linhas (o `?columns=` é a UNIÃO das chaves do lote).
 */
function eventIdValido(value) {
  return UUID_RE.test(value || '') ? value : crypto.randomUUID();
}

function normalizeMobileEvent(event, userId = null) {
  const type = ['tela', 'acao', 'erro', 'ping'].includes(event?.tipo) ? event.tipo : 'acao';
  const duration = Number.parseInt(event?.duration_ms, 10);
  return {
    tipo: type,
    nome: cleanText(event?.nome, 120) || 'desconhecido',
    props: sanitizeProps(event?.props),
    plataforma: normalizePlatform(event?.plataforma),
    app_version: cleanText(event?.app_version, 40),
    build_number: cleanText(event?.build_number, 40),
    // ⚠️ ONDA 3 (07/08): `app_version` é a versão do BUNDLE (veio no OTA) e é
    // '1.0.0' em 13.231 de 13.231 eventos — nunca distinguiu binário nenhum.
    // Quem identifica o BINÁRIO é `runtime_version` (compilada no build), e
    // `update_id` diz qual bundle está rodando. `is_embedded` responde "esta
    // sessão roda o bundle embutido?", que é o caso da 1ª abertura de toda
    // instalação nova — o achado irmão da versão mínima.
    // ⚠️ Saem SEMPRE, mesmo null: o upsert usa `?columns=` como UNIÃO das
    // chaves do lote, e chave ausente em parte das linhas quebra o INSERT
    // inteiro (a lição do `event_id`, que deixou a telemetria 5 dias morta).
    runtime_version: cleanText(event?.runtime_version, 40),
    update_id: cleanText(event?.update_id, 80),
    canal: cleanText(event?.canal, 40),
    is_embedded: typeof event?.is_embedded === 'boolean' ? event.is_embedded : null,
    session_id: cleanText(event?.session_id, 80),
    installation_id: cleanText(event?.installation_id, 80),
    os_version: cleanText(event?.os_version, 40),
    device_model: cleanText(event?.device_model, 120),
    manufacturer: cleanText(event?.manufacturer, 80),
    network_type: cleanText(event?.network_type, 30),
    duration_ms: Number.isFinite(duration) && duration >= 0 && duration <= 600000 ? duration : null,
    outcome: cleanText(event?.outcome, 30),
    is_offline: typeof event?.is_offline === 'boolean' ? event.is_offline : null,
    occurred_at: safeTimestamp(event?.occurred_at),
    // Id do app quando vier (dá idempotência real no reenvio); senão o nosso.
    event_id: eventIdValido(event?.event_id),
    user_id: userId,
  };
}

function normalizeMobileTelemetryBatch(events, userId = null) {
  return (Array.isArray(events) ? events : []).slice(0, 50).map((event) => normalizeMobileEvent(event, userId));
}

async function mobileSentry(platform) {
  const token = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;
  const project = platform === 'ios' ? process.env.SENTRY_PROJECT_IOS : process.env.SENTRY_PROJECT_ANDROID;
  const missing = [];
  if (!token) missing.push('SENTRY_AUTH_TOKEN');
  if (!org) missing.push('SENTRY_ORG');
  if (!project) missing.push(platform === 'ios' ? 'SENTRY_PROJECT_IOS' : 'SENTRY_PROJECT_ANDROID');
  if (missing.length) return { state: 'external_pending', missing, issues: [] };

  const url = new URL(`https://sentry.io/api/0/organizations/${encodeURIComponent(org)}/issues/`);
  url.searchParams.set('project', project);
  url.searchParams.set('query', 'is:unresolved');
  url.searchParams.set('sort', 'freq');
  url.searchParams.set('statsPeriod', '14d');
  url.searchParams.set('limit', '30');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    return {
      state: 'connected',
      issues: payload.map((issue) => ({
        id: cleanText(issue.id, 120),
        shortId: cleanText(issue.shortId, 80),
        title: cleanText(issue.title, 220),
        level: cleanText(issue.level, 30),
        count: Number(issue.count) || 0,
        users: Number(issue.userCount) || 0,
        lastSeen: issue.lastSeen || null,
        permalink: /^https:\/\/[^/]*sentry\.io\//.test(issue.permalink || '') ? issue.permalink : null,
      })),
    };
  } catch (error) {
    return { state: 'partial', error: error.name === 'AbortError' ? 'timeout' : 'source_unavailable', issues: [] };
  } finally {
    clearTimeout(timer);
  }
}

function storeAdapter(platform) {
  const required = platform === 'ios'
    ? ['APP_STORE_CONNECT_ISSUER_ID', 'APP_STORE_CONNECT_KEY_ID', 'APP_STORE_CONNECT_PRIVATE_KEY']
    : ['GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', 'GOOGLE_PLAY_PACKAGE_NAME'];
  const missing = required.filter((key) => !process.env[key]);
  return {
    state: missing.length ? 'external_pending' : 'partial',
    provider: platform === 'ios' ? 'App Store Connect' : 'Google Play Developer Reporting',
    missing,
    note: missing.length
      ? 'Credenciais ainda não configuradas.'
      : 'Credenciais presentes; coleta automática da loja ainda não foi ativada.',
  };
}

async function getMobileCommandCenter(platform, days = 14) {
  const normalized = normalizePlatform(platform);
  if (!normalized) {
    const error = new Error('Plataforma inválida.');
    error.code = 'INVALID_PLATFORM';
    throw error;
  }
  const safeDays = Math.min(Math.max(Number.parseInt(days, 10) || 14, 1), 30);
  const [{ data, error }, sentry] = await Promise.all([
    supabase.rpc('fn_system_mobile_overview', { p_platform: normalized, p_days: safeDays }),
    mobileSentry(normalized),
  ]);
  if (error) throw error;
  return {
    ...data,
    sources: {
      telemetry: { state: data?.lastEventAt ? 'connected' : 'partial' },
      sentry,
      store: storeAdapter(normalized),
      expo: {
        state: Number(data?.push?.total || 0) > 0 ? 'connected' : 'partial',
        trackedTickets: Number(data?.push?.total || 0),
        pendingReceipts: Number(data?.push?.pending_receipts || 0),
      },
    },
  };
}

/**
 * ⚠️⚠️ FECHA A JANELA DOS RECIBOS VENCIDOS (07/08/2026 · Onda 4).
 *
 * A Expo guarda recibo por ~24h, e `refreshExpoReceipts` só olha tickets dentro
 * dessa janela (`gte sent_at, -24h`). Então ticket que passou de 24h sem ser
 * conferido fica com `receipt_checked_at` NULL **PARA SEMPRE** — sai da fila de
 * trabalho e nunca é fechado.
 *
 * Sem isto a coluna mente por omissão: NULL passa a significar duas coisas
 * diferentes ("ainda não conferi" e "perdi o prazo"), e aí ninguém consegue
 * medir cobertura de entrega — que é justamente o buraco que deixou 1.801
 * falhas passarem dois meses.
 */
async function expirarRecibosVencidos() {
  const corte = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('system_mobile_push_tickets')
    .update({ receipt_status: 'expirado', receipt_checked_at: new Date().toISOString() })
    .is('receipt_checked_at', null)
    .not('provider_ticket_id', 'is', null)
    .lt('sent_at', corte)
    .select('id');
  if (error) throw error;
  return { expirados: data?.length || 0 };
}

/**
 * ⚠️⚠️ O ALERTA É O QUE VALE AQUI — não o recibo (07/08/2026).
 *
 * O que justifica: em 07/08 mediu-se **1.801 de 1.820 tickets em erro (98,9%)**,
 * 1.773 com `PUSH_TOO_MANY_EXPERIENCE_IDS`, acumulados por DOIS MESES. O dado
 * estava na tabela o tempo todo. **Ninguém olhava.** Coletar recibo sem alertar
 * repetiria exatamente o erro: encher outra coluna que ninguém lê.
 *
 * Dispara incidente quando:
 *  · a taxa de ACEITE em 24h cai abaixo de 90%, com **piso de 20 tickets** —
 *    sem o piso, um envio isolado que falha vira alarme falso e o aviso perde
 *    credibilidade (aviso que grita à toa é desligado, e aí volta a cegueira);
 *  · aparece **qualquer** `PUSH_TOO_MANY_EXPERIENCE_IDS`. Esse não tem limiar
 *    aceitável: significa que a régua de agrupamento por app Expo
 *    (`utils/pushLotes.js`) parou de funcionar, e o efeito é o request INTEIRO
 *    ser recusado — quem estava no mesmo lote também não recebeu. Um só já é
 *    regressão.
 *
 * ⚠️ `chaveDedup` fixa por DIA: o cron roda a cada 15 min e não pode virar 96
 * avisos iguais na caixa de entrada.
 */
async function alertarSaudeDoPush() {
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('system_mobile_push_tickets')
    .select('ticket_status,ticket_error_code')
    .gte('sent_at', desde);
  if (error) throw error;

  const tickets = data || [];
  const total = tickets.length;
  const aceitos = tickets.filter((t) => t.ticket_status === 'accepted').length;
  const mistura = tickets.filter((t) => t.ticket_error_code === 'PUSH_TOO_MANY_EXPERIENCE_IDS').length;
  const taxa = total ? aceitos / total : 1;

  const PISO_TICKETS = 20;
  const TAXA_MINIMA = 0.9;
  const hoje = new Date().toISOString().slice(0, 10);
  const alertas = [];

  if (mistura > 0) {
    alertas.push({
      tipo: 'push_lote_misturado',
      titulo: `Push recusado por mistura de apps (${mistura} em 24h)`,
      mensagem:
        `${mistura} envio(s) voltaram com PUSH_TOO_MANY_EXPERIENCE_IDS nas últimas 24h. `
        + 'A Expo recusa o REQUEST INTEIRO quando tokens de apps Expo diferentes vão juntos, '
        + 'então quem estava no mesmo lote também não recebeu. Conferir a régua de agrupamento '
        + '(backend/utils/pushLotes.js) e se `app_push_tokens.projeto_id` está sendo carimbado.',
      severidade: 'critico',
      chaveDedup: `push_lote_misturado_${hoje}`,
    });
  }

  if (total >= PISO_TICKETS && taxa < TAXA_MINIMA) {
    alertas.push({
      tipo: 'push_taxa_aceite_baixa',
      titulo: `Push: só ${Math.round(taxa * 100)}% aceitos em 24h`,
      mensagem:
        `${aceitos} de ${total} envios foram aceitos pela Expo nas últimas 24h. `
        + 'Entre junho e 07/08/2026 essa taxa ficou em 1% sem ninguém perceber, '
        + 'porque este aviso não existia.',
      severidade: 'aviso',
      chaveDedup: `push_taxa_aceite_${hoje}`,
    });
  }

  for (const a of alertas) {
    await notificar({ modulo: 'sistema', link: '/admin/app-analytics', ...a })
      .catch((e) => console.warn('[appPush] alerta:', e.message));
  }

  return { total, aceitos, mistura, taxa: Number(taxa.toFixed(4)), alertas: alertas.length };
}

async function refreshExpoReceipts(limit = 500) {
  const { data: pending, error } = await supabase
    .from('system_mobile_push_tickets')
    .select('id,provider_ticket_id')
    .not('provider_ticket_id', 'is', null)
    .is('receipt_checked_at', null)
    .lte('sent_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .gte('sent_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('sent_at', { ascending: true })
    .limit(Math.min(Math.max(Number(limit) || 500, 1), 1000));
  if (error) throw error;
  if (!pending?.length) return { checked: 0, delivered: 0, errors: 0, pending: 0 };

  const response = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ids: pending.map((item) => item.provider_ticket_id) }),
  });
  if (!response.ok) throw new Error(`Expo receipts respondeu HTTP ${response.status}`);
  const payload = await response.json();
  const receipts = payload?.data || {};
  let delivered = 0;
  let errors = 0;
  let checked = 0;
  for (const item of pending) {
    const receipt = receipts[item.provider_ticket_id];
    if (!receipt) continue;
    const isOk = receipt.status === 'ok';
    const patch = {
      receipt_status: isOk ? 'delivered_to_provider' : 'error',
      receipt_error_code: cleanText(receipt.details?.error, 120),
      receipt_error_message: cleanText(receipt.message, 500),
      receipt_checked_at: new Date().toISOString(),
    };
    const { error: updateError } = await supabase.from('system_mobile_push_tickets').update(patch).eq('id', item.id);
    if (updateError) throw updateError;
    checked += 1;
    if (isOk) delivered += 1;
    else errors += 1;
  }
  return { checked, delivered, errors, pending: pending.length - checked };
}

module.exports = {
  ALLOWED_PROPS,
  normalizePlatform,
  sanitizeProps,
  normalizeMobileEvent,
  normalizeMobileTelemetryBatch,
  getMobileCommandCenter,
  refreshExpoReceipts,
  expirarRecibosVencidos,
  alertarSaudeDoPush,
};
