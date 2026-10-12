/* ============================================================================
 * FHS Inspection — ศูนย์รวมการตั้งค่าทั้งระบบ (single source of truth)
 * ----------------------------------------------------------------------------
 * เดิมค่าพวกนี้ถูกคัดลอกไว้ใน index.html / admin.html / dashboard.html / report.html
 * แยกกันคนละชุด → แก้ที่เดียวไม่ครบ ไฟล์นี้ทำให้แก้ที่เดียวจบ
 *
 * ⚠️  ไฟล์นี้ถูกเสิร์ฟแบบสาธารณะบน GitHub Pages (repo เป็น public)
 *     - FIREBASE_CONFIG / CLOUDINARY_CONFIG / EMAILJS publicKey = ค่า public by design
 *       (Firebase web config ไม่ใช่ความลับ — ความปลอดภัยจริงอยู่ที่ Firestore Rules
 *        และ Cloudinary upload preset ที่ตั้ง signed/allowed-formats ไว้)
 *     - SITE_RECIPIENTS = มองเห็นได้ ถือเป็นข้อมูลภายใน ไม่ใช่ความลับระดับรหัสผ่าน
 *     - ❌ ห้ามใส่: service account key, Cloudinary api_secret, รหัสผ่าน, private token
 *        ในไฟล์นี้เด็ดขาด — ถ้าต้องใช้ของจริงให้ย้ายไป server/Cloud Function
 * ==========================================================================*/

/* ---------- 1. Firebase (Firestore) ---------- */
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBusmdWb1BuElcAgZ8IC4-bwUW0p8X0ifg",
  authDomain: "bevchain-fhs.firebaseapp.com",
  projectId: "bevchain-fhs",
  storageBucket: "bevchain-fhs.firebasestorage.app",
  messagingSenderId: "568964415233",
  appId: "1:568964415233:web:4be7220d2d14644fbce500",
};

/* ---------- 2. Cloudinary (รูปหลักฐาน → ไม่ใช้ Firebase Storage) ---------- */
export const CLOUDINARY_CONFIG = {
  cloudName: "diiqvxqqd",
  uploadPreset: "fhs_inspection",
};

/* ---------- 3. EmailJS (ใช้เฉพาะ report.html) ----------
 * สมัคร emailjs.com → สร้าง service + template ที่มีตัวแปร:
 *   {{to_email}}  {{subject}}  {{{html_content}}}
 * ถ้าเทมเพลตของคุณตั้งชื่อตัวแปรผู้รับว่า {{email}} แทน ให้แก้ toEmailVar ด้านล่าง
 * (โค้ดจะส่งทั้ง to_email และ email ไปพร้อมกัน จึงใช้ได้ทั้งสองแบบ)            */
export const EMAILJS = {
  publicKey: "YOUR_EMAILJS_PUBLIC_KEY",
  serviceId: "YOUR_SERVICE_ID",
  templateId: "YOUR_TEMPLATE_ID",
  toEmailVar: "to_email",
};

/* ---------- 4. ผู้รับอีเมลรายงาน แยกตามไซต์ ----------
 * _all = ผู้บริหาร/ส่วนกลาง ได้รับทุกไซต์
 * ใส่หลายอีเมลคั่นด้วย , หรือ ;
 *
 * หมายเหตุ: README.md เคยระบุชุดผู้รับ 5 คน (Pongsatorn_Untharindr@,
 * Wanida_Kongcharit@, Surat_Pumyu@, jakkaphan_boonnarangsri@, Sayan_Nuangthanee@)
 * แต่ไฟล์ report.html ที่ deploy จริงใช้ค่าด้านล่างนี้ — ตรวจสอบก่อนใช้จริง
 * แล้วแก้ให้ตรงกับความต้องการของหน่วยงาน                                */
export const SITE_RECIPIENTS = {
  LLKDC: "llkdc-manager@bevchain.co.th",
  NDC: "ndc-manager@bevchain.co.th",
  Wangnoi: "wangnoi-manager@bevchain.co.th",
  _all: "egm@bevchain.co.th, security-head@bevchain.co.th",
};

