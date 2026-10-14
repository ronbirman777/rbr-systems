# InnerDweS Admin: source inventory and metric contracts (PLANNING ONLY)

Status: **design for approval, 2026-10-14.** Nothing here is built, wired or deployed. This extends
`docs/admin/ADMIN-OPERATIONS-DASHBOARD-SPEC.md` (the base, commit `13b2bc4`). It does not replace it. Where the two
disagree, the **Corrections** in §0 apply, and the spec carries a pointer to them. Requirements: matrix §2.8 `ADM-*`.
Workboard: §8 D1.

Companion documents:
- `PROVIDER-USAGE-AND-COSTS.md`: providers, quotas and the cost model
- `BACKUP-WATCHDOG-MONITORING-VIEW.md`: the Backups & DR section
- `ADMIN-IMPLEMENTATION-BATCHES.md`: staged delivery

Evidence rule: every statement cites a file, migration, document or dated observation from the repository. Anything
the repository does not establish is marked **UNKNOWN** or **UNVERIFIED**. I made no provider or API calls for this
document.

---

## 0. Corrections to the base spec (owner decisions and newer evidence win)

| # | Base spec text | Correct value | Source |
|---|---|---|---|
| C1 | Overview: backup freshness green < 6 h, amber 6–10 h, red > 10 h (spec §2) | **green ≤ 8 h, amber > 8 h and ≤ 12 h, red > 12 h** | Owner decision 2026-10-13. Watchdog `CONFIG.staleWarningH = 8`, `staleCriticalH = 12` (infra `watchdog/src/config.ts`). Workboard §5 A4 and §8 D1 |
| C2 | Alert "No verified successful backup within 10 h (warning at 6 h)" (spec §7.2); B2 threshold "Backup age > 10 h" (spec §3) | Warning at **8 h**, critical at **12 h** | Same |
| C3 | Healthchecks expects a ping every 4 h with an 8 h grace; the Worker runs hourly and alerts at 10 h (spec §7.3) | The Worker runs **every 30 min**. Healthchecks.io monitors **the watchdog itself** (period 30 min, grace **60 min**). A backup-job ping check (4 h / 8 h) is the optional phase **F2**, which needs a reviewed workflow merge | infra `docs/watchdog-runbook.md` §1, §6; workboard §5 A4 ("60m governs over the old 90m") |
| C4 | The Worker "writes a summary the dashboard can display", with an authenticated endpoint (WS-F proposal §7) | The Worker has **no HTTP surface**: `fetch()` returns 404 (`watchdog/src/index.ts:75-78`). It writes KV `summary/v1` only. **Dashboard access is an open design decision** (§5). No endpoint exists, and none is assumed | Workboard §8 D1 |
| C5 | Watchdog B2 key: "listBuckets, listFiles, readFiles, readBuckets, readBucketLifecycleRules" (spec §11) | **listFiles and readFiles only**, pinned to the bucket and the `_backup-state/` prefix. The Worker raises a critical alert if the key holds any write, delete or bypass capability | `watchdog-runbook.md` §3; `watchdog-deployment-packet.md` §2 |
| C6 | "Under Managed Payments Stripe is the merchant of record" (spec §4.2) | **Undecided.** Managed Payments (MoR) is decision BIL-12 and has not been made. Labels stay conditional | HANDOFF-EVIDENCE contradiction #15; `docs/billing/TAX.md` |
| C7 | Watchdog alert names `backup.never_started`, `backup.failed`, `backup.stuck` (WS-F proposal §3) | Implemented fingerprints: `backup.missed_runs`, `backup.run_failed`, `backup.guard_failed`, `backup.guard_blocked`, `backup.run_stuck`, `backup.lock_stuck`, `backup.state_invalid`, `backup.lock_invalid`, `backup.deletions`, `backup.count_drop`, `credential.*`, `watchdog.source_*` | `watchdog-runbook.md` §4 |

---

## 1. Universal contract rules

### 1.1 Every metric declares

