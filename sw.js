const CACHE_NAME = 'maac-v1.1';
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

// Fetch – cache-first, then network
self.addEventListener('fetch', event => {
  if (event.request.url.includes('firestore') || event.request.url.includes('googleapis')) {
    // Network only for Firebase
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => {
      const networked = fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
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
