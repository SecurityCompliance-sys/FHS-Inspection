#!/usr/bin/env node
/* ============================================================================
 * Smoke test — โหลดสคริปต์ของทุกหน้าใน Node แล้วดูว่าพังตอนรันหรือไม่
 * ----------------------------------------------------------------------------
 * ทำไมต้องมี: repo นี้ไม่มี build step และไม่มี bundler สคริปต์ทุกหน้าจึงรัน
 * ครั้งแรกก็บนเบราว์เซอร์ของผู้ตรวจ — `node --check` บอกได้แค่ "syntax ผ่าน"
 * แต่จับไม่ได้เลย:
 *   • เรียกฟังก์ชันที่ไม่มีอยู่ (ReferenceError ตอนโหลด → หน้าจอขาว)
 *   • ลำดับ const/let ผิด (TDZ) เช่นเรียกใช้ก่อนประกาศ
 *   • import ชื่อที่ไม่มีในโมดูล (V8 โยนข้อผิดพลาดตอน link)
 *   • เขียนทับ import binding
 *
 * วิธีทำ: ดึง <script type="module"> ของแต่ละหน้า, เปลี่ยน import ที่ชี้ไป
 * ภายนอก (gstatic/unpkg/…) ให้เป็น stub ที่สร้างขึ้นชั่วคราว, แล้ว import จริง
 * ใน Node โดยมี DOM ปลอม (Proxy) — ไม่ต้องใช้เบราว์เซอร์และไม่ต้องต่อเน็ต
 *
 * ข้อจำกัด: ไม่ได้ตรวจผลลัพธ์ทางหน้าจอหรือการเชื่อมต่อ Firestore จริง
 *           ตรวจได้แค่ว่า "โค้ดโหลดและรันช่วงต้นได้โดยไม่โยนข้อผิดพลาด"
 *
 * ใช้:  node scripts/smoke.mjs          (exit 0 = ผ่าน, 1 = มีหน้าพัง)
 * ==========================================================================*/

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fhs-smoke-"));

/* ───────────────────────────── DOM ปลอม ─────────────────────────────
 * ใช้ Proxy เพื่อให้ทุก property/เมธอดที่โค้ดหน้าเว็บเรียกมีอยู่เสมอ
 * จุดประสงค์ไม่ใช่จำลองเบราว์เซอร์ให้ครบ แต่เพื่อให้โค้ดเดินต่อไปได้
 * จนถึงบรรทัดที่เราต้องการตรวจ (ถ้าพังจะพังด้วยข้อผิดพลาดจริง)              */
function makeElement(tag = "div") {
  const t = {
    tagName: String(tag).toUpperCase(),
    style: {},
    dataset: {},
    children: [],
    options: [],
    value: "",
    textContent: "",
    innerHTML: "",
    checked: false,
    hidden: false,
    disabled: false,
    files: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  };
  return new Proxy(t, {
    get(target, key) {
      if (key === Symbol.iterator) return function* () {};
      if (key === Symbol.toPrimitive) return () => "";
      if (key === "then") return undefined;          // อย่าให้ await แล้วค้าง
      if (key in target) return target[key];
      if (typeof key !== "string") return undefined;
      if (key === "getAttribute") return () => null;
      if (key === "closest") return () => null;
      if (key === "querySelectorAll" || key === "getElementsByTagName") return () => [];
      if (key === "querySelector") return () => null;
      if (key === "appendChild" || key === "insertBefore" || key === "removeChild") return (x) => x;
      if (key === "insertAdjacentHTML") return () => {};
      if (key === "focus" || key === "blur" || key === "scrollIntoView" || key === "remove") return () => {};
      if (key === "toBlob") return (cb) => cb?.(null);
      if (key === "getContext") return () => makeElement("canvas");
      return () => undefined;
    },
    set(target, key, v) { target[key] = v; return true; },
    has() { return true; },
  });
}

