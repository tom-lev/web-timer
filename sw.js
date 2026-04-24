// sw.js — MultiTimer Service Worker
// Caches the app shell for offline use and stays alive to support
// the Media Session notification.

const CACHE_NAME = 'multitimer-v6';

// App shell: everything needed to run offline
const PRECACHE = [
  './',
  './index.html',
  './app.js?v=4',
  './style.css',
  './timer-worker.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  // Google Fonts (cached on first load)
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
];

// ── Install: pre-cache the app shell ─────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache what we can; ignore failures for third-party URLs
      return Promise.allSettled(
        PRECACHE.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first for app shell, network-first for everything else ───────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and non-http(s) requests
  if (!request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) {
        // Serve from cache; refresh in background (stale-while-revalidate)
        const fetchPromise = fetch(request)
          .then(response => {
            if (response && response.status === 200 && response.type !== 'opaque') {
              caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
            }
            return response;
          })
          .catch(() => cached); // Stay offline-friendly
        return cached; // Respond immediately with cache
      }

      // Not in cache — go to network
      return fetch(request).then(response => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
        }
        return response;
      }).catch(() => {
        // Fallback for navigation requests
        if (request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// ── Message handler: receive timer state for keepalive ───────────────────────
// The main page sends periodic pings so the SW stays resident on some browsers.
self.addEventListener('message', event => {
  if (event.data?.type === 'KEEPALIVE') {
    // Acknowledge — keeps the SW alive while timers are running
    event.ports?.[0]?.postMessage({ type: 'KEEPALIVE_ACK' });
  }

  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
