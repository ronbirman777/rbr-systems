# Admin Dashboard Batch 1: implementation report (LOCAL DEVELOPMENT ONLY)

Date: 2026-10-14. Branch `feat/032.6-admin-batch1` (worktree `RBR-admin-batch1`), base `18761b2`.
Owner approval: 2026-10-14, local development only. Nothing was pushed, merged or deployed. I made no hosted Supabase,
Vercel or Stripe calls, added no migration file to `app/supabase/migrations/`, did not change `vercel.json`, created no
credentials or env secrets, and added no dependencies.

Commits:

| SHA | Subject |
|---|---|
| `474a37a` | fix(admin/auth): role-aware Admin gate, stricter AAL2, gate-first actions |
| `71f1acb` | feat(admin): metric contract, exact-count Spaces/Overview queries, watchdog adapter, view audit |
| `fd0249b` | feat(admin): console shell, nine-section nav, owner Overview and Spaces & Customers |
| (this commit) | docs(admin): Batch 1 report + ADM-M1 proposed migration draft (NOT APPLIED) |

---

## 1. Gap analysis: every Admin page and action, before and after

**Confirmed gap (P-3):** `resolveAdmin()` checked the session, the `admin_users` row and AAL2, but never the role. There
was no way to make a section owner-only. Fixed: `requireAdminPage` / `requireAdminAction` take an additive
`roles?: AdminRole[]` option. When it is omitted, behaviour is unchanged (any active owner or billing_admin). A role
mismatch raises a new `role_forbidden` denial. Pages render it as `notFound()`: the same plain 404 a non-admin gets,
not a 403 and not a redirect. The role is checked **before** MFA, because a second factor cannot fix a role mismatch.
An unknown role value fails closed (`not_admin`).

### Pages and layouts (all are server components; each one calls its own gate first)

| Route | Gate before | Gate after | Change |
|---|---|---|---|
| `admin/layout.tsx` (root) | none (by design: no chrome, sets lang/dir only) | unchanged | — |
| `/admin` (`page.tsx`) | **none**: a plain `redirect("/admin/billing")` | `requireAdminPage()`, then redirect to the role's landing section (owner → `/admin/overview`, billing_admin → `/admin/billing`) | **Gap fixed**: the page now gates itself |
| `billing/layout.tsx` | `requireAdminPage()` | `requireAdminPage()` (any admin). The header moved into the shared `AdminShell` | billing_admin header is unchanged (no section nav, no env badge) |
| `/admin/billing` + `subscriptions`, `subscriptions/[id]`, `coupons`, `coupons/new`, `coupons/[id]`, `payments`, `audit`, `settings` | `requireAdminPage()` | unchanged (any admin) | none. Role-matrix regression tests cover all 9 personas |
| `(console)/layout.tsx` (new) | — | `requireAdminPage({ roles: ["owner"] })` | new |
| `/admin/overview`, `/admin/spaces`, `/admin/spaces/[id]`, `/admin/usage`, `/admin/infrastructure`, `/admin/backups`, `/admin/alerts`, `/admin/costs`, `/admin/integrations` (new) | — | each page: `requireAdminPage({ roles: sectionRoles(key) })` = owner | new, owner-only |
| `/admin/mfa/enroll`, `/admin/mfa/verify` | `requireAdminForMfaPages()` (active admin, any AAL) | same, and an unknown role is now refused (404). The post-MFA default target is `/admin` (role landing) instead of `/admin/billing` | hardening |

### Server actions (public POST endpoints)

| Action | Gate before | Gate after |
|---|---|---|
| `createCouponAction`, `setCouponActiveAction`, `syncCouponAction`, `resyncSubscriptionAction`, `reconcileCheckoutAction` | `requireAdminAction()` (+ step-up per policy) | unchanged |
| `updateCouponAction` | **Gap**: a service-role `coupon_redemptions` count ran **before** the gate, so any unauthenticated caller of the endpoint triggered a DB read. A failed count was read as 0, which meant no step-up | The gate runs first, then the count, then the step-up check. A failed count is treated as "used" (step-up required) |
| `syncPlanAction`, `setExemptAction`, `clearExemptAction`, `setPaidCheckoutAction` | AAL2 + step-up | unchanged (any admin, step-up) |
| `grantAdminAction`, `revokeAdminAction` | AAL2 + step-up. Only the **service** refused a billing_admin (`owner_only`), after a step-up prompt | `roles: ["owner"]` at the gate (a billing_admin gets `not_admin` before any prompt or lookup). The service check stays (defence in depth) |
| `mfa/actions.ts` (4 actions) | `requireAdminForMfaPages()` | same, plus the unknown-role refusal |