/* ---------- 5. ค่าคงที่ทางธุรกิจ (domain rules) ---------- */
export const RULES = {
  /* GPS geofence — บันทึกผลได้เฉพาะเมื่ออยู่ในรัศมีนี้ (A5)
   * PR #20 ตั้งไว้ 120 ม. • ค่า 60 ม. เดิมแคบเกินไปสำหรับหน้างานจริง */
  gpsWarnMeters: 120,

  /* ให้ผู้ตรวจบันทึกผลได้ทั้งที่อยู่นอกระยะ/ยืนยันพิกัดไม่ได้ หรือไม่
   * true  = อนุญาต แต่ต้อง "ระบุเหตุผล" และเหตุผลจะถูกบันทึกไว้ในเอกสารผลตรวจ
   *         (ตรวจสอบย้อนหลังได้ว่าใครบันทึกจากระยะไกล เพราะอะไร)
   * false = เข้มงวดเต็มที่ ห้ามบันทึกถ้าไม่อยู่ในระยะ (โหมดตรวจสอบ)
   * เหตุผลที่ต้องมีตัวเลือกนี้: คลังสินค้า/ชั้นใต้ดินสัญญาณ GPS อ่อนมาก ถ้าบล็อก
   * แข็งจะทำให้ผู้ตรวจบันทึกงานไม่ได้เลย — แต่ก็ต้องไม่ให้บันทึกเงียบ ๆ ได้ด้วย */
  allowGpsOverride: true,
  gpsOverrideMinReasonChars: 8,

  /* ช่วงแรงดันปกติของสถานีหัวดับเพลิง (bar) — เตือนเมื่ออยู่นอกช่วง (I7) */
  pressureMin: 4.5,
  pressureMax: 12,

  /* ล็อกบัญชีชั่วคราวเมื่อรหัสผ่านผิดติดกัน (I1) */
  maxLoginFails: 5,
  lockMinutes: 15,

  /* อายุ session / draft กันข้อมูลหายกลางคัน */
  loginTtlHours: 12,
  draftTtlHours: 12,

  /* สถานีไม่ถูกตรวจเกินกี่วัน = เกินกำหนด (G2) */
  overdueDays: 7,
  /* เคสเปิดค้างเกินกี่วัน = ค้างนาน (G3) */
  staleCaseDays: 14,
  /* โหลดประวัติย้อนหลังกี่วันโดยค่าเริ่มต้น (กดโหลดทั้งหมดได้ในแท็บประวัติ) */
  historyDays: 180,
  /* ตารางแสดงสูงสุดกี่แถวต่อหน้า (Export ได้ครบ) */
  historyMaxRows: 200,

  /* กะทำงาน (ใช้กับรายงานแยกกะ) — กลางวัน 07:00–19:00 นอกนั้นกลางคืน */
  shiftDayStart: 7,
  shiftDayEnd: 19,
};

/* ---------- 6. ตัวชี้วัดที่ตรวจได้จริงในแต่ละข้อ ----------
 * ใช้แสดงรูปตัวอย่างอุปกรณ์ (settings/referenceImages) ให้ผู้ตรวจเทียบ (B5/B6) */
export const EXAMPLE_CODES = ["B5", "B6"];
export const EXAMPLE_CAPTIONS = {
  B5: { th: "ตัวอย่าง: landing valve (วาล์วเปิด-ปิดน้ำสำหรับต่อสาย)", en: "Example: landing valve" },
  B6: { th: "ตัวอย่าง: ข้อต่อ/coupling (หัวต่อสายดับเพลิง)", en: "Example: hose coupling" },
};

/* ---------- 7. helper: ตรวจว่ายังเป็น placeholder อยู่หรือไม่ ---------- */
export function isPlaceholder(v) {
  return !v || typeof v !== "string" || /^YOUR_|^<|TODO|CHANGEME/i.test(v.trim());
}

/* ---------- 8. helper: แยกสตริงอีเมลหลายรายการเป็น array ---------- */
export function parseRecipients(str) {
  return String(str || "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
}

/* ---------- 9. URL ของหน้าเว็บ (ใช้ทำลิงก์ในอีเมล / QR) ---------- */
export const PAGES = {
  inspect: "index.html",
  dashboard: "dashboard.html",
  report: "report.html",
  admin: "admin.html",
  manual: "manual-inspector.html",
};

/** ลิงก์แบบเต็ม (absolute) ของหน้าหนึ่ง ๆ — ใช้ในอีเมลและ QR code */
export function pageUrl(page, params) {
  const base = location.href.replace(/[^/]*$/, "") + page;
  const u = new URL(base);
  if (params) for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.href;
}