const elements = new Map();
function installDom() {
  const document = {
    documentElement: makeElement("html"),
    body: makeElement("body"),
    head: makeElement("head"),
    title: "",
    getElementById(id) {
      // คืน element เดิมทุกครั้ง (โค้ดบางหน้าอ้างถึงซ้ำและเทียบ identity)
      if (!elements.has(id)) elements.set(id, makeElement("div"));
      return elements.get(id);
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => makeElement(tag),
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
    cookie: "",
  };
  const storage = () => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: () => null, get length() { return m.size; } };
  };
  const location = {
    href: "https://example.test/FHS-Inspection/dashboard.html",
    origin: "https://example.test",
    pathname: "/FHS-Inspection/dashboard.html",
    search: "",
    hash: "",
    protocol: "https:",
    hostname: "example.test",
    reload() {},
    assign() {},
    replace() {},
  };
  const win = {
    document, location,
    localStorage: storage(), sessionStorage: storage(),
    navigator: { onLine: true, userAgent: "node-smoke", language: "th-TH", serviceWorker: { register: async () => ({ addEventListener() {} }), ready: Promise.resolve({}) } },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    addEventListener() {}, removeEventListener() {},
    setTimeout, clearTimeout, setInterval, clearInterval,
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => "", blob: async () => null }),
    open: () => null,
    print() {}, alert() {}, confirm: () => true, prompt: () => null,
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    cancelAnimationFrame: () => {},
    crypto: globalThis.crypto,
    URL, URLSearchParams, Blob: globalThis.Blob, FormData: globalThis.FormData,
    CustomEvent: class { constructor(t, o) { this.type = t; Object.assign(this, o); } },
    Event: class { constructor(t) { this.type = t; } },
    Image: class { constructor() { return makeElement("img"); } },
    DataTransfer: class {},
    File: globalThis.File || class {},
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
  };
  win.window = win;
  win.self = win;
  win.globalThis = win;
  win.history = { pushState() {}, replaceState() {}, back() {}, forward() {}, go() {} };
  win.screen = { width: 1280, height: 800, orientation: { type: "portrait-primary" } };
  win.devicePixelRatio = 1;
  win.innerWidth = 1280;
  win.innerHeight = 800;
  win.scrollY = 0;
  win.scrollX = 0;
  win.Notification = class { static permission = "denied"; static requestPermission = async () => "denied"; };
  win.speechSynthesis = { speak() {}, cancel() {} };
  win.SpeechSynthesisUtterance = class {};
  win.URL = URL;
  win.URLSearchParams = URLSearchParams;
  win.crypto = globalThis.crypto;
  win.atob = globalThis.atob;
  win.btoa = globalThis.btoa;
  win.structuredClone = globalThis.structuredClone;

  /* อะไรที่ยังไม่มีให้เป็น no-op แทนที่จะโยน TypeError — เว้นพวกที่โค้ดใช้
   * ตรวจ feature (ต้องเป็น undefined จริง ไม่งั้นจะเลือกทางที่เบราว์เซอร์ไม่เลือก) */
  const MUST_BE_UNDEFINED = new Set([
    "XLSX", "L", "emailjs", "firebase", "Html5Qrcode", "Html5QrcodeScanner",
    "BarcodeDetector", "NDEFReader", "FaceDetector", "indexedDB",
  ]);
  const permissive = new Proxy(win, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === "string" && MUST_BE_UNDEFINED.has(k)) return undefined;
      if (typeof k !== "string") return undefined;
      return () => undefined;
    },
    has() { return true; },
    set(t, k, v) { t[k] = v; return true; },
  });

  globalThis.window = permissive;
  globalThis.document = document;
  globalThis.location = location;
  // globalThis.navigator มี getter อย่างเดียวใน Node ≥21 — ต้อง defineProperty
  Object.defineProperty(globalThis, "navigator", { value: win.navigator, configurable: true, writable: true });
  globalThis.localStorage = win.localStorage;
  globalThis.sessionStorage = win.sessionStorage;
  globalThis.matchMedia = win.matchMedia;
  globalThis.alert = win.alert;
  globalThis.confirm = win.confirm;
  globalThis.open = win.open;
  globalThis.getComputedStyle = win.getComputedStyle;
  globalThis.requestAnimationFrame = win.requestAnimationFrame;
  return win;
}

