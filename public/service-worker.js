import { isCacheablePublicResource } from './offline-cache-policy.js';

const CACHE_NAME = 'chenpilot-public-static-v1';
const CACHE_PREFIX = 'chenpilot-public-static-';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (cacheNames) => {
      await Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName)),
      );
      await self.clients.claim();
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!isCacheablePublicResource(request.url, request.method, self.location.origin)) {
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(request);
      if (cachedResponse) return cachedResponse;

      const response = await fetch(request);
      const cacheControl = response.headers.get('Cache-Control') || '';
      const isPublicResponse = response.type === 'basic' &&
        response.ok &&
        !/\b(?:private|no-store)\b/i.test(cacheControl);

      if (isPublicResponse) {
        try {
          await cache.put(request, response.clone());
        } catch (error) {
          console.error('[ServiceWorker] Unable to cache public static resource:', error);
        }
      }

      return response;
    })(),
  );
});