| Field | Meaning |
|---|---|
| `key` | Stable id, e.g. `spaces.total` |
| `section` | One of the nine sections (spec §2) |
| `definition` | Exact backend definition (table, filter, function) |
| `source` | `supabase_sql` · `billing_synced` (Stripe data already in our tables) · `watchdog_kv` · `provider_api:<name>` · `manual` · `derived` · `evidence_register` |
| `environment` | Production reads Production, and Staging reads Staging. **One dashboard never mixes environments.** The page header names the environment |
| `freshness` | `live` (read at page load) or `snapshot` (read from a stored sample). Each declares `max_age`, after which the value is shown as **stale** |
| `as_of` | The time the value describes: query time, sample time or provider period end. It is always shown |
| `quality` | **Actual**: measured or provider-billed, from a system of record. **Estimated**: calculated (usage × published price) or forecast. **Manual**: entered by the owner, with an evidence reference |
| `unit` | `count`, `minor_units:<CUR>`, `bytes`, `minutes`, `hours`, `percent` |
| `exclusions` | Exempt Spaces, QA/synthetic data and archived Spaces, as stated per metric |
| `privacy` | `aggregate_only` · `owner_pii_detail` (a Space-owner email on a detail page only) · `none` |
| `status` | AVAILABLE NOW · PARTIALLY IMPLEMENTED · PLANNED · REQUIRES RESEARCH (spec labels) |

### 1.2 Missing is not zero

A metric value is one of these states. Only `ok` renders a number.

| State | When | Rendering |
|---|---|---|
| `ok` | The source was read successfully. A real `0` is allowed here | Number + as-of + quality badge |
| `no_source` | No integration is connected or configured (for example, Resend is not configured) | "No data source connected". **Never `0`** |
| `not_measured` | The capability does not exist yet (for example, listening minutes, AUD-03) | "Not measured yet", with the reason. **Never `0`** |
| `error` | The read failed, threw or timed out | "Could not load", with the source name. Existing behaviour: `loadOverview` throws instead of returning `0` (`docs/billing/METRICS.md`, "Fail visibly") |
| `stale` | Value older than `max_age` | Last value, greyed, with "stale since …". It never counts toward a "healthy" verdict |
| `truncated` | A bounded read hit its limit | Value + a warning naming the bound. Existing behaviour: `metricsTruncated` / `ovMetricsTruncated` |
| `not_applicable` | The metric is defined only under a condition, e.g. cost per paid Space when paid Spaces = 0 | "—", with a tooltip explaining why |

Rules:
1. A `null` from SQL, a missing key in JSON or an absent provider field maps to `error` or `no_source`, **never to `0`**.
   Code must not use `?? 0` or `coalesce(…, 0)` on a metric value unless the definition says that "absent" means
   zero. Example: `sum()` over an empty set of paid subscriptions is a genuine 0 **only** after a successful read.
2. Aggregates over several sources (for example, total monthly cost) show the split by quality. If any component
   is `no_source` or `error`, the total is labelled **partial** and lists what is missing.
3. A health verdict (green) needs every input to be `ok` and fresh. `unknown`, `stale` and `error` produce grey,
   never green. This mirrors the watchdog's UNKNOWN rule (`watchdog-runbook.md` §1.3).

### 1.3 Money

- Amounts are integer **minor units per ISO currency**. There is **no currency conversion** and no cross-currency sum.
  A multi-currency figure renders as one line per currency (`docs/billing/METRICS.md`).
- **MRR per currency**: `mrr.currentMinor[cur]`, the current discounted recurring amount, with `mrr.listMinor[cur]`
  (list value) beside it. Both are pre-tax. Both count only `active`/`trialing`, non-exempt subscriptions. MRR is
  monthly only because the one plan interval is `month`. A `year` plan would need normalisation before it can appear.
- A subscription whose `currency` is null is reported in an explicit **"currency unknown"** bucket and raises a data-quality
  warning. **It is not assumed to be USD.** The design-only RPC in `METRICS.md` uses `coalesce(currency,'USD')`. That RPC is
  not implemented, and this contract supersedes it on this point. The RPC needs the change before implementation.
- Never mix revenue concepts (spec §4.2). Gross invoiced, tax, processing fees, net revenue (Estimated), cash received
  (payouts) and "recognized revenue = not supported" stay separate lines. Tax is never revenue. Whether Stripe is
  merchant of record depends on BIL-12 (C6).

### 1.4 Privacy limits (non-negotiable)

- No listener or guest identity, IP address, IP HMAC, user agent, device id or unique-listener/unique-visitor count is ever
  read into or shown by the dashboard. This includes `guest_access_ip_attempts.ip_hmac` (`0016:50-58`). The dashboard
  has no query that touches that table.
