# TASK 033 — integration report (2026-10-13)

Branch `feat/033-guest-experience` (worktree `~/Desktop/RBR-033-worktree`), base `d02ac99`, local only — **not pushed,
not deployed, no hosted migration, no Production change.** Contract: `IMPLEMENTATION-CONTRACT.md`.

## Final verification (integration HEAD, local, Node 26.4)

| Check | Result |
|---|---|
| `npx vitest run` | **3080 passed / 18 skipped** (179 files + 3 skipped); baseline 2874 / 18 |
| `npx tsc --noEmit -p .` | clean |
| `npx eslint` | 0 errors, 29 warnings (= baseline) |
| `npx next build` (no `.env` present) | success |
| Diff hygiene `d02ac99..HEAD` | 97 files; no migrations, `vercel.json`, package/lock files, env/Vercel files; no secret-like strings; only billing file touched is `audioQuota.test.ts` (tr/it expectation) |
| Browser / device / performance QA | **not done** (required before Staging acceptance) |

## Packages

| Pkg | Branch / commits | Delivered | Open items |
|---|---|---|---|
| P1 Share Card | `feat/033-p1-share` `71e8405` | `lib/share/publishedCardImage.ts` (published Space → Hero → gradient, tenant + snapshot membership checks, draft never returned); card name/logo/colours from the published row; in-session refresh after Republish via read-only `loadPublishedShareCard` (no `router.refresh`); Teach: Space → portrait → hero → gradient, `?v=<publishedAt>`, `teach.shareCardCta` | Owner to confirm expected photo (Return to Balance Space image = bungalow/sala); Satori cannot shape Hebrew CTA (English CTA kept for he, as Flow); share-sheet text uses draft language |
| P2 Day Navigator | `feat/033-p2-schedule` `3e7eed6`, `6b736d3` | optional `startDate`/`endDate` in `retreatProfile` (copied by `publish_space` 0043 and Production 0034 — no migration; SQL-text proof test); `buildRetreatDays` (calendar offset, empty days, derived fallback, out-of-range activities kept, 60-day max, 120-day cap); navigator (Teach style, ARIA, roving tabindex, RTL keys, Today after mount); single-day header | Dates panel not in the unsaved-changes guard; Daily Inspiration "Day 1" still anchored to the first activity; Staging publish check of `published_spaces.modules.retreatProfile` |
| P3 Currency | `feat/033-p3-currency` `36b9268` | ISO 4217 data (155 codes, generator `--check`), `formatPrice` (no rounding, no bare `$`, he isolation, legacy raw), `CurrencySelect`, Space default EUR (`spaceSettings.currency`), Flow D-CC4 server + client, Teach picker; server-formatted guest prices | Guest price display changes (e.g. `THB 700.00` instead of `700 THB`); Teach server accepts any 3 capitals (legacy) — ISO check for edited rows is a decision; ICU-dependent snapshot; no bulk "apply default" |
| P4 Guest shell / loading / perf (see corrections below) | `feat/033-p4-guest` `fd5e9fe` | shared shell (≥640 px → centered column ≤480 px, brand-tinted backdrop; Flow device frame removed); Suspense fallback after one light locale read + hero-wait overlay (1.5 s CSS+JS cap, 200 ms delay, fixed, reduced motion); `/g` access chain once per request (exception → 404 fail-closed); guest font preloads 11 → 3; staged prefetch (budgets, dedupe, saveData/2g/3g/memory rules, `/api/media` URLs only); Teach Intl months + CSS uppercase | ~~200 + noindex for unavailable Spaces~~ **fixed** (`7c95430`); ~~code-entry screen outside the shell~~ **fixed** (`4f870f8`); P3 media check skipped (needs DB function); latin-ext only on non-preloaded faces |
| P5 tr/it | `feat/033-p5-i18n` `3b987db`, `861b4e1`, `c937ea0` | tr/it full `Dictionary` (1,253 keys each: common 74, teach 505, flow 390, studio 284); ordinals; Turkish `capitalizeFirst`; TR/IT recommendations; glossaries; parity, placeholder and terminology tests; **not added to `SPACE_SELECTABLE_LOCALES`** | Native review (lists in `docs/localization/GLOSSARY-{tr,it}.md`); commit `c937ea0` prefixed `test(033/P5)` |
| Integration | `5f8cbff`, `0b7bd23`, `1b6541a` | tr/it for every key added by P1–P3 (31 keys); Studio schedule day strip fixed to Studio locale on UTC dates (device-locale bug, guard test) | Integration-added tr/it strings also need native review |

## Not in this package (recorded, not dropped)

Country card removal and phone default from the account country (§4.1, T33-05), D-CC2 publish privacy migration, D-PF1
region move, D-PF2 cache window, P2 guest-access RPC and P3 media check (both need a migration), timezone UX backlog
(POST-032), Teach class structured price (D-CC5 kept).

## Gates before Staging / Production

1. Browser QA per plan §1–§3, §4.11 (7 locales × 320–1440, Chromium + WebKit, RTL, keyboard/screen reader, reduced motion, axe, owner devices) and the performance matrix against the 4.4 baseline.
2. Staging deploy of this branch (Staging already has 0001–0047; **no new migration needed**).
3. Owner sign-offs: expected Share Card photo; DAY-n/single-day behaviour (already locked A1/A5 — confirm visually); guest price display format change; 200-vs-404 behaviour for unavailable Spaces.
4. tr/it: native review → add to `SPACE_SELECTABLE_LOCALES` (single switch) only then.
5. **Production dependency:** this branch contains TASK 032 (migrations 0036–0047 not on Production, which is at 0035). Production release needs the TASK 032 release gates first, or a separately reviewed backport.

## Corrections after integration (2026-10-13, owner "STAGING READINESS & QA PACKAGE")

| Fix | Commits | Result |
|---|---|---|
| Real 404 for suspended / commercially unavailable / unpublished / unknown Spaces (access decided before any streaming boundary) | `7c95430` (+ `4f870f8` carries the `guestDocument.ts` deletion) | 404 on `/s` and `/g` (local browser + curl); access-check exception → 404 on both |
| Access-code screen inside the shared shell (no behaviour change) | `4f870f8` | PASS locally (no protected content/prefetch before the code) |
| Retreat dates in the Studio unsaved-changes guard | `4d1fa49` | PASS locally |
| Daily Inspiration Day 1 = retreat start (legacy unchanged without dates) | `ff095e9` | PASS locally |
| QA defects D1 overlay, D3 contrast, D4 fonts, D5 JS | `db642b2`, `426213a`, `03322da`, `141bcef` | see `LOCAL-QA-REPORT.md` |

Integration HEAD after corrections: `e3ed1eb` — vitest 3170 passed / 20 skipped (2 build-manifest checks skip when
`.next` is older than sources), `tsc` clean, eslint 0 errors (29 warnings = baseline), `next build` OK. Local browser QA
and before/after performance: `LOCAL-QA-REPORT.md`. Staging deployment: `STAGING-DEPLOYMENT-PLAN.md`; deployed 2026-10-13 → `STAGING-QA-REPORT.md`.
