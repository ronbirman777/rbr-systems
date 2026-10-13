# TASK 033 — Staging deployment + QA (2026-10-13)

Owner approval: "INNERDWES — TASK 033 STAGING DEPLOYMENT APPROVAL" (Staging only; sign-offs 1–5 given). **Production
not touched. No merge or push to `main`. No migration. Stripe inactive. No DNS change.**

## Deployment

| Item | Value |
|---|---|
| Commit | `e3ed1eb` (`feat/033-guest-experience` code HEAD; later commits are docs only) |
| Deployment | `dpl_C3GQkdeFjyY44TEBEvvnzpHcY6tV` — `https://innerdwes-85fff4s07-inner-dwe-s.vercel.app` |
| Target | custom environment `staging`; alias `innerdwes-env-staging-inner-dwe-s.vercel.app` |
| Source | clean detached worktree at `e3ed1eb` (`vercel deploy --target=staging --yes`, repo root) |
| Attempt 1 | **failed** at build: Turbopack `Can't resolve '@vercel/turbopack-next/internal/font/google/font'` (`lib/teach/fonts.ts`, Cormorant Garamond) — stale Vercel build cache (same code builds clean locally) |
| Attempt 2 | `--force` (build without cache, same commit) → **READY** |
| Pre-checks | app code = `e3ed1eb`; `git diff 25fca3e e3ed1eb -- app/supabase/migrations` empty (Staging ledger 0001–0047); `25fca3e` is an ancestor (no billing code lost); Staging has no Stripe/Resend/cron env names, `paid_checkout_enabled = false` |
| Production | latest Production deployment unchanged (`innerdwes-cdlnhanhr`, `44426be`) |
| QA access | temporary Protection Bypass for Automation secret (value kept in a 0600 scratch file, never printed) → **revoked**; project now has **0** bypass secrets; the revoked header gets the SSO redirect (302); scratch files securely deleted |

## Browser QA (Playwright 1.63, Chromium + WebKit, 320/390/430/768/1440; NEW `e3ed1eb` vs OLD `25fca3e`)

Read-only: no logins, no form submissions, no data changes. Emulation ≠ real device; WebKit ≠ iOS Safari.

| Check | Result |
|---|---|
| Flow `qa-flow-1h8ve`, Teach `qa-teach-staging` render, both engines, all widths | PASS |
| Desktop shell (centred 480 px at 768/1440, full width below, no overflow), bottom nav, scrolling | PASS |
| Currency: `700 THB` → `THB 700.00`; `450 EUR` → `€450.00`; `1,250.50 EUR` → `€1,250.50`; Teach class free text `₪65` unchanged | PASS (no legacy non-ISO values exist on Staging) |
| Loading: fast + CDP 4G, 3 runs per Space, frame video | PASS — always blank → loader → content; never over painted content; 1.5 s cap respected |
| Console / hydration errors on Flow + Teach | PASS (none) |
| Unknown slug / unknown id | 404 + `noindex` |
| Social image `/s/<slug>/social/<v>` | 200 png, byte-identical to OLD |
| Day Navigator | single-day header PASS; **multi-day, Today, keyboard BLOCKED** (Staging Flow Space has one date, no retreat dates) |
| Hebrew RTL, de, tr/it | **BLOCKED** (all Staging Spaces English); tr/it remain unselectable |
| Code-protected, suspended, commercially unavailable, unpublished Spaces | **BLOCKED** (none on Staging); verified locally (`LOCAL-QA-REPORT.md`) |
| Share Card after Republish (Flow + Teach) | **BLOCKED** (needs Studio login) |
| `qa-staging-retreat` | shows "Nothing scheduled right now", no nav, logo 404 — **same on OLD** (synthetic data has no modules / missing logo file) |

## Marketing + Studio CSS (cssChunking)

8 site pages (`/`, `/time-to-heal`, `/time-to-elevate`, `/log-in`, `/sign-up`, `/forgot-password`, `/reset-password`,
`/preview-access`) × Chromium/WebKit × 390/1440: **0 differing pixels** on all 32 pairs, identical heights. Stylesheet
requests 1 → 2 per page; fonts and font preloads unchanged. Studio pages: **not checked on Staging** (needs login).

