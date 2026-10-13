#!/usr/bin/env node
/* ============================================================================
 * FHS Inspection — ตัวตรวจสอบคุณภาพไฟล์แบบไม่ต้องพึ่ง dependency
 * ----------------------------------------------------------------------------
 * repo นี้ไม่มี build system และไม่มี test framework → สคริปต์นี้ทำหน้าที่เป็น
 * "ตาข่ายกันพลาด" ราคาถูก ก่อน push ทุกครั้ง:
 *
 *   0. ไฟล์ครบ ไม่ถูกตัดทอน/เขียนทับด้วย snippet (ไม่มี marker ตัดทอน / U+FFFD, .html ครบตั้งแต่ doctype ถึง </html>)
 *   1. syntax ของ <script type="module"> ในทุกไฟล์ .html
 *   2. syntax ของไฟล์ .js/.mjs ใน src/ และ scripts/
 *   3. JSON ถูกต้อง (manifest.json, package.json)
 *   4. service worker: CACHE ถูกประกาศ และ CORE อ้างไฟล์ที่มีจริง
 *   5. ลิงก์ภายใน (href="xxx.html") ชี้ไปไฟล์ที่มีอยู่จริง
 *   6. ทุก <img> มี alt, ทุก <html> มี lang, ไม่มี user-scalable=no
 *   7. ตรวจว่าไม่มีคีย์ลับหลุดเข้ามาใน src/config.js
 *
 * รัน:  npm run check      (คืน exit code 1 ถ้าเจอปัญหา)
 * ==========================================================================*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import os from "node:os";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const warnings = [];
const ok = [];

const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);
const pass = (msg) => ok.push(msg);

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p) => fs.existsSync(path.join(ROOT, p));

const htmlFiles = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort();

/** ตัด comment (HTML + CSS) ก่อนตรวจ — ไม่งั้นคำอธิบายในคอมเมนต์จะถูกจับเป็นปัญหาปลอม */
const stripComments = (html) =>
  html
    .replace(/<!--[\s\S]*?-->/g, "")          // HTML comment
    .replace(/\/\*[\s\S]*?\*\//g, "")          // /* */ block comment
    // // line comment — ต้องข้าม "://" เพื่อไม่กิน URL (https://…)
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/* ── 0. ไฟล์ครบ ไม่ถูกตัดทอน ──────────────────────────────────────────────────
 * เคยเกิดจริง (fce3fe2, 68d1a5d): แก้ไฟล์ผ่านเครื่องมือภายนอกแล้วได้ไฟล์ที่ (ก) เหลือแค่ snippet CSS
 * หรือ (ข) บรรทัดยาวถูกตัดแล้วต่อท้ายด้วย marker ตัดทอน (ตัดกลางอักษรไทยจนเป็น U+FFFD) — หน้าเว็บพังทั้งหน้า
 * แต่ error อื่น ๆ ไม่บอกสาเหตุตรง ๆ ด่านนี้จึงอยู่หน้าสุด
 * (ห้ามพิมพ์ marker หรือ U+FFFD ตรง ๆ ในไฟล์นี้ ไม่งั้นไฟล์นี้จะโดนจับเอง — จึงประกอบค่าตอนรัน) */
const MARKER = "[" + "...]";
const REPLACEMENT_CHAR = String.fromCharCode(0xfffd);
const isTruncated = (line) => line.includes(MARKER) || line.includes(REPLACEMENT_CHAR);
const servedFiles = [
  ...htmlFiles,
  ...["src", "scripts"].flatMap((d) =>
    fs.readdirSync(path.join(ROOT, d)).filter((f) => /\.(m?js|css)$/.test(f)).map((f) => `${d}/${f}`)),
  ...["sw.js", "manifest.json", "package.json"].filter(exists),
];
let intact = true;
for (const f of servedFiles) {
  const line = read(f).split("\n").findIndex(isTruncated);
  if (line !== -1) {
    fail(`${f}: ไฟล์ถูกตัดทอน — บรรทัด ${line + 1} มี "${MARKER}" หรืออักขระเสีย (U+FFFD) → กู้จาก commit ก่อนหน้า อย่าแก้ต่อจากไฟล์นี้`);
    intact = false;
  }
}
for (const f of htmlFiles) {
  const html = read(f).trim();
  if (!/^<!doctype html>/i.test(html) || !/<\/html>$/i.test(html)) {
    fail(`${f}: ไม่ใช่เอกสาร HTML ที่ครบ (ต้องขึ้นต้นด้วย <!doctype html> และจบด้วย </html>) — ถูกเขียนทับด้วย snippet?`);
    intact = false;
  }
}
if (intact) pass(`ไฟล์ครบ ไม่ถูกตัดทอน (${servedFiles.length} ไฟล์)`);

/* ── 1+2. syntax ของ JavaScript ───────────────────────────────────────────── */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fhs-check-"));

function checkJs(code, label) {
  const file = path.join(tmp, label.replace(/[^\w.-]/g, "_") + ".mjs");
  fs.writeFileSync(file, code);
  const r = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (r.status !== 0) {
    const msg = (r.stderr || "").split("\n").slice(0, 6).join("\n");
    fail(`syntax ผิดใน ${label}\n${msg}`);
    return false;
  }
  return true;
}

for (const file of htmlFiles) {
  const html = read(file);
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m, i = 0;
  while ((m = re.exec(html))) {
    const attrs = m[1] || "";
    const body = m[2] || "";
    if (/\bsrc\s*=/.test(attrs)) continue;          // สคริปต์ภายนอก ไม่ต้องตรวจ
    if (!body.trim()) continue;
    i++;
    const isModule = /type\s*=\s*["']module["']/i.test(attrs);
    checkJs(body, `${file}#script${i}${isModule ? "" : " (classic)"}`);
  }
  if (i) pass(`${file}: ตรวจ ${i} inline script ผ่าน`);
}

for (const dir of ["src", "scripts"]) {
  if (!exists(dir)) continue;
  for (const f of fs.readdirSync(path.join(ROOT, dir))) {
    if (!/\.(m?js)$/.test(f)) continue;
    checkJs(read(path.join(dir, f)), `${dir}/${f}`);
  }
  pass(`${dir}/: ตรวจ syntax ผ่าน`);
}

/* ── 2b. ตรวจ import/export ให้ตรงกัน ──────────────────────────────────────────
 * repo นี้ไม่มี build step — ถ้า import ชื่อที่โมดูลไม่ได้ export ออกมา โค้ดจะพัง
 * ตอนรันในเบราว์เซอร์เท่านั้น (node --check จับไม่ได้) ตัวนี้จึงไล่จับให้
 * โดยเฉพาะกับ src/*.js ที่ทุกหน้าอ้างถึง                                         */
function exportedNames(code) {
  const names = new Set();
  // export const/let/var/function/class NAME
  for (const m of code.matchAll(/\bexport\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  // export { a, b as c }
  for (const m of code.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const t = part.trim(); if (!t) continue;
      names.add((t.split(/\s+as\s+/)[1] || t).trim());
    }
  }
  return names;
}

const moduleCache = new Map();
function moduleExports(relPath) {
  if (moduleCache.has(relPath)) return moduleCache.get(relPath);
  let set = null;
  if (exists(relPath)) set = exportedNames(read(relPath));
  moduleCache.set(relPath, set);
  return set;
}

for (const file of htmlFiles) {
  const html = stripComments(read(file));
  for (const m of html.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'](\.[^"']+)["']/g)) {
    const names = m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
    const spec = m[2];
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
    const exp = moduleExports(target);
    if (exp === null) { fail(`${file}: import จาก ${spec} แต่ไม่พบไฟล์`); continue; }
    for (const n of names) {
      if (!exp.has(n)) fail(`${file}: import "${n}" จาก ${spec} แต่ไฟล์นั้นไม่ได้ export ชื่อนี้`);
    }
  }
  // import แบบ namespace / default ก็ต้องมีไฟล์จริง
  for (const m of html.matchAll(/import\s+(?:\*\s+as\s+\w+|\w+)\s+from\s*["'](\.[^"']+)["']/g)) {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1]));
    if (!exists(target)) fail(`${file}: import จาก ${m[1]} แต่ไม่พบไฟล์`);
  }
}
pass("import/export ระหว่างหน้าเว็บกับ src/ ตรงกัน");

