/* Service worker: lets the tools open without a connection.
 * Network first, so a new deploy is always picked up when online; the saved copy is used only when the network fails.
 * Only the site's own pages, scripts, styles, fonts and images are kept. Nothing from the database, the account,
 * payments or any function is ever stored here, so no personal content ends up in this cache. */
const VERSION = 'sil-v1';
const PAGES = ['/', '/breathing/', '/regulation/', '/soundscape-machine/', '/ear-training/', '/sequencer/', '/spatial-game/', '/cocktail-party-problem/', '/creature/', '/offline.html'];
const STATIC = /^\/(assets|images|audio|dashboard)\//;

self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.add('/offline.html')).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const norm = p => (p !== '/' && !p.endsWith('/') && !/\.[a-z0-9]+$/i.test(p) ? p + '/' : p);

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/.netlify/')) return;
  const nav = req.mode === 'navigate';
  const keep = nav ? PAGES.includes(norm(url.pathname)) : STATIC.test(url.pathname);
  if (!nav && !keep) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok && res.type === 'basic' && (keep || nav && PAGES.includes(norm(url.pathname)))) {
        const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: nav });
      if (hit) return hit;
      if (nav) { const off = await caches.match('/offline.html'); if (off) return off; }
      throw err;
    }
  })());
});
