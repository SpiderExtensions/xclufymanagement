const getSwUrl = () => (import.meta.env.DEV ? '/dev-sw.js?dev-sw' : '/sw.js');
const getSwType = (): WorkerType => (import.meta.env.DEV ? 'module' : 'classic');

function isEmbeddedFrame(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

async function canFetchSwWithoutRedirect(swUrl: string): Promise<boolean> {
  try {
    const res = await fetch(swUrl, {
      method: 'GET',
      credentials: 'same-origin',
      redirect: 'manual',
    });
    if (!res.ok || res.redirected || res.type === 'opaqueredirect') {
      return false;
    }
    const contentType = res.headers.get('content-type') || '';
    return contentType.includes('javascript');
  } catch {
    return false;
  }
}

export async function initServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !window.isSecureContext) {
    return null;
  }

  // Cross-origin preview iframes behind auth proxies do not attach partitioned
  // cookies to Service Worker script fetches, triggering a disallowed 302 redirect.
  if (isEmbeddedFrame()) {
    return null;
  }

  const swUrl = getSwUrl();
  const ok = await canFetchSwWithoutRedirect(swUrl);
  if (!ok) {
    return null;
  }

  try {
    return await navigator.serviceWorker.register(swUrl, {
      scope: '/',
      type: getSwType(),
    });
  } catch {
    return null;
  }
}

export async function getActiveServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) {
    return existing;
  }

  const registered = await initServiceWorker();
  if (!registered) {
    return null;
  }

  return navigator.serviceWorker.ready;
}
