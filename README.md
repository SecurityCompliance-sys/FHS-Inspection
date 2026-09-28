# FHS Weekly Report — Auto Sender

ตั้งเวลาส่งอีเมลรายงาน FHS สัปดาห์ที่แล้วอัตโนมัติทุกวันจันทร์ **08:00 น. (Asia/Bangkok)**

## สถาปัตยกรรม

GitHub Actions รัน cron `0 1 * * 1` (= 08:00 Bangkok) → Playwright + Chromium headless เปิด
`report.html?autosend=1&week=1&notify=...` → หน้าเว็บเข้าโหมด auto (ข้าม login gate,
โหลด Firestore, ยิง EmailJS ตามชุดผู้รับที่มีอยู่แล้วใน `SITE_RECIPIENTS._all`)
→ Playwright poll `#autoResult[data-status]` จนได้ `success` / `partial` / `failure`
→ ระบบอีเมลสรุปยิงกลับไปที่ `Jakkaphan_boonnarangsri@bevchain.co.th` เสมอ (สำเร็จ/ผิดพลาด)

## ไฟล์ที่ต้องเพิ่ม/แก้ (commit เข้าทั้ง 2 repo)

- `report.html` — **แทนที่ของเดิม** (เพิ่มโหมด auto-send, ของเดิมทำงานเหมือนเดิมทุกอย่าง)
- `.github/workflows/weekly-report.yml` — workflow cron ใหม่
- `scripts/send-weekly.mjs` — สคริปต์ Playwright

`report.html.diff` = unified diff เทียบกับของเดิม (สั้น 92 บรรทัด อ่านง่าย)

## Query params ที่ report.html รองรับเพิ่ม

| param | ค่า | หน้าที่ |
|---|---|---|
| `autosend` | `1` | เข้าโหมด auto (ข้าม login gate, สร้าง synthetic admin) |
| `week` | `0`, `1`, `2` | เลือกช่วง — 0=สัปดาห์นี้, 1=สัปดาห์ที่แล้ว (default), 2=2 สัปดาห์ก่อน |
| `notify` | email | ส่งสรุปผลไปให้อีเมลนี้เมื่อเสร็จสิ้น (ทั้งสำเร็จและล้มเหลว) |
| `dryrun` | `1` | ทดสอบไม่ยิง EmailJS จริง — log แต่นับเป็น ok |

การเข้าโหมด auto ไม่กระทบกับการใช้งานปกติของ report.html (ปุ่ม "ส่งอีเมล" มือยังทำงานเหมือนเดิม)

## ขั้นตอน deploy

1. **Commit ไฟล์** เข้าทั้งสอง repo:
   - `SecurityCompliance-sys/FHS-Inspection` (ตัวที่ deploy จริงบน GitHub Pages)
   - `BRFSecurityandCompliance/BRF-FHS-Inspection` (org repo)

2. **ทดสอบก่อนรอ cron** — ที่ repo `SecurityCompliance-sys/FHS-Inspection`:
   - เปิดแท็บ Actions → เลือก workflow "FHS Weekly Report (auto send)"
   - กด "Run workflow" → ใส่ week=1 (default) → รัน
   - รอ ~2 นาที ดู log และ Summary ที่ตัว run

3. **ทดสอบแบบไม่ส่งจริง** (แนะนำครั้งแรก): เพิ่ม `&dryrun=1` ใน URL ที่สคริปต์เรียก
   หรือคัดลอก `report.html?autosend=1&week=1&dryrun=1` ใส่ browser
   → หน้าจะรันจริง แต่ไม่ยิง EmailJS (log ที่ console อย่างเดียว)

## เวลาส่ง

Cron `0 1 * * 1` UTC = **จันทร์ 08:00 น. Asia/Bangkok** เป๊ะ

GitHub cron ไม่ garantee ตรงนาที (อาจดีเลย์ 0-15 นาทีตอนโหลดสูง) ถ้าต้องการตรงเป๊ะให้
ย้ายไป Firebase Cloud Function + Cloud Scheduler แทน (ต้องใช้ Blaze plan)

## สิ่งที่ไม่ได้แก้ (คงเดิม)

- ปุ่ม "📧 ส่งอีเมล" ในหน้าเว็บ ยังทำงานเหมือนเดิมทุกอย่าง (บังคับ login admin)
- `SITE_RECIPIENTS._all` ยังเป็นชุดเดิม (5 อีเมล) — auto weekly จะใช้ชุดเดียวกันนี้
- Firestore rules / Firebase config ไม่ต้องแก้
- EmailJS service/template/publicKey ไม่ต้องแก้

## Security notes

- โหมด auto ข้าม login gate โดยดู `?autosend=1` ในอีเมล query — ไม่มี token
- ความเสี่ยง: ถ้ามีคนพบ URL นี้ อาจ trigger ให้ส่งอีเมลซ้ำไปยัง `SITE_RECIPIENTS._all` (ชุด hardcoded เดิม) — worst case คือส่งซ้ำ ไม่ใช่ leak ผู้รับใหม่
- EmailJS มี rate limit ในตัว (200 emails/month บน free tier) — จำกัดการ abuse
- ถ้าอยาก strict กว่านี้: เพิ่ม HMAC token ตรวจว่า signature ตรงกับ `secret+YYYYMMDD` (JS ยังต้องรู้ secret → obscurity เท่านั้น)

## Recipient ปัจจุบัน

จาก `SITE_RECIPIENTS._all` (ไม่ได้แก้):
1. Pongsatorn_Untharindr@bevchain.co.th
2. Wanida_Kongcharit@bevchain.co.th
3. Surat_Pumyu@BevChain.co.th
4. jakkaphan_boonnarangsri@bevchain.co.th
5. Sayan_Nuangthanee@BevChain.co.th

ต้องการปรับ recipient สำหรับ auto weekly แยกจากปุ่มมือ? แจ้งได้ครับ จะแยก
`AUTO_RECIPIENTS` ให้เป็นของตัวเอง
