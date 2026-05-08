// Web Push helpers para PWA do CBRio.
// Registra o service worker, pede permissao e gerencia subscription.

const API = (typeof window !== 'undefined' && (window as any).__API_BASE__) || '/api';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    return reg;
  } catch (e) {
    console.warn('[push] SW registration falhou', e);
    return null;
  }
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration('/');
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

async function fetchVapidKey(): Promise<string | null> {
  const r = await fetch(`${API}/notificacoes/push/vapid-key`, { headers: authHeaders() });
  if (r.status === 204) return null;
  if (!r.ok) return null;
  const j = await r.json();
  return j?.key || null;
}

// Pede permissao + cria subscription + registra no backend.
// Retorna 'ok' | 'denied' | 'unsupported' | 'no_vapid' | 'error'.
export async function subscribePush(): Promise<'ok' | 'denied' | 'unsupported' | 'no_vapid' | 'error'> {
  if (!isPushSupported()) return 'unsupported';
  const vapidKey = await fetchVapidKey();
  if (!vapidKey) return 'no_vapid';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const reg = await registerServiceWorker();
  if (!reg) return 'error';

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    } catch (e) {
      console.warn('[push] subscribe falhou', e);
      return 'error';
    }
  }

  const r = await fetch(`${API}/notificacoes/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(sub.toJSON()),
  });
  return r.ok ? 'ok' : 'error';
}

export async function unsubscribePush(): Promise<boolean> {
  const sub = await getCurrentSubscription();
  if (!sub) return true;
  const endpoint = sub.endpoint;
  try { await sub.unsubscribe(); } catch {}
  try {
    await fetch(`${API}/notificacoes/push/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ endpoint }),
    });
  } catch {}
  return true;
}