/* ───────────────────── stub สำหรับโมดูลภายนอก ─────────────────────
 * ทุกชื่อ export เป็นตัวเดียวกัน: เรียกได้, await ได้ (ไม่ใช่ thenable),
 * เข้าถึง property อะไรก็ได้ เพื่อให้โค้ดเดินต่อไปโดยไม่โยน TypeError        */
function stubSource(names) {
  const body = `
const stub = new Proxy(function () {}, {
  get(t, k) {
    if (k === "then") return undefined;      // อย่าให้ await แล้วค้าง
    if (k === Symbol.toPrimitive) return () => 0;
    if (k === Symbol.iterator) return function* () {};
    if (k === "toString") return () => "";
    return stub;
  },
  apply() { return stub; },
  construct() { return stub; },
});
`;
  const lines = names.map((n) => `export const ${n} = stub;`);
  return body + lines.join("\n") + "\n";
}

/** ดึง <script type="module"> ทั้งหมดของไฟล์ HTML */
function extractModules(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((m) => /\btype\s*=\s*["']module["']/i.test(m[1]) && m[2].trim())
    .map((m) => m[2]);
}

/* ─────────────── epilogue: เรียกฟังก์ชันวาดผลลัพธ์จริง ───────────────
 * การ "import ผ่าน" เฉย ๆ ไม่พอ เพราะโค้ดวาดผล (renderX) ถูกเรียกตอนมีข้อมูล
 * บั๊กส่วนใหญ่จึงซ่อนอยู่ในนั้น (เช่น template literal ที่เครื่องหมาย backtick
 * หลุด ทำให้ได้ SyntaxError ตอนไฟล์โหลด หรือ undefined ตอนเรียกใช้)
 *
 * ต่อท้ายโมดูลด้วยโค้ดที่เรียกฟังก์ชันเหล่านั้นด้วยข้อมูลว่าง — eval() แบบ direct
 * มองเห็น binding ระดับโมดูล จึงเรียกฟังก์ชันภายในได้โดยไม่ต้อง export อะไรออกไป
 * เลือกเฉพาะชื่อที่ขึ้นต้นด้วย verb ที่ปลอดภัย และกันชื่อที่ "เขียนข้อมูล" ออก   */
const epilogue = (names) => `
const __SMOKE_SAFE = /^(render|draw|populate|update|compute|build|get|count|refresh|weekRange|freqOf|planInfo|caseStatusLabel|resultLabel|clLabel|eqLabel|delta|inRange|getAlerts)/;
const __SMOKE_UNSAFE = /(save|saveUser|submit|upload|send|delete|del|remove|clear|clr|logout|login|seed|export|print|open|capture|process|start|stop|scan|reset|loadAll)/i;
const __SMOKE_FOUND = ${JSON.stringify(names)};

/* ใส่ข้อมูลตั้งต้นเท่าที่จำเป็น — ฟังก์ชันวาดผลหลายตัวสมมติว่ามีผู้ใช้ล็อกอิน
 * หรือมีตัวแปรสถานะถูกประกาศแล้ว ถ้าไม่มีจะโยน error ที่ไม่ใช่บั๊กจริง
 * ใช้ eval() แบบ direct เพื่อเขียนค่าลง binding ระดับโมดูล (เฉพาะ let/var)      */
const __SMOKE_FIXTURES__ = {
  ADMIN: { id: "smoke", name: "Smoke Admin", role: "admin" },
  USERS: [],
  CAMERAS: [],
  STATIONS: [],
  INSPECTIONS: [],
  CASES: [],
  ALL_HISTORY: [],
  CUR_CASE: null,
};
for (const __k of Object.keys(__SMOKE_FIXTURES__)) {
  const __v = __SMOKE_FIXTURES__[__k];
  try {
    const __cur = eval(__k);
    // ปล่อยค่าเดิมไว้ถ้ามีข้อมูลจริงอยู่แล้ว (อาเรย์ที่มีสมาชิก)
    if (Array.isArray(__cur) && __cur.length) continue;
    if (__cur !== undefined && __v === null) continue;
    eval(\`\${__k} = __SMOKE_FIXTURES__["\${__k}"]\`);
  } catch { /* ตัวแปรนี้ไม่มีในหน้านี้ / เป็น const → ข้าม */ }
}
const __SMOKE_FAILED = [];
for (const __n of __SMOKE_FOUND) {
  if (!__SMOKE_SAFE.test(__n) || __SMOKE_UNSAFE.test(__n)) continue;
  let __fn;
  try { __fn = eval(__n); } catch { continue; }        // ไม่ใช่ฟังก์ชัน/อยู่นอก scope
  if (typeof __fn !== "function") continue;
  if (__fn.length > 2) continue;                       // ต้องเรียกได้โดยไม่ส่ง argument
  try {
    const __r = __fn();
    if (__r && typeof __r.then === "function") await __r;
  } catch (__e) {
    __SMOKE_FAILED.push(\`\${__n}(): \${__e && __e.message ? __e.message : __e}\`);
  }
}
if (__SMOKE_FAILED.length) {
  throw new Error("ฟังก์ชันวาดผลทำงานไม่ผ่าน — " + __SMOKE_FAILED.join(" | "));
}
`;

/** ชื่อฟังก์ชันที่ประกาศในโมดูลนี้ (ไว้ให้ epilogue เรียก) */
function declaredFunctions(code) {
  const names = new Set();
  for (const m of code.matchAll(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/gm)) {
    const params = m[2].trim();
    // เอาเฉพาะที่เรียกด้วย 0 argument ได้ (ไม่มีพารามิเตอร์ หรือมีแต่ค่า default)
    if (!params || /^[\w$]+\s*=\s*[^,]+(,\s*[\w$]+\s*=\s*[^,]+)*$/.test(params)) names.add(m[1]);
  }
  return [...names];
}

/** แทนที่ import ที่ชี้ภายนอกด้วย stub และคืนรายชื่อ dependency ภายนอกทั้งหมด
 *  - http(s):// → stub ที่สร้างชั่วคราว (ไม่ต้องต่อเน็ต)
 *  - ./ หรือ ../ → เปลี่ยนเป็น file:// แบบ absolute เพราะไฟล์ชั่วคราวอยู่คนละที่
 *    กับหน้าเว็บ (ไม่งั้นจะ resolve ไม่เจอ src/config.js)                     */
function rewriteImports(code, stubDir, pageName) {
  let i = 0;
  const externals = new Set();
  let out = code.replace(
    /import\s+([\s\S]*?)\s+from\s+["'](https?:\/\/[^"']+)["']/g,
    (full, clause, spec) => {
      externals.add(spec);
      const names = [...clause.matchAll(/\{([^}]*)\}/g)]
        .flatMap((m) => m[1].split(","))
        .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
        .filter(Boolean);
      const file = path.join(stubDir, `${pageName}-ext-${i++}.mjs`);
      fs.writeFileSync(file, stubSource(names));
      return full.replace(spec, pathToFileURL(file).href);
    },
  );
  out = out.replace(/from\s+["'](\.[^"']+)["']/g, (full, spec) => {
    // ชี้ไปสำเนาใน temp (ไม่ใช่ไฟล์จริง) เพราะไฟล์ใน src/ เองก็ import จาก https
    const abs = path.resolve(ROOT, spec);
    const rel = path.relative(path.join(ROOT, "src"), abs);
    const target = abs.startsWith(path.join(ROOT, "src"))
      ? path.join(SRC_OUT, rel)
      : abs;                                  // ไฟล์นอกรอบ src/ ใช้ของจริงได้เลย
    return `from ${JSON.stringify(pathToFileURL(target).href)}`;
  });
  return { code: out, externals: [...externals] };
}

/** คัดลอก src/ ไป temp โดยเปลี่ยน import จาก https ให้เป็น stub */
const SRC_OUT = path.join(tmp, "src");
function prepareSrc() {
  fs.mkdirSync(SRC_OUT, { recursive: true });
  for (const f of fs.readdirSync(path.join(ROOT, "src"))) {
    let code = fs.readFileSync(path.join(ROOT, "src", f), "utf8");
    code = code.replace(
      /import\s+([\s\S]*?)\s+from\s+["'](https?:\/\/[^"']+)["']/g,
      (full, clause) => {
        const names = [...clause.matchAll(/\{([^}]*)\}/g)]
          .flatMap((m) => m[1].split(","))
          .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
          .filter(Boolean);
        const file = path.join(tmp, `srcext-${f}-${names.length}-${names[0] || "x"}.mjs`);
        fs.writeFileSync(file, stubSource(names));
        return full.replace(/["']https?:\/\/[^"']+["']/, JSON.stringify(pathToFileURL(file).href));
      },
    );
    fs.writeFileSync(path.join(SRC_OUT, f), code);
  }
}

