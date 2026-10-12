# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Progressive Web App for **Fire Hydrant Station (FHS) inspection**, used by field inspectors and
security/compliance staff (client: BevChain, Thailand). UI is primarily **Thai**, with an EN toggle.
The backend is Firebase Firestore (client SDK loaded from CDN); there is no server-side code here.

**There is no build step.** The files committed *are* the files served — GitHub Pages publishes
`main` at the repo root. What exists instead of a build is a small verification suite (below); run it
before every commit.

## Running & verifying

```bash
npm run serve     # static dev server on :8080 (ES modules, SW, camera, geolocation need HTTP)
npm run check     # scripts/check.mjs — static gate
npm run test      # scripts/smoke.mjs  — loads every page script in Node
npm run verify    # both
```

`scripts/check.mjs` validates: inline-script syntax, that every named import resolves to a real
export, that no imported binding is reassigned (a silent `TypeError` on load), that every `data-i18n`
key exists in `COMMON` or the page dictionary, JSON validity, the service-worker cache version, the
`sw.js` `CORE` list, and that no secrets leaked into `src/config.js`.

`scripts/smoke.mjs` is the important one. It extracts each page's inline module, stubs its CDN
imports, installs a Proxy-based DOM, imports it for real, then calls the `render*` functions via
direct `eval`. This catches `ReferenceError` from a typo'd function name, TDZ mistakes, and template
literals with a lost backtick — none of which `node --check` can see, and all of which white-screen
the page. When adding a page, make sure it is picked up by both scripts (they glob `*.html`).

CI (`.github/workflows/ci.yml`) runs both on every push and PR. Keep it green.

**Service-worker cache:** `sw.js` keeps a versioned cache (`const CACHE = "fhs-v8"`). After editing
any file listed in its `CORE` array you **must bump the version** (`fhs-v8` → `fhs-v9`) or returning
clients keep the stale copy. Navigations are network-first with a cache fallback, so an online user
always gets fresh HTML; the cache matters for offline and for the CDN/library URLs.

## Shared modules (`src/`)

Every page imports from these — **do not copy config or helpers back into the HTML files**.

- **`src/config.js`** — the single source of truth: `FIREBASE_CONFIG`, `CLOUDINARY_CONFIG`,
  `EMAILJS`, `SITE_RECIPIENTS`, `RULES` (all tunable domain values), `PAGES` / `pageUrl()`, plus
  `isPlaceholder()` and `parseRecipients()`. This file is served publicly, so it must never contain
  a service-account key, `api_secret`, password, or private token (`check.mjs` enforces this).
- **`src/shared.js`** — `esc`, `escUrl`, `cld`/`thumb` (Cloudinary transforms), `sha256`, date
  helpers (`tsDate`, `fmt`, `fmtD`, `fmtTime`, `fmtStamp`, `daysAgo`, `isoDay`), `haversine`,
  `store`, `ADMIN_ROLES`, admin-session read/write/verify, `verifyInspector`, `toast`, `$`,
  `debounce`, `prefersReducedMotion`, `isOnline`, `thaiYear`.
- **`src/i18n.js`** — `createI18n()` (returns `{ lang, t, TL, pick, applyLang, setLang, toggleLang,
  bind }`), `mergeDict()`, and `COMMON` (nav + shared strings). `data-i18n` attributes are applied by
  `applyLang()`; the EN/ไทย button is bound by `bind()`.
- **`src/liquid-nav.css` / `src/liquid-nav.js`** — shared, prefixed app-switcher styling and
  scroll-aware mobile floating bar. Keep real links, `aria-current`, the 44px target size, and the
  reduced-motion behavior; these assets are in the Service Worker `CORE` list.

`verifyAdminSession(db)` re-reads `users/{id}` on every page load and clears the session if the
account was deactivated or demoted — don't reintroduce a bare `JSON.parse(sessionStorage…)` restore.

## Pages (each is a standalone app)

- **`index.html`** — the inspector PWA. Flow: login → QR-scan or pick a station → GPS geofence check
  → checklist (B1–B13) + equipment present/missing → photos (in-page camera with watermark, plus a
  gallery option) + signature → submit. Holds a draft in local storage so a half-finished inspection
  survives an accidental reload.
- **`dashboard.html`** — "Command Center": Leaflet map, stats, CCTV investigation cases, inspection
  history, plan, alerts. Excel export via `xlsx` (loaded lazily on first export).
- **`admin.html`** — manage `users`, `stations`, `cctvCameras`, and reference images; generates
  station QR codes (`qrcodejs`).
- **`report.html`** — weekly report, emailed via EmailJS. Also implements the `?autosend=1` mode the
  weekly CI job drives.
