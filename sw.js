const V = 'tonix-v32';
const CORE = ['./', 'index.html', 'studio.html', 'app.css', 'app.js', 'vdo.js', 'player.js', 'vocal.html', 'separate.js', 'server.js', 'qr.js', 'watch.html', 'watch.js', 'embed.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== V && k !== 'psb-fonts' && k !== 'tonix-models-v1').map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open('psb-fonts').then(c => c.match(r).then(hit => {
      const net = fetch(r).then(res => { if (res.ok || res.type === 'opaque') c.put(r, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })));
    return;
  }
  if (u.origin !== location.origin) return;
  if (r.mode === 'navigate') {
    // Network first. Each page is cached under its own URL so studio.html and the hub never overwrite each other.
    e.respondWith(fetch(r, { cache: 'no-cache' }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(V).then(c => c.put(r, copy)); }
      return res;
    }).catch(() => caches.match(r, { ignoreSearch: true }).then(hit => hit || caches.match('index.html'))));
    return;
  }
  // Network first for everything, so a new version reaches phones on the next open. The cache is only the offline fallback.
  e.respondWith(fetch(r, { cache: 'no-cache' }).then(res => {
    if (res.ok && !u.pathname.includes('/vdo/') && !u.pathname.includes('/ort/')) { const copy = res.clone(); caches.open(V).then(c => c.put(r, copy)); }
    return res;
  }).catch(() => caches.match(r)));
});
