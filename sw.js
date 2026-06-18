// Service worker — makes the app installable and fully usable offline.
// Strategy: precache the app shell + bundled data on install; serve same-origin
// GETs cache-first (and runtime-cache anything new). Cross-origin requests
// (Google TTS audio, the PDF.js/JSZip CDNs used only for Reader uploads) bypass
// the cache and just hit the network — so TTS needs a connection, everything
// else works offline.
//
// Bump CACHE whenever app files change so clients pull the new version.
const CACHE = 'tiengviet-v11';

const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/data.js',
  './js/sentences.js',
  './js/srs.js',
  './js/telex.js',
  './js/vocab.js',
  './js/basics.js',
  './js/tones.js',
  './js/cloze.js',
  './js/grammar.js',
  './js/listening.js',
  './js/stats.js',
  './js/reader.js',
  './js/plan.js',
  './js/settings.js',
  './js/app.js',
  './data/vocab.json',
  './data/sentences.json',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let cross-origin (TTS/CDN) go to network

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        // Runtime-cache successful same-origin responses for next time.
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached); // offline & uncached → undefined (nothing we can do)
    })
  );
});