- **`manual-inspector.html`** — static inspector handbook (no backend).
- **`IT-HR-Approval-Document.html`** — standalone Thai approval document (Sarabun font). Not part of
  the app; unrelated to the others.

Pages link to each other through the `.fhs-liquid-nav` app switcher: in the header on desktop and
as a floating bottom bar on narrow screens. The inspector handbook link lives in the footer of
`index.html` (the Inspection page), not in the app switcher. Pages share an identical CSS design
system (the `:root` custom properties — navy/red/amber palette, hazard stripes; Bai Jamjuree / IBM
Plex Sans Thai / IBM Plex Mono fonts). Keep that block in sync when restyling.

Accessibility conventions already in place — keep them when adding markup: a skip link targeting
`#mainContent`, `.sr-only` labels, `:focus-visible` outlines, `@media (prefers-reduced-motion)`,
`type="button"` on every non-submit button, `alt` on every `<img>`, `aria-live` on alert regions, and
`role="tab"` + `aria-selected` + `aria-controls` on tab strips. Open modals through `openModal()` /
`closeModal()` so focus is trapped and restored; don't add inline `on*=` handlers (they block a
strict CSP).

## Backend & data model (Firestore)

Collections:
- **`users`** — one doc per employee ID. Auth is **custom, not Firebase Auth**:
  `passwordHash = SHA-256(salt + password)`, with brute-force lockout
  (`RULES.maxLoginFails`, `RULES.lockMinutes` via `failedAttempts`/`lockedUntil`). Fields: `role`
  (`admin` | `inspector` | `viewer`), `site`, `active`. Sessions live in `sessionStorage`.
- **`stations`** — inspection sites. Hold `gps`, `equipment[]` (each item tracks `status` +
  `lastSeenAt`/`lastSeenBy`), `cctvCameras`, `lastInspectionAt`, `lastResult`.
- **`inspections`** — one doc per completed inspection. Carries `gpsOverride` (reason + distance)
  when the inspector recorded a result from outside the geofence.
- **`cases`** — CCTV investigation cases. **Auto-created** on submit for every equipment item marked
  missing, capturing the `lastSeenAt`→now window and the station's cameras (see the submit handler in
  `index.html`).
- **`cctvCameras`**, **`settings`** (doc `referenceImages` holds admin-managed example photos).

Offline: `enableIndexedDbPersistence` is on. When `navigator.onLine` is false, writes are fired
without `await` so Firestore queues and syncs them later (and the submit button doesn't hang).

**Images → Cloudinary** (unsigned `uploadPreset`), not Firebase Storage. **Email → EmailJS**
(`report.html` only). When sending, pass the recipient under both `to_email` and `email` — templates
across accounts name the variable differently, and `EMAILJS.toEmailVar` picks the official name.

## Domain rules (all tunable values live in `RULES`, `src/config.js`)

- **Checklist** `CHECKLIST` = codes B1–B8, B11, B12, B13 (B9/B10 intentionally absent). B4 carries
  `brass:true`. B5/B6 can show an admin-managed example photo (the "📷 ดูตัวอย่าง" button).
- **Inspection result**: `pass` | `needs_repair` | `fail`.
- **Equipment status**: `present` | `missing` | `damaged`. **Case status**: `investigating` | `found`
  | `replaced` | `closed`.
- **GPS geofence**: `RULES.gpsWarnMeters` (120 m). Submit is blocked outside the radius *unless* the
  inspector types a reason (`RULES.allowGpsOverride`, minimum `gpsOverrideMinReasonChars`), which is
  stored on the inspection as `gpsOverride` so remote sign-offs stay auditable.
- **Overdue / staleness**: `RULES.overdueDays` (station not inspected = overdue),
  `RULES.staleCaseDays` (open case left too long), `RULES.historyDays` / `historyMaxRows`.
- **Shifts**: day = 07:00–19:00 (`RULES.shiftDayStart` / `shiftDayEnd`). Note that the current
  dashboard schedules by **frequency** (`inspectionFrequencyDays` per station, defaulting to
  `overdueDays`); the shift constants remain for shift-based reporting.

## i18n

Thai is the default; language is stored in `localStorage` under `fhs_lang` (shared across pages) and
toggled by `#langBtn`, which `i18n.bind()` wires up. Two mechanisms coexist: `data-i18n` attributes
swapped by `applyLang()`, and an inline helper for JS-built strings.

**Naming gotcha:** the inline helper is **`TL(en, th)` — never `L`**, because pages that load Leaflet
(`dashboard.html`) would shadow the global `L` and break the map. This was a real regression (PR #18).

**Escaping:** always run user/DB strings through `esc()` when building HTML. The shared `esc()`
escapes `& < > " '` — including quotes, because values are frequently interpolated into attributes.
Never build an inline `onclick` from data; attach a listener instead.
