// Push pro APP de membros (Expo) direto do backend do sistema.
// Espelha a Edge Function _shared/notify.ts do app: grava em app_notificacoes
// (histórico in-app) e dispara via Expo Push API pros tokens de app_push_tokens.
// No-op gracioso se não houver token. Não usar pra push do ERP web (esse é o
// webpush.js/VAPID).
const { supabase } = require('../utils/supabase');
const { fetchAllRows } = require('../utils/pagination');
// ⚠️ Régua gêmea de `Aplicativo-CBRio/lib/pushLotes.ts` — ver o cabeçalho de lá.
const { lotesDePush, tokenMorreu } = require('../utils/pushLotes');

// ⚠️⚠️ LEITURA DE TOKEN É PAGINADA E EM LOTES (auditoria 06/08/2026).
// Duas armadilhas somadas, as duas SILENCIOSAS:
//   1. o PostgREST capa em 1000 linhas server-side (sem erro), então a partir de
//      ~1.000 instalações o broadcast alcançava só o primeiro pedaço da base —
//      a igreja "não recebia o aviso" e nenhum log acusava. Medido em 06/08: 29
//      tokens hoje, ou seja gatilho armado, não estrago consumado.
//   2. `.in()` com a lista inteira estoura a URL do PostgREST e a query falha
//      INTEIRA — mesma lição do `.in()` gigante da Onda 1 de performance.
// Régua da casa: leitura de tabela que cresce com o uso vai por `fetchAllRows`,
// e `.in()` sempre em lotes de <= 200.
const LOTE_IN = 200;

async function lerEmLotes(ids, build) {
  const out = [];
  for (let i = 0; i < ids.length; i += LOTE_IN) {
    const fatia = ids.slice(i, i + LOTE_IN);
    out.push(...(await fetchAllRows(() => build(fatia))));
  }
  return out;
}

function safeText(value, max = 500) {
  return value == null ? null : String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) || null;
}

async function persistExpoTickets(items) {
  if (!items.length) return;
  const { error } = await supabase.from('system_mobile_push_tickets').insert(items);
  if (error) console.warn('[appPush] histórico de tickets:', error.message);
}

// Resolve membro_id -> user_id (profiles.id) quando vier por membro.
async function membrosParaUsuarios(membroIds) {
  if (!membroIds?.length) return [];
  const rows = await lerEmLotes(
    [...new Set(membroIds.filter(Boolean))],
    (fatia) => supabase.from('profiles').select('id').in('membro_id', fatia),
  );
  return rows.map((p) => p.id).filter(Boolean);
}

