# InnerDweS — consolidated Staging release proposal (RC1, 2026-10-14)

Prepared for owner + ChatGPT review. Facts observed locally/read-only unless marked [A] (assumption/recommendation).
Nothing in this document has been deployed. Production is unchanged (`main` = `44426be`, deployment `innerdwes-cdlnhanhr`,
Supabase Production at migration 0035).

## A. Completed and ready for integration

| Package | Branch @ commit | Contents (implemented + locally verified) |
|---|---|---|
| TASK 032 billing foundation | contained in the TASK 033 line (base `d02ac99`) | Billing core, coupons, provisioning, access enforcement, payments/invoices, email primitives, lifecycle/audio/media guards, bucket limits. **Already on Staging** (migrations 0036–0047 applied there; code in the current Staging build). Billing OFF (`paid_checkout_enabled=false`, no Stripe env) |
| TASK 033 guest experience | `feat/033-guest-experience` `182f47e` (code) | Share Card, Day Navigator, currency, guest shell/loading/perf, tr/it translations (not selectable), D1–D4 fixes. **On Staging** (`innerdwes-1fn3aanxu`) |
| TASK 033 Studio UX package | `fix/033-studio-ux` `e8d2d03` | iPhone input-zoom + horizontal-overflow fixes; Edit Session panel; Duplicate Session; automatic end time (+1 h, manual override kept); no placeholder "Untitled" rows; Save deletes only removed sessions; exact retreat-date boundaries (out-of-range activities hidden, kept in storage); Flow day navigator styled after Teach |
| Admin Batch 1 + security follow-up | `feat/032.6-admin-batch1` `a0138c7` | Role-aware gate (owner-only sections 404 for billing_admin), gate-first actions, stricter AAL2 (TOTP in session + fresh factor check), owner Overview + Spaces & Customers (exact counts, missing ≠ 0), owner-only paid-checkout/exemptions (`/admin/launch`), no bulk customer emails, unknown-currency MRR, backup authenticator, watchdog "not connected" interface |

**Integration candidate (trial):** `integration/staging-rc1` @ `1798149` = `e8d2d03` + merge of `a0138c7`
(worktree `~/Desktop/RBR-staging-rc`). Bases differ only in docs (`d02ac99..18761b2` has no `app/` change).
**0 merge conflicts; 0 shared files.** Clean `npm ci`: `tsc` clean · eslint 0 errors / 29 warnings (baseline) ·
vitest **3822 passed / 25 skipped** (after build) · `next build` OK. No migration, package, lockfile, env or `vercel.json`
change in either branch.

## B. Still in progress (NOT in RC1)

| Item | State |
|---|---|
| Mobile Studio menu drawer | being implemented (uncommitted) |
| Brand editor simplification (8 presets, Customize Colors, remove "Where You Are") | queued |
| Branded loading experience | queued |
| Arrival Info restructuring + optional Home feature image (Studio/data side; migration check with STOP rule) | queued |
| Flow Home redesign | design only (Figma), awaits owner review |
| Dynamic Home / Happening Now | planning approved; implementation gated |
| tr/it Space selection | translated, native review pending; not selectable |
| R2 product | Worker + unwired app modules on `feat/032.5-r2-product` `8dd2749`; proposed SQL only; gates G0–G8 open — **excluded** from app releases [A] |

[A] Recommendation: build the final Staging candidate (RC1 final) from whatever of the four in-progress UX items is
**committed and gate-green** at deploy time; anything not finished is listed as excluded, never claimed.

## C. Dependency and migration map

- Staging DB: 0001–0047 → **no new migration needed** for RC1 (none of the branches adds one).
- Production DB: 0001–0035 → RC code requires 0036–0047 first (the new app fails closed for Studio uploads/publish on a
  0035 DB; guests unaffected) — TASK 032 packet `a73b0e8` (§ ordering blocker).
- Admin on any environment: needs at least one `admin_users` row (Staging has 0) + TOTP enrolment; Production also needs
  0036 (admin tables).
- Proposed, NOT applied: ADM-M1 (admin metric snapshots), R2 PXXXA–D, possibly Home feature image (pending check).
  Migration numbers 0048+ need one central allocation.
- Flags: billing paid checkout OFF; tr/it not selectable; R2 not wired; watchdog independent of the app.

## D. Proposed combined Staging release

