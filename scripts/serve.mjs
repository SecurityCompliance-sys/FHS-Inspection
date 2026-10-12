/* ============================================================================
 * FHS Inspection — local static server (ไม่ต้องพึ่ง dependency ใด ๆ)
 * ----------------------------------------------------------------------------
 * ใช้แทน `python3 -m http.server` เพราะ:
 *   • ตั้ง MIME type ถูกต้องสำหรับ .js/.mjs/.json/.svg/.webmanifest
 *   • ส่ง Cache-Control: no-store ตอนพัฒนา → refresh แล้วเห็นไฟล์ใหม่ทันที
 *     (สำคัญมากกับ service worker ที่ชอบเสิร์ฟไฟล์เก่า)
 *   • รองรับ SPA-ish fallback → 404.html
 *
 * รัน:  npm run serve        (ค่าเริ่มต้นพอร์ต 8000)
 *       PORT=3000 npm run serve
 *
 * หมายเหตุ: ES module / service worker / กล้อง / GPS ต้องเปิดผ่าน http(s)
 *           เท่านั้น — เปิดไฟล์แบบ file:// จะไม่ทำงาน
 * ==========================================================================*/

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || "0.0.0.0";   // 0.0.0.0 เพื่อให้ preview จากภายนอกเข้าถึงได้

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith("/")) pathname += "index.html";

  // กัน path traversal: ทุกอย่างต้องอยู่ใต้ ROOT
  const filePath = path.join(ROOT, path.normalize(pathname));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // ไม่พบไฟล์ → ส่ง 404.html ของโปรเจกต์ (ถ้ามี)
      fs.readFile(path.join(ROOT, "404.html"), (e2, page) => {
        res.writeHead(404, { "Content-Type": MIME[".html"] });
        res.end(e2 ? "404 Not Found" : page);
      });
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",             // dev: ห้าม cache
      "Service-Worker-Allowed": "/",
    });
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`FHS Inspection dev server → http://localhost:${PORT}/index.html`);
  console.log(`serving ${ROOT}`);
  console.log("(กด Ctrl+C เพื่อหยุด)");
});
