// Network first, cache as fallback: always the latest build and puzzles when online,
// still playable offline. The page warms the cache, see enableOffline() in src/main.ts.
// ponytail: nothing is evicted (old bundles, past puzzles, ~5 KB a day); bump the version to purge.
const CACHE = 'chart-of-the-day-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
        }
        return response;
      })
      // ignoreVary: hosts send Vary (e.g. Origin), which would hide files fetched by the warm-up.
      .catch(() => caches.match(request, { ignoreVary: true }).then((hit) => hit ?? Response.error())),
  );
});
