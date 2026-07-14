// Push pro APP de membros (Expo) direto do backend do sistema.
// Espelha a Edge Function _shared/notify.ts do app: grava em app_notificacoes
// (histórico in-app) e dispara via Expo Push API pros tokens de app_push_tokens.
// No-op gracioso se não houver token. Não usar pra push do ERP web (esse é o
// webpush.js/VAPID).
const { supabase } = require('../utils/supabase');

// Resolve membro_id -> user_id (profiles.id) quando vier por membro.
async function membrosParaUsuarios(membroIds) {
  if (!membroIds?.length) return [];
  const { data } = await supabase.from('profiles').select('id').in('membro_id', membroIds);
  return (data || []).map((p) => p.id);
}

// Dispara push Expo (SEM gravar histórico in-app) pros tokens registrados em
// app_push_tokens dos usuários informados. Best-effort: nunca lança — loga e
// retorna { enviados: 0 } em caso de erro. Lotes de até 100 (limite da Expo
// Push API por request).
async function pushExpoParaUsers(userIds, { title, body, data } = {}) {
  try {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (!ids.length || !title) return { enviados: 0 };

    const { data: toks } = await supabase.from('app_push_tokens').select('token').in('user_id', ids);
    const tokens = [...new Set((toks || []).map((t) => t.token).filter(Boolean))];
    if (!tokens.length) return { enviados: 0 };

    const messages = tokens.map((to) => ({
      to,
      sound: 'cbrio-chime.wav',
      channelId: 'default',
      title,
      body,
      data: data || {},
    }));

    for (let i = 0; i < messages.length; i += 100) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messages.slice(i, i + 100)),
      }).catch((e) => console.error('[appPush] Expo:', e.message));
    }
    return { enviados: messages.length };
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