## Performance (Chromium, medians of 5, real Staging network: functions iad1, DB Tokyo)

| Metric | Flow OLD → NEW | Teach OLD → NEW |
|---|---|---|
| HTML first byte (curl ×5) | 2651 → 3329 ms | 5610 → 2563 ms |
| Total transfer (cold) | 815 → 488 KB (−40 %) | ~800 → 550 KB (−31 %) |
| JS gzip | 386 → 314 KB | 386 → 314 KB |
| Font preloads / requests | 11 / 11 → 3 / 4 | 11 / 11 → 3 / 6 |
| CLS | ≤ 0.0005 both | ≤ 0.0007 → ≤ 0.0002 |
| Hero decoded (390 4G cold) | 2997 → 3107 ms (ranges overlap) | 5760 → 5396 ms (ranges overlap) |

Bytes clearly down; paint and hero times are within server-time noise. Plan §4.11 targets (hero ≤ 1.5 s, HTML first byte
≤ 0.8 s) are met by **neither** build on Staging — the bottleneck is server rendering across regions (D-PF1 region move,
D-PF2 caching), not TASK 033 client code. NEW Flow's later first byte is consistent with deciding access before
streaming (real-404 requirement) — inference, not verified.

## Observations

- `og:image` absolute host on Staging (OLD and NEW) points at an old branch alias
  (`innerdwes-git-fix-0275-teach-qa-corrections-…`) — Staging site-URL setting, not code. Not changed.
- One extra stylesheet request on site pages (approved sign-off 3).

## Proposal — scoped Staging synthetic data + QA account reset (NOT executed; needs approval)

1. **Studio QA owner password** — user `innerdwes.staging.qa+028@qa.example`, id `b7a0e045-0006-471c-8a2c-e91bc0c3980b`,
   Staging project `kkqjsspxupyxytddiumf` only. Method: Supabase Auth admin `updateUserById` (password only), generated
   value stored 0600 in the session scratchpad, never printed; no other user touched; verify by id + email before and
   after. Enables Studio checks: dates panel, currency picker, Republish → Share Card.
2. **Synthetic data, same owner only** (via Studio UI after step 1, then Publish): retreat start/end dates on
   `qa-flow-1h8ve` (multi-day navigator, Today, keyboard); Space language he on one Space, then restore; access code on one
   Space, then remove.
3. **Commercially unavailable 404**: needs a billing/entitlement state change on a synthetic tenant — separate SQL
   approval (exact row, before/after values, revert statement) because it is not reachable from the UI.

## Rollback

Reassign Staging to the previous deployment `innerdwes-3i0hzkev6` (`25fca3e`, still Ready) or redeploy `25fca3e` with
`--target=staging`. No data or schema to undo.

---

# Round 2 — authenticated Studio + Guest QA (2026-10-13 18:00–19:30 UTC)

Owner approval: "INNERDWES — TASK 033 STAGING QA CONTINUATION" (scoped password reset of the synthetic QA owner only;
synthetic data only; no billing state or SQL; read-only first-byte diagnosis).

## Access

| Step | Evidence |
|---|---|
| User verified before change | Staging `kkqjsspxupyxytddiumf`, Auth admin GET: id `b7a0e045-0006-471c-8a2c-e91bc0c3980b` exact, email `innerdwes.staging.qa+028@qa.example` exact, provider email, not banned |
| Password set | Auth admin `PUT /admin/users/<id>` (password only), generated value written to a 0600 scratch file, never printed or committed; id + email re-checked in the response |
| Sign-in check | password grant 200, same user id |
| Vercel bypass | new automation secret for the run → **revoked** after QA; 0 remain; revoked header → 302 SSO |
| Pre-QA snapshot | read-only REST snapshot of both QA Spaces' tables (0600 scratch file), diffed after restore |

