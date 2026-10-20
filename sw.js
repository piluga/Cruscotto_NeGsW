const CACHE_NAME = 'cruscotto-a-multi-pwa-v1-andamento-v1-icona-gold-v1-20261020';
const ASSETS = ['./index.html', './avvio.js?v=locale-1', './style.css', './app.js?v=andamento-v1-20261018', './firebase-client.js?v=andamento-v1-20261018',
    './firebase-config.js?v=sicurezza-1', './dati.js?v=statistiche-resi-v2-20261016', './manifest.json', './icone/dashboard192.png?v=gold-20261020', './icone/dashboard512.png?v=gold-20261020'];
const urls = new Set(ASSETS.map(path => new URL(path, self.location.href).href));
self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS.map(path => new Request(path, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('cruscotto-a-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
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