### MFA / AAL2 (`amr.ts`, `auth.ts`)

- AAL2 is enforced server-side on every Admin page and action, and the gate runs before any Admin data is read. The
  role matrix proves that no service-role read happens for any denied persona.
- `isAal2` now requires `aal === "aal2"` **and** a TOTP entry in the verified JWT's `amr`. Admin MFA is TOTP only, and
  step-up reads that timestamp. If an aal2 claim has no TOTP entry (another method, or a malformed claim), the session
  is sent to the code prompt.
- Step-up (600 s) now also re-reads the factor list. If a factor is removed while its AAL2 JWT is still valid, it can
  no longer satisfy a dangerous action. A failing factor lookup fails closed.
- Session refresh keeps the original TOTP timestamp in `amr`, so step-up ages from the real verification (tested).
  Clock skew of up to 60 s in the future is tolerated. NaN and Infinity are rejected.
- **Residual risk (not fixed, documented):** for ordinary **page reads**, an AAL2 JWT whose factor was removed stays
  valid until the token expires (Supabase default 1 h). Re-reading factors on every page would add an Auth-server
  round trip per request.

### Other findings (reported, not changed: billing behaviour must stay as it is today)

1. **Billing `exactCount` returned 0 for a missing count.** PostgREST answers a HEAD count on a table it does not know
   (for example Production before P-2) with `204`, no count and no error. Fixed in `474a37a`: it now throws, which
   matches the documented "fail visibly" rule.
2. The paid-checkout launch switch and exemptions are open to `billing_admin`, although a code comment says "the owner
   flips this deliberately". **Owner decision:** should `settings.paid_checkout` (and the exemptions) be owner-only?
3. The billing Subscriptions list shows owner emails in bulk to both roles (`listSubscriptions`/`lookupEmails`). The
   contracts (§1.4) limit console PII to one Space detail page. This is for the Batch 2 / billing owner to decide.
4. The billing MRR treats a null currency as USD (`metrics.ts:71`). The contracts say "unknown bucket". Batch 2 owns
   the fix. Until then the owner Overview shows a data-quality warning with the exact count of such subscriptions.
5. The billing sub-nav label "Overview" sits under the new top-level "Overview" for owners. It is cosmetic and was left
   unchanged so billing pages stay identical.

## 2. What was built

- **Contracts** `app/src/lib/admin/contracts/metric.ts`: `MetricState` (ok / stale / truncated carry a value;
  no_source / not_measured / not_applicable / error never do). `ok()` turns null, NaN and non-numbers into `error`.
  Money is per currency with an `unknown` bucket. `healthOf` is never green unless every input is a fresh ok.
  `partialSum` labels partial totals.
- **Counts** `lib/admin/queries/count.ts`: `select(col, { count: "exact" }).limit(0)` returns an exact count with no
  rows and no cap. GET is used instead of HEAD so that a missing table (`PGRST205`/`42P01`/`PGRST200`) can be
  classified as `no_source`. Any other error is `error`, never 0.
