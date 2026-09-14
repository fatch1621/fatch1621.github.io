// =========================================================
// SERVICE WORKER - KeuanganKu PWA
// =========================================================
const CACHE_NAME = 'keuanganku-v3.1.2';

// File yang di-cache saat pertama kali install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/foto1.png',
  '/foto2.jpg',
  '/manifest.json'
];

// Install: cache file utama
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell');
        return cache.addAll(PRECACHE_URLS).catch(err => {
          console.warn('[SW] Beberapa file gagal di-cache:', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// Activate: hapus cache lama
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => {
      return Promise.all(
        names.map(name => {
          if (name !== CACHE_NAME) {
            console.log('[SW] Menghapus cache lama:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: strategi Network First untuk Firebase, Cache First untuk aset statis
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Jangan cache request Firebase, Google APIs, atau CDN
  if (url.includes('firebase') ||
      url.includes('googleapis') ||
      url.includes('gstatic') ||
      url.includes('jsdelivr') ||
      url.includes('chart.js') ||
      url.includes('xlsx') ||
      event.request.method !== 'GET') {
    return; // Biarkan lewat network
  }

  // Untuk aset statis: Cache First, fallback ke Network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache response baru kalau valid
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Fallback offline: kalau HTML, tampilkan halaman utama
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('/index.html');
        }
      });
    })
  );
});
