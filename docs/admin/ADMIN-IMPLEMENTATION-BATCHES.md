# Admin Operations Dashboard: implementation batches (PLANNING ONLY)

Status: **plan for approval, 2026-10-14.** No batch is authorized. Each batch needs its own approval, and its migration
needs a **centrally assigned number**. This replaces the phase table in spec §10 **only in granularity**. Order and
dependencies follow workboard §8 D1: inventory/contracts → read-only overview → watchdog/backup view → alerts →
providers → costs → listening.

## 0. Preconditions and shared constraints

| # | Constraint | Source |
|---|---|---|
| P-1 | **One admin.** Extend `/admin`. Reuse `lib/billing/admin/auth.ts` (`requireAdminPage` / `requireAdminAction`), `audit.ts`, `redact.ts`, `_components/ui.tsx`, `AdminI18n`, the admin dictionaries (7 locales) | Spec principle 1; ADM-01 |
| P-2 | **Production has no admin tables yet.** `admin_users` and `admin_audit_log` come from 0036, which is on Staging only (Production at 0035). Any Production Admin page needs the TASK 032 release first | Matrix baselines |
| P-3 | **Role gate missing.** `resolveAdmin()` checks only membership + AAL2. It does not check the role (`auth.ts:51-66`). Owner-only sections need `requireAdminPage({ roles: ["owner"] })`; `billing_admin` gets 404 there | Spec §9; ADM-02 |
| P-4 | Shared hotspots (single writer; integration queue): `lib/billing/admin/auth.ts`, `admin/_components/AdminNav.tsx`, `admin/billing/layout.tsx` (header/nav live here today), admin dictionaries, `vercel.json`, migrations, the lockfile | Workboard §9 |
| P-5 | Migration numbers: 0047 is used (media bucket limits). **0048+ is contested** (R2 0048–0050 vs TASK 033). Admin migrations below are named `ADM-Mn` until a number is assigned | HANDOFF-EVIDENCE #16 |
| P-6 | Read-only boundary. No control that changes infrastructure, backups, keys or billing. The only writes are owner metadata (exclusions, evidence register, manual costs, alert ack), each with step-up + audit | ADM-11 |
| P-7 | Pre-commit gate for each code batch: type generation, `tsc`, lint, full `vitest`, `next build`, diff/secret hygiene in a clean `npm ci` state | Project `CLAUDE.md` |
| P-8 | Watchdog deployed and verified (PRD-V) **before** Batch 3. Owner priority: WS-F before the expanded Admin UI | Spec §10; workboard §11.5 |

### Security requirements common to every batch

- Every page **and** every server action calls the gate itself (layouts do not re-run on client navigation, `admin/layout.tsx` comment).
- AAL2 always. **Step-up (600 s)** for: exclusions, evidence-register entries, manual cost/expense entries, alert acknowledge/resolve, threshold metadata, integration metadata.
- New audited actions, added to `ADMIN_ACTIONS` (`policy.ts`) with `requiresStepUp` = true: `metrics.exclusion_set`, `metrics.exclusion_clear`,
  `dr.evidence_add`, `cost.manual_add`, `cost.manual_update`, `expense.add`, `expense.update`, `alert.acknowledge`, `alert.resolve`,
  `integration.meta_update`. Sensitive **views** (Costs & Profitability, Space detail with an owner email) write a `view.*` audit row (spec §9).
  Design question: audit volume. Proposal: one row per page view per admin per 10 min.
- New tables: RLS on, **no policies**, `revoke all from public, anon, authenticated` (the `admin_users` pattern). Only the service role reads and writes them, after the gate.
- No secret values in the DB, logs, page props or client bundles. Provider tokens are Vercel **Production server env** only. A test greps the client bundle for the env names.
- Privacy rules: `ADMIN-METRIC-CONTRACTS.md` §1.4. No query reads `guest_access_ip_attempts`.

---

## Batch 0: inventory and contracts (docs) ✔ this commit