- Listening data, once metered, is shown only as per-Space and per-period aggregates (spec §5; matrix MED-14, R2-06).
- Customer personal data is limited to the Space owner's email on a single Space detail page (`owner_pii_detail`). There
  is no bulk list or export of emails without a separate decision (spec §9).
- Watchdog data contains no object names (`watchdog-runbook.md` §4: "never object names or credentials"). The dashboard
  must not add any.
- No secret values, key ids, ping URLs or tokens are displayed. Integrations show **metadata only**: scope description,
  created and expiry dates, last success.

### 1.5 Exclusions

| Data | Rule | Gap |
|---|---|---|
| Exempt Spaces | Excluded from revenue and paid counts, and shown separately (`METRICS.md`) | — |
| QA/synthetic **Spaces** | Excluded only if marked exempt. "The code has no other QA filter" (`METRICS.md`, QA rows) | GAP: Production QA/demo Spaces must be marked exempt (`PRODUCTION-EXEMPTION-LIST.md`, owner approval) |
| QA/synthetic **accounts** | Spec §4.1 says "excluding the documented QA/synthetic accounts" | **GAP: no account-level QA flag or list exists.** Until an owner-approved exclusion list exists (proposed table `admin_metric_exclusions`, Batch 1), the accounts metric is labelled "includes internal/demo accounts" |
| QA audit rows | `qaAuditReason()` flags them, and they are never a metric input (`qaAudit.test.ts`) | — |

---

## 2. Source inventory

| Source id | System | What it provides | Access path (server-side only) | Exists today? | Environment caveat |
|---|---|---|---|---|---|
| S-DB-CORE | Supabase Postgres: `tenants`, `published_spaces`, `tenant_members`, `auth.users`, `profiles`, `module_items` | Spaces, accounts, publishing, content | Service-role client after `requireAdminPage()` | AVAILABLE NOW (both envs) | — |
| S-DB-BILL | Supabase: `space_subscriptions`, `billing_plans`, `billing_invoices`, `coupon_redemptions`, `space_subscription_addons`, `billing_events`, `pending_space_checkouts`, `billing_email_outbox` (0036–0041) | Billing state, synced from Stripe by webhooks and cron | `lib/billing/admin/queries.ts` | **Staging only.** Production is at 0035 (matrix baselines) | The Production dashboard needs the TASK 032 release first |
| S-DB-AUDIO | `billing_audio_verifications` (0046), `space_audio_entitlements()` (0038:727), `module_items.metadata.durationSeconds` | Library minutes and entitlement | SQL | Staging only | Legacy Spaces: client-reported duration (AUD-06) |
| S-DB-STORAGE | `storage.objects` (`tenant-media`), `pg_database_size()`, `pg_total_relation_size()` | Bytes per bucket, per Space prefix and per table | Service-role SQL (read-only) | AVAILABLE NOW | Bytes come from object metadata. Verify the field at implementation |
| S-DB-AUDIT | `admin_audit_log` (0036:596) | Admin actions | `queries.ts` audit page | Staging only | Append-only |
| S-SNAP | Proposed `admin_metric_snapshots`, `provider_usage_samples`, `provider_costs`, `manual_expenses`, `admin_alerts`, `admin_alert_events`, `integration_status`, `admin_metric_exclusions`, `dr_evidence` | History, provider samples, costs, alerts, DR evidence | Collector writes (service role); page reads | **PLANNED** (migration needs central numbering) | — |
| S-WD | Watchdog KV `summary/v1` (and `state/v1` for history) | Backup health, open alerts, facts | **Undecided** (§5) | Watchdog **NOT DEPLOYED** (BKP-09) | Production backups only |
| S-HC | Healthchecks.io check `backup-watchdog` | Whether the watchdog itself is alive | Read-only API key (to verify) | Account **not created** (`watchdog-owner-setup.md` §4) | — |
| S-GH | GitHub REST, infra repo `ronbirman777/innerdwes_backup_infra` | Workflow runs and conclusions, Actions minutes | Fine-grained token, Actions read | Watchdog token planned. A dashboard token would be separate | — |
| S-B2 | Backblaze B2 native API | Bytes and versions of `innerdwes-production-backup` | Read-only key | Owner-held verification key only (expires 2026-10-20T08:46:24Z, rollout log) | — |
| S-CF | Cloudflare GraphQL Analytics / Analytics Engine SQL | Worker requests, CPU, errors. R2 bytes and ops | API token, Analytics read | REQUIRES RESEARCH (spec §3) | POC only today |
| S-VC | Vercel REST | Deployments, failures, usage | Read token (scope REQUIRES RESEARCH) | — | — |
| S-ST | Stripe API | Fees (balance transactions), payouts, disputes | Restricted read key | Sandbox exists. Not connected (BIL-01) | Later |
| S-RS | Resend | Sends, bounces, complaints | API / webhooks | Billing key **not configured** (ENVIRONMENT.md) | — |
| S-MAN | Owner entry | Invoices, plan facts, domain renewals, DR evidence | Admin form (step-up, audited) | PLANNED | — |
| S-EVID | Evidence register (`dr_evidence`, proposed) | Dated DR facts: restore drills, R4, key revocation | Manual entry with an evidence ref (run id, commit, digest) | PLANNED | — |

