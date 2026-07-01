const CACHE_NAME = 'maac-v1.3';
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
  // Handle these separately and let the browser follow redirects (e.g. Cloudflare's
  // .html -> extensionless 308) natively. Re-wrapping a navigation fetch inside the
  // service worker without explicit redirect handling caused ERR_FAILED.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { redirect: 'follow' })
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone)).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          // Offline fallback: try the exact cached page, then the cached homepage
          const cachedPage = await caches.match(event.request);
          if (cachedPage) return cachedPage;
          const fallback = await caches.match('/index.html');
          if (fallback) return fallback;
          return Response.error();
        })
    );
    return;
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
