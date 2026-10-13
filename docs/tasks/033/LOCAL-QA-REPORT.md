# TASK 033 — local browser QA + performance (2026-10-13)

**Environment:** fully local, isolated. Supabase CLI stack on this Mac (Docker/colima, ports 553xx, migrations
0001–0047), synthetic data only, production builds (`next build && next start`): QA = integration `e3ed1eb`
(re-check; first pass on `135a736`), baseline = `d02ac99` (pre-TASK 033). Playwright 1.63 (Chromium + WebKit),
viewports 320/390/430/768/1440. **No hosted system, Staging or Production was used.** Evidence (screenshots, videos,
JSON, scripts) in the session scratchpad `qa033/` (r1 = `135a736`, r2 = `e3ed1eb`); synthetic credentials 0600 there.

**Limits:** emulation ≠ real device; WebKit ≠ iOS Safari; throttling Chromium/CDP only; no screen reader; local
image transforms not running (Teach Share Card photo unverifiable locally); tr/it Guest renders English by design
(not yet in `SPACE_SELECTABLE_LOCALES`). Times below are local-machine and **not comparable** to the 2026-10-12
Production baseline (plan §4.4, cross-Pacific DB round trips) — only before/after deltas are meaningful.

## Functional results (e3ed1eb)

| Area | Result |
|---|---|
| Desktop shell (≤480 px centred column at ≥640 px; full width below; nav fixed inside column; no overflow) Flow, Teach, he, tr, it | PASS 38/38 |
| Day Navigator (tabs, DAY n, Today, 56×72 targets), empty day state, single-day header | PASS 28/28, 10/10, 4/4 |
| Keyboard arrows/Home/End; Hebrew RTL reversal | PASS 4/4, 4/4 |
| Timezone: device UTC+14 / UTC−11 / UTC+7 vs Space America/Los_Angeles | PASS (dates/Today follow the Space) |
| Daily Inspiration Day 1 = retreat start | PASS |
| Flow Share Card: draft image change does not alter card; Republish updates without reload | PASS |
| Teach Share Card `?v=<publishedAt>`, route 200 png | PASS (photo BLOCKED locally: no image transforms) |
| Studio dates: unsaved-changes dialog on step switch, Cancel keeps edit, unload warning, clean after Save | PASS |
| Studio currency: EUR default on new priced item, USD override, legacy "baht" flagged | PASS |
| Guest prices | `€120.00`, `US$95.50`, `700 baht` (legacy raw), `40` (no currency) — **format change for owner sign-off** |
| Non-English Guest after hydration: Flow de/es/fr/he (both engines), Teach de/he (Chromium), Teach he (WebKit) | PASS — no English UI leaks, no console errors, navigator localized |
| Teach de on WebKit | React #418 hydration mismatch — **pre-existing** (baseline 5/5 too; Node vs WebKit `Intl` date output) |
| Access-code screen 390/1440 | PASS: in shell, 200 + `noindex,nofollow`, only gate hero/logo before code, no protected content, no prefetch; right code unlocks, wrong code errors |
| Loading: media delayed / media 500 / reduced motion | PASS (no stuck loader; static under reduced motion) |
| axe | Day Navigator 0 violations; **no new violations vs baseline**; pre-existing: contrast on Flow/Teach home, code screen, schedule time column/category chip; 404 page `html` lacks `lang` |

### HTTP status (document response; `/s/` and `/g/` identical, both engines + curl)

| Space | Status |
|---|---|
| Public Flow / Teach | 200 |
| Code-protected (gate) | 200 + `noindex,nofollow` |
| Suspended (billing `guest_suspended`) | **404** |
| Commercially unavailable (entitlement expired) | **404** |
| Unpublished / archived / unknown | **404** |

## Defects found and fixed during QA

| # | Defect (on `135a736`) | Fix commit | Re-check (`e3ed1eb`) |
|---|---|---|---|
| D1 | Hero-wait overlay faded in over already-painted content on 4G (~0.85–1.32 s) | `db642b2` | never visible over content (6/6 runs); loader removed ~1.0 s |
| D3 | Day Navigator labels 3.94:1 (AA fail) | `426213a` | 0 axe violations in navigator; default palette 5.86:1; min text 10 px |
| D4 | Guest pages preloaded 7 fonts | `03322da` | 3 preloads (DM Sans, DM Serif Display ×2); site pages unchanged (7) but **+1 stylesheet** (cssChunking) |
| D5 | Guest JS +56 KB gzip (tr/it in shared chunk) | `141bcef` | 385 → 308 KB gzip (below pre-033) |

## Performance, baseline d02ac99 → e3ed1eb (Chromium, medians of 5, ms)

| Cell | FCP | LCP | Hero decoded |
|---|---|---|---|
| Flow 390 4G cold | 716 → 444 | 1004 → 532 | 994 → 524 |
| Flow 1440 4G cold | 720 → 440 | 1000 → 532 | 991 → 523 |
| Teach 390 4G cold | 708 → 444 | 1000 → 536 | 991 → 524 |
| Teach 1440 4G cold | 712 → 448 | 988 → 536 | 976 → 526 |
| 4G warm / fast cold / fast warm | unchanged within loopback noise (±15 ms) | | |

| Metric (cold) | Baseline → QA |
|---|---|
| Total transfer | 792–802 KB → 461–462 KB (−42 %) |
| Requests | 30–32 → 24–26 |
| Font requests / preloads / bytes | 11 / 11 / 360 KB → 4 / 3 / 102 KB |
| JS gzip | 385 → 308 KB |
| `/api/media` duplicates | Teach 1440: 1 → 0; Flow +1 staged prefetch |
| CLS | ≤ 0.002 → ≤ 0.0002 |
| HTML size | ~38 → ~46–48 KB (server-passed locale messages) |

## Owner sign-offs requested

1. Guest price format (`€120.00` / `US$95.50` instead of `120 EUR` / `95.5 USD`).
2. Hero-wait overlay appears only while the page is still streaming at 200 ms; a slow hero alone no longer shows the
   overlay (content shows with the hero area empty until the image arrives).
3. App-wide `experimental.cssChunking: "graph"` (site pages load 2 stylesheets instead of 1).
4. Light custom navigation colours: `--rbr-on-navigation` now computed against the painted (AA-darkened) colour.
5. Expected Share Card photo (Space image) for existing Spaces.
