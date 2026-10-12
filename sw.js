/* ============================================================================
 * FHS Inspection — Service Worker (PWA / offline)
 * ----------------------------------------------------------------------------
 * ⚠️ ทุกครั้งที่แก้ไฟล์ .html ที่อยู่ใน CORE ต้อง bump CACHE (v7 → v8 → …)
 *    ไม่งั้นเครื่องที่เคยเปิดแล้วจะยังได้ไฟล์เก่าจาก cache
 *
 * ประวัติ: ไฟล์นี้เคยถอยหลังจาก fhs-v6 กลับไปเป็น fhs-v3 (ตอนอัปโหลดทับ repo)
 * ทำให้หายไปทั้งการ precache หน้าอื่น ๆ, การกัน SDK firebase ถูก cache ผิด
 * และการรองรับลิงก์ลึก (?station=…) ตอนออฟไลน์ — เวอร์ชันนี้กู้กลับมาแล้ว
 * ==========================================================================*/

const CACHE = "fhs-v7";

const CORE = [
  // หน้าเว็บทั้งหมด
  "index.html",
  "dashboard.html",
  "admin.html",
  "report.html",
  "manual-inspector.html",
  "404.html",
  // โมดูลที่ใช้ร่วมกัน (ต้องมี ไม่งั้นหน้าจะพังตอนออฟไลน์)
  "src/config.js",
  "src/shared.js",
  "src/i18n.js",
  // PWA / ไอคอน
  "manifest.json",
  "favicon.svg",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  // ไลบรารีภายนอก (เวอร์ชันตายตัว → cache ได้ปลอดภัย)
  "https://fonts.googleapis.com/css2?family=Bai+Jamjuree:wght@500;600;700&family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap",
  "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js",
];

/* host ที่ต้องต่อเน็ตเสมอ ห้าม cache
 * จับจาก "hostname" เท่านั้น — ถ้าใช้ substring จะไปโดนไฟล์
 * firebase-firestore.js บน gstatic ด้วย แล้วโหลดออฟไลน์พัง (บั๊กที่เคยเจอ) */
const API_HOSTS = /(^|\.)((firestore|identitytoolkit)\.googleapis\.com|firebaseio\.com|cloudinary\.com)$/;

/* host ที่ cache-first ได้ (ไฟล์เวอร์ชันตายตัว) */
const CDN_HOSTS = /(^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|www\.gstatic\.com)$/;

const isSameOrigin = (url) => url.origin === self.location.origin;

/* ------------------------------------------------------------------ install */
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // add() ทีละไฟล์ ไม่ใช้ addAll() เพราะ addAll เป็น all-or-nothing:
      // ถ้า CDN ตัวใดตัวหนึ่งล่ม การ precache ทั้งชุดจะล้มเหลวทั้งหมด
      Promise.all(CORE.map((u) => cache.add(new Request(u, { cache: "reload" })).catch(() => {})))
    )
  );
});

/* ----------------------------------------------------------------- activate */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable().catch(() => {});
      }
      await self.clients.claim();
    })()
  );
});

/* ------------------------------------------------------------------ message */
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
  if (event.data === "VERSION") event.source?.postMessage({ type: "VERSION", cache: CACHE });
});

/* -------------------------------------------------------------------- fetch */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;                      // mutation ผ่านเลย

  const url = new URL(req.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  if (API_HOSTS.test(url.hostname)) return;               // Firestore/Cloudinary ต่อตรงเสมอ

  /* ---- 1. การเปิดหน้าเว็บ (navigation) ----
   * network-first: ได้ไฟล์ใหม่เสมอเมื่อออนไลน์
   * ออฟไลน์: ใช้ cache ของ "หน้านั้น" (ignoreSearch เพื่อรองรับ ?station=…)
   *          ถ้าไม่มีจริง ๆ จึงถอยไป index.html แล้วค่อย 404.html */
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const preload = await event.preloadResponse;
          if (preload) return preload;
          const fresh = await fetch(req);
          if (fresh && fresh.ok) {
            const copy = fresh.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return fresh;
        } catch {
          const hit = await caches.match(req, { ignoreSearch: true });
          if (hit) return hit;
          const idx = await caches.match("index.html", { ignoreSearch: true });
          const notFound = await caches.match("404.html");
          // หน้าที่ขอมาถ้าไม่ใช่ index ให้ตอบ 404 ที่เราเตรียมไว้ (ซื่อตรงกว่า)
          if (idx && /(^|\/)(index\.html)?$/.test(url.pathname)) return idx;
          return notFound || idx || Response.error();
        }
      })()
    );
    return;
  }

  /* ---- 2. ไฟล์จาก CDN (เวอร์ชันตายตัว) → cache-first ---- */
  if (!isSameOrigin(url) && CDN_HOSTS.test(url.hostname)) {
    event.respondWith(
      (async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res && (res.status === 200 || res.type === "opaque")) {
            caches.open(CACHE).then((c) => c.put(req, res.clone())).catch(() => {});
          }
          return res;
        } catch {
          return hit || Response.error();
        }
      })()
    );
    return;
  }

  /* ---- 3. ไฟล์ของเราเอง (js/css/รูป) → network-first, cache สำรอง ---- */
  if (isSameOrigin(url)) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res && res.status === 200 && res.type === "basic") {
            caches.open(CACHE).then((c) => c.put(req, res.clone())).catch(() => {});
          }
          return res;
        } catch {
          const hit = await caches.match(req, { ignoreSearch: true });
          return hit || Response.error();
        }
      })()
    );
  }
});