Deliverables: `ADMIN-METRIC-CONTRACTS.md`, `PROVIDER-USAGE-AND-COSTS.md`, `BACKUP-WATCHDOG-MONITORING-VIEW.md`, this file, the spec corrections pointer.
There is no code.

## Batch 1: shell, contracts code and the read-only Overview / Spaces & Customers

| Item | Files (proposed) |
|---|---|
| Metric contract types + missing-state helpers | `app/src/lib/admin/contracts/metric.ts` (+ `.test.ts`) |
| Role-aware gate (additive option, no behaviour change for billing pages) | `app/src/lib/billing/admin/auth.ts` (`roles?: AdminRole[]`) + `auth.test.ts` cases |
| Shared console layout + nine-section nav (empty states for unconnected sections) | `app/src/app/(site)/admin/_components/AdminNav.tsx`, a new `admin/(console)/layout.tsx` or a refactor of `billing/layout.tsx` (integration owner decides) |
| Overview + Spaces & Customers pages | `admin/overview/page.tsx`, `admin/spaces/page.tsx`, `admin/spaces/[id]/page.tsx` |
| Queries (exact counts, no `.limit`, fail visibly) | `app/src/lib/admin/queries/spaces.ts` (+ tests modelled on `metricsExact.test.ts`) |
| Dictionaries | `lib/i18n/dictionaries/admin.*.ts` (7 locales; the dictionary test enforces parity) |
| **ADM-M1 migration** | `admin_metric_snapshots`, `admin_metric_exclusions`; a daily snapshot writer (Vercel cron route, bearer, fail-closed; `vercel.json` hotspot; cron frequency is plan-dependent, see providers doc §2.1) |

Tests: missing ≠ zero (the contract tests in `ADMIN-METRIC-CONTRACTS.md` §4); `billing_admin` gets 404 on owner sections; non-admin 404; AAL1 redirect; no `guest_access_ip_attempts` reference (source grep test); per-type counts against seeded fixtures; snapshot idempotency (one row per date and key); exclusions are audited with step-up.
Environment: local DB → Staging. Production only after P-2.

## Batch 2: Revenue & Billing extensions (read-only)

Per-currency MRR with the "currency unknown" bucket; ARR run-rate; invoice-derived totals; revenue by Space type. **No Stripe API yet.**
Files: `lib/billing/admin/metrics.ts` / `queries.ts` (extend; billing hotspot, coordinate with the billing owner), `admin/billing/page.tsx`.
Optional: the `admin_billing_overview` RPC (METRICS.md design) as **ADM-M2**, with the null-currency fix.
Tests: no cross-currency sum; null currency → unknown bucket; equivalence of the RPC with `computeOverviewMetrics`.

## Batch 3: Backups & DR view (after WS-F PRD-V and the KV access decision)

| Item | Files |
|---|---|
| Watchdog summary client (option A: KV REST read, server-only, ≤ 5 min cache) | `app/src/lib/admin/watchdog/summary.ts` (+ a strict parser and tests) |
| Page | `admin/backups/page.tsx` (owner-only) |
| DR evidence register | **ADM-M3** `dr_evidence` table + entry form (step-up, audit) |
| Env (names) | `CLOUDFLARE_WATCHDOG_KV_READ_TOKEN` (secret), `CLOUDFLARE_ACCOUNT_ID`, `WATCHDOG_KV_NAMESPACE_ID`: Production only |

Tests: `BACKUP-WATCHDOG-MONITORING-VIEW.md` §7. Approval needed: the credential (account-wide KV read scope?), and whether `state/v1` history may be read.

## Batch 4: Alerts & Incidents (app-side)

