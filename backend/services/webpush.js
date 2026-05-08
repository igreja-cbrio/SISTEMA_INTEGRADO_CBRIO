// Web Push wrapper — vira no-op se VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY
// nao estiverem configurados. Centraliza envio, remocao automatica de
// subscriptions invalidas (410/404) e logs.

const { supabase } = require('../utils/supabase');

let webpush = null;
let vapidConfigured = false;

function ensureInit() {
  if (vapidConfigured || webpush) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:contato@cbrio.com.br';
  if (!pub || !priv) return;
  try {
    webpush = require('web-push');
    webpush.setVapidDetails(subject, pub, priv);
    vapidConfigured = true;
    console.log('[webpush] VAPID configurado');
  } catch (e) {
    console.warn('[webpush] falha ao configurar VAPID:', e.message);
  }
}

function isEnabled() {
  ensureInit();
  return vapidConfigured;
}

function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

// Envia push para todos os endpoints registrados de uma lista de userIds.
// Auto-remove subscriptions com status 404/410 (gone).
async function enviarPushParaUsers(userIds, payload) {
  ensureInit();
  if (!vapidConfigured || !userIds?.length) return 0;

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('auth_user_id', userIds);

  if (!subs?.length) return 0;

  const body = JSON.stringify(payload || {});
  let sent = 0;
  const remover = [];

  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body
      );
      sent++;
    } catch (e) {
      const code = e?.statusCode;
      if (code === 404 || code === 410) {
        remover.push(s.id);
      } else {
        console.warn('[webpush] erro envio:', code, e?.body || e?.message);
      }
    }
  }));

  if (remover.length) {
    await supabase.from('push_subscriptions').delete().in('id', remover);
  }
  return sent;
}

module.exports = { isEnabled, getVapidPublicKey, enviarPushParaUsers };
