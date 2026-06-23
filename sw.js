/* FHS Inspection — Service Worker (Phase 3, J4 PWA/offline) */
const CACHE = "fhs-v3";
const CORE = [
  "index.html",
  "dashboard.html",
  "admin.html",
  "report.html",
  "manual-inspector.html",
  "manifest.json",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "https://fonts.googleapis.com/css2?family=Bai+Jamjuree:wght@500;600;700&family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap",
  "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js",
];

// API hosts: always network, never cached (Firestore has its own offline cache).
// Match on hostname only — a path/substring match would also catch the SDK file
// firebase-firestore.js on gstatic and break offline loading.
const API_HOSTS = /(^|\.)((firestore|identitytoolkit)\.googleapis\.com|firebaseio\.com|cloudinary\.com)$/;

self.addEventListener("install", (e) => {
  self.skipWaiting();
  // add() per URL so one failed CDN fetch doesn't abort the whole precache (addAll is all-or-nothing)
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(CORE.map((u) => c.add(u).catch(() => {})))));
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
  if (API_HOSTS.test(url.hostname)) return;

  // Navigations: network first, then the cached page itself, then index.html (SPA-style)
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(() =>
        caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("index.html"))
      )
    );
    return;
  }

  // Static assets: cache-first, then network (and cache the result)
  e.respondWith(
    caches.match(req).then((hit) =>
      hit ||
      fetch(req).then((res) => {
        if (res && res.status === 200 && (url.origin === location.origin || /fonts\.|unpkg\.com|jsdelivr\.net|cdnjs|gstatic\.com/.test(url.href))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit)
    )
  );
});
