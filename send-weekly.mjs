// FHS Weekly Report — auto sender
// เปิดหน้า report.html ในโหมด ?autosend=1 ผ่าน Playwright/Chromium headless
// รอจนกว่า #autoResult[data-status] จะกลายเป็น success / partial / failure
// exit code:
//   0 = success
//   1 = failure หรือ timeout
//   2 = partial (ส่งได้บางส่วน) — ถือว่าไม่สมบูรณ์แต่ไม่ error CI

import { chromium } from 'playwright';
import fs from 'node:fs';

const REPORT_URL   = process.env.FHS_REPORT_URL   || 'https://securitycompliance-sys.github.io/FHS-Inspection/report.html';
const NOTIFY_TO    = process.env.FHS_NOTIFY_TO    || '';
const WEEK         = process.env.FHS_WEEK         || '1';
const OVERALL_TIMEOUT_MS = 5 * 60 * 1000; // 5 นาที

const params = new URLSearchParams({ autosend: '1', week: WEEK });
if (NOTIFY_TO) params.set('notify', NOTIFY_TO);
const url = `${REPORT_URL}?${params.toString()}`;

const log = (...a) => { const line = `[${new Date().toISOString()}] ${a.join(' ')}`; console.log(line); fs.appendFileSync('/tmp/fhs-run.log', line + '\n'); };

log('opening', url.replace(NOTIFY_TO, '<notify>'));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: 'th-TH',
  timezoneId: 'Asia/Bangkok',
  viewport: { width: 1280, height: 1600 },
});
const page = await context.newPage();

page.on('console',  msg => log(`  console.${msg.type()}:`, msg.text()));
page.on('pageerror', err => log('  pageerror:', err.message));

let status = 'unknown', ok = 0, fail = 0, message = '';
try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });

  const deadline = Date.now() + OVERALL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const el = document.getElementById('autoResult');
      if (!el) return null;
      return {
        status: el.getAttribute('data-status') || 'idle',
        ok: el.getAttribute('data-ok') || '0',
        fail: el.getAttribute('data-fail') || '0',
        text: el.textContent || '',
      };
    });
    if (state) {
      status = state.status; ok = state.ok; fail = state.fail; message = state.text;
      log('poll:', state.status, `ok=${state.ok} fail=${state.fail}`);
      if (['success','partial','failure'].includes(state.status)) break;
    }
    await page.waitForTimeout(3000);
  }

  await page.screenshot({ path: '/tmp/fhs-final.png', fullPage: false });
} catch (err) {
  log('fatal:', err.message);
  try { await page.screenshot({ path: '/tmp/fhs-fatal.png', fullPage: false }); } catch {}
  status = 'failure';
  message = err.message;
} finally {
  await browser.close();
}

log('final status:', status, `ok=${ok} fail=${fail}`, '|', message);

// GitHub Actions summary
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
`## FHS Weekly Report — ${status}
- URL: \`${REPORT_URL}\`
- Week offset: **${WEEK}**
- Sent OK: **${ok}**
- Failed: **${fail}**
- Notify: \`${NOTIFY_TO || '(none)'}\`
- Message: \`${message.slice(0, 500)}\`
`);
}

if (status === 'success') process.exit(0);
if (status === 'partial') process.exit(2);
process.exit(1);
