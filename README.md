# FHS Inspection — ระบบตรวจสอบสถานีหัวดับเพลิง

PWA สำหรับตรวจสอบสถานีหัวดับเพลิง (Fire Hydrant Station) ของคลังสินค้า BevChain Thailand
ฝ่าย Security & Compliance — ใช้หน้างานบนมือถือของผู้ตรวจ และดูภาพรวมบน Command Center

> ⚠️ repository นี้เป็น **public** และเว็บ deploy จริงบน GitHub Pages
> ดูก่อนแก้ทุกครั้ง: [ความปลอดภัย](#ความปลอดภัย) และ [ข้อควรระวัง](#ข้อควรระวัง)

---

## หน้าเว็บทั้งหมด

| หน้า | ใช้ทำอะไร | ใครใช้ |
|---|---|---|
| `index.html` | แอปตรวจ — สแกน QR ที่สถานี ปิด checklist ถ่ายรูป (มีลายน้ำ) เซ็นชื่อ แล้วส่งผล | ผู้ตรวจ |
| `dashboard.html` | Command Center — แผนที่ สถิติ เคส CCTV ประวัติ แผนตรวจ และการแจ้งเตือน | หัวหน้างาน / admin |
| `report.html` | รายงานสรุปประจำสัปดาห์ + ส่งอีเมล (มีโหมดส่งอัตโนมัติ) | ผู้บริหาร / admin |
| `admin.html` | จัดการสถานี ผู้ใช้ กล้อง CCTV สร้าง QR และล้างข้อมูลทดสอบ | admin |
| `manual-inspector.html` | คู่มือผู้ตรวจ (เอกสารอ่านอย่างเดียว) | ผู้ตรวจ |
| `IT-HR-Approval-Document.html` | เอกสารอนุมัติ IT/HR (ไม่เกี่ยวกับตัวแอป) | — |

ทุกหน้าเป็น Thai เป็นค่าเริ่มต้น กดปุ่ม **EN / ไทย** ที่มุมขวามือเพื่อสลับภาษา
(จำค่าไว้ใน `localStorage` คีย์ `fhs_lang` ร่วมกันทุกหน้า)

---

## โครงสร้างไฟล์

```
index.html … manual-inspector.html   หน้าเว็บ (ไม่มี build step — commit แล้วขึ้นเว็บทันที)
src/config.js        ⭐ ศูนย์รวมค่าตั้งต้นทั้งหมด (Firebase / Cloudinary / EmailJS / ผู้รับ / กฎธุรกิจ)
src/shared.js        ฟังก์ชันที่ใช้ร่วมกัน (esc, cld, วันที่, session, toast, …)
src/i18n.js          ระบบแปลภาษา (createI18n, COMMON, data-i18n)
sw.js                Service Worker — precache + offline (ต้อง bump CACHE เมื่อแก้ไฟล์ใน CORE)
manifest.json        PWA manifest
scripts/check.mjs    ด่านตรวจพื้นฐาน (syntax, import/export, คีย์แปล, manifest, หาความลับหลุด)
scripts/smoke.mjs    smoke test — โหลดสคริปต์ทุกหน้าใน Node จริง
scripts/serve.mjs    dev server สำหรับทดสอบในเครื่อง
scripts/send-weekly.mjs  ตัวส่งรายงานอัตโนมัติ (Playwright)
.github/workflows/ci.yml            รัน check + smoke test ทุก push / PR
.github/workflows/weekly-report.yml cron ส่งรายงานทุกวันจันทร์ 08:00 น.
```

### ไม่มี build step

ไฟล์ที่ commit คือไฟล์ที่ขึ้นเว็บ ฉะนั้น **ตรวจก่อน commit เสมอ**:

```bash
npm run verify     # = check.mjs + smoke.mjs
npm run serve      # เปิด http://localhost:8080 เพื่อทดสอบในเครื่อง
```

`smoke.mjs` โหลดสคริปต์ของทุกหน้าใน Node (มี DOM จำลอง + stub Firebase/Leaflet)
จึงจับได้ทั้ง `ReferenceError` จากชื่อฟังก์ชันที่พิมพ์ผิด, การใช้ `const` ก่อนประกาศ
และ template literal ที่เครื่องหมาย backtick หลุด — ซึ่ง `node --check` จับไม่ได้
แต่ทำให้จอขาว

---

## ติดตั้ง / ตั้งค่า

1. **ใส่ค่า EmailJS** ที่ `src/config.js` → `EMAILJS`
   สมัคร [emailjs.com](https://www.emailjs.com/) แล้วสร้าง service + template
   ที่มีตัวแปร `{{to_email}}` `{{subject}}` `{{{html_content}}}`
   (ถ้าเทมเพลตใช้ชื่อ `{{email}}` ก็ได้ — โค้ดส่งทั้งสองชื่อไปพร้อมกัน)
2. **ตรวจรายชื่อผู้รับ** ที่ `src/config.js` → `SITE_RECIPIENTS`
   (`_all` = ผู้บริหาร/ส่วนกลาง ได้รับทุกไซต์ ใส่หลายอีเมลคั่นด้วย `,` หรือ `;`)
3. **ตั้ง Firebase Firestore rules** ให้ `users` อ่านได้เฉพาะที่จำเป็น
   และ `inspections` เขียนได้ตามที่ออกแบบ (ค่า config ของ Firebase เป็น public by design)

> ค่าที่ยังเป็น `YOUR_...` จะถูกตรวจจับโดย `isPlaceholder()` และปุ่มส่งอีเมลจะแจ้งเตือน
> อย่างชัดเจนแทนที่จะส่งเงียบ ๆ ไม่สำเร็จ

---

## รายงานอัตโนมัติรายสัปดาห์

GitHub Actions รัน cron `0 1 * * 1` UTC = **จันทร์ 08:00 น. (Asia/Bangkok)**
(GitHub ไม่การันตีตรงนาที — อาจดีเลย์ได้ถึง ~15 นาทีตอนโหลดสูง)

```
cron → Playwright เปิด report.html?autosend=1&week=1&notify=<อีเมล>
     → หน้าเว็บเข้าโหมดอัตโนมัติ (ข้ามหน้า login) โหลด Firestore แล้วยิง EmailJS
     → เขียนสถานะลง #autoResult[data-status] = success | partial | failure
     → Playwright อ่านค่านั้นแล้วสรุปใน GitHub Actions Summary + ส่งอีเมลแจ้งผล
```

| query param | ค่า | หน้าที่ |
|---|---|---|
| `autosend` | `1` | เข้าโหมดอัตโนมัติ (ข้ามหน้า login) |
| `week` | `0` `1` `2` | ช่วงเวลา — 0=สัปดาห์นี้, 1=สัปดาห์ที่แล้ว (ค่าเริ่มต้น), 2=2 สัปดาห์ก่อน |
| `notify` | email | ส่งสรุปผลการรันไปที่อีเมลนี้ (ทั้งสำเร็จและล้มเหลว) |
| `dryrun` | `1` | ไม่ยิง EmailJS จริง — log อย่างเดียว |

**ทดสอบก่อนเสมอ:** Actions → *FHS Weekly Report (auto send)* → **Run workflow**
→ ติ๊ก `dryrun` ก่อนหนึ่งรอบ แล้วค่อยรันจริง

exit code ของ `scripts/send-weekly.mjs`: `0` = ส่งครบทุกฉบับ, `2` = ส่งได้บางส่วน, `1` = ล้มเหลว

ปุ่ม **"📧 ส่งอีเมล"** ในหน้าเว็บยังทำงานเหมือนเดิม (ต้องเป็น admin) และไม่ถูกกระทบโดยโหมดอัตโนมัติ

---

## ความปลอดภัย

- `src/config.js` ถูกเสิร์ฟแบบสาธารณะโดยเจตนา — Firebase web config และ Cloudinary
  upload preset เป็นค่าที่เปิดเผยได้ ความปลอดภัยจริงอยู่ที่ **Firestore rules**
  และการตั้งค่า upload preset ฝั่ง Cloudinary
- **ห้ามใส่ในไฟล์นี้เด็ดขาด:** service account key, Cloudinary `api_secret`,
  รหัสผ่าน, private token — ถ้าต้องใช้ ให้ย้ายไป Cloud Function / server
- `scripts/check.mjs` จะสแกนหาความลับที่หลุดเป็นด่านสุดท้าย
- รหัสผ่านผู้ใช้เก็บเป็น `SHA-256(salt + password)` ใน Firestore ไม่เก็บ plaintext
- ระบบล็อกบัญชีชั่วคราวเมื่อกรอกรหัสผ่านผิดติดกัน (`RULES.maxLoginFails`)
- session ของ admin ถูกตรวจกับ Firestore ซ้ำทุกครั้งที่เปิดหน้า ถ้าถูกถอดสิทธิ์จะเข้าไม่ได้อีก
- โหมด `?autosend=1` ไม่มี token ป้องกัน **ผลกระทบร้ายที่สุดคือ "ส่งอีเมลซ้ำ"**
  ไม่ใช่การอ่านหรือแก้ข้อมูล — ถ้าต้องการเข้มกว่านี้ให้เพิ่ม HMAC token ที่ผูกกับวันที่

### GPS geofence

บันทึกผลได้เมื่ออยู่ในรัศมี `RULES.gpsWarnMeters` (120 ม.) จากสถานี
ถ้าอยู่นอกระยะหรือยืนยันพิกัดไม่ได้ ผู้ตรวจ **ยังบันทึกได้** แต่ต้องพิมพ์เหตุผล
และระบบจะเก็บ `gpsOverride` ไว้ในเอกสารผลตรวจเพื่อตรวจสอบย้อนหลัง
ปิดความยืดหยุ่นนี้ได้ที่ `RULES.allowGpsOverride = false`

---

## ข้อควรระวัง

- **ถ้าแก้ไฟล์ใดในรายการ `CORE` ของ `sw.js` ต้อง bump `CACHE`** (`fhs-v7` → `fhs-v8`)
  ไม่งั้นเครื่องที่เคยเปิดแล้วจะยังเห็นไฟล์เก่าจาก cache
- หน้า `report.html` และ `dashboard.html` ใช้ `TL(en, th)` สำหรับสตริงสองภาษาในโค้ด
  **ห้ามใช้ชื่อ `L`** เพราะชนกับตัวแปรของ Leaflet (เคยทำให้แผนที่พังมาแล้ว)
  และสตริงที่มาจาก Firestore ต้องผ่าน `esc()` เสมอ เพราะถูกใส่ลงใน attribute
- วันที่และตัวเลขใน UI ใช้ `fmt()/fmtD()` จาก `src/shared.js` ซึ่งรับภาษาเป็นพารามิเตอร์

---

## ใบอนุญาต

Internal use — BevChain Thailand, Security & Compliance (ไม่ใช่ open source)