1. Rebuild `integration/staging-rc1` from the then-current `fix/033-studio-ux` + `feat/032.6-admin-batch1`; full gates.
2. `vercel deploy --target=staging --yes` from a clean detached worktree; no env change, no migration.
3. Automated QA (§E) → batch fixes within scope → redeploy → final report + owner checklist (§F).

**Staging data preserved:** code-only deploy. Behavioural changes affect display, not stored data: activities outside
explicit retreat dates are hidden (still stored); Add/Duplicate no longer create rows until Save; Save deletes only rows
removed in that editor; billing_admin no longer sees customer emails. Existing synthetic QA data (incl. the G5 partial
setup: dates 13–17 Oct + 3 activities, unpublished) is kept.

**Rollback:** redeploy / repoint Staging to the current build `innerdwes-1fn3aanxu` (`dpl_BV2H4q1emg3So83NbqvLjHcoHoPi`,
`182f47e`). No data/schema to undo. Synthetic QA changes restored from snapshots.

## E. Automated QA plan (Claude-run on Staging)

Chromium + WebKit; 320 / 390 / 430 / 1440; host allow-list; temporary bypass revoked afterwards.
- **Guest (Flow + Teach):** status codes (public, unknown, access-code, commercially unavailable via the approved G1 method
  only if re-approved), rendering, day navigator (exact range, empty days, twins), prices, Share Card, loader (no
  overlay-on-content), Hebrew RTL, de/es/fr locales, overflow, axe, console/network errors, performance vs current build.
- **Studio (synthetic automation account):** log-in, no zoom/overflow on every step, Edit Session panel, Add → leave
  (no row), Duplicate → Save (exactly one new row), end-time follow/override, remove-one-keeps-others, out-of-range hint,
  save + reopen, Publish → Guest matches Studio (snapshot diff), plus each in-progress item that made it into the build.
- **Admin:** role matrix with synthetic owner + billing_admin (TOTP enrolled by the harness), 404s, AAL1 redirect, exact
  counts vs read-only SQL, no customer emails in billing pages, `/admin/launch` owner-only.
- **Data checks:** read-only snapshots before/after; restore synthetic changes; report every non-cosmetic difference.
- Defects: collect → classify → fix in one batch → targeted + full gates → redeploy (same approval) → report.

## F. Owner acceptance checklist (structure)

Generated from the ACTUAL deployed build, plain English, grouped by app and page, with direct Staging links:
Flow Guest (Home, Schedule/day strip, Arrival, Share) · Teach Guest (Home, week strip, class sheet) · Flow Studio (log-in
on iPhone, Schedule editor: add/duplicate/end time/remove, Brand, menu) · Teach Studio · Admin (permissions, MFA,
Overview, Spaces) · Languages (en/de/es/fr/he selectable; tr/it not). One session, real iPhone + desktop.

## G. Production release sequence (not requested now)

1. Staging acceptance of RC1 final.
2. TASK 032 packet Gate B: backup listing + owner-held logical dump (PITR is off).
3. Gate M: apply 0036–0047 (one window, current app stays live — safe on the new schema).
4. Gate A: fast-forward `main` to the accepted RC (contains TASK 032 + 033 + Admin) → auto-deploy; smoke tests.
   Owner decisions first: "Created with InnerDweS" footer, HEIC/GIF refusal, 15-min cron vs Vercel plan, unexplained
   Production catalog objects, Supabase "AAL1 session limit" scope before copying MFA settings.
5. Admin on Production: owner bootstrap row + TOTP (+ backup factor). Stripe, paid checkout and R2 stay OFF.
Rollback: promote `innerdwes-cdlnhanhr`; database rollback per file only with separate approval.

## H. Approvals required

