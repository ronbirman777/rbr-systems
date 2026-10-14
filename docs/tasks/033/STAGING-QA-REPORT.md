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

## Round 3 — redeploy `182f47e` + read-only Guest QA (2026-10-14)

Owner approval: "INNERDWES — TASK 033 STAGING CONTINUATION" (Staging only). **Production not touched. No merge or push
to `main`. No migration or SQL (the 404 proposal above is still NOT executed). Staging env/site-URL settings unchanged
(D5 still open). Stripe inactive.**

| Item | Value |
|---|---|
| Commit | `182f47e` (`feat/033-guest-experience`; app delta `e3ed1eb..182f47e` = 13 files: D1–D3 `e293838`, D4 WebKit #418 `caa39b6`, legacy pricing tests; no migrations, config, dependency or env changes) |
| Deployment | `dpl_EME1Fuq7cxYeDbEdC4AfnETsuy61` — `https://innerdwes-4iqe9trhs-inner-dwe-s.vercel.app`, READY |
| Target | custom environment `staging`; alias `innerdwes-env-staging-inner-dwe-s.vercel.app` now points at it |
| Source | clean detached worktree at `182f47e` (`vercel deploy --target=staging --yes`, repo root) |
| Pre-checks | Staging env names unchanged (same 7 as round 1, no Stripe/Resend/cron); `paid_checkout_enabled = false`; Production latest `innerdwes-cdlnhanhr` unchanged before and after |
| Rollback | reassign the staging alias / redeploy `e3ed1eb` → `innerdwes-85fff4s07` (READY, kept); older `innerdwes-3i0hzkev6`. No data or schema change to undo |
| QA access | temporary bypass secret (0600 scratch, never printed) → **revoked**; project has **0** bypass secrets; revoked header → 302; scratch file securely deleted; secret grep over evidence: 0 hits |

Read-only Guest QA (Playwright Chromium + WebKit; NEW `4iqe9trhs` vs PREV `85fff4s07`; GETs, navigation and tab
clicks only; host allowlist = the two deployments + Staging Supabase):

| Check | Result |
|---|---|
| Status codes | PASS — `/s` ×3, `/g` ×3, `/`, `/log-in` 200; unknown slug / `/g` id 404 + `noindex`, no Space text; identical to PREV |
| Guest rendering (Flow, Teach, Flow2 × 320/390/430/768/1440) | PASS 84/84 on NEW and PREV (shell, overflow, nav, Teach week strip 14 days, tab round trips, prices `THB 700.00` / `€450.00` / `€1,250.50` / free text `₪65`) |
| Console / hydration | PASS — 0 errors, 0 React #418/#423/#425 on both engines and builds |
| Loader | PASS — 0 overlay-over-content violations in 24 cold loads (fast + 4G) |
| Social image | PASS — 200 png 1200×1200, byte-identical to PREV |
| Site pages | PASS — 0 differing pixels in 32 comparisons (8 pages × 390/1440 × 2 engines); CSS diff = only the D3 `min-[480px]:` utilities |
| Performance | PASS — no measurable regression: paired NEW−PREV medians (24 pairs) Flow end-of-body +227 ms [IQR −133…+777], Teach +81 [−243…+764]; every IQR straddles 0; transfer +0.2–0.3 KB |

Not exercised (no data / needs login or a Studio change): D1 multi-day duplicate-key fix (Staging Flow has one day),
D4 German-date WebKit fix (all Staging Guest Spaces are English), Studio D2/D3 rows. Same-as-PREV observation: absolute
`og:image` host is `innerdwes-git-fix-0275-teach-qa-corrections-…` (= D5 site-URL setting). Emulation ≠ real device;
WebKit ≠ iOS Safari. Evidence: session scratchpad `qa033/stg3/`.

## Round 4 — approved Staging actions G1, G2a, G2b (2026-10-14 06:10–06:28 UTC)

Owner approval: "INNERDWES — TASK 033 STAGING APPROVALS" (Staging only). Production, `main`, Stripe (off), tr/it gate
unchanged; no real customer data touched; no credential reset (G3 Option B: owner holds the QA password). Evidence:
session scratchpad `g1/`, `g2/` (0600), `qa033/stg5/`, `qa033/stg6/`.

### G1 — commercially-unavailable 404 test: PASS, restored

| Step | Result |
|---|---|
| Pre-change snapshot (REST, 0600 `g1/before-g1.json`) | entitlement row identical to the packet values; 0 subscriptions; tenant `live` |
| Guard dry-run (SQL, read-only) | change filter **1** row; restore filter 0 rows; 2 rows share the end date (tenant filter excludes `c585f413-…`); no triggers |
| Bypass | fresh secret (0 before) |
| Control before | 8/8 PASS (target `/s` + `/g` 200 with Space name; controls 200), Chromium + WebKit |
| Step 2 (06:16:41Z) | guarded `DO` block: exactly 1 row; `access_ends_at` → 2026-10-06 06:16:41Z |
| Step 3 | 8/8 PASS: `/s/qa-staging-retreat`, `/g/4eb19601-…` **404 + noindex**, no Space name, 0 `/api/media` requests, both engines; `/s/qa-flow-1h8ve`, `/s/qa-teach-staging` 200 |
| Step 4 (06:19:13Z) | guarded restore: exactly 1 row; `access_ends_at` and `updated_at` back to `2026-10-03T07:05:32.450636+00:00` / `2027-10-03T07:05:32.450636+00:00` |
| Step 5 | post-restore snapshot **byte-identical** to the pre-change snapshot; 8/8 PASS (200 again) |
| Window | unavailable ≈ 2 min 32 s (limit 15 min) |
| Bypass revoke | 0 active secrets; revoked header 302; local copy deleted; value in 0 evidence files |

### G2a — Staging site address: DONE, verified

| Item | Result |
|---|---|
| Before (recorded, 0600 `g2/`) | both records = `https://innerdwes-git-fix-0275-teach-qa-corrections-inner-dwe-s.vercel.app`; full env metadata (44 records, 9 Production) saved |
| Targets confirmed | records `AbjueOWmjqDQY5eE` (SITE_URL), `wPHMblsr1yFkI5xb` (APP_URL): Preview branch `fix/027.5-teach-qa-corrections` + custom env `staging` (`env_fTINl69sF95hUnVgvL8Evl95HlAv`, branch matcher `feat/task-028-guest-performance`) |
| Change | value-only PATCH → `https://innerdwes-env-staging-inner-dwe-s.vercel.app`; metadata diff: only these 2 records, only `updatedAt`; targets/branch/custom env unchanged; 0 records added; **0 Production records changed** |
| Redeploy | `182f47e` (clean detached worktree) → **`dpl_BV2H4q1emg3So83NbqvLjHcoHoPi`, `https://innerdwes-1fn3aanxu-inner-dwe-s.vercel.app`**, READY, custom env `staging`, alias `innerdwes-env-staging-inner-dwe-s.vercel.app` |
| Canonical / `og:url` | `/s/qa-flow-1h8ve`, `/s/qa-teach-staging`, `/g/3e6e4978-…` → `innerdwes-env-staging-…` (alias and deployment URL) |
| Share Cards | `og:image` → `innerdwes-env-staging-…/s/<slug>/social/<v>`; 200 `image/png`; bytes/sha identical to round 3 (Flow 1,428,997 `8e06245070a272e9`, Teach 1,251,030 `72355afff56122e6`) |
| Generated links | Teach page's generated Flow guest links (`teach/retreats.ts`): old host → `innerdwes-env-staging-…`; robots `Sitemap:` and every sitemap `<loc>` → new host; old host in HTML 0, in client JS 0 (origin is server-rendered) |
| QR codes / Studio "Guest App link" | same server constant (`GUEST_PUBLIC_ORIGIN` = SITE_URL on Staging) as canonical; direct Studio check needs the QA login → owner (iPhone I-12, I-15) |
| Browsers | Chromium + WebKit: 200, `og:image` + canonical on new host, 0 console errors |
| Unchanged, pre-existing | marketing `/` has no canonical and its file-based `og:image` uses the deployment's own host — same on the previous build `4iqe9trhs` (Next.js/Vercel preview behaviour), not a G2a effect |
| Bypass revoke | 0 active secrets; revoked header 302; local copy deleted; value in 0 evidence files |
| Rollback | PATCH both records back to the recorded value + redeploy `182f47e`, or redeploy from `innerdwes-4iqe9trhs` (old value baked in) |

### G2b — Supabase Auth redirect allow-list: DONE, verified

Staging project `kkqjsspxupyxytddiumf` dashboard → Authentication → URL Configuration: added
`https://innerdwes-env-staging-inner-dwe-s.vercel.app/**`. After reload: **2 entries** (existing
`https://innerdwes-git-feat-time-to-teach-integration-inner-dwe-s.vercel.app/**` preserved); Site URL **unchanged**
(`https://innerdwes-git-feat-time-to-teach-integration-inner-dwe-s.vercel.app`). No authentication email sent.
Rollback: delete the added entry. (Dashboard banner at the time: Supabase "investigating a technical issue" — no effect
observed.)