- **Spaces & Customers** `lib/admin/queries/spaces.ts`: accounts (GoTrue admin total, labelled "includes internal/demo
  accounts"); total / archived; by type, with "other" never dropped; published, draft-never-published, edits pending
  (a bounded paged read with a `truncated` state, because PostgREST cannot compare two columns), published this month;
  billing states that reuse `overviewCountSpecs` + `applyCountFilters`, plus legacy via an anti-join; new Spaces by
  UTC month; a paged list (`range` + exact total); and a detail view. Production without billing tables shows billing
  as `no_source` and legacy = all Spaces. No `guest_access_ip_attempts` read anywhere (source test).
- **Overview** `lib/admin/queries/overview.ts` reuses `loadOverview` for paid subscriptions, payment failures and MRR per
  currency (with a truncation state and the missing-currency warning). Snapshot tiles (net new paid this month,
  growth) are `not_measured` ("needs ADM-M1"). Alerts, usage and cost are `no_source`. The watchdog tile is NOT CONNECTED.
- **Console UI**: `AdminShell` (shared header), `AdminSectionNav` (the role-filtered nine sections from
  `lib/admin/sections.ts`), and `MetricView` / `WatchdogView` / `SectionPlaceholder`. Every tile shows its value or its
  state message, plus a quality badge and the as-of time. The page header shows the environment (from Vercel system
  vars; "Local" otherwise).
- **Sensitive view audit** `lib/admin/audit/views.ts`: `view.space_detail` is written through the existing redacting
  `writeAudit`, at most one row per admin, target and 10 minutes, storing the field names only. If the dedupe read or
  the write fails, the owner email is **not** shown.
- **Dictionaries**: 172 new keys × 7 locales. The parity, placeholder and no-raw-key tests pass. `SPACE_SELECTABLE_LOCALES` is untouched.

## 3. Watchdog integration interface (WS-F)

Code: `lib/admin/watchdog/summary.ts` (pure contract and strict parser) and `status.ts` (server-only adapter).
`WatchdogSource.readSummary()` returns `not_configured | absent | error | raw`. The **default source is
`notConnectedWatchdogSource`**: it makes no network call, reads no KV and no env var, and needs no credential. The test
asserts that `fetch` is not called and `process.env` is untouched. The Backups page and the Overview tiles show
**NOT CONNECTED** (grey) and never "0 alerts".

**Contract the deployed watchdog must satisfy** (KV key `summary/v1`, as written today by `watchdog/src/index.ts`
`runOnce` on infra branch `task-032.6-wsf-watchdog`):

| Field | Required shape | Rejection → |
|---|---|---|
| `health` | one of `HEALTHY` `WARNING` `CRITICAL` `UNKNOWN` (exact case) | `error` (never HEALTHY) |
| `checked_at` | ISO-8601 with an offset or `Z` | `error` |
| `unknown` | array of `b2` / `github` / `delivery` | `error` |
| `open[]` | `{ fp: dotted id (^[a-z0-9_]+(\.[a-z0-9_]+){0,3}$), severity: warning\|critical, since: ISO }` | `error`. Unknown fingerprints are kept verbatim |
| `facts` | object. Read: `last_success_at`, `backup_count`, `last_attempt_status`, `deleted_24h`, `last_run_started_at`, `credential.b2_key_expires_at`, `credential.github_token_expires_at`, `b2`/`github` = `"unavailable"` | missing object → `error`. Missing or invalid individual facts → null (rendered "unknown"/"no verified success", never 0) |

Freshness and failure states: a summary older than **90 min** is `stale` (grey health, "has not reported for N min",
pointing to the Healthchecks email). Backup age is green ≤ 8 h, amber > 8 h and ≤ 12 h, red > 12 h. These are pinned by
a test and must equal infra `config.ts` (gap G-1). Credential expiry is amber at ≤ 14 d or when unknown, red at ≤ 3 d.
An absent key means not connected. A read failure or an unreadable summary is `error`.

Access options (contracts §5). Each needs a `WatchdogSource` implementation in Batch 3 and nothing else in the UI:

| Option | What the adapter would need |
|---|---|
| **A. KV REST read** (recommended) | Read-only Cloudflare token (`Workers KV Storage: Read`), proposed `CLOUDFLARE_WATCHDOG_KV_READ_TOKEN` (secret) + `CLOUDFLARE_ACCOUNT_ID` + `WATCHDOG_KV_NAMESPACE_ID` in **Vercel Production server env only**. Cache ≤ 5 min. Owner approval of the token scope (namespace-level scoping UNVERIFIED) |
| B. Authenticated Worker endpoint | A Worker code change + redeploy (adds an internet surface), and a shared bearer/HMAC secret in both places |
| C. Worker pushes to the app | A new app write endpoint + table (a migration) + a Worker secret. It gives the watchdog a Vercel/Supabase dependency |
| D. Dashboard re-reads B2/GitHub | Its own read-only B2 key + GitHub token. It shows raw facts only: no health verdict |

The client-bundle test already lists the option-A env names, so they can never reach a client chunk.

## 4. ADM-M1 (snapshots + exclusions): proposed only

`docs/admin/proposed-migrations/ADM-M1.sql` is a **draft, NOT APPLIED**, with no number. It defines
`admin_metric_snapshots` (unique per date, key, dimensions and environment, for idempotent upserts) and
`admin_metric_exclusions` (one active exclusion per subject), both with RLS on, no policies and privileges revoked. It
also contains a design note for the cron writer: bearer `CRON_SECRET`, fail closed, a non-ok metric writes no row,
retention 2 years. I validated it only by applying it inside a `BEGIN … ROLLBACK` on the local stack, including a
double upsert that left one row. Afterwards `to_regclass` was null, so nothing persisted.

## 5. Tests and gates (exact counts)

| Gate | Baseline (`18761b2`, this worktree) | After (`fd0249b`, clean throwaway worktree with `npm ci`) |
|---|---|---|
| `next typegen` (no other type-generation script exists) | exit 0 | exit 0 |
| `tsc --noEmit -p .` | 0 errors | 0 errors |
| `eslint` | 0 errors, 29 warnings | 0 errors, 29 warnings (none added) |
| `vitest run` (no build present) | 164 files passed / 3 skipped; 2874 tests passed / 18 skipped | 171 passed / 5 skipped; 3274 passed / 28 skipped |
| `vitest run` after `next build` (client-bundle test active) | — | 172 passed / 4 skipped; 3277 passed / 25 skipped |
| `next build` | exit 0 | exit 0 (all 21 `/admin` routes dynamic) |
| Intermediate commits | — | `474a37a`: tsc 0, vitest 164/3 files, 2889 tests. `71f1acb`: tsc 0, vitest 168/5 files, 2949 tests |
| Diff hygiene `18761b2..HEAD` | — | no `.env*`, `.vercel`, migrations, `supabase/.temp`, `package*.json`, `vercel.json`; secret-pattern scan clean |

New tests: role matrix (`admin/roleMatrix.test.ts`: 9 personas × 21 pages/layouts + 12 billing actions + MFA
pages/actions; it also asserts no data read before the gate, and that every page/layout file and every exported action
is in the matrix; a mutation check (dropping the spaces role) failed 2 cases as expected), auth roles/AAL edge cases,
amr edge cases, the metric contract (missing ≠ zero), counts, the watchdog parser and boundaries, view audit
(dedupe, fail closed, no values stored), the Space-detail audit ordering, source greps (no
`guest_access_ip_attempts`/`ip_hmac`, no `.limit(n)`, no `?? 0`/`|| 0`, gate-first, PII only on the detail page,
client components import no server modules), the client bundle (server env names + local secret values), and a gated
local-stack integration test, `spaces.int.test.ts` (7 tests, **passed** against `adm1-int-*` fixtures: exact before/after
deltas for every summary count, list total, Overview billing figures and detail).

## 6. Local browser QA

Setup: `next build && next start -p 3147` against the local stack `innerdwes-local-qa`. The fixtures were 4 users
(`adm1-qa-*`), 2 `admin_users` rows (owner, billing_admin) and 6 `adm1-qa` tenants with published, subscription and
member rows. Playwright Chromium + WebKit at 1440 and 390.

**AAL2 sessions were minted, not obtained by a real TOTP challenge.** The shared local stack has TOTP MFA disabled
(`[auth.mfa.totp] enroll_enabled = false`, `verify_enabled = false`). Changing that would need a config change and a
restart of a stack other worktrees use, so I did not change it. Instead the QA script took a real password session and
re-signed its claims as `aal2` + `amr totp` with the local demo JWT secret (HS256). GoTrue `/user` accepted it (status
200). **The real browser TOTP enrol/verify flow was therefore not exercised.** The AAL1 personas used real password
sessions.

| Check | Result |
|---|---|
| Role matrix in the browser: 6 personas (anon, non-admin, billing_admin AAL1/AAL2, owner AAL1/AAL2) × 17 URLs × 2 engines | **204/204 pass** |
| Owner sections as billing_admin | HTTP **404**, no Admin chrome in the body |
| Non-admin on any `/admin/*` | HTTP 404 |
| AAL1 admin | redirect to `/admin/mfa/enroll` (no verified factor exists locally), no Admin content |
| Anonymous | redirect to `/log-in` |
| `/admin` | owner → `/admin/overview`, billing_admin → `/admin/billing` |
| Overview + Spaces tiles vs independent SQL (accounts, totals, archived, by type, published, draft, edits pending, legacy, paid, exempt) | **17/17 equal** |
| Spaces list total vs `count(*) from tenants` | equal |
| Missing states rendered (never 0) | app alerts and audio and cost = "No data source connected"; watchdog and backup = NOT CONNECTED; net new paid and growth = "Not measured yet" |
| Space detail owner email | shown after the audit row; exactly 1 `view.space_detail` row for many views (10-min dedupe) |
| Horizontal overflow at 390 / 1440 | none (all owner pages + billing, both engines) |
| Hebrew (RTL) at 390, both engines: overview, spaces, detail, backups | `dir=rtl`, no overflow, no raw keys |
| Console errors | none |
| billing_admin header | visually identical to before (no section nav, no env badge) |

Cleanup: all `adm1-*` users, tenants, subscriptions, members and `admin_users` rows were removed (residue query
0/0/0). The local stack is back to 18 tenants and 1 user. **Residue that cannot be removed:** 1 `view.space_detail` row
in the append-only `admin_audit_log` on the **local** stack (admin_user_id = the deleted fixture owner). The table
forbids DELETE by design, and I did not bypass that. The worktree's gitignored `app/.env.local` (0600, local demo
values) remains.

