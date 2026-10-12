#!/usr/bin/env node
/* ============================================================================
 * FHS Weekly Report — auto sender (Playwright / Chromium headless)
 * ----------------------------------------------------------------------------
 * เปิดหน้า report.html ในโหมด ?autosend=1 แล้วรอจนกว่า #autoResult[data-status]
 * จะกลายเป็น success / partial / failure จากนั้นสรุปผลลง GitHub Actions Summary
 *
 * ตัวแปรสภาพแวดล้อม
 *   FHS_REPORT_URL  URL ของ report.html (ค่าเริ่มต้น = GitHub Pages ของ repo นี้)
 *   FHS_WEEK        offset สัปดาห์: 0 = สัปดาห์นี้, 1 = สัปดาห์ที่แล้ว, 2 = 2 สัปดาห์ก่อน
 *   FHS_NOTIFY_TO   อีเมลผู้รับข้อความสรุปผลการรัน (ไม่ใส่ = ไม่ส่ง)
 *   FHS_DRYRUN      '1' = ไม่ยิง EmailJS จริง แค่ log (ใช้ทดสอบ)
 *   FHS_RETRIES     จำนวนรอบที่ลองใหม่เมื่อล้มเหลว (ค่าเริ่มต้น 1 = ลองทั้งหมด 2 รอบ)
 *
 * exit code
 *   0 = success (ส่งครบทุกฉบับ)
 *   1 = failure / timeout / fatal
 *   2 = partial (ส่งได้บางส่วน — ไม่ทำให้ CI แดง แต่เตือนใน summary)
 *
 * หมายเหตุ: สคริปต์นี้เมื่อก่อนอยู่ที่ root (`send-weekly.mjs`) แต่ workflow เรียก
 * `node scripts/send-weekly.mjs` → หาไฟล์ไม่เจอ CI จึงรันไม่ได้เลย ตอนนี้ย้ายมา
 * อยู่ที่ scripts/ ให้ตรงกับที่ workflow เรียก
 * ==========================================================================*/

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const CFG = {
  reportUrl: process.env.FHS_REPORT_URL || "https://securitycompliance-sys.github.io/FHS-Inspection/report.html",
  week: process.env.FHS_WEEK || "1",
  notifyTo: (process.env.FHS_NOTIFY_TO || "").trim(),
  dryrun: process.env.FHS_DRYRUN === "1" || process.env.FHS_DRYRUN === "true",
  retries: Math.max(0, parseInt(process.env.FHS_RETRIES ?? "1", 10)),
  // เวลาสูงสุดที่รอให้หน้าเว็บส่งอีเมลเสร็จ (นาที) — เกินกว่านี้ถือว่า timeout
  overallTimeoutMs: Math.max(1, parseInt(process.env.FHS_TIMEOUT_MIN ?? "6", 10)) * 60_000,
};

// เขียนลง ./artifacts (ไม่ใช่ /tmp) เพราะ actions/upload-artifact อ่านได้เฉพาะ
// ไฟล์ที่อยู่ใน workspace — ของเดิมเขียน /tmp แล้ว upload ไม่ได้เลย
const ART = path.resolve("artifacts");
fs.mkdirSync(ART, { recursive: true });

const LOG_FILE = path.join(ART, "fhs-run.log");
const lines = [];
function log(...args) {
  const line = `${new Date().toISOString()}  ${args.join(" ")}`;
  lines.push(line);
  console.log(line);
}
function flushLog() {
  try { fs.writeFileSync(LOG_FILE, lines.join("\n") + "\n"); } catch { /* ignore */ }
}

/* --- แจ้งเตือนบน GitHub Actions (ถ้ารันใน CI) --- */
const gh = (level, msg) => { if (process.env.GITHUB_ACTIONS) console.log(`::${level}::${msg}`); };

function buildUrl() {
  const params = new URLSearchParams({ autosend: "1", week: CFG.week });
  if (CFG.notifyTo) params.set("notify", CFG.notifyTo);
  if (CFG.dryrun) params.set("dryrun", "1");
  const sep = CFG.reportUrl.includes("?") ? "&" : "?";
  return `${CFG.reportUrl}${sep}${params.toString()}`;
}