---

## 3. Metric contracts by section

Format: **key** · definition · source · freshness / as-of · quality · missing-state behaviour · status.
Thresholds use the corrected values (§0).

### 3.1 Overview (owner) — summary only. Every tile links to its section

| Key | Definition | Source | Freshness | Quality | Missing | Status |
|---|---|---|---|---|---|---|
| `ov.alerts_open` | Count of open alerts by severity: app `admin_alerts` **plus** watchdog `summary.open` (shown separately, never merged) | S-SNAP + S-WD | live / summary `checked_at` | Actual | Watchdog not connected → "Watchdog: not connected", grey. Never "0 alerts" | PLANNED |
| `ov.backup_age_h` | `now − facts.last_success_at`. Green ≤ 8 h, amber ≤ 12 h, red > 12 h | S-WD | Summary max age 90 min | Actual | Summary missing or stale → grey "unknown". Never green | PLANNED |
| `ov.paid_spaces` | = `billing.paid_subscriptions` | S-DB-BILL | live | Actual | Production pre-release → `no_source` | AVAILABLE NOW (Staging) |
| `ov.mrr` | `mrr.currentMinor` per currency (list value on hover) | S-DB-BILL | live | Actual | as above | AVAILABLE NOW (Staging) |
| `ov.net_new_paid_month` | Snapshot difference of paid subscriptions, month to date | S-SNAP | daily | Actual (derived) | Fewer than 2 snapshots → `not_measured` | PLANNED |
| `ov.payment_failures` | `paymentFailures` | S-DB-BILL | live | Actual | — | AVAILABLE NOW (Staging) |
| `ov.spaces_live_by_type` | = `spaces.total` by `product_type` | S-DB-CORE | live | Actual | — | AVAILABLE NOW |
| `ov.published_this_month` | `published_spaces.published_at` in the month, not archived | S-DB-CORE | live | Actual | — | AVAILABLE NOW (query to write) |
| `ov.audio_near_limit` | Paid Spaces at ≥ 80% of library minutes | S-DB-AUDIO | live | Actual | — | AVAILABLE NOW (Staging) |
| `ov.cost_mtd` | Month-to-date cost, split Actual / Manual / Estimated per currency | S-SNAP (`provider_costs`) | daily | mixed, split shown | Any provider missing → "partial" + list | PLANNED |
| `ov.freshness_footer` | Each source with its last successful read | all | — | — | — | PLANNED |

### 3.2 Spaces & Customers (owner)