// Dispara push Expo (SEM gravar histórico in-app) pros tokens registrados em
// app_push_tokens dos usuários informados. Best-effort: nunca lança — loga e
// retorna { enviados: 0 } em caso de erro. Lotes de até 100 (limite da Expo
// Push API por request).
async function pushExpoParaUsers(userIds, { title, body, data } = {}) {
  try {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (!ids.length || !title) return { enviados: 0 };

    // ⚠️ `projeto_id` num SELECT que pode não existir ainda: se a migration
    // `20260807220000` não tiver rodado, o PostgREST derruba a query INTEIRA por
    // coluna desconhecida (não devolve "0 linhas" — falha tudo). Sem este
    // resgate, o push pararia em vez de só perder o agrupamento.
    let toks;
    try {
      toks = await lerEmLotes(
        ids,
        (fatia) => supabase.from('app_push_tokens').select('token,platform,projeto_id').in('user_id', fatia),
      );
    } catch (e) {
      if (!/projeto_id/i.test(String(e?.message || ''))) throw e;
      console.warn('[appPush] coluna projeto_id ausente — rode a migration 20260807220000');
      toks = await lerEmLotes(
        ids,
        (fatia) => supabase.from('app_push_tokens').select('token,platform').in('user_id', fatia),
      );
    }

    // ⚠️⚠️ AGRUPA POR APP EXPO (07/08/2026). Aqui o chunk era só de 100, POR
    // ORDEM DE LEITURA — e `app_push_tokens` recebe token de DOIS apps Expo
    // (membros e CBRio Staff). A Expo recusa o REQUEST INTEIRO quando eles vão
    // juntos: 1.801 de 1.820 tickets em erro, 1.773 com
    // `PUSH_TOO_MANY_EXPERIENCE_IDS`. Um token do Staff derrubava a entrega dos
    // 30 tokens iOS válidos. A dedupe por token agora vive na régua.
    const lotes = lotesDePush(toks || []);
    if (!lotes.length) return { enviados: 0 };
    const totalMensagens = lotes.reduce((n, l) => n + l.length, 0);

    let aceitos = 0;
    let erros = 0;
    const mortos = [];
    for (const chunkTokens of lotes) {
      const chunk = chunkTokens.map((item) => ({
        to: item.token,
        // ⚠️ `cbrio_chime.wav` com UNDERSCORE — é o nome do asset em
        // `app.json:55` e do canal Android em `lib/push.ts:40`. Aqui estava
        // `cbrio-chime.wav` com hífen: som que não existe, então o iOS caía no
        // silêncio/padrão em todo push disparado pelo ERP.
        sound: 'cbrio_chime.wav',
        channelId: 'default',
        title,
        body,
        data: data || {},
      }));
      try {
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(chunk),
        });
        const payload = await response.json().catch(() => ({}));
        const tickets = Array.isArray(payload?.data) ? payload.data : [];
        const rows = chunkTokens.map((token, index) => {
          const ticket = tickets[index] || {};
          const accepted = response.ok && ticket.status === 'ok' && ticket.id;
          if (accepted) aceitos += 1;
          else erros += 1;
          const code = ticket.details?.error || payload?.errors?.[0]?.code || `HTTP_${response.status}`;
          // ⚠️ SÓ `DeviceNotRegistered` some. Apagar por erro de LOTE teria
          // zerado a tabela — 1.773 tickets traziam
          // `PUSH_TOO_MANY_EXPERIENCE_IDS`, culpa do request e não do token.
          if (!accepted && tokenMorreu(code)) mortos.push(token.token);
          return {
            provider_ticket_id: accepted ? safeText(ticket.id, 160) : null,
            platform: ['android', 'ios'].includes(String(token.platform).toLowerCase()) ? String(token.platform).toLowerCase() : 'unknown',
            ticket_status: accepted ? 'accepted' : 'error',
            ticket_error_code: accepted ? null : safeText(ticket.details?.error || payload?.errors?.[0]?.code || `HTTP_${response.status}`, 120),
            ticket_error_message: accepted ? null : safeText(ticket.message || payload?.errors?.[0]?.message, 500),
          };
        });
        await persistExpoTickets(rows);
      } catch (error) {
        erros += chunk.length;
        console.error('[appPush] Expo:', error.message);
        await persistExpoTickets(chunkTokens.map((token) => ({
          platform: ['android', 'ios'].includes(String(token.platform).toLowerCase()) ? String(token.platform).toLowerCase() : 'unknown',
          ticket_status: 'error',
          ticket_error_code: 'NETWORK_ERROR',
          ticket_error_message: safeText(error.message, 500),
        })));
      }
    }

    // Limpeza best-effort dos tokens que a Expo declarou permanentemente mortos.
    if (mortos.length) {
      const { error } = await supabase.from('app_push_tokens').delete().in('token', mortos);
      if (error) console.warn('[appPush] limpar tokens mortos:', error.message);
    }

    return { enviados: totalMensagens, aceitos, erros };
  } catch (e) {
    console.error('[appPush] pushExpoParaUsers erro:', e.message);
    return { enviados: 0 };
  }
}

async function notificarApp(userIds, payload) {
  try {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (!ids.length) return { enviados: 0 };

    // 1) histórico in-app (1 por user)
    const rows = ids.map((u) => ({
      user_id: u, tipo: payload.tipo, titulo: payload.titulo,
      body: payload.body, data: payload.data || {},
    }));
    await supabase.from('app_notificacoes').insert(rows);

    // 2) push Expo pros tokens
    const { enviados } = await pushExpoParaUsers(ids, {
      title: payload.titulo,
      body: payload.body,
      data: { tipo: payload.tipo, ...(payload.data || {}) },
    });
    return { enviados, persistidos: rows.length };
  } catch (e) {
    console.error('[appPush] erro:', e.message);
    return { enviados: 0 };
  }
}

module.exports = { notificarApp, membrosParaUsuarios, pushExpoParaUsers };
