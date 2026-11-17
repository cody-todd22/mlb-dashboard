/* Live Board service worker: keeps the app's own files on the device so the board opens straight away
 * and survives a short network drop.
 *
 * - The board's own files (this site only): network first, so a new deploy is picked up on the next load;
 *   if the network is slow (3 s) or down, the saved copy is used instead.
 * - Google Fonts: saved copy first, refreshed in the background.
 * - Everything else (MLB, ESPN, NCAA, your relay) is never touched: live data always comes from the network,
 *   and nothing from those feeds is stored here. */
const SHELL = 'board-shell-v1', FONTS = 'board-fonts-v1';
const FILES = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest',
  'js/config.js', 'js/api.js', 'js/charts.js', 'js/extras.js', 'js/snapshot.js', 'js/app.js',
  'js/college/config.js', 'js/college/api.js', 'js/college/snapshot.js', 'js/college/app.js',
  'js/football/config.js', 'js/football/api.js', 'js/football/snapshot.js', 'js/football/app.js', 'js/pwa.js',
  'icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => Promise.all(FILES.map((f) => c.add(f).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL && k !== FONTS).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

function timeout(ms) { return new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms)); }

async function shell(request) {
  const cache = await caches.open(SHELL);
  try {
    const res = await Promise.race([fetch(request), timeout(3000)]);
    if (res && res.ok && res.type === 'basic') cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request, { ignoreSearch: request.mode === 'navigate' }) || (request.mode === 'navigate' ? await cache.match('index.html') : null);
    if (hit) return hit;
    throw err;
  }
}
async function fonts(request) {
  const cache = await caches.open(FONTS), hit = await cache.match(request);
  const fresh = fetch(request).then((res) => { if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone()); return res; });
  if (hit) { fresh.catch(() => null); return hit; }
  return fresh;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) e.respondWith(shell(req));
  else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') e.respondWith(fonts(req));
});
