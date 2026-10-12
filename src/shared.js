/* ============================================================================
 * FHS Inspection — ฟังก์ชันที่ใช้ร่วมกันทุกหน้า
 * ----------------------------------------------------------------------------
 * เดิมโค้ดเหล่านี้ถูกคัดลอกไว้ในทุกไฟล์ HTML (esc / sha256 / cld / tsDate …)
 * รวมมาไว้ที่เดียวเพื่อให้แก้บั๊กครั้งเดียวมีผลทั้งระบบ
 * ==========================================================================*/

import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ---------------------------------------------------------------------------
 * 1) esc — escape สำหรับ HTML ทั้ง text node และ attribute
 *
 * ⚠️ ของเดิมใช้ `div.textContent = s; return div.innerHTML` ซึ่ง **ไม่ escape
 *    เครื่องหมายคำพูด** ( " และ ' ) แต่ค่าจาก Firestore ถูก interpolate ลงใน
 *    attribute หลายจุด เช่น  class="${esc(x)}" , title="…" , data-full="${esc(u)}"
 *    → ถ้าค่ามี " ก็หลุดออกจาก attribute แล้ว inject HTML/JS ได้ (XSS)
 *    ตัวนี้ escape ครบ 5 ตัว (& < > " ') จึงปลอดภัยทั้งสองบริบท
 *    หมายเหตุ: เบราว์เซอร์จะ decode &#39; กลับเป็น ' เมื่อแสดงผล หน้าตาไม่เปลี่ยน
 * -------------------------------------------------------------------------*/
const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC_MAP[c]);

/** เหมือน esc แต่กันไว้ใช้กับค่าใน CSS/URL — ตัดอักขระที่ทำให้หลุดบริบท */
export const escUrl = (u) => {
  const s = String(u == null ? "" : u).trim();
  return /^(https?:|\/|\.\/|data:image\/)/i.test(s) ? esc(s) : "";
};

/* ---------------------------------------------------------------------------
 * 2) cld — ขอรูปย่อจาก Cloudinary แทนรูปเต็ม (ลด bandwidth มหาศาล)
 *    cld(url, 300)                                  → w_300,q_auto,f_auto
 *    cld(url, 'c_fill,w_300,h_300,q_auto,f_auto')   → ตามที่ระบุ
 *    cld(url, {w:300,h:300,crop:'fill'})            → สร้าง transform ให้
 *    URL ที่ไม่ใช่ Cloudinary → คืนค่าเดิม ไม่แตะ
 * -------------------------------------------------------------------------*/
export function cld(url, transform) {
  if (!url || typeof url !== "string") return url || "";
  const m = url.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/);
  if (!m) return url;

  const [, prefix, rest] = m;
  // แยกส่วนที่เป็น transform เดิมออก (ถ้ามี) เพื่อ "แทนที่" ไม่ใช่ซ้อนกัน
  // transform ของ Cloudinary ไม่มี "." แต่ public id มี → ใช้แยกได้
  const parts = rest.split("/");
  const hasExistingTransform = parts.length > 1 && !parts[0].includes(".") && /[,]|_[a-z]/.test(parts[0]);
  const tail = hasExistingTransform ? parts.slice(1).join("/") : rest;

  let tx;
  if (typeof transform === "number") tx = `w_${transform},q_auto,f_auto`;
  else if (typeof transform === "string" && transform) tx = `q_auto,f_auto,${transform}`.replace("q_auto,f_auto,q_auto,f_auto", "q_auto,f_auto");
  else if (transform && typeof transform === "object") {
    const { w, h, crop = "fill" } = transform;
    tx = [w && `w_${w}`, h && `h_${h}`, (w || h) && `c_${crop}`, "q_auto", "f_auto"].filter(Boolean).join(",");
  } else tx = "q_auto,f_auto";

  return `${prefix}${tx}/${tail}`;
}

/** รูปสี่เหลี่ยมจัตุรัสสำหรับ thumbnail */
export const thumb = (url, size) => cld(url, { w: size, h: size, crop: "fill" });

/* ---------------------------------------------------------------------------
 * 3) sha256 — ตรงกับที่ admin สร้างตอนตั้งรหัสผ่าน: SHA-256(salt + password)
 * -------------------------------------------------------------------------*/
export async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------------------------------------------------------------------------
 * 4) เวลา / ตัวเลข — รองรับ th/en
 *    tsDate รับได้ทั้ง Firestore Timestamp, Date, ISO string, epoch number
 * -------------------------------------------------------------------------*/
export function tsDate(ts) {
  if (ts == null) return null;
  if (typeof ts === "object" && typeof ts.toDate === "function") return ts.toDate();
  if (ts instanceof Date) return Number.isNaN(ts.getTime()) ? null : ts;
  if (typeof ts === "object" && typeof ts.seconds === "number") return new Date(ts.seconds * 1000);
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

const locale = (lang) => (lang === "en" ? "en-GB" : "th-TH");

export const fmt = (d, lang) =>
  d ? d.toLocaleString(locale(lang), { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

export const fmtD = (d, lang) =>
  d ? d.toLocaleDateString(locale(lang), { day: "2-digit", month: "short", year: "2-digit" }) : "—";

export const fmtTime = (d, lang) =>
  d ? d.toLocaleTimeString(locale(lang), { hour: "2-digit", minute: "2-digit" }) : "—";

export const fmtStamp = (d, lang) =>
  d ? d.toLocaleString(locale(lang)) : "—";

/** จำนวนวันเต็มที่ผ่านมา (สำหรับ "เกินกำหนด X วัน") */
export const daysAgo = (d) => (d ? Math.floor((Date.now() - d.getTime()) / 86400000) : null);

/** ป้ายวัน ISO สำหรับชื่อไฟล์ export */
export const isoDay = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/* ---------------------------------------------------------------------------
 * 5) haversine — ระยะทางจริงระหว่างพิกัดสองจุด หน่วยเป็นเมตร
 * -------------------------------------------------------------------------*/
export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

/* ---------------------------------------------------------------------------
 * 6) localStorage / sessionStorage แบบกันพัง
 *    (Safari โหมดส่วนตัว / iframe บางตัว โยน exception ตอนเรียก storage)
 * -------------------------------------------------------------------------*/
export const store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  },
  del(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
  getS(key, fallback = null) {
    try {
      const raw = sessionStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  setS(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  },
  delS(key) { try { sessionStorage.removeItem(key); } catch { /* ignore */ } },
};

/* ---------------------------------------------------------------------------
 * 7) session ของผู้ดูแล (dashboard / admin / report)
 *
 * ⚠️ ช่องโหว่ที่แก้: ของเดิม `sessionStorage.fhs_admin` ถูกเชื่อทันทีตอนบูต
 *    → ถ้า admin ลดสิทธิ์/ระงับบัญชีผู้ใช้คนนั้น ผู้ใช้ที่ยังเปิดแท็บค้างอยู่
 *      ยังเข้า Command Center ได้ต่อไปจนกว่าจะกดออกเอง
 *    ตัวนี้ตรวจกับ Firestore ซ้ำทุกครั้งที่บูต และล้าง session ถ้าไม่ผ่าน
 * -------------------------------------------------------------------------*/
export const ADMIN_ROLES = ["admin", "viewer"];

/** อ่าน session ที่เก็บไว้ (ยังไม่ตรวจสิทธิ์) */
export function readAdminSession() {
  const s = store.getS("fhs_admin");
  return s && s.id ? s : null;
}

export function writeAdminSession(admin) {
  store.setS("fhs_admin", { id: admin.id, name: admin.name || admin.id, role: admin.role });
}

export function clearAdminSession() {
  store.delS("fhs_admin");
}

/**
 * ตรวจ session กับ Firestore แล้วคืนค่า admin ที่ยังใช้ได้ (หรือ null)
 * @param {object} db          Firestore instance ของหน้านั้น
 * @param {(id:string)=>Promise<object|null>} fetchUser  ฟังก์ชันอ่าน users/{id}
 */
export async function verifyAdminSession(db, fetchUser) {
  const s = readAdminSession();
  if (!s) return null;

  const load = fetchUser || (async (id) => {
    const snap = await getDoc(doc(db, "users", id));
    return snap.exists() ? snap.data() : null;
  });

  try {
    const u = await load(s.id);
    if (u && ADMIN_ROLES.includes(u.role) && u.active !== false) {
      const admin = { id: s.id, name: u.name || s.id, role: u.role };
      writeAdminSession(admin);
      return admin;
    }
    clearAdminSession();          // บัญชีถูกระงับ/ลดสิทธิ์ → ตัดทันที
    return null;
  } catch {
    // ออฟไลน์/เน็ตล่ม: เชื่อ session เดิมชั่วคราว แต่ไม่ต่ออายุ
    return ADMIN_ROLES.includes(s.role) ? s : null;
  }
}

/* ---------------------------------------------------------------------------
 * 8) ตรวจการล็อกอินผู้ตรวจ (index.html) — SHA-256(salt+password) + lockout
 * -------------------------------------------------------------------------*/
/**
 * @returns {Promise<{ok:true,user:object}|{ok:false,error:string}>}
 */
export async function verifyInspector(db, id, pw, rules, fetchUser, onFail, onLock) {
  const load = fetchUser || (async (uid) => {
    const snap = await getDoc(doc(db, "users", uid));
    return { exists: snap.exists(), data: snap.exists() ? snap.data() : null };
  });

  const snap = await load(id);
  const exists = snap.exists !== undefined ? snap.exists : !!snap.data;
  if (!exists) return { ok: false, error: "ไม่พบรหัสพนักงานนี้ในระบบ" };

  const u = snap.data ?? snap;
  if (u.active === false) return { ok: false, error: "บัญชีนี้ถูกระงับการใช้งาน" };

  const lockedUntil = tsDate(u.lockedUntil);
  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    const mins = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000);
    return { ok: false, error: `บัญชีถูกล็อกชั่วคราว ลองใหม่ใน ${mins} นาที` };
  }

  const hash = await sha256((u.salt || "") + pw);
  if (hash !== u.passwordHash) {
    if (onFail) return onFail(u);                       // หน้านั้นจัดการนับรอบ/ล็อกเอง
    return { ok: false, error: "รหัสผ่านไม่ถูกต้อง" };
  }

  if (onLock) await onLock(u);
  return { ok: true, user: { id, name: u.name || id, role: u.role || "inspector", site: u.site || "" } };
}

/* ---------------------------------------------------------------------------
 * 9) toast — แจ้งเตือนลอย มุมล่าง พร้อม aria-live สำหรับ screen reader
 * -------------------------------------------------------------------------*/
let toastEl = null;
let toastTimer = null;
export function toast(msg, isError = false, ms = 4200) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.id = "fhsToast";
    toastEl.setAttribute("role", "status");
    toastEl.setAttribute("aria-live", "polite");
    toastEl.style.cssText =
      "position:fixed;left:50%;bottom:22px;transform:translateX(-50%);max-width:92vw;padding:11px 16px;" +
      "border-radius:11px;color:#fff;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,.25);" +
      "transition:opacity .3s,top .3s;text-align:center;pointer-events:none;opacity:0";
    document.body.appendChild(toastEl);
  }
  toastEl.style.background = isError ? "#D62828" : "#0E8A5F";
  toastEl.textContent = msg;
  toastEl.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.style.opacity = "0"; }, ms);
}

/* ---------------------------------------------------------------------------
 * 10) misc
 * -------------------------------------------------------------------------*/
export const $ = (id) => document.getElementById(id);

export function debounce(fn, ms = 300) {
  let t = null;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export const prefersReducedMotion = () =>
  !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

export const isOnline = () => navigator.onLine !== false;

/** ปี พ.ศ. สำหรับเอกสารไทย (2026 → 2569) */
export const thaiYear = (d = new Date()) => d.getFullYear() + 543;