## 7. Remaining dependencies

| # | Dependency | Blocks |
|---|---|---|
| 1 | **ADM-M1** number allocation (0048+ contested) + review + apply, plus the snapshot cron route and a `vercel.json` cron entry | growth history, net new paid, exclusions (and dropping the "includes internal/demo accounts" label) |
| 2 | **P-2**: TASK 032 Production release (0036–0047) | any Production Admin page (`admin_users` does not exist on Production) |
| 3 | **P-8**: WS-F watchdog deployed and verified | Backups & DR beyond NOT CONNECTED |
| 4 | Watchdog **access option** A–D + credential approval | the Batch 3 `WatchdogSource` |
| 5 | Cron plan (Vercel plan limits, PROVIDER-USAGE-AND-COSTS §2.1) | the ADM-M1 writer frequency |
| 6 | Owner decisions: paid-checkout/exemption role; bulk emails on billing Subscriptions; null-currency MRR (Batch 2) | §1 findings 2–4 |
| 7 | A real TOTP enrol/verify browser pass | needs an MFA-enabled stack (Staging, or a local stack with TOTP on) |

## 8. Staging readiness (what a Staging deploy of this branch would need)

- **Migrations:** none. Staging already has 0036–0047, and Batch 1 adds no migration. ADM-M1 is not needed (the tiles
  show "not measured").