## Results (Playwright Chromium + WebKit, 320–1440; emulation ≠ real device; WebKit ≠ iOS Safari)

| # | Test | Result |
|---|---|---|
| 1 | Retreat dates (Flow): set 2026-10-12→16, saved, persisted after reload; unsaved-changes dialog on step switch, Cancel keeps edits; Publish | PASS |
| 2 | Multi-day Day Navigator: one tab per day, `MON 12 · DAY 1`, localized aria-labels incl. "today", tablist/aria-selected/roving tabindex/aria-controls, 56×72, empty-day state, arrows wrap, Home/End | PASS — defect **D1** (below) |
| 3 | Day 1 = retreat start (start moved before first activity → empty `SUN 11 · DAY 1`); Daily Inspiration anchored to start date (day-3 reflection shown) | PASS |
| 4 | Timezone: Space Europe/Lisbon; device UTC+14 / UTC−11 / Lisbon → Today and dates follow the Space zone | PASS |
| 5 | Currency: new priced item pre-filled EUR; searchable selector; USD override; Guest `€120.00`, `US$95.50`, existing `THB 700.00`; Teach picker EUR + required | PASS (D-CC4 error path not reachable from the UI: pre-fill prevents an empty currency; no legacy values on Staging) |
| 6 | Publish / Republish: draft changes invisible until Publish, visible after each Republish | PASS |
| 7 | Share Card: Flow uses the published Space image; draft image change does not alter the card; Republish updates it without reload. Teach `/api/share-card/<id>?v=` 200 png when signed in (`private, no-store`), 404 anonymous, `v` advances after Republish | PASS (Hero/gradient fallback not separately exercised on Staging; covered locally) |
| 8 | Hebrew: Studio language list en, de, es, fr, he — **tr/it absent**; Guest `dir=rtl lang=he`, mirrored navigator, reversed arrows, no English leaks, no console errors; restored to en | PASS |
| 9 | Access code: `/s` + `/g` 200 + `noindex`, code screen inside the shell (480 px column ≥768), no protected content or media before the code, wrong code error, rate limit after ~5 tries, right code unlocks and persists; code removed afterwards | PASS |
| 10 | Studio responsive (dashboard, builder steps, dates, currency picker, Share card, Teach): no overflow except **D2**; **D3** at 320 | PASS with D2, D3 |

## Defects

| # | Severity | Defect | Status |
|---|---|---|---|
| D1 | Medium | Guest schedule: two activities with the same date, time and title duplicated the React key (`schedule-screen.tsx` `${date}-${startTime}-${title}`) and the extras id → a stale card stayed on other days | **Fixed** on `fix/033-staging-qa`: key and id by date + position (published items have no id by design); regression tests |
| D2 | Low | Studio Share step overflows at 320 px (fixed 300 px preview → scrollWidth 324) | **Fixed**: preview `w-full max-w-[300px]`, 4:5 aspect ratio |
| D3 | Low/Med | Studio list rows (Teach "My Retreats" etc.) at 320 px: title cut to one letter by thumbnail, arrows and chevron | **Fixed**: below 480 px narrower gap, thumbnail and duplicate chevron hidden (title still toggles; arrows stay 44×44); declared in `collapsibleItemRow.test.ts` |
| D4 | Low/Med | Studio Flow configurator on WebKit: React #418 hydration text mismatch on every load | **Open** — not yet located; likely Intl date/time text (cf. pre-existing Teach de WebKit #418 in local QA) |
| D5 | Low | Studio "Guest App link" and `og:image` use an old branch host (`innerdwes-git-fix-0275-teach-qa-corrections-…`) | **Open — Staging configuration** (site-URL env value), not code; not changed |
| D6 | Low | Flow configurator: 404 for the deleted previous draft image right after a replace | Open (cosmetic console noise) |
| D7 | — | One reflection remained after fast removal of three; not reproducible | Not confirmed |

