const CACHE_NAME = 'hydrhacked-v3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/images/icone-192.png',
  '/images/icone-512.png'
];

// 1. INSTALLATION
self.addEventListener('install', event => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Mise en cache des fichiers statiques');
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Suppression ancien cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  const isStaticAsset = url.pathname === '/' || 
                        url.pathname.endsWith('.html') || 
                        url.pathname.endsWith('.css') || 
                        url.pathname.endsWith('.js') || 
                        url.pathname.endsWith('.png') || 
                        url.pathname.endsWith('.json');

  if (!isStaticAsset || event.request.method !== 'GET') {
    return; 
  }

  // Si c'est statique, on sert le cache
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});