/* ============================================================================
 * FHS Inspection — ระบบสองภาษา (ไทย / อังกฤษ) ใช้ร่วมกันทุกหน้า
 * ----------------------------------------------------------------------------
 * กติกาชื่อ (สำคัญ — เคยทำ dashboard พังมาแล้ว):
 *   helper แปลแบบ inline ชื่อ **TL(en, th)** เสมอ
 *   ❌ ห้ามตั้งชื่อ `L` เพราะ Leaflet ประกาศ global `L` ไว้ → ทับกันแล้วแผนที่พัง
 *
 * กลไก 2 ชั้นเหมือนเดิม แต่รวมศูนย์:
 *   1. attribute ใน HTML:  data-i18n / data-i18n-ph / data-i18n-title /
 *                          data-i18n-aria / data-i18n-html
 *   2. สตริงที่ JS สร้างเอง: TL('English','ไทย')  หรือ t('key')
 *
 * ค่าภาษาเก็บใน localStorage key เดียวกันทุกหน้า (`fhs_lang`) → สลับที่หน้าไหน
 * หน้าอื่นก็เปลี่ยนตาม
 * ==========================================================================*/

import { store } from "./shared.js";

export const LANG_KEY = "fhs_lang";

/**
 * @param {object} dict  { th:{...}, en:{...} }
 * @param {object} [opts]
 * @param {()=>void} [opts.onChange]  เรียกหลังสลับภาษา เพื่อ re-render ส่วนที่ JS สร้าง
 * @param {string}   [opts.defaultLang]
 * @param {string}   [opts.buttonId]  id ของปุ่มสลับภาษา (จะตั้งข้อความให้อัตโนมัติ)
 */
export function createI18n(dict, opts = {}) {
  const { onChange, defaultLang = "th", buttonId = "langBtn" } = opts;

  let lang = store.get(LANG_KEY, defaultLang === "en" ? "en" : "th");
  if (lang !== "th" && lang !== "en") lang = defaultLang;

  /** แปลจาก key — ถ้าไม่มี key ในภาษาที่เลือก จะถอยไปใช้ไทย แล้วค่อยใช้ key เอง */
  function t(key) {
    const table = dict[lang] || {};
    const fallback = dict[defaultLang] || {};
    const v = table[key];
    if (v !== undefined && v !== null) return v;
    return fallback[key] !== undefined ? fallback[key] : key;
  }

  /** แปลแบบ inline: TL('English','ไทย') */
  const TL = (en, th) => (lang === "en" ? en : th);

  /** เลือกค่าตามภาษาปัจจุบันจากออบเจ็กต์ {th, en} */
  const pick = (obj) => (obj && (obj[lang] ?? obj[defaultLang])) || "";

  function applyLang() {
    document.documentElement.lang = lang;

    for (const el of document.querySelectorAll("[data-i18n]")) {
      const k = el.dataset.i18n;
      if (k) el.textContent = t(k);
    }
    for (const el of document.querySelectorAll("[data-i18n-html]")) {
      const k = el.dataset.i18nHtml;
      if (k) el.innerHTML = t(k);            // ใช้เฉพาะสตริงที่เราคุมเอง (ไม่ใช่ค่าจาก DB)
    }
    for (const el of document.querySelectorAll("[data-i18n-ph]")) {
      const k = el.dataset.i18nPh;
      if (k) el.setAttribute("placeholder", t(k));
    }
    for (const el of document.querySelectorAll("[data-i18n-title]")) {
      const k = el.dataset.i18nTitle;
      if (k) el.setAttribute("title", t(k));
    }
    for (const el of document.querySelectorAll("[data-i18n-aria]")) {
      const k = el.dataset.i18nAria;
      if (k) el.setAttribute("aria-label", t(k));
    }
    for (const el of document.querySelectorAll("[data-i18n-value]")) {
      const k = el.dataset.i18nValue;
      if (k) el.setAttribute("value", t(k));
    }

    const lb = document.getElementById(buttonId);
    if (lb) {
      // ปุ่มโชว์ภาษาที่จะ "สลับไป" จึงเป็น lang ตรงข้าม
      lb.textContent = lang === "th" ? "EN" : "ไทย";
      lb.setAttribute("aria-label", lang === "th" ? "Switch to English" : "สลับเป็นภาษาไทย");
      lb.setAttribute("title", lang === "th" ? "Switch to English" : "สลับเป็นภาษาไทย");
      lb.setAttribute("lang", lang === "th" ? "en" : "th");
    }

    if (typeof onChange === "function") onChange();
  }

  function setLang(next) {
    lang = next === "en" ? "en" : "th";
    store.set(LANG_KEY, lang);
    applyLang();
  }

  const toggleLang = () => setLang(lang === "th" ? "en" : "th");

  /** ผูกปุ่มสลับภาษา + เรียก applyLang() ครั้งแรก */
  function bind() {
    const lb = document.getElementById(buttonId);
    if (lb) {
      lb.setAttribute("role", "button");
      lb.setAttribute("tabindex", "0");
      lb.addEventListener("click", toggleLang);
      lb.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleLang(); }
      });
    }
    applyLang();
  }

  return {
    get lang() { return lang; },
    t, TL, pick, applyLang, setLang, toggleLang, bind,
  };
}

/* ---------------------------------------------------------------------------
 * สตริงที่ใช้ร่วมกันหลายหน้า (nav / คำทั่วไป)
 * -------------------------------------------------------------------------*/
export const COMMON = {
  th: {
    nav_inspect: "ตรวจ", nav_dashboard: "Dashboard", nav_report: "รายงาน",
    nav_admin: "Admin", nav_manual: "คู่มือ",
    signout: "ออกระบบ", signin: "เข้าสู่ระบบ", f_empid: "รหัสพนักงาน", f_pw: "รหัสผ่าน",
    loading: "กำลังโหลด…", save: "บันทึก", cancel: "ยกเลิก", close: "ปิด", retry: "ลองใหม่",
    err_fill: "กรอกข้อมูลให้ครบ", err_nouser: "ไม่พบผู้ใช้", err_wrongpw: "รหัสผ่านไม่ถูกต้อง",
    err_offline: "ไม่มีสัญญาณอินเทอร์เน็ต — ข้อมูลจะซิงค์ให้อัตโนมัติเมื่อกลับมาออนไลน์",
    skip_to_content: "ข้ามไปที่เนื้อหาหลัก",
  },
  en: {
    nav_inspect: "Inspect", nav_dashboard: "Dashboard", nav_report: "Report",
    nav_admin: "Admin", nav_manual: "Manual",
    signout: "Sign out", signin: "Sign in", f_empid: "Employee ID", f_pw: "Password",
    loading: "Loading…", save: "Save", cancel: "Cancel", close: "Close", retry: "Retry",
    err_fill: "Please fill in all fields", err_nouser: "User not found", err_wrongpw: "Incorrect password",
    err_offline: "No connection — your data will sync automatically when you're back online",
    skip_to_content: "Skip to main content",
  },
};

/** รวม COMMON เข้ากับ dict ของหน้านั้น (dict ของหน้าชนะถ้า key ซ้ำ) */
export function mergeDict(dict) {
  return {
    th: { ...COMMON.th, ...(dict.th || {}) },
    en: { ...COMMON.en, ...(dict.en || {}) },
  };
}
