/* Nova FM 87,5 — Service Worker (app instalável)
   Página e dados: rede primeiro (sempre o conteúdo novo), com cópia para abrir offline.
   Imagens, CSS e JS: cache primeiro, atualizando em segundo plano.
   Ao mudar arquivos em /assets, troque o ?v= no index.html e a versão abaixo. */
const VERSAO = 'novafm-v7';
const BASICOS = ['/', '/assets/site.css?v=20261009d', '/assets/app.js?v=20261009d', '/img/logo-mark.webp', '/img/logo-nova.webp',
  '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(BASICOS)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function redePrimeiro(req, chave) {
  return fetch(req).then((res) => {
    if (res.ok) { const copia = res.clone(); caches.open(VERSAO).then((c) => c.put(chave || req, copia)); }
    return res;
  }).catch(() => caches.match(chave || req));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== location.origin) return;               // stream, Instagram, promoções: nunca passam pelo cache
  if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/admin')) return; // ao vivo e painel: sempre da rede

  if (req.mode === 'navigate') { e.respondWith(redePrimeiro(req, '/')); return; }
  if (u.pathname.startsWith('/content/')) { e.respondWith(redePrimeiro(req, u.pathname)); return; }

  e.respondWith(caches.match(req).then((salvo) => {
    const rede = fetch(req).then((res) => {
      if (res.ok) { const copia = res.clone(); caches.open(VERSAO).then((c) => c.put(req, copia)); }
      return res;
    }).catch(() => salvo);
    return salvo || rede;
  }));
});