| Key | Definition | Source | Freshness | Quality | Missing | Status |
|---|---|---|---|---|---|---|
| `accounts.total` | `count(auth.users)` minus approved exclusions (§1.5). Not `profiles`: pre-0019 accounts have no profile row | S-DB-CORE | live | Actual | No exclusion list → labelled "includes internal/demo accounts" | AVAILABLE NOW (query to write) |
| `spaces.total` | `tenants` where `status <> 'archived'` and `archived_at is null`. Archived shown separately | S-DB-CORE | live | Actual | — | AVAILABLE NOW |
| `spaces.by_type` | `product_type`: `retreat` = Time to Flow, `teach` = Time to Teach, `client_hub` = legacy (`lib/brand/productFamilies.ts:12-13`) | S-DB-CORE | live | Actual | An unknown type is listed as "other (<value>)", never dropped | AVAILABLE NOW |
| `spaces.published` / `spaces.draft` / `spaces.edits_pending` | As in spec §4.1 | S-DB-CORE | live | Actual | — | AVAILABLE NOW |
| `spaces.paid` / `spaces.legacy` / `spaces.exempt` / `spaces.suspended_guest` / `spaces.suspended_studio` | `METRICS.md` definitions. Legacy = no `space_subscriptions` row | S-DB-BILL + S-DB-CORE | live | Actual | Production pre-release: every Space is legacy. Show that, not 0 paid | AVAILABLE NOW (Staging) |
| `spaces.new_by_period` | `tenants.created_at` by week/month and type | S-DB-CORE | live | Actual | Deleted Spaces are gone from history: label "current Spaces only" until snapshots exist | AVAILABLE NOW |
| `growth.*` | Daily snapshot of the counts above | S-SNAP | daily (as-of = snapshot date) | Actual | Before the first snapshot → `not_measured` | PLANNED |
| `space.detail.owner_email` | Owner email on one Space's page | S-DB-CORE | live | Actual | — | PLANNED (`owner_pii_detail`, view audited) |

### 3.3 Revenue & Billing (owner, billing_admin)

Existing pages and definitions: `admin/billing/*`, `METRICS.md`. New items:

| Key | Definition | Source | Freshness | Quality | Missing | Status |
|---|---|---|---|---|---|---|
| `billing.mrr_current[cur]` / `billing.mrr_list[cur]` | §1.3 | S-DB-BILL | live (as fresh as the last synced invoice) | Actual | "currency unknown" bucket | AVAILABLE NOW (Staging) |
| `billing.arr_run_rate[cur]` | MRR × 12, labelled "run-rate" | derived | live | Estimated | — | AVAILABLE NOW (derived) |
| `billing.gross_invoiced[cur]`, `billing.collected[cur]`, `billing.refunded[cur]`, `billing.outstanding[cur]` | `billing_invoices` (0040:41-42) | S-DB-BILL | live | Actual | No invoices → genuine 0 only after a successful read, with the label "no invoices yet" | AVAILABLE NOW (Staging) |
| `billing.tax[cur]` | `billing_invoices.tax_minor`. Label depends on BIL-12 (C6) | S-DB-BILL | live | Actual | Automatic tax off → "tax not collected (automatic tax off)", not 0 | PARTIALLY IMPLEMENTED |
| `billing.fees[cur]` | Stripe balance-transaction fees | S-ST | daily | Actual | `no_source` until stored | PLANNED |
| `billing.net_estimate[cur]` | collected − refunds − fees, excluding tax | derived | daily | Estimated (until reconciled with payouts) | Fees missing → `no_source`. **Do not compute without fees** | PLANNED |
| `billing.payouts[cur]` | Stripe payouts | S-ST | daily | Actual | `no_source` | PLANNED |
| `billing.mrr_movements[cur]` | new / expansion / contraction / churned, from per-subscription daily snapshots | S-SNAP | daily | Actual (derived) | Needs ≥ 2 snapshots | PLANNED |
| `billing.churn_rate` | Ended paid subscriptions in the month ÷ paid at month start | S-SNAP | monthly | Actual (derived) | Denominator 0 → `not_applicable` | PLANNED |
| `billing.addon_revenue` | `space_subscription_addons`. **Always 0 by design: add-ons are not sold (BIL-13)** | S-DB-BILL | live | Actual | Show "not sold", not a revenue 0 | AVAILABLE NOW |
| `billing.recognized_revenue` | **Not supported** (no ledger) | — | — | — | Rendered as "not supported" | — |

### 3.4 Usage & Resources (owner)

