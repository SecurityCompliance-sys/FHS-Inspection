/* FHS Inspection — Service Worker (Phase 3, J4 PWA/offline) */
const CACHE = "fhs-v3";
const CORE = [
  "index.html",
  "manifest.json",
  "icon-192.png",
  "icon-512.png",
  "https://fonts.googleapis.com/css2?family=Bai+Jamjuree:wght@500;600;700&family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap",
  "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js",
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE).catch(() => {})));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // mutations pass through

  const url = new URL(req.url);
  // Firestore / Cloudinary / Firebase APIs: always network (Firestore has its own offline cache)
  if (/firestore|firebaseio|googleapis\.com\/.*firestore|cloudinary\.com|identitytoolkit/.test(url.href)) return;

  // Navigations: serve cached index.html when offline (SPA-style)
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("index.html")));
    return;
  }

  // Static assets: cache-first, then network (and cache the result)
  e.respondWith(
    caches.match(req).then((hit) =>
      hit ||
      fetch(req).then((res) => {
        if (res && res.status === 200 && (url.origin === location.origin || /fonts\.|unpkg\.com|jsdelivr\.net|cdnjs/.test(url.href))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit)
    )
  );
});