Fix verification (2026-10-13, local only: local Supabase stack, production build of `fix/033-staging-qa`, Chromium +
WebKit, non-local hosts blocked): D1 5/5 runs per engine (twin activities, rapid day switching, no stale card, distinct
extras ids); D2 no overflow at 320/390/1440, preview 272×340 at 320 (4:5, undistorted); D3 at 320/400/479/480/1440 no
overflow, narrowest title 124 px (320) / 168 px (480), arrows 44×44, title toggles. vitest 3174 passed / 18 skipped, `tsc`
clean, eslint 0 errors (29 warnings = baseline), `next build` OK. **Not yet redeployed to Staging** (needs approval).

Observations (pre-existing): Today greeting always "Good morning."; a session without end time is "Happening now" until
day end; Teach header says "Publish" when already live; Flow sidebar footer overlaps at 1440×900.

## Synthetic data changes and restoration

Changes only through the Studio UI on `qa-flow-1h8ve` / `qa-teach-staging` (41 logged steps, scratchpad
`qa033/stg2/changelog.jsonl`). Restored by 19:25 UTC; read-only diff against the snapshot: schedule items, module
items/configs identical; remaining differences are cosmetic — Flow Space image re-uploaded from the original bytes (new
ref), `spaceSettings.currency: null` key present, `published_at` / `content_updated_at` advanced. Reflection C was live on
the synthetic Flow Space for ~3 min during restore.

## Flow first-byte investigation (read-only)

- Data-loading code is byte-identical between `25fca3e` and `e3ed1eb` (`publishedSocialSpace.ts`, `guestAccess/*`,
  `entitlements/*`, `billing/commercialAccess.ts`); `/s` Flow does the same 4 sequential DB round trips before the first byte
  on both (published row → tenant status → entitlement ∥ subscription → access-mode RPC), through one React `cache()`.
- 20 alternating OLD/NEW pairs: Flow `/s` first byte 2.32 → 2.53 s median (paired +0.20 s median, **+0.045 s mean**, NEW
  slower in 13/20, IQRs overlap); Flow `/g` 2.63 → 2.27 s (the duplicate access chain on `/g` was removed); Teach first byte
  3.91 → 2.12 s but end of body +0.31 s (the fallback is flushed earlier; content arrives at about the same time).
- Conclusion: the earlier 2.65 → 3.33 s (5 samples) was sampling noise plus cold starts (OLD cold ~5.2–5.5 s). No regression.
- Code-only candidate (not implemented, needs approval): parallelise the tenant-keyed access reads (~2 round trips,
  ~0.35–0.4 s on every guest page) keeping the decision order and fail-closed behaviour. Larger wins need D-PF1 (region)
  or D-PF2 (cache) or a single access RPC (migration) — all need approval.

## Proposal — commercially unavailable 404 test (NOT executed)

- Target: synthetic tenant `qa-staging-retreat` (`4eb19601-1f88-4753-a13d-989de04ac935`; owner on `example.com`; already
  broken test data, not used by other QA). No `space_subscriptions` rows exist on Staging, so availability comes from the
  legacy entitlement: `space_entitlements.access_type = complimentary`, `access_ends_at = 2027-10-03T07:05:32.450636+00:00`;
  unusable once `now > access_ends_at + 7 days` grace. No triggers on `space_entitlements`.
- Change (one row, Staging only):
  `update public.space_entitlements set access_ends_at = now() - interval '8 days' where tenant_id = '4eb19601-1f88-4753-a13d-989de04ac935' and access_ends_at = '2027-10-03T07:05:32.450636+00:00' returning tenant_id, access_ends_at;` (expect exactly 1 row).
- Test: `/s/qa-staging-retreat` and `/g/4eb19601-…` → 404 + `noindex`, no Space content, both engines; Studio shows the
  inactive state for its owner (not logged in by us).
- Rollback (immediately after):
  `update public.space_entitlements set access_ends_at = '2027-10-03T07:05:32.450636+00:00' where tenant_id = '4eb19601-1f88-4753-a13d-989de04ac935' returning access_ends_at;` then re-check 200.
- Note: `updated_at` on that row will change. Requires explicit owner approval of these exact statements.