| Key | Definition | Source | Freshness | Quality | Missing | Status |
|---|---|---|---|---|---|---|
| `usage.library_minutes[space]` | Server-measured durations against `space_audio_entitlements()` | S-DB-AUDIO | live | Actual (paid). Legacy: client-reported, labelled | — | AVAILABLE NOW (Staging) |
| `usage.library_utilization[space]` | used ÷ entitled. Warning 80%, critical 95% | derived | live | Actual | Entitlement null (legacy/exempt) → `not_applicable` (AUD-05 policy undecided) | AVAILABLE NOW (derived) |
| `usage.storage_bytes[bucket]`, `usage.storage_bytes[space]` | `storage.objects` sizes in `tenant-media`, by tenant prefix | S-DB-STORAGE | daily snapshot | Actual | — | AVAILABLE NOW (query to write) |
| `usage.audio_bytes[space]` | As above, filtered to audio MIME types | S-DB-STORAGE | daily | Actual | — | AVAILABLE NOW (Supabase) |
| `usage.listening_minutes[space,period]` | **Not measured** (AUD-03 MISSING). Observe-only metering design R2-06 | — | — | — | `not_measured`: "Listening is not metered yet". **Never 0** | PLANNED |
| `usage.listening_utilization` | Only after metering. Labelled "observe-only, not enforced" | — | — | Estimated (AE sampling, `07-POC-ACCOUNTING.md`) | `not_measured` | PLANNED |
| `usage.delivered_bytes[space]` | Worker Analytics Engine (sampled) | S-CF | daily | **Estimated** | `no_source` | PLANNED |
| Privacy | No per-listener rows, unique-listener counts, IP or UA, ever (§1.4) | | | | | |

### 3.5 Infrastructure & Providers (owner)

One card per provider. Per-provider sources and quotas are in `PROVIDER-USAGE-AND-COSTS.md`. Generic contract:

| Key pattern | Definition | Source | Freshness | Quality | Missing |
|---|---|---|---|---|---|
| `provider.<p>.plan` | Plan name and renewal date | S-MAN (until an API is verified) | as entered (`verified_at`) | Manual | "Plan unknown". Never assume Free |
| `provider.<p>.quota.<metric>` | Plan limit | S-MAN, citing the plan page and the date read | as entered | Manual | "Quota unknown". Utilization not computed |
| `provider.<p>.usage.<metric>` | Measured usage for the period | S-SNAP (`provider_usage_samples`) | per collector (daily) | Actual | `no_source` / `error` / `stale` |
| `provider.<p>.utilization.<metric>` | usage ÷ quota. Warning ≥ 80%, critical ≥ 95% (spec §7.2) | derived | min(usage, quota) freshness | inherits the worst input | Either input missing → no percentage, and no alert |
| `provider.<p>.collector_health` | Last success / last error of that collector | S-SNAP (`integration_status`) | live | Actual | Never run → "not connected" |

### 3.6 Backups & Disaster Recovery (owner)

Full design: `BACKUP-WATCHDOG-MONITORING-VIEW.md`. Contract summary:

| Key | Source field | Quality | Missing |
|---|---|---|---|
| `bkp.watchdog_health` | `summary.health` (HEALTHY / WARNING / CRITICAL / UNKNOWN) | Actual | Not deployed or no summary → "Watchdog not connected" (grey) |
| `bkp.summary_age_min` | `now − summary.checked_at`. Stale after 90 min (three missed 30-min evaluations, matching the Healthchecks period + grace) | Actual | — |
| `bkp.last_verified_success` | `summary.facts.last_success_at` (written by the guard only after verification) | Actual | null → `error` "no verified success recorded" |
| `bkp.age_h` | §3.1 thresholds 8 / 12 h | Actual | — |
| `bkp.last_run_started` | `facts.last_run_started_at` | Actual | `facts.github = "unavailable"` → unknown |
| `bkp.object_count` | `facts.backup_count` | Actual | — |
| `bkp.deleted_24h` | `facts.deleted_24h` (from the guard's history) | Actual | — |
| `bkp.last_attempt_status` | `facts.last_attempt_status` | Actual | — |
| `bkp.credential_expiry.<id>` | `facts["credential.b2_key_expires_at"]`, `facts["credential.github_token_expires_at"]` | Actual | null → "expiry unknown" (warning) |
| `bkp.open_alerts` | `summary.open[]` (`fp`, `severity`, `since`) | Actual | — |
| `dr.*` (restore drills, vault, DB copy, PITR, R3, key revocation) | Evidence register | Manual (with evidence ref) | No entry → "not evidenced" |

### 3.7 Alerts & Incidents (owner)

| Key | Definition | Source | Quality | Missing |
|---|---|---|---|---|
| `alerts.app.*` | `admin_alerts` / `admin_alert_events` (spec §7.1), produced by app-side collectors | S-SNAP | Actual | Collectors not running → banner "app-side checks not running" |
| `alerts.watchdog.*` | Mirror of `summary.open`, read-only. **The watchdog keeps sole ownership of its alert state and email.** The dashboard cannot acknowledge or resolve a watchdog alert (its state lives in KV, and the dashboard has no write path) | S-WD | Actual | as §3.6 |
| `alerts.history` | App: `admin_alert_events`. Watchdog: `state/v1.history` (last 500), if access is approved (§5) | S-SNAP / S-WD | Actual | Watchdog history not approved → "history available in watchdog emails only" |

Delivery stays outside the app (spec principle 4). The dashboard is a viewer.

### 3.8 Costs & Profitability (owner only)

Model: `PROVIDER-USAGE-AND-COSTS.md` §4. Contract:

| Key | Definition | Quality rule | Missing |
|---|---|---|---|
| `cost.month[provider,cur]` | Best available value: Actual (billing API) > Manual (owner-entered invoice, evidence ref required) > Estimated (usage × published price, or forecast) | The badge shows which. The total shows the split | Provider without any value → "not entered". Total "partial" |
| `cost.fixed` / `cost.variable` | Classified by line (plan fee vs usage) | inherits | — |
| `cost.per_paid_space[cur]` | cost ÷ paid Spaces | Estimated | paid = 0 → `not_applicable` |
| `cost.margin_estimate` | (net revenue estimate − cost) ÷ net revenue estimate | Estimated | Any input missing → `no_source` |
| `cost.forecast` | Linear over the last 3 months | Estimated (forecast) | < 3 months → `not_measured` |

Never shown to Space owners or guests. Viewing this section is audited (spec §9).

### 3.9 Settings & Integrations (owner)

| Key | Definition | Source | Notes |
|---|---|---|---|
| `int.<provider>.status` | connected / not connected / error; last success; last error code (sanitized) | `integration_status` | **Never the secret.** Not even a prefix or the last 4 characters |
| `int.<provider>.credential_meta` | Scope description, created_at, expires_at, owner, rotation due | `integration_status` (Manual) | Expiry ≤ 14 d warning, ≤ 3 d critical (spec §7.2) |
| `settings.thresholds` | Displayed thresholds. Backup 8 / 12 h are **owner decisions held in the watchdog** (read-only here) | config | Changing a watchdog threshold is an infra code change, not a dashboard setting |
| `settings.admins` | `admin_users` rows (role, disabled) | S-DB-CORE | Grant/revoke stays step-up + audited (existing) |
| `settings.exclusions` | Approved QA/demo exclusions (§1.5) | `admin_metric_exclusions` | Step-up + audited |

---

## 4. Typed contract (proposed shape; not added to the codebase yet)

Kept here, not committed as code. It would be the first file of Batch 1 (`app/src/lib/admin/contracts/metric.ts`),
with unit tests. Adding it now as unwired code would bring in the full pre-commit gate (type generation, typecheck, lint,
full tests, build) for code nothing uses.

```ts
export type Quality = "actual" | "estimated" | "manual";
export type MetricState =
  | { state: "ok"; value: number; asOf: string; quality: Quality; unit: Unit }
  | { state: "stale"; value: number; asOf: string; quality: Quality; unit: Unit; staleSince: string }
  | { state: "truncated"; value: number; asOf: string; quality: Quality; unit: Unit; bound: number }
  | { state: "no_source"; reason: string }
  | { state: "not_measured"; reason: string }
  | { state: "not_applicable"; reason: string }
  | { state: "error"; source: string };
export type Unit = "count" | "bytes" | "minutes" | "hours" | "percent" | { minor: string /* ISO 4217 */ };
// Money is always Record<currency, MetricState>, never a single cross-currency number.
```

Required tests (Batch 1): `null`/`undefined`/throw never produce `{state:"ok", value:0}`; multi-currency never sums
across currencies; `stale`, `error` and `no_source` never render green; a fixture with currency `null` lands in the
unknown bucket.

---

## 5. Reading watchdog status: access design (FOR APPROVAL; nothing exists)

Facts: the Worker `innerdwes-backup-watchdog` (not deployed) has no HTTP surface (`index.ts:75-78`). Each evaluation
writes two KV keys in namespace `innerdwes-backup-watchdog`:
- `summary/v1` = `{health, checked_at, unknown[], open[{fp, severity, since}], facts{…}}` (`index.ts:54-57`);
- `state/v1` = alerts, source-failure counters, `history` (≤ 500 events) and `lastEvaluation` (`types.ts` `Store`).

Neither contains secrets or object names.

| Option | How | Changes the Worker? | Pros | Cons / risks | Recommendation |
|---|---|---|---|---|---|
| **A. KV REST read** | The dashboard server (Vercel, Production env only) calls Cloudflare's KV REST "read key-value pair" endpoint for `summary/v1`, and optionally `state/v1`. It uses a **dedicated Cloudflare API token with Workers KV Storage: Read only** on the one account | **No** | The Worker keeps no HTTP surface. The alerting path is untouched. Read-only. The token cannot change the Worker or KV | Token **scope granularity is UNVERIFIED**: it may grant read on every KV namespace in the account, including the R2 POC namespaces. Verify whether namespace-level scoping exists. If not, accept read-of-all-KV, or move the watchdog to a separate Cloudflare account. KV reads are eventually consistent (shown via `checked_at`) | **Recommended**, subject to the scope check |
| B. Authenticated Worker endpoint | Add a `fetch` route returning the summary behind a bearer/HMAC check | **Yes** (code + review + redeploy) | Exact data contract. No account-wide token | Adds an internet-facing surface to a component whose value is its independence. Needs a new secret. Contradicts the reviewed "no HTTP surface" design | Not recommended now |
| C. Worker pushes to the app | The Worker POSTs the summary to an app route | Yes | Push model | Gives the watchdog a dependency on Vercel/Supabase (a failure path to handle) and a new app write endpoint | Not recommended |
| D. Dashboard re-reads sources | The dashboard reads B2 `_backup-state/` and the GitHub runs itself, with its own read-only credentials | No | Independent second opinion | Duplicates the rule logic (drift between two rule sets). Two more credentials | Fallback only, if A is rejected. It shows raw facts and **no health verdict** |

Contract for option A (to approve):
1. Read only `summary/v1` in Batch 3. `state/v1.history` is a separate approval (it holds the full incident history).
2. Server-side only, after `requireAdminPage()` with role `owner`. Cache ≤ 5 min. The token is a Vercel **Production**
   server env var (proposed name `CLOUDFLARE_WATCHDOG_KV_READ_TOKEN`, plus non-secret `WATCHDOG_KV_NAMESPACE_ID` and
   `CLOUDFLARE_ACCOUNT_ID`). It is never in Preview/Staging (they have no production watchdog) and never `NEXT_PUBLIC_*`.
3. Parse with a strict schema: version key `summary/v1`, `health` in the four-value enum, ISO `checked_at`. An unknown
   or invalid shape → `error` ("watchdog summary unreadable"). Never HEALTHY.
4. Freshness: `checked_at` older than 90 min → `stale`, with the banner "the watchdog may not be running: check the
   Healthchecks email". The dashboard does **not** send that alert itself (Healthchecks does).
5. No dashboard write to KV, ever. Acknowledging a watchdog alert is not possible from the dashboard.
6. Threshold coupling: the 8 / 12 h values exist in the infra repo (`config.ts`) and in the dashboard. Proposal
   (later, infra change): `summary/v2` includes `thresholds` so the dashboard displays the watchdog's own values.
   Until then a dashboard test pins 8 / 12, and the runbook names both places.

Owner decisions needed: the A/B/C/D choice; whether the KV token's account-wide read scope is acceptable (or a separate
account); whether the dashboard may read `state/v1` history.

---

## 6. Proposed matrix row text (for the matrix owner; not edited here)

- **ADM-03** (append to Evidence): "Metric contracts incl. missing≠zero states and QA-account exclusion gap:
  `docs/admin/ADMIN-METRIC-CONTRACTS.md` §1–3."
- **ADM-04** (append): "Per-currency MRR with an explicit 'currency unknown' bucket (no USD assumption); MoR wording
  conditional on BIL-12 (contracts §0 C6, §1.3)."
- **ADM-09** (append to Next): "Dashboard access to KV `summary/v1`: design options A–D, recommended A (KV read token),
  owner decision pending (contracts §5). Thresholds corrected to 8 h / 12 h (§0 C1–C3)."
- **New ADM-13** · "Metric contract and missing-state rendering (no 0 for absent data; stale/error never green)" ·
  PLANNED · `ADMIN-METRIC-CONTRACTS.md` §1.2 · Batch 1.