/** เปิดหน้าเว็บหนึ่งรอบ แล้วดึงสถานะสุดท้ายออกมา */
async function attempt(url, attemptNo) {
  log(`── attempt ${attemptNo} ──`);
  // ไม่ log notifyTo ตรง ๆ (เป็นอีเมลภายใน)
  log("opening", url.replace(encodeURIComponent(CFG.notifyTo), "<notify>"));

  const browser = await chromium.launch({ headless: true });
  const result = { status: "unknown", ok: 0, fail: 0, message: "" };

  try {
    const context = await browser.newContext({
      locale: "th-TH",
      timezoneId: "Asia/Bangkok",
      viewport: { width: 1280, height: 1600 },
    });
    const page = await context.newPage();

    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log(`  console.${m.type()}:`, m.text()); });
    page.on("pageerror", (e) => log("  pageerror:", e.message));
    page.on("requestfailed", (r) => log("  requestfailed:", r.url().slice(0, 120), r.failure()?.errorText || ""));

    // networkidle ไม่เหมาะกับหน้าที่มี connection ค้าง (Firestore long-poll)
    // → ใช้ domcontentloaded แล้ว poll สถานะเอง
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });

    const deadline = Date.now() + CFG.overallTimeoutMs;
    let last = "";
    while (Date.now() < deadline) {
      const state = await page.evaluate(() => {
        const el = document.getElementById("autoResult");
        if (!el) return null;
        return {
          status: el.getAttribute("data-status") || "idle",
          ok: Number(el.getAttribute("data-ok") || 0),
          fail: Number(el.getAttribute("data-fail") || 0),
          text: (el.textContent || "").trim(),
        };
      });

      if (!state) {
        result.status = "failure";
        result.message = "ไม่พบ #autoResult บนหน้า report.html — เวอร์ชันที่ deploy ไม่รองรับโหมด autosend";
        log("  ✖", result.message);
        break;
      }

      const snapshot = `${state.status}|${state.ok}|${state.fail}`;
      if (snapshot !== last) {
        log("  poll:", state.status, `ok=${state.ok} fail=${state.fail}`);
        last = snapshot;
      }
      Object.assign(result, { status: state.status, ok: state.ok, fail: state.fail, message: state.text });

      if (["success", "partial", "failure"].includes(state.status)) break;
      await page.waitForTimeout(3000);
    }

    if (["running", "idle", "unknown"].includes(result.status)) {
      result.message = `หมดเวลา ${CFG.overallTimeoutMs / 60000} นาทีก่อนที่การส่งจะจบ (สถานะล่าสุด: ${result.status})`;
      result.status = "failure";
      log("  ✖", result.message);
    }

    // เก็บภาพหน้าจอไว้ทุกรอบ (ช่วย debug) — ตั้งชื่อตามรอบ
    await page.screenshot({ path: path.join(ART, `fhs-final-${attemptNo}.png`), fullPage: false }).catch(() => {});
    if (result.status === "failure") {
      fs.writeFileSync(path.join(ART, `fhs-dom-${attemptNo}.html`), await page.content().catch(() => ""));
    }
  } catch (err) {
    result.status = "failure";
    result.message = err.message;
    log("  fatal:", err.message);
  } finally {
    await browser.close().catch(() => {});
  }

  return result;
}

/* ───────────────────────────── main ───────────────────────────── */
let url;
try {
  url = buildUrl();
} catch (err) {
  log("fatal: สร้าง URL ไม่สำเร็จ:", err.message);
  flushLog();
  process.exit(1);
}

log(`FHS weekly report — week=${CFG.week}${CFG.dryrun ? " (DRYRUN)" : ""}`);
if (CFG.dryrun) log("โหมดทดสอบ: จะไม่มีการส่งอีเมลจริง");

let final = { status: "failure", ok: 0, fail: 0, message: "ไม่ได้รัน" };
for (let i = 0; i <= CFG.retries; i++) {
  final = await attempt(url, i + 1);
  if (final.status === "success" || final.status === "partial") break;
  if (i < CFG.retries) log(`ยังไม่สำเร็จ (${final.message}) — ลองใหม่ในอีก 20 วินาที…`) , await new Promise((r) => setTimeout(r, 20_000));
}

log("final status:", final.status, `ok=${final.ok} fail=${final.fail}`, "|", final.message);
flushLog();

/* สรุปผลลง GitHub Actions */
const emoji = { success: "✅", partial: "⚠️", failure: "❌" }[final.status] || "❓";
const summary = [
  `## ${emoji} FHS Weekly Report — ${final.status}`,
  "",
  "| รายการ | ค่า |",
  "| --- | --- |",
  `| ช่วงเวลา | week=${CFG.week}${CFG.dryrun ? " (dryrun)" : ""} |`,
  `| ส่งสำเร็จ | **${final.ok}** ฉบับ |`,
  `| ล้มเหลว | **${final.fail}** ฉบับ |`,
  `| ปลายทางแจ้งเตือน | \`${CFG.notifyTo || "(ไม่ได้ตั้งค่า)"}\` |`,
  `| หน้าเว็บ | ${CFG.reportUrl} |`,
  "",
  `**ข้อความ:** \`${final.message.slice(0, 500) || "-"}\``,
  "",
  final.status === "failure" && final.message.includes("#autoResult")
    ? "> ℹ️ หน้า report.html ที่ deploy อยู่ยังไม่มีโหมด autosend — ต้อง push เวอร์ชันใหม่แล้วรอ GitHub Pages build เสร็จก่อน"
    : "",
].join("\n");

if (process.env.GITHUB_STEP_SUMMARY) {
  try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n"); } catch { /* ignore */ }
}
if (final.status === "failure") gh("error", `FHS weekly report ล้มเหลว: ${final.message.slice(0, 400)}`);
if (final.status === "partial") gh("warning", `FHS weekly report ส่งได้บางส่วน (ok=${final.ok}, fail=${final.fail})`);

process.exit(final.status === "success" ? 0 : final.status === "partial" ? 2 : 1);
