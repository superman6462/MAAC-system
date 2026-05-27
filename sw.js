const CACHE_NAME = 'maac-v1.0';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/css/style.css',
  '/assets/js/main.js',
  '/firebase/firebase-config.js',
  '/shared/auth.js',
  '/shared/db.js',
  '/offline/idb.js',
  '/offline/offline-queue.js',
  '/student/index.html',
  '/student/student.js',
  '/teacher/index.html',
  '/teacher/teacher.js',
  '/manager/index.html',
  '/manager/manager.js',
  '/admin/index.html',
  '/admin/admin.js',
  '/chairman/index.html',
  '/chairman/chairman.js',
  '/secure-admin/index.html',
  '/secure-admin/secure-admin.js'
];

// Install – cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate – clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
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
