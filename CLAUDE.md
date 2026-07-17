# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Progressive Web App for **Fire Hydrant Station (FHS) inspection**, used by field inspectors and security/compliance staff (client: BevChain, Thailand). UI is primarily **Thai**, with an EN toggle. There is **no build system, no framework, no package manager, and no tests** — every page is a single self-contained `.html` file with inline `<style>` and an inline `<script type="module">`. The backend is Firebase Firestore (client SDK loaded from CDN); there is no server-side code in this repo.

## Running locally

ES modules, the service worker, geolocation, and the camera all require an HTTP origin — opening files over `file://` will break. Serve the directory statically:

```
python3 -m http.server 8000     # then open http://localhost:8000/index.html
```

There is nothing to build, lint, or test. Changes are edits to the HTML files directly.

**Service-worker cache gotcha:** `sw.js` precaches the core pages under a versioned cache name (`const CACHE = "fhs-v4"`). Precached pages are served cache-first, so after editing any core `.html` file you **must bump the cache version** (`fhs-v4` → `fhs-v5`) or returning clients will keep the stale copy until the SW updates.

## Pages (each is a standalone app)

- **`index.html`** — the inspector PWA. Flow: login → QR-scan or pick a station → GPS geofence check → checklist (B1–B13) + equipment present/missing → photos + signature → submit.
- **`dashboard.html`** — "Command Center": Leaflet map, stats, CCTV investigation cases, inspection history, plan, alerts. Excel export via `xlsx`.
- **`admin.html`** — manage `users`, `stations`, `cctvCameras`, and reference images; generates station QR codes (`qrcodejs`).
- **`report.html`** — weekly report, emailed via EmailJS.
- **`manual-inspector.html`** — static inspector handbook (no backend).
- **`IT-HR-Approval-Document.html`** — standalone Thai approval document (Sarabun font). Not part of the app; unrelated to the others.

Pages link to each other through the `.appsw` app-switcher nav in the top bar. They share an identical CSS design system (the `:root` custom properties — navy/red/amber palette, hazard stripes; Bai Jamjuree / IBM Plex Sans Thai / IBM Plex Mono fonts). Keep that block in sync when restyling.

## Backend & data model (Firestore)

Collections:
- **`users`** — one doc per employee ID. Auth is **custom, not Firebase Auth**: `passwordHash = SHA-256(salt + password)`, with brute-force lockout (`MAX_LOGIN_FAILS=5`, `LOCK_MINUTES=15` via `failedAttempts`/`lockedUntil`). Fields: `role` (`admin` | `inspector` | `viewer`), `site`, `active`. Session is kept in `sessionStorage` (`fhs_user`).
- **`stations`** — inspection sites. Hold `gps`, `equipment[]` (each item tracks `status` + `lastSeenAt`/`lastSeenBy`), `cctvCameras`, `lastInspectionAt`, `lastResult`.
- **`inspections`** — one doc per completed inspection.
- **`cases`** — CCTV investigation cases. **Auto-created** on submit for every equipment item marked missing, capturing the `lastSeenAt`→now window and the station's cameras (see the submit handler in `index.html`).
- **`cctvCameras`**, **`settings`** (doc `referenceImages` holds admin-managed example photos).

Offline: `enableIndexedDbPersistence` is on. When `navigator.onLine` is false, writes are fired without `await` so Firestore queues and syncs them later (and the submit button doesn't hang).

**Images → Cloudinary** (unsigned `uploadPreset`), not Firebase Storage. **Email → EmailJS** (report.html only).

### Config is duplicated per page — the biggest gotcha

`FIREBASE_CONFIG` is copied into `index.html`, `admin.html`, `dashboard.html`, and `report.html`; `CLOUDINARY_CONFIG` into `index.html` + `admin.html`; the `EMAILJS` keys live in `report.html`. There is **no shared config module** — rotating a key or changing the project means editing every copy. When touching config, grep across all pages.

## Domain rules & enums (defined at the top of `index.html`)

- **Checklist** `CHECKLIST` = codes B1–B8, B11, B12, B13 (B9/B10 intentionally absent). B4 carries `brass:true`.
- **Inspection result**: `pass` | `needs_repair` | `fail`.
- **Equipment status**: `present` | `missing` | `damaged`. **Case status**: `investigating` | `found` | `replaced` | `closed`.
- **GPS geofence**: `GPS_WARN_METERS = 120`. Submit is blocked when outside the radius or GPS is unverified (distance via the `haversine` helper).
- **Shifts**: day = 07:00–19:00 (`SHIFT_DAY_START`/`SHIFT_DAY_END`), otherwise night (`shiftOf` helper).

## i18n

Thai is the default; language is stored in `localStorage` under `fhs_lang` and toggled by `#langBtn`. Two mechanisms coexist: `data-i18n` attributes swapped by `applyLang()`, and an inline helper for JS-built strings.

**Naming gotcha:** on pages that load Leaflet (`dashboard.html`), the inline helper is named **`TL(en, th)` — never `L`**, because Leaflet exposes a global `L`. Naming it `L` shadows Leaflet and breaks the map (this was a real regression). `report.html` has no Leaflet and uses `L(en, th)`. Always escape user/DB strings with `esc()` when building HTML.