/* ── 2c. ห้ามเขียนทับชื่อที่ import มา ───────────────────────────────────────
 * import binding เป็นค่าคงที่ — `esc = ...` จะโยน TypeError ตอนโหลดหน้า
 * (ไม่ใช่ syntax error จึงผ่าน node --check ไปได้)                            */
for (const file of htmlFiles) {
  const html = stripComments(read(file));
  const imported = new Set();
  for (const m of html.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
    for (const part of m[1].split(",")) {
      const t = part.trim();
      if (!t) continue;
      imported.add((t.split(/\s+as\s+/)[1] || t).trim());
    }
  }
  if (!imported.size) continue;
  // หา "ชื่อ =" ที่ไม่ใช่ ==, ===, =>, <=, >=, != และไม่ใช่การประกาศ (const/let/var)
  for (const name of imported) {
    const re = new RegExp(`(?<![-.\\w$])(?:const|let|var)?\\s*\\b${name}\\b\\s*(?:\\+\\+|--)?\\s*=(?!=|>)`, "g");
    for (const m of html.matchAll(re)) {
      const before = html.slice(Math.max(0, m.index - 40), m.index);
      if (/\b(const|let|var)\s+$/.test(before)) continue;   // ประกาศชื่อใหม่ทับ scope ใน — ต้องดูด้วยตา
      fail(`${file}: เขียนทับชื่อ "${name}" ที่ import มา (import binding แก้ไม่ได้ → TypeError ตอนโหลด)`);
    }
  }
}
pass("ไม่มี import binding ถูกเขียนทับ");

