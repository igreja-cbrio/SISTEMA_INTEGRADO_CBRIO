// Service Worker do CBRio
// Responsabilidades:
// - Receber Web Push e mostrar notificacao
// - Abrir a URL associada quando o usuario clica

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try { payload = event.data.json(); } catch { payload = { title: 'CBRio', body: event.data.text() }; }

  const title = payload.title || 'CBRio';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/logo-cbrio-icon.png',
    badge: payload.badge || '/logo-cbrio-icon.png',
    tag: payload.tag,
    data: { url: payload.url || '/', campus_id: payload.campus_id || null },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification?.data?.url || '/', self.location.origin);
  if (target.origin !== self.location.origin) return;
  const campus = event.notification?.data?.campus_id;
  if (typeof campus === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(campus)) target.searchParams.set('campus_id', campus);
  const targetUrl = target.href;

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Se ja tem aba aberta, foca e navega
    for (const client of allClients) {
      const sameOrigin = new URL(client.url).origin === self.location.origin;
      if (sameOrigin) {
        await client.focus();
        try { await client.navigate(targetUrl); } catch {}
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
  })());
});