- **Env:** no new variable. It uses the existing `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
  `SUPABASE_SECRET_KEY` of the `staging` custom environment. The environment badge reads Vercel's `VERCEL_TARGET_ENV`
  (system variable, should show "Staging"). No watchdog env (the adapter is not connected).
- **Deploy:** `vercel deploy --target=staging` from the repo root, a separately approved action. This branch is not
  pushed.
- **Admin users:** provisioning or changing an `owner`/`billing_admin` row on Staging is a **separate approved action**
  (SQL bootstrap per `docs/billing/ADMIN-RECOVERY.md`, or the in-app grant by an existing owner, which is step-up and
  audited). Existing Staging admins keep working. Owners will now land on `/admin/overview`.
- **MFA:** each admin needs a verified TOTP factor (Staging Auth has MFA available; Staging QA 2026-10-10). After this
  change an aal2 session without a TOTP `amr` entry is refused. Verify once on Staging that real sessions carry
  `amr` `totp` (expected).
- **QA on Staging:** repeat §6 with real TOTP (owner and billing_admin), including step-up on a billing action. Expect
  billing tiles to read Staging data, and Spaces counts to match Staging SQL (read-only).
- **Rollback:** redeploy the previous Staging deployment (no schema change to revert). Audit rows written by `view.*`
  stay, because the log is append-only.

---

## 9. Follow-up package (owner-approved 2026-10-14, still local only)

Commit `24f83cd` (code + tests), then the docs commit that adds this section. No push, no deploy, no hosted call, no
migration file, no Stripe work.

### 9.1 Paid-checkout switch and exemptions: owner only

- The cards moved from Billing → Settings to **`/admin/launch`** ("Launch & exemptions"). The page sits in the
  owner-only `(console)` group, so a billing_admin gets a **404 at any assurance level**. I first placed it under
  `/admin/billing/controls`. The browser QA showed that the billing layout would send an AAL1 billing_admin to MFA
  before the page's 404, so I moved it.
- Actions `setPaidCheckoutAction`, `setExemptAction` and `clearExemptAction` are `roles: ["owner"]` at the gate. A
  billing_admin gets `not_admin` before any data read or step-up prompt (role matrix).
- **billing_admin capabilities that stay unchanged**: Billing Overview (the paid-checkout state is still visible,
  read-only, without a link); Subscriptions list and detail, incl. "re-sync from Stripe"; Coupons list, detail and new;
  coupon create, update, enable/disable and sync to Stripe; Payments (incl. reconcile checkout); Audit log; Settings →
  plan sync to Stripe (step-up) and viewing the Admin user list; their own MFA, including adding a backup authenticator.
  Admin grant and revoke were already owner-only.

### 9.2 No bulk customer emails

- `listSubscriptions`, `listInvoices`, `getCouponDetail` and `getSubscriptionDetail` no longer resolve emails. They make
  no Auth user lookup at all, so no email can be in page props or the RSC payload. The "Owner" and "Customer" columns
  are gone. Subscription detail shows "Owner contact: Space page" to owners, which links to the audited
  `/admin/spaces/[id]` (`view.space_detail`, 10-minute dedupe).
- Still shown, because they are **staff** identities, not customers: audit-log authors (`listAudit`) and the Admin user
  list (`listAdmins`). A source test pins this list to exactly those two functions.
- **Capability change, as requested:** billing_admin no longer sees any customer email (it had them in three lists and
  on subscription detail).
- Tests: the loader test (`noBulkEmails.test.ts`) uses a fake DB whose Auth API *would* return an email; it asserts
  that none is returned and none is looked up. The source test asserts that no billing page references
  `ownerEmail`/`userEmail`/`lookupEmails`. The browser check found no fixture email in any billing page's HTML or RSC
  payload, for either role and both engines. The client-bundle test still passes.

### 9.3 Missing currency is never USD (root fix)

- `computeOverviewMetrics`: a paid subscription with a null or blank currency is excluded from every currency total
  and counted in `mrrUnknownCurrency`. Its exact count comes from a new spec (`status in (active,trialing) and currency
  is null`, new `isNull` filter op). The exact-count parity test now crosses every case with currency USD and null.
  A missing base amount is excluded and counted in `mrr.missingAmount`, never added as 0.
- Admin `money()`: a missing currency renders "N (minor units, unknown currency)", localized, instead of "$".
- UI: a Billing Overview "Unknown currency (paid subscriptions)" stat (warn tone when > 0). The owner Overview warning
  now reads from the billing metrics, with no separate query. Dictionaries: all 7 locales.
- The integration test's USD delta is now 2500: the null-currency fixture is excluded.

### 9.4 Stale factors (decision and justification)

- `amr` entries contain only `{ method, timestamp }` (auth-js `AMREntry`), with **no factor id**. The gate therefore
  links the session to a factor by time. A **verified TOTP factor that still exists**, read fresh through the **Auth
  Admin API (service role)**, must have been created no later than the session's latest TOTP verification (+5 s). If
  a future `amr` carries `factor_id`, it is matched exactly.
- **Server actions and step-up: always fresh**, no cache. A lookup failure fails closed: actions return
  `mfa_required`, step-up returns `step_up_required`.
- **Page reads: fresh check with a 60 s positive-only cache** per (user, session, TOTP timestamp, server instance).
  Negative results are never cached.
  - Why: it is secure but practical. A removed factor stops authorizing reads within 60 s instead of the JWT's ~1 h.
    The cost is at most one Auth Admin call per admin session per minute per instance.
  - Not chosen: accepting the 1 h window, which the owner wanted closed; and a per-request check with no cache, which
    adds an Auth round trip to every navigation for no meaningful gain.
- The MFA screens treat an unbacked AAL2 session as not AAL2, so a session whose factor was removed lands on
  verify/enrol instead of looping back to `/admin`.
- **Backup authenticator:** `/admin/mfa/enroll?add=1` (header link). It needs a fresh step-up, and the enrol actions
  re-check that on the server whenever a verified factor already exists.
- Residual risk (documented): with two factors, removing the one that verified the session is not detected while the
  older one remains.
- Browser proof on the local stack (fixture factor rows inserted, because TOTP is disabled locally):

  | Factor state | Result |
  |---|---|
  | factor present | `/admin/overview` 200 |
  | removed, within the cache window | still 200 (expected) |
  | removed, after 62 s | redirect to `/admin/mfa/enroll` |
  | replaced by a factor newer than the verification | redirect to `/admin/mfa/verify` |
  | factor older than the verification again | 200 |

### 9.5 Tests and gates (clean throwaway worktree, `npm ci`, at `24f83cd`)

| Gate | Batch 1 (`fd0249b`) | Follow-up (`24f83cd`) |
|---|---|---|
| typegen / tsc | pass / 0 errors | pass / 0 errors |
| eslint | 0 errors, 29 warnings | 0 errors, 29 warnings |
| vitest, no build | 171 passed / 5 skipped files; 3274 passed / 28 skipped tests | 172 / 5 files; **3374 passed / 28 skipped** |
| vitest after build | 172 / 4 files; 3277 / 25 | 173 / 4 files; **3377 passed / 25 skipped** |
| next build | pass | pass |
| local integration (`spaces.int.test.ts`) | 7/7 | 7/7 |

New or extended tests:
- The role matrix now has 11 personas, adding factor-removed and factor-replaced. It covers `/admin/launch`, the three
  newly owner-only actions and backup enrolment: 388 tests in that file.
- Gate tests for stale factors (6), `factorBacksSession` (6), unknown currency (2 metric + money), and no bulk emails (6).

Browser QA, Chromium + WebKit, 6 personas × 18 URLs = **216/216 pass**:
- billing_admin on `/admin/launch`: 404 at both AAL1 and AAL2.
- AAL1 admins (who have a factor row) are sent to `/admin/mfa/verify`.
- No customer email in any billing HTML or RSC payload.
- The unknown-currency stat and amount label are present.
- 17/17 tiles match SQL.
- One transient WebKit "access control checks" error on an aborted RSC prefetch during fast navigation did not recur
  on a full re-run (0 console errors). Treated as navigation noise, not reproduced.

Cleanup: all `adm1-*` users, factors, tenants, subscriptions and `admin_users` rows were removed (residue 0/0/0).
Append-only residue on the **local** audit log: 2 `view.space_detail` rows in total.

### 9.6 Staging: lockout analysis and recovery

See `docs/admin/STAGING-ADMIN-BOOTSTRAP-AND-RECOVERY.md`: facts vs assumptions, the proposed first-owner SQL with a
manual audit row, enrolment order inside the 15-minute AAL1 window, the `amr` totp check, the ≥ 2-factor
recommendation, lost-device and sole-owner recovery, and rollback. Staging dependencies for a deploy:
- an approved first-owner grant (`admin_users` has 0 rows);
- the owner's TOTP enrolment plus a backup factor;
- confirmation that Staging sessions carry `amr` totp (A1, and no custom access-token hook);
- no migration and no env change.

`docs/billing/ADMIN-RECOVERY.md` was updated for the new gate rules.

### 9.7 TASK 033 merge-friendliness

- `fix/033-studio-ux` (base `86404b3`, 48 files) touches the **shared** dictionaries `lib/i18n/dictionaries/{en,de,es,fr,he,it,tr}.ts`,
  configurator, schedule, guest, auth (log-in/sign-up) and component files.
- This branch touches only the **admin** dictionaries `admin.*.ts`, Admin/billing-admin code and docs.
- The intersection of the two file lists is **empty**, so no textual conflict is expected.
- Both branches append keys only in their own namespace files.