/* ── 2d. คีย์ data-i18n ต้องมีอยู่ในพจนานุกรม ────────────────────────────────
 * คีย์ที่ไม่มีจะถูกแทนด้วย "คีย์" เองหรือสตริงว่าง → เห็นเป็นข้อความผิดปกติบนจอ
 * ดึงคีย์จาก COMMON ใน src/i18n.js + dict ของหน้านั้น (บล็อก th:{...} )        */
const dictKeyRe = /(?:^|[\s{,])([a-z][a-z0-9_]*)\s*:\s*(?:'[^'\n]*'|"[^"\n]*")/g;
const keyOf = (text) => new Set([...text.matchAll(dictKeyRe)].map((m) => m[1]));
const commonKeys = keyOf(read("src/i18n.js"));
for (const file of htmlFiles) {
  const html = stripComments(read(file));
  const used = [...html.matchAll(/data-i18n(?:-html|-ph|-title|-aria|-value)?="([^"]+)"/g)].map((m) => m[1]);
  if (!used.length) continue;
  const dictKeys = new Set([...commonKeys, ...keyOf(html)]);
  const missing = [...new Set(used)].filter((k) => !dictKeys.has(k));
  if (missing.length) fail(`${file}: data-i18n ใช้คีย์ที่ไม่มีในพจนานุกรม → ${missing.join(", ")}`);
}
pass("คีย์ data-i18n มีอยู่ในพจนานุกรม (COMMON + dict ของหน้า)");

/* ── 3. JSON ──────────────────────────────────────────────────────────────── */
for (const f of ["manifest.json", "package.json"]) {
  if (!exists(f)) continue;
  try { JSON.parse(read(f)); pass(`${f}: JSON ถูกต้อง`); }
  catch (e) { fail(`${f}: JSON ไม่ถูกต้อง — ${e.message}`); }
}

/* ── 4. service worker ────────────────────────────────────────────────────── */
if (exists("sw.js")) {
  const sw = read("sw.js");
  const cacheName = sw.match(/const CACHE\s*=\s*["']([^"']+)["']/);
  if (!cacheName) fail("sw.js: ไม่พบตัวแปร CACHE");
  else pass(`sw.js: CACHE = "${cacheName[1]}"`);

  const coreBlock = sw.match(/const CORE\s*=\s*\[([\s\S]*?)\]/);
  if (coreBlock) {
    const urls = [...coreBlock[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]);
    for (const u of urls) {
      if (/^https?:/.test(u)) continue;
      if (!exists(u)) fail(`sw.js: CORE อ้างไฟล์ที่ไม่มีอยู่จริง → ${u}`);
    }
    pass(`sw.js: ตรวจ CORE ${urls.length} รายการ`);
  }
}

/* ── 5+6. ตรวจ HTML ทั่วไป ────────────────────────────────────────────────── */
const IGNORE_LINK_RE = /^(https?:|mailto:|tel:|#|javascript:)/i;

for (const file of htmlFiles) {
  const html = stripComments(read(file));

  if (!/<html[^>]*\slang=/i.test(html)) fail(`${file}: <html> ไม่ได้ระบุ lang`);

  if (/user-scalable\s*=\s*no/i.test(html) || /maximum-scale\s*=\s*1/i.test(html)) {
    fail(`${file}: viewport ปิดการซูม (user-scalable=no / maximum-scale=1) — ผิดหลัก accessibility`);
  }

  // <img> ต้องมี alt
  for (const tag of html.match(/<img\b[^>]*>/gi) || []) {
    if (!/\balt\s*=/.test(tag)) fail(`${file}: <img> ไม่มี alt → ${tag.slice(0, 90)}`);
  }

  // ลิงก์ภายในต้องมีอยู่จริง
  for (const tag of html.match(/<a\b[^>]*href\s*=\s*["'][^"']+["'][^>]*>/gi) || []) {
    const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1] || "";
    if (IGNORE_LINK_RE.test(href)) continue;
    if (href.includes("${")) continue;        // ลิงก์ที่ประกอบจากเทมเพลต JS — ตรวจตอน build ไม่ได้
    const clean = href.split("#")[0].split("?")[0];
    if (clean && !exists(clean)) fail(`${file}: ลิงก์ไปไฟล์ที่ไม่มีอยู่ → ${href}`);
  }

  // ปุ่มควรมี type (กัน submit ฟอร์มโดยไม่ตั้งใจ)
  const buttonNoType = (html.match(/<button\b(?![^>]*\btype=)[^>]*>/gi) || []).length;
  if (buttonNoType) warn(`${file}: มี <button> ${buttonNoType} ปุ่มที่ไม่ได้ระบุ type`);

  // inline handler (ขวาง CSP)
  const inlineHandlers = (html.match(/\son(click|change|input|keydown|load|error)\s*=/gi) || []).length;
  if (inlineHandlers) warn(`${file}: มี inline event handler ${inlineHandlers} จุด (ตั้ง CSP เข้มไม่ได้)`);
}

/* ── 7. ตรวจว่าไม่มีคีย์ลับหลุด ───────────────────────────────────────────── */
if (exists("src/config.js")) {
  const cfg = read("src/config.js");
  const secretPatterns = [
    [/private_key/i, "private_key"],
    [/BEGIN (RSA |EC )?PRIVATE KEY/, "PEM private key"],
    [/api_secret\s*[:=]\s*["'][^"']+["']/i, "Cloudinary api_secret"],
    [/service_account/i, "service account"],
    [/client_secret\s*[:=]\s*["'][^"']+["']/i, "client secret"],
  ];
  let dirty = false;
  for (const [re, name] of secretPatterns) {
    if (re.test(cfg)) { fail(`src/config.js: พบสิ่งที่ดูเหมือนความลับ (${name}) — ห้าม commit`); dirty = true; }
  }
  if (!dirty) pass("src/config.js: ไม่พบความลับหลุด");
}

/* ── สรุป ─────────────────────────────────────────────────────────────────── */
fs.rmSync(tmp, { recursive: true, force: true });

console.log("");
for (const p of ok) console.log(`  ✅ ${p}`);
if (warnings.length) {
  console.log("");
  for (const w of warnings) console.log(`  ⚠️  ${w}`);
}
if (errors.length) {
  console.log("");
  for (const e of errors) console.log(`  ❌ ${e}`);
}

console.log("");
console.log(errors.length
  ? `✖ พบปัญหา ${errors.length} ข้อ${warnings.length ? ` (+ คำเตือน ${warnings.length})` : ""}`
  : `✔ ผ่านทั้งหมด${warnings.length ? ` (มีคำเตือน ${warnings.length} ข้อ)` : ""}`);

process.exit(errors.length ? 1 : 0);