**One consolidated Staging approval** covering:
1. Deploy RC1 final (as defined in D) to Vercel `staging` only; up to 3 batch-fix redeploys within the same scope.
2. Temporary protection-bypass secrets for automated QA, revoked after each run (0 remaining verified).
3. A synthetic automation account on Staging only (`innerdwes.staging.auto+033@qa.example`): created via the Supabase
   admin API with a generated session-only password (0600, never printed); added as owner member of the two synthetic QA
   Spaces; `admin_users` rows for a synthetic owner and a synthetic billing_admin with harness-enrolled TOTP; all disabled
   (`disabled_at`, factors removed) at the end. (Needed because the QA owner's password is now held only by you.)
4. Synthetic QA data changes on `qa-flow-1h8ve` / `qa-teach-staging` (publish, sessions, brand, access code, language)
   restored from snapshots; G5 data preserved.

Separate (not part of the Staging approval): your own first Staging admin grant; any hosted migration; Production
(G, all gates); WS-F B5/B6–B8; R2 G0+.

## Workstream F status (infrastructure, separate from app releases)

Live Worker `innerdwes-backup-watchdog` on account `1e9ec232…`: B2 KV created, B3 secrets (6), **B4 schedule active since
2026-10-14 11:16:52Z (`*/30 * * * *`)**; workers.dev/previews off, no routes/domains, public probe 404. First scheduled
run expected 11:30 UTC. Next gates: B5 (verify first run), B6 drills, B7 drill cleanup, B8 evidence.

## RC1 update 2026-10-14

Local only (no push, no deploy, no hosted calls). Branch `integration/staging-rc1`, previous HEAD `f8b0bb8`.
Merge commits (no rebase/reset): `425ded2` (origin/main), `1643853` (legal/rc1-versions), `9b013e2` (fix/033-studio-ux); this section is the commit after `9b013e2`.

**Merged, in order**

1. `origin/main` @ `94de158` (Production): 033 UX backports (`be1f9e8`, `5fba95b` line) and legal pack v1.0 (`/legal/*`, `lib/legal/documents.ts`, `isPublicLegalPath` gate exemption, footer/sign-up/My Spaces/pricing links).
2. `legal/rc1-versions` @ `9860211`: `LEGAL_VERSIONS` read from the registry (`1.0-2026-10-14`), checkout consent links to `/legal/terms`, `/legal/privacy`, `/legal/billing`. Merged cleanly; `documents.ts` byte-identical to main's.
3. `fix/033-studio-ux` @ `34973a3`: `aac5be9` (430 px Guest shell, 404 inside the shell) and the `34973a3` design docs.

**Conflict resolutions**

- Brand editor: main's `brand-palette-editor.tsx` taken whole (RC editor plus the owner-approved adaptations). "Advanced colours" disclosure keeps navigation/text colours reachable. Flow passes `showSurface={false}`, so there is no Background tint control because the Flow Guest App does not read `custom_surface`. Teach keeps Background tint and puts its "Fine-tune" toggle under Advanced. `advancedColours` added for it ("Colori avanzati") and tr ("Gelişmiş renkler").
- Guest shell, loader and media sizes: kept the RC (033-line) side in merge 1 because it is the superset (hero-wait overlay, guest loader, localized loader messages). The 430 px column then came from the original `aac5be9` in merge 3. Final: `GUEST_COLUMN_MAX_WIDTH = 430`, CSS `max-width: 430px`, no 480 px left. Main's two extra shell tests were ported, and the access-code one was adapted to the RC call (`locale`, `heroWait={false}`).
- Preview gate and proxy: union. TASK 032 `isMachineEndpointPath` and `isPublicLegalPath` are both kept.
- `space/page.tsx` imports: union. `studioMobileGuards.test`: took main's auto-discovery of form primitives.
- `brandedLoading.test` (new from main): the loader regex now also accepts the RC's `messages={translateAll(...)}` loaders.
- `it.ts` (merge 3): kept the RC's "tu" loader strings over the branch's older Lei forms and added the two register-neutral `guestNotFound` strings.

**Gates (after `npm ci`)**

| Gate | Result | RC baseline at `f8b0bb8` |
|---|---|---|
| `tsc --noEmit` | 0 errors | 0 |
| `eslint` | 0 errors, 29 warnings | 29 warnings |
| `vitest run` | 4017 passed, 25 skipped (217 files + 4 skipped) | 3887 / 25 |
| `next build` | success; `/legal` and `/legal/[slug]` (7 documents) prerendered | — |

The extra 130 tests come from main and the legal branch.

**Checks**

- The Italian register guard ("tu, never Lei") passes. The new Italian strings have no Lei forms.
- `SPACE_SELECTABLE_LOCALES` is still `en, de, es, fr, he`.
- Migrations vs main: only `0036`–`0047` added.
- The legal gate exemption tests (proxy and `lib/legal/*`) pass.
- The checkout links (`terms`, `privacy`, `billing`) resolve to registry slugs, covered by `checkoutLegalLinks.test`.

**For a later legal v1.1 merge:** `lib/legal/documents.ts` on the RC is exactly main's file with no RC-local edits, so an amendment branch based on main or `legal/rc1-versions` should merge cleanly.
