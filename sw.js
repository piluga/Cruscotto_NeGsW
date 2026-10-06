const CACHE_NAME = 'cruscotto-sicurezza-v3';
const ASSETS = ['./index.html', './avvio.js?v=locale-1', './style.css', './app.js?v=sicurezza-1', './firebase-client.js?v=sicurezza-1',
    './firebase-config.js?v=sicurezza-1', './dati.js?v=sicurezza-1', './manifest.json', './icone/dashboard192.png', './icone/dashboard512.png'];
const urls = new Set(ASSETS.map(path => new URL(path, self.location.href).href));
self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS.map(path => new Request(path, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('cruscotto-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    // Firebase e autenticazione non vengono mai intercettati o salvati.
    if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
    const root = new URL('./', self.location.href).href;
    const key = url.href === root ? new URL('./index.html', self.location.href).href : url.href;
    if (!urls.has(key)) return;
    event.respondWith(caches.open(CACHE_NAME).then(async cache => (await cache.match(key)) || fetch(event.request)));
});
