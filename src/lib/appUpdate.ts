export const APP_UPDATE_RETRY_PARAM = '_chunk_retry';
export const APP_UPDATE_RETRY_STARTED_PARAM = '_chunk_retry_at';
export const APP_UPDATE_CACHE_BUSTER_PARAM = '_cb';
export const MAX_APP_UPDATE_RETRIES = 3;
export const APP_UPDATE_RETRY_WINDOW_MS = 60_000;

const CACHE_CLEANUP_TIMEOUT_MS = 1200;
const VERSION_CHECK_PARAM = '_version_check';
const LEGACY_RETRY_KEYS = new Set(['boundary-chunk-retry']);

let reloadInProgress = false;

type AppUpdateRuntime = {
  getHref?: () => string;
  refreshCaches?: () => Promise<void>;
  replace?: (url: string) => void;
  reload?: () => void;
};

export function getAppUpdateRetryCount(
  href = window.location.href,
  now = Date.now(),
): number {
  try {
    const url = new URL(href);
    const count = Math.max(0, parseInt(url.searchParams.get(APP_UPDATE_RETRY_PARAM) || '0', 10) || 0);
    const startedAt = Math.max(0, parseInt(url.searchParams.get(APP_UPDATE_RETRY_STARTED_PARAM) || '0', 10) || 0);
    if (startedAt && now - startedAt > APP_UPDATE_RETRY_WINDOW_MS) return 0;
    return count;
  } catch {
    return 0;
  }
}

export function buildAppUpdateUrl(
  href: string,
  options: { resetRetries?: boolean; now?: number } = {},
): string {
  const url = new URL(href);
  const now = options.now ?? Date.now();
  const currentRetryCount = getAppUpdateRetryCount(href, now);
  const currentStartedAt = Math.max(
    0,
    parseInt(url.searchParams.get(APP_UPDATE_RETRY_STARTED_PARAM) || '0', 10) || 0,
  );
  const retryCount = options.resetRetries ? 1 : currentRetryCount + 1;
  const startedAt = options.resetRetries || currentRetryCount === 0 || !currentStartedAt
    ? now
    : currentStartedAt;

  url.searchParams.set(APP_UPDATE_RETRY_PARAM, String(retryCount));
  url.searchParams.set(APP_UPDATE_RETRY_STARTED_PARAM, String(startedAt));
  url.searchParams.set(APP_UPDATE_CACHE_BUSTER_PARAM, String(now));
  return url.toString();
}

/**
 * URL sem NENHUM parâmetro de recuperação.
 *
 * ⚠️ POR QUE ISTO PRECISA EXISTIR:
 * com `_chunk_retry=3` na querystring, `getAppUpdateRetryCount()` devolve 3 —
 * o teto — e o ErrorBoundary se recusa a tentar de novo. Recarregar a MESMA
 * URL (inclusive com Cmd+Shift+R) reencontra o mesmo 3 e cai na mesma parede,
 * até os 60s da janela expirarem. Foi exatamente o que prendeu o Matheus três
 * vezes em 18/08/2026, sempre com um deploy em andamento por trás.
 *
 * Voltar para a URL limpa devolve o orçamento de tentativas e mantém rota,
 * filtros e hash — que é o que a pessoa estava olhando.
 */
export function buildCleanUrl(href = window.location.href): string {
  try {
    const url = new URL(href);
    url.searchParams.delete(APP_UPDATE_RETRY_PARAM);
    url.searchParams.delete(APP_UPDATE_RETRY_STARTED_PARAM);
    url.searchParams.delete(APP_UPDATE_CACHE_BUSTER_PARAM);
    return url.toString();
  } catch {
    return href;
  }
}

function clearLegacyRetryFlags() {
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith('chunk-retry-') || LEGACY_RETRY_KEYS.has(key))
      .forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // Alguns modos privados bloqueiam o sessionStorage. O reload ainda funciona.
  }
}

async function refreshBrowserManagedCaches() {
  const tasks: Promise<unknown>[] = [];

  // Cache Storage é separado do cache HTTP. Limpamos seus itens sem tocar em
  // localStorage/sessionStorage, que guardam login e preferências do usuário.
  if ('caches' in window) {
    tasks.push((async () => {
      const keys = await window.caches.keys();
      await Promise.all(keys.map((key) => window.caches.delete(key)));
    })());
  }

  // O service worker é usado para Web Push e não intercepta fetch. Atualizá-lo
  // preserva a inscrição; desregistrá-lo faria o usuário perder notificações.
  if ('serviceWorker' in navigator) {
    tasks.push((async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.update()));
    })());
  }

  await Promise.allSettled(tasks);
}

export async function reloadForAppUpdate(
  options: { resetRetries?: boolean } = {},
  runtime: AppUpdateRuntime = {},
) {
  if (reloadInProgress && !options.resetRetries) return;
  reloadInProgress = true;

  clearLegacyRetryFlags();

  // Cache Storage ou a API de Service Worker podem ficar penduradas em alguns
  // navegadores. A navegação nunca deve esperar mais que este limite.
  try {
    await Promise.race([
      runtime.refreshCaches?.() ?? refreshBrowserManagedCaches(),
      new Promise((resolve) => setTimeout(resolve, CACHE_CLEANUP_TIMEOUT_MS)),
    ]);
  } catch {
    // A URL com cache-buster continua sendo a recuperação principal.
  }

  try {
    const href = runtime.getHref?.() ?? window.location.href;
    const replace = runtime.replace ?? window.location.replace.bind(window.location);
    replace(buildAppUpdateUrl(href, options));
  } catch {
    const reload = runtime.reload ?? window.location.reload.bind(window.location);
    reload();
  }
}

function normalizeEntryScript(src: string | null, baseHref: string): string | null {
  if (!src) return null;
  try {
    const url = new URL(src, baseHref);
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

export function getEntryScriptFromHtml(html: string, baseHref = window.location.href): string | null {
  try {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const src = parsed.querySelector<HTMLScriptElement>('script[type="module"][src]')
      ?.getAttribute('src') ?? null;
    return normalizeEntryScript(src, baseHref);
  } catch {
    return null;
  }
}

export function getCurrentEntryScript(baseHref = window.location.href): string | null {
  const src = document.querySelector<HTMLScriptElement>('script[type="module"][src]')
    ?.getAttribute('src') ?? null;
  return normalizeEntryScript(src, baseHref);
}

export async function hasNewAppVersion(): Promise<boolean> {
  const currentEntry = getCurrentEntryScript();
  if (!currentEntry) return false;

  try {
    const checkUrl = new URL('/index.html', window.location.origin);
    checkUrl.searchParams.set(VERSION_CHECK_PARAM, String(Date.now()));

    const response = await fetch(checkUrl.toString(), {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });
    if (!response.ok) return false;

    const latestEntry = getEntryScriptFromHtml(await response.text(), checkUrl.toString());
    return Boolean(latestEntry && latestEntry !== currentEntry);
  } catch {
    // Falha de rede não deve bloquear a abertura do sistema.
    return false;
  }
}
