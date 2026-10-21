const C = 'pelada-v2';
const SHELL = ['/', '/index.html', '/app.js', '/styles.css', '/i18n/pt.json', '/i18n/en.json', '/i18n/fr.json', '/hero.jpg', '/icons/icon-192.png', '/manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.pathname.startsWith('/api/')) return; // API always network
  // network-first everywhere; app.js and HTML bypass the HTTP cache so updates arrive immediately
  const fresh = u.pathname === '/' || u.pathname.endsWith('.html') || u.pathname === '/app.js';
  e.respondWith(fetch(e.request, fresh ? { cache: 'no-store' } : undefined).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('/index.html'))));
});