/* ───────────────────────────── รัน ───────────────────────────── */
installDom();
prepareSrc();
globalThis.window.emailjs = { init() {}, send: async () => ({ status: 200 }) };
globalThis.emailjs = globalThis.window.emailjs;
globalThis.firebase = { initializeApp: () => ({}) };
globalThis.L = new Proxy(function () {}, { get: () => globalThis.L, apply: () => globalThis.L, construct: () => globalThis.L });
globalThis.XLSX = globalThis.L;
globalThis.Html5Qrcode = globalThis.L;
globalThis.Html5QrcodeScanner = globalThis.L;
globalThis.html5Qrcode = globalThis.L;

const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort();
let failed = 0;
let checked = 0;

for (const page of pages) {
  const html = fs.readFileSync(path.join(ROOT, page), "utf8");
  const mods = extractModules(html);
  if (!mods.length) {
    console.log(`  ⏭  ${page}: ไม่มี inline module (ข้าม)`);
    continue;
  }
  for (const [idx, code] of mods.entries()) {
    const tag = `${page}${mods.length > 1 ? `#${idx + 1}` : ""}`;
    const { code: rewritten, externals } = rewriteImports(code, tmp, `${page}-${idx}`);
    const file = path.join(tmp, `${page}-${idx}.mjs`);
    const fns = declaredFunctions(rewritten);
    fs.writeFileSync(file, rewritten + epilogue(fns));
    try {
      await import(pathToFileURL(file).href);
      checked++;
      const note = externals.length ? `  (stub ${externals.length} external module)` : "";
      console.log(`  ✅ ${tag}: โหลดและรันช่วงต้นได้${note}`);
    } catch (err) {
      failed++;
      const msg = String(err && err.stack ? err.stack.split("\n").slice(0, 4).join("\n      ") : err);
      console.log(`  ❌ ${tag}: ${err && err.name ? err.name + ": " : ""}${err && err.message ? err.message : err}`);
      console.log(`      ${msg}`);
    }
  }
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }

console.log("");
if (failed) {
  console.log(`✖ ${failed} สคริปต์โหลดไม่ผ่าน (ตรวจ ${checked + failed} ไฟล์)`);
  process.exit(1);
}
console.log(`✔ smoke test ผ่านทั้งหมด (${checked} สคริปต์)`);
