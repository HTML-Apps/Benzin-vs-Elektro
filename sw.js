/* Service Worker – Enyaq Ladekosten
 * - App-Shell (index.html) und die CDN-Skripte werden gecacht, die App startet dadurch auch offline.
 * - HTML: "Network first" (du bekommst nach einem Deploy sofort die neue Version, offline den Cache).
 * - Skripte/Schriften/sonstige Dateien: "Stale while revalidate" (schnell aus dem Cache, im Hintergrund aktualisiert).
 * - Die KI-Abfrage (/api/…) wird NIE gecacht und läuft immer übers Netz.
 * Bei größeren Änderungen am Cache-Konzept CACHE_VERSION erhöhen. */

const CACHE_VERSION = 'v3';
const CACHE_NAME = 'enyaq-' + CACHE_VERSION;

// Dateien, die beim Installieren vorab geladen werden
const SAME_ORIGIN_ASSETS = ['./', './index.html'];
const CDN_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SAME_ORIGIN_ASSETS);
    // CDN-Dateien einzeln und "no-cors" laden (opake Antworten sind cachebar); ein Fehler bricht die Installation nicht ab
    await Promise.all(CDN_ASSETS.map(async (url) => {
      try { await cache.put(url, await fetch(new Request(url, { mode: 'no-cors' }))); }
      catch (err) { console.warn('[SW] Vorab-Caching fehlgeschlagen:', url, err); }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // alte Cache-Versionen entfernen
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('enyaq-') && n !== CACHE_NAME).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;                              // POST (KI-Abfrage) nie anfassen
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;
  if (!/^https?:$/.test(url.protocol)) return;
  // Fremde Hosts nur für die bekannten Skript-CDNs cachen – Firestore/Auth (Streaming, Login-Iframe/Popup) niemals anfassen
  const CDN_HOSTS = ['cdn.tailwindcss.com', 'cdn.jsdelivr.net', 'www.gstatic.com'];
  if (url.origin !== self.location.origin && !CDN_HOSTS.includes(url.hostname)) return;

  // Seitenaufrufe: Network first, offline -> gecachte index.html
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (err) {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Alles andere: Stale while revalidate
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    const network = fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => cached);
    return cached || network;
  })());
});
