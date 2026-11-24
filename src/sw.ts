/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

const CACHE_NAME = 'xclufy-shell-v1';
const manifestEntries = self.__WB_MANIFEST || [];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  const urls = manifestEntries.map((entry) => entry.url);
  if (urls.length > 0) {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => cache.addAll(urls)).catch(() => undefined)
    );
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === 'navigate') {
        const shell = await caches.match('/index.html');
        if (shell) return shell;
      }
      return Response.error();
    })
  );
});

self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; linkModule?: string } = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'XCLUFY Notification', body: event.data?.text() || 'New business update.' };
  }

  const title = data.title || 'XCLUFY';
  const options: NotificationOptions = {
    body: data.body || 'You have a new update.',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    data: { linkModule: data.linkModule || 'notifications' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const linkModule = (event.notification.data as { linkModule?: string } | undefined)?.linkModule || 'notifications';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({ type: 'OPEN_MODULE', module: linkModule });
          return;
        }
      }
      return self.clients.openWindow(`/?module=${encodeURIComponent(linkModule)}`);
    })
  );
});
