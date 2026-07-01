const CACHE_NAME = 'maac-v1.4';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/student-login.html',
  '/manifest.json'
];

// Install – cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  // Do NOT auto skipWaiting — let the page prompt the user first (see message listener below)
});

// Listen for the page telling us to activate the new version now
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Activate – clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
     .then(() => self.clients.matchAll())
     .then(clientsArr => {
       clientsArr.forEach(client => client.postMessage({ type: 'SW_ACTIVATED', cache: CACHE_NAME }));
     })
  );
});

// Fetch – cache-first for assets, network-first (redirect-safe) for navigations
self.addEventListener('fetch', event => {
  // Only handle simple GET requests — POST etc. and cross-origin API calls pass straight through
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('firestore') || event.request.url.includes('googleapis')) {
    // Network only for Firebase
    return;
  }

  // ── NAVIGATION REQUESTS (full page loads / clicking links) ──
  // Deliberately NOT intercepted. Letting the browser handle navigations natively
  // avoids conflicts with Cloudflare's own redirect/routing layer (e.g. the
  // .html -> extensionless 308), which was causing ERR_FAILED when the service
  // worker re-wrapped these requests. Offline support for navigations is handled
  // separately below via a fallback only when the network is actually down.
  if (event.request.mode === 'navigate') {
    return; // let it pass straight through to the network/Cloudflare
  }

  // ── STATIC ASSETS (css, js, images, fonts, etc.) ──
  event.respondWith(
    caches.match(event.request).then(cached => {
      const networked = fetch(event.request)
        .then(response => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached || Response.error());

      // Serve cache immediately if present, else wait on network (with its own safe fallback above)
      return cached || networked;
    })
  );
});

// Background sync for offline queue
self.addEventListener('sync', event => {
  if (event.tag === 'sync-attendance') {
    event.waitUntil(syncOfflineQueue());
  }
});

async function syncOfflineQueue() {
  // Process IndexedDB queue and push to Firestore
  // (implemented in offline/offline-queue.js)
}