**ADM-M4**: `admin_alerts`, `admin_alert_events` (spec §7.1). App-side producers (cron): billing webhook failures, stuck checkouts, outbox
failures, overdue DR drills, credential-metadata expiry, collector staleness. Watchdog alerts are **mirrored read-only** and cannot be acknowledged here.
Delivery of app-side Critical alerts: email via a **separate** sending key, or no push (dashboard only). Owner decision: app-side alerts must not
be the only path for anything Critical (spec principle 4).
Tests: fingerprint de-dup (one open per fingerprint); auto-resolve; a manual resolve requires a note; ack/resolve = step-up + audit (+ `admin_alert_events`); no duplicate emails.

## Batch 5: Infrastructure & Providers

**ADM-M5**: `provider_usage_samples`, `integration_status`. Collectors (daily, back-off, isolated failures): Supabase SQL (sizes), B2 (dedicated read-only key),
GitHub (runs/minutes; **not** the watchdog token), Cloudflare GraphQL (after the dataset research), Vercel (after the scope research), Resend (outbox counts).
Manual plan/quota entry (Manual quality, read date).
Approval: each new credential (`PROVIDER-USAGE-AND-COSTS.md` §5).
Tests: no utilization or alert without a recorded quota; collector failure → stale + warning, not 0; `integration_status` never stores secrets (schema has no such column; test).

## Batch 6: Costs & Profitability (owner only)

**ADM-M6**: `provider_costs`, `manual_expenses`. Stripe fees/payouts via a restricted read key (**only after** Stripe is connected and BIL-12 is decided).
Precedence Actual > Manual > Estimated (`PROVIDER-USAGE-AND-COSTS.md` §4).
Tests: the split always visible; partial totals; a Manual entry requires an `evidence_ref`; a price snapshot is stored with calculated values; the view is audited; `billing_admin` gets 404.

## Batch 7: Listening and audio usage

Only after observe-only metering ships (R2-06, W4). Reads per-Space hourly aggregates (`media_usage_hourly`, its own migration in the R2 lane).
Labelled "observe-only, not enforced" and Estimated (Analytics Engine sampling).
Tests: no per-listener fields exist in any query or type; `not_measured` before the meter exists.

## Batch 8 (later): MRR movements and churn

Needs ≥ 2 months of per-subscription snapshots (from Batch 1/2).

---

## Migration summary (central numbering required)

| Placeholder | Batch | Tables / functions | Rollback |
|---|---|---|---|
| ADM-M1 | 1 | `admin_metric_snapshots`, `admin_metric_exclusions` | Drop tables (no dependants) |
| ADM-M2 (optional) | 2 | `admin_billing_overview()` RPC | Drop function |
| ADM-M3 | 3 | `dr_evidence` | Drop table |
| ADM-M4 | 4 | `admin_alerts`, `admin_alert_events` | Drop tables |
| ADM-M5 | 5 | `provider_usage_samples`, `integration_status` | Drop tables |
| ADM-M6 | 6 | `provider_costs`, `manual_expenses` | Drop tables |
| (role) | when approved | Extend the `admin_users.role` check with `ops_viewer` (spec §9) | Revert the check |

Retention (spec §8, ADM-12): raw samples 90 d, snapshots 2 y, alerts 1 y. Purge jobs need their own approval, and they never touch `admin_audit_log`.

## Recommended next batch

**Batch 1**, scoped to code that does not depend on Production: the contracts module, the role-aware gate and the Spaces/Overview queries
against **Staging**, without ADM-M1 at first (live counts only). This needs no new credential and no migration number, so it can start
as soon as an Admin implementation task is authorized. ADM-M1 (snapshots) follows once a number is assigned. Batch 3 waits for the WS-F deployment.

## Proposed matrix row text (not edited here)

- **ADM-01** (Next): "Batch 1 per `docs/admin/ADMIN-IMPLEMENTATION-BATCHES.md` (role-aware gate, contracts, Overview/Spaces on Staging)."
- **ADM-02** (Gap): "`resolveAdmin` does not check the role; owner-only sections need a `roles` option (Batch 1)."
- **ADM-12** (Next): "Migrations ADM-M1..M6 need central number assignment (0048+ contested)."
