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
