# InnerDweS Admin Operations & Business Dashboard — specification (PLANNING ONLY)

Status: **approved product direction, planning only** (owner, 2026-10-13). Nothing in this document is built or
deployed unless a row says **AVAILABLE NOW**. Requirements are tracked as `ADM-*` rows in
`docs/audits/INNERDWES-REQUIREMENTS-MATRIX.md` §2.8.

**Extended 2026-10-14** (this spec remains the base): metric contracts and the corrections list
(`ADMIN-METRIC-CONTRACTS.md` §0, which wins where this text is older), providers and costs (`PROVIDER-USAGE-AND-COSTS.md`),
the Backups & DR view (`BACKUP-WATCHDOG-MONITORING-VIEW.md`) and the staged batches (`ADMIN-IMPLEMENTATION-BATCHES.md`).
Backup thresholds below have been corrected to the owner decision of 2026-10-13 (warning 8 h, critical 12 h).

Labels used throughout:
- **AVAILABLE NOW**: the data or feature exists in code today (file cited).
- **PARTIALLY IMPLEMENTED**: some of it exists; the gap is stated.
- **PLANNED**: designed here, not built.
- **REQUIRES RESEARCH**: depends on a provider capability, plan tier or price that has not been verified.

Principles:
1. **One admin.** Extend the existing `/admin` console (billing-only today). Do not build a separate system.
2. **Read-only first.** Monitoring and reporting only. Any action that changes infrastructure, billing or data
   needs its own approval, later.
3. **Real data or a visible label.** Every number shows its source and freshness. Values that are estimated,
   forecast or entered by hand are labelled as such and are never shown as an invoice or a measurement.
4. **Critical alerts never depend on the dashboard.** They are produced and delivered by components outside the
   application (§7).
5. **Guest privacy is preserved.** No listener identity, IP, user agent or unique-listener metric, ever (§5).

---

## 1. What exists today (reusable)

| Capability | Where | Status |
|---|---|---|
| Admin console, billing only: Overview, Subscriptions, Coupons, Payments, Audit, Settings | `app/src/app/(site)/admin/billing/*`; nav `admin/_components/AdminNav.tsx:8-15` | AVAILABLE NOW (Staging-verified, BIL-06) |
| Server-side admin authorization: verified session + `admin_users` row (role `owner` or `billing_admin`, not disabled) + AAL2 MFA; TOTP step-up for sensitive actions; non-admins get 404 | `app/src/lib/billing/admin/auth.ts:8-92`, `amr.ts:12`, `policy.ts:31`; table `admin_users` (`0036_billing_core_tables.sql:578`, no client privileges) | AVAILABLE NOW |
| Append-only audit log with redaction (update/delete/truncate blocked by triggers) | `admin_audit_log` (`0036:596-630`); writer `lib/billing/admin/audit.ts:25`, `redact.ts` | AVAILABLE NOW |
| Billing metrics with exact counts, paged MRR sums and a visible truncation warning | `lib/billing/admin/metrics.ts`, `queries.ts:61`; definitions `docs/billing/METRICS.md` | AVAILABLE NOW |
| Admin UI primitives: PageHeader, Card, Badge, Stat, Dl, responsive table, filters, confirm button | `admin/_components/ui.tsx`, `styles.ts`, `ConfirmActionButton.tsx`, `useAdminForm.ts` | AVAILABLE NOW |
| Admin i18n in 7 locales | `lib/i18n/dictionaries/admin.*.ts` | AVAILABLE NOW |
| Design tokens (forest, parchment, clay, sage, graphite, linen; Geist UI, Fraunces editorial) | `app/src/app/globals.css:16-65` (Tailwind v4, CSS-configured) | AVAILABLE NOW |
| Scheduled server job pattern (Vercel cron with bearer secret, fail-closed) | `app/vercel.json`, `app/api/cron/billing/route.ts:6-24` | AVAILABLE NOW |
| Email sending (Resend via fetch) with an outbox | `lib/billing/emails/resend.ts`, `0041` | PARTIALLY IMPLEMENTED (Resend not configured; mail stays pending) |
| Backup run evidence: GitHub Actions run history; guard `PLAN`/`TIMING` lines; `_backup-state/storage-backup.json` (after release) | infra repo `ronbirman777/innerdwes_backup_infra` | PARTIALLY IMPLEMENTED (guard not released) |
| Error tracking, uptime/health endpoints, analytics SDK | — | not present |
| Platform-wide (non-billing) admin pages, a platform-owner role beyond `owner`/`billing_admin` | — | not present |

---

## 2. Information architecture

Top-level navigation of the extended `/admin` (owner-only sections marked ●; `billing_admin` keeps billing only):

| Section | Purpose | Main content |
|---|---|---|
| **Overview** ● | 30-second health of the business and platform | KPI strip + alert summary (below) |
| **Spaces & Customers** ● | Who uses InnerDweS | Accounts, Spaces by type/state, growth, lifecycle states, per-Space detail |
| **Revenue & Billing** | Money in, from Stripe-synced data | Today's six billing pages, plus MRR movements, cash, refunds, fees |
| **Usage & Resources** ● | What customers consume | Audio library and listening, storage per Space, quota proximity |
| **Infrastructure & Providers** ● | Provider plans, usage, quotas, renewals | One card per provider (§3), quota bars, data freshness |
| **Backups & Disaster Recovery** ● | Is the data recoverable? | Backup freshness, counts, guard verdicts, restore drills, key expiry |
| **Alerts & Incidents** ● | Everything that needs attention | Open/acknowledged/resolved alerts with evidence and history |
| **Costs & Profitability** ● (owner only) | Is it sustainable? | Actual vs estimated costs, margin, cost per paid Space |
| **Settings & Integrations** ● | How data gets in | Integration status (never secret values), thresholds, manual expense entry, admin users |

**Overview (main page) — only what drives a decision:**
1. Alert strip: count of open Critical/Warning alerts, each linking to evidence.
2. Backup freshness: "last verified backup N h ago" (green ≤ 8 h, amber > 8–12 h, red > 12 h; owner 2026-10-13), from the watchdog.
3. Business: paid Spaces, MRR (current, per currency), net new paid Spaces this month, payment failures.
4. Spaces: total live Spaces by product type; published this month.
5. Usage: Spaces at ≥ 80% of an audio entitlement (once metered).
6. Cost: month-to-date infrastructure cost (actual where billed, estimate otherwise, clearly split).
7. Data freshness footer: each source with its last successful refresh.

Everything else (trends, per-provider detail, per-Space tables, histories) lives on detail pages.

**Design:** reuse the existing admin primitives and tokens; parchment surface, forest text, clay for warnings
and red only for Critical; numbers in Geist tabular figures; every metric card shows source, as-of time and an
`Estimated` / `Manual` / `Actual` badge; empty states say "No data source connected" instead of zero; tables
are responsive (existing `RTable`); RTL supported (existing admin layout). No charts library is chosen yet
(REQUIRES RESEARCH: pick one that renders server-side or is small, and respects reduced motion).

---

## 3. Provider inventory and monitoring

Only services used for InnerDweS are in scope. Personal services are excluded. Plans and prices marked `?` are
**not verified** and must be confirmed by the owner from the provider's billing page.

| Provider | Used for | Plan (verified?) | Usage data via API | Billing / invoice data via API | Auth for read access | Monitoring method | Key thresholds | Status |
|---|---|---|---|---|---|---|---|---|
| **Vercel** | Hosting the Next.js app (Production, Preview, `staging` env); cron | `?` (owner to confirm) | REST API: deployments, project/domain info; usage endpoints depend on plan (REQUIRES RESEARCH) | Invoices in dashboard; billing API availability REQUIRES RESEARCH | Read-scoped access token, server-side | Poll deployments (failed deploys); monthly manual usage/cost entry until an API is confirmed | Failed Production deploy; usage ≥ 80% of plan limits | PLANNED |
| **Supabase** | Postgres, Auth, Storage (`tenant-media`); Production `qzmsclkzbxrfohuxnitc`, Staging `kkqjsspxupyxytddiumf` | Pro (per `docs/media/r2-audit/02-VENDOR-RESEARCH.md`; confirm) | **SQL (service role) AVAILABLE NOW**: database size, table sizes, storage bytes per bucket/Space, row counts. Management API (personal access token) for project metadata; org usage/egress API REQUIRES RESEARCH | Invoices in dashboard (manual) | Service-role key already server-side (SQL only); a PAT would be a new secret | Daily SQL snapshot; egress/Auth MAU from dashboard (manual) until an API is confirmed | DB or storage ≥ 80% of plan quota; egress ≥ 80% of included | PLANNED (SQL part feasible now) |
| **Cloudflare** | R2 media POC Worker (`innerdwes-media-poc`), KV, Queue, Analytics Engine; future R2 delivery | Workers Free (owner-confirmed 2026-10-12) | GraphQL Analytics API: Worker requests, CPU time, errors; R2 storage and operations (REQUIRES RESEARCH for exact datasets on Free); Analytics Engine SQL API for per-tenant aggregates | Billing API limited (REQUIRES RESEARCH); invoices in dashboard | Account API token with Analytics:Read only | Daily GraphQL pull; Worker error rate | Worker requests/CPU ≥ 80% of Free daily limits; R2 Class A/B ops ≥ 80% of free tier | PLANNED |
| **Backblaze B2** | Off-platform backup of Supabase Storage (`innerdwes-production-backup`) | Pay-as-you-go | Native API with a **read-only, bucket-pinned key**: versions, bytes, hide markers, lifecycle (proven in TASK 032.6) | **No usage/billing API**: cost is computed from bytes × published price (Estimated); invoices manual | Read-only application key (expiry tracked) | Watchdog (§7) + daily inventory | Backup age > 8 h warning / > 12 h critical; count drop; unexpected hide markers; bytes growth > 2× median | PARTIALLY IMPLEMENTED (scripts exist, not scheduled) |
| **GitHub / Actions** | Backup workflows, CI (infra repo, private) | Free (2,000 private minutes/month) | REST: workflow runs, conclusions, timings (Actions: read); billing usage endpoint REQUIRES RESEARCH | Billing in settings (manual if no API) | Fine-grained token, Actions: read, one repo | Watchdog + daily pull | Backup run failed/missing; minutes ≥ 80% of free | PLANNED |
| **Stripe** | Subscriptions, invoices, payments (Managed Payments decision pending, BIL-12) | Account exists (Singapore; MP "Eligible", see `docs/billing/research/MANAGED-PAYMENTS-COMPATIBILITY-v2.md`) | Full API: subscriptions, invoices, refunds, disputes, balance transactions (fees), payouts | Yes (Stripe is the ledger) | Restricted key, read-only, server-side | Webhooks (exist) + scheduled reconciliation | Failed-payment spike; webhook failures; sync errors | PARTIALLY IMPLEMENTED (billing tables synced; fees/payouts not stored) |
| **Resend** | Transactional/billing email | `?` (not configured) | API: sent emails, domains; event webhooks for bounces/complaints; quota data REQUIRES RESEARCH | Dashboard (manual) | Sending key (exists as env name only) | Webhook events + outbox counts | Bounce/complaint rate; daily/monthly quota ≥ 80% | PLANNED |
| **Namecheap** | Domain registration (owner to confirm which domains) | `?` | API exists but requires account eligibility and IP allow-listing (REQUIRES RESEARCH) | Dashboard | — | **Manual**: domain list, renewal dates, auto-renew flag | Renewal ≤ 30 days; auto-renew off | PLANNED (manual) |
| **Netlify** | Legacy only; no runtime dependency (CLAUDE.md) | `?` | Not monitored | Manual | — | Track only any remaining charge; propose decommission | Any charge > $0 | PLANNED (manual) |
| **Google Workspace** | Only if used for InnerDweS mail/admin (owner to confirm) | `?` | Not needed | Manual | — | Manual cost entry | Renewal | REQUIRES RESEARCH (scope) |
| **Shopify** | Only if integrated with InnerDweS (no reference found in the repo or docs) | — | — | — | — | Exclude unless the owner confirms | — | REQUIRES RESEARCH (scope) |

Rules: provider secrets live only in server-side environments (Vercel env / Cloudflare secrets), never in the
browser, the database or this repository; the dashboard stores **metadata** about each integration (provider,
scope description, created/expires dates, last success) so expiring keys can raise alerts.

---

## 4. Metric definitions

Every metric names its backend source. Synthetic/QA data and **exempt** Spaces are excluded from business
metrics and shown separately (as the billing Overview already does).

### 4.1 Business overview (Spaces & Customers)

| Metric | Definition (actual backend) | Status |
|---|---|---|
| Registered accounts | `count(auth.users)` (service role), excluding the documented QA/synthetic accounts. Not `profiles`: accounts created before 0019 have no profile row | AVAILABLE NOW (query to write) |
| Total Spaces | `tenants` where `status <> 'archived'` and `archived_at is null`; archived shown separately | AVAILABLE NOW |
| Spaces by product type | `tenants.product_type`: `retreat` = **Time to Flow** (`lib/brand/productFamilies.ts:12-13`), `teach` = **Time to Teach**, `client_hub` = legacy type (shown as such) | AVAILABLE NOW |
| Published Spaces | Has a `published_spaces` row (`0004:84`) and not archived | AVAILABLE NOW |
| Draft / never published | `status in ('draft','ready_to_publish')` and no `published_spaces` row. A published Space with unpublished edits is "Published (edits pending)" via `content_updated_at > published_at` | AVAILABLE NOW |
| Active paid Spaces | `space_subscriptions` status `active` or `trialing`, not exempt (= `paidSubscriptions`, `docs/billing/METRICS.md`) | AVAILABLE NOW |
| Unpaid (payment failing) | `payment_failed_at` set and not ended (`paymentFailures`) | AVAILABLE NOW |
| Trial Spaces | `status = 'trialing'`. No plan offers a trial today, so this is expected to be 0; shown only if non-zero | AVAILABLE NOW |
| Legacy Spaces (no subscription) | `tenants` with no `space_subscriptions` row: today's Production Spaces predate billing | AVAILABLE NOW |
| Suspended Spaces | Billing-derived only: `guestSuspended` and `studioSuspended` (`METRICS.md`; `space_access_state()` `0038:635`). There is **no** manual admin suspension; none is proposed here | AVAILABLE NOW (Staging) |
| New Spaces over time | `tenants.created_at` by week/month, by product type | AVAILABLE NOW |
| Account and Space growth | Daily snapshot of the counts above (`admin_metric_snapshots`, §8) so history survives deletions | PLANNED |
| Active subscriptions | `paidSubscriptions` | AVAILABLE NOW |
| Subscription cancellations | Scheduled: `cancel_at_period_end = true` on active/trialing (`scheduledCancellations`). Completed: `canceled_at`/`ended_at` set (`0036:330-333`) within the period | AVAILABLE NOW (Staging) |
| Plan distribution | `space_subscriptions` joined to `billing_plans.plan_key`. One plan exists (`space_monthly_usd`), so this is a single bar until more plans exist | AVAILABLE NOW |

### 4.2 Revenue and billing

Terminology (shown on the page): **Gross revenue** = amounts invoiced to customers before tax.
**Taxes** = tax collected on invoices (`billing_invoices.tax_minor`); tax is never InnerDweS revenue. Whether
Stripe acts as merchant of record (Managed Payments) is **undecided** (BIL-12); labels stay conditional on that decision. **Payment processing fees** =
Stripe fees (and the Managed Payments fee, if adopted) from balance transactions. **Net revenue (estimate)** =
gross collected − refunds − fees, excluding tax. **Cash received** = Stripe payouts to the bank.
**Recognized revenue** = not supported (no revenue-recognition ledger; would need Stripe Revenue Recognition,
REQUIRES RESEARCH). All amounts are per currency, in minor units; no currency conversion.

| Metric | Definition | Status |
|---|---|---|
| MRR | `mrr.currentMinor` (current discounted recurring amount) per currency; `mrr.listMinor` shown as list value. Valid as monthly because the only interval is `month` (`METRICS.md`) | AVAILABLE NOW |
| ARR | MRR × 12, labelled "run-rate" | AVAILABLE NOW (derived) |
| New / Expansion / Contraction / Churned MRR | Movement between two daily MRR snapshots per subscription: new (no prior row), expansion/contraction (amount change, e.g. add-on or discount end), churned (ended). Requires per-subscription daily snapshots | PLANNED |
| Payments collected (gross, incl. tax) | `billing_invoices.amount_paid_minor` for invoices paid in the period (`0040:41`) | AVAILABLE NOW (Staging; no real invoices yet) |
| Refunds | `billing_invoices.amount_refunded_minor` (`0040:42`) | AVAILABLE NOW |
| Failed payments | Invoices `open` with a failed attempt / `payment_failed_at` episodes | AVAILABLE NOW |
| Outstanding invoices | `status = 'open'`, sum of `amount_due_minor` | AVAILABLE NOW |
| Subscription churn rate | Ended paid subscriptions in month ÷ paid subscriptions at month start (from snapshots) | PLANNED |
| Revenue by Space type | Invoices joined to `tenants.product_type` via subscription | AVAILABLE NOW (query to write) |
| Add-on revenue | `space_subscription_addons`; **no add-on is sold** (BIL-13), so 0 by design | AVAILABLE NOW (always 0 today) |
| Taxes collected | `billing_invoices.tax_minor` where present; automatic tax is off today; under Managed Payments shown as "collected and remitted by Stripe" | PARTIALLY IMPLEMENTED |
| Stripe fees | Stripe balance transactions `fee` (not stored today) | PLANNED |
| Net revenue estimate | As defined above, labelled Estimated until reconciled with payouts | PLANNED |

The Managed Payments decision (BIL-12) and the legal/tax gates (`docs/billing/LAUNCH-GATES.md`, `TAX.md`) decide
the final labels; nothing here pre-empts them.

### 4.3 Costs and profitability (owner only)

| Metric | Definition | Status |
|---|---|---|
| Monthly infrastructure cost | Sum over providers of the best available value per month: **Actual** (invoice entered or from a billing API) > **Calculated** (usage × published price) > **Forecast** (trend). The total shows the split | PLANNED |
| Cost by provider | Same, per provider | PLANNED |
| Fixed vs variable | Fixed: plan fees (Vercel, Supabase plan, domains, Workspace). Variable: usage-based (egress, B2 bytes, R2 ops, Actions minutes over free) | PLANNED |
| Manual expenses | Owner-entered lines (amount, currency, period, provider, category, note, attachment link), audited | PLANNED |
| Cost per active paid Space | Monthly cost ÷ active paid Spaces (shown only when paid Spaces > 0) | PLANNED |
| Estimated cost per product type | Variable cost allocated by measured usage share (storage bytes, listening minutes when metered); fixed cost allocated by Space count. Always "Estimated" | PLANNED |
| Revenue per paid Space | Net revenue estimate ÷ paid Spaces | PLANNED |
| Gross margin estimate | (Net revenue − infrastructure cost) ÷ net revenue | PLANNED |
| Operating profit estimate | Net revenue − infrastructure cost − manual operating expenses | PLANNED |
| Trends and projections | 12-month history from snapshots; projection = linear on the last 3 months, labelled Forecast | PLANNED |

Never shown to Space owners or guests. Never mixes estimated and actual values without the badge.

---

## 5. Audio usage and costs

Approved model (`docs/billing/ENTITLEMENTS.md:1-31`; seed `0036:93-120`): Space $25/month includes 240
audio-library minutes, 60 minutes maximum per recording and 100,000 listening minutes per month; each $5/month
`audio_pack` adds 240 library minutes and 70,000 listening minutes. Add-ons are **not sold** yet (BIL-13).

| Metric | Source | Status |
|---|---|---|
| Audio-library minutes used per Space | Server-measured durations (`billing_audio_verifications`, `0046:127`; `module_items.metadata.durationSeconds`), entitlement from `space_audio_entitlements()` (`0038:727`) | AVAILABLE NOW (Staging) |
| Library utilization and "approaching limit" | used ÷ entitled; Warning at 80%, Critical at 95% | AVAILABLE NOW (derived) |
| Audio storage bytes | `storage.objects` sizes for audio MIME types in `tenant-media` (service-role SQL); after the R2 move, R2 object sizes | AVAILABLE NOW (Supabase) / PLANNED (R2) |
| Listening minutes per Space / platform total | **Not measured today** (`ENTITLEMENTS.md` "NOT ENFORCED"). Planned observe-only metering: hourly per-Space aggregates (`media_usage_hourly`) from playback-token beacons, design `docs/media/r2-audit/04-SECURITY-STREAMING-METERING.md` §F.7, `docs/billing/LISTENING-METERING-OPTIONS.md`; POC code only in `infra/media-worker-poc/` | PLANNED (R2-06) |
| Listening entitlement utilization | listening minutes ÷ entitled; shown only once metered; labelled "observe-only, not enforced" until `ENFORCE_LISTENING` is approved | PLANNED |
| Audio bandwidth | Today only Supabase org-level egress (manual). After R2: Worker delivered bytes per Space from Analytics Engine — **sampled, so an estimate** (`07-POC-ACCOUNTING.md`) | PLANNED |
| Add-on subscriptions | `space_subscription_addons` (none sold) | AVAILABLE NOW (always 0) |
| Audio infrastructure cost | Calculated: storage bytes × price + delivered bytes/operations × price, per `docs/media/r2-audit/03-COST-MODEL.md`. Always "Estimated" | PLANNED |

**Privacy (non-negotiable):** aggregates per Space and hour only; no persistent listener identifiers, no IP or
user-agent use, no cookies for metering, no unique-listener counts, no per-guest histories. The dashboard can
show "minutes listened in Space X this month", never "who" or "how many people".

---

## 6. Infrastructure usage (what each provider contributes)

| Area | Metrics (only if a real source exists) | Source | Status |
|---|---|---|---|
| Supabase | DB size, largest tables, storage bytes per bucket and per Space, row growth | SQL snapshot | PLANNED (feasible now) |
| Supabase | Egress, Auth MAU, compute/performance | Dashboard (manual) / Management API | REQUIRES RESEARCH |
| Supabase | Database backup status | Supabase dashboard (PITR/daily per plan); independent DB dumps are WS-G | PLANNED |
| Vercel | Deployments and failures; function errors; bandwidth | REST API; usage endpoints by plan | REQUIRES RESEARCH |
| Cloudflare | R2 bytes and ops; Worker requests, CPU, errors; Queue backlog; KV ops | GraphQL Analytics API | REQUIRES RESEARCH (dataset availability on Free) |
| Backblaze | Stored bytes, versions, hide markers, backup age, integrity (guard verdicts, restore drills), growth, lifecycle rule, estimated cost | Read-only B2 key; guard state; GitHub runs | PARTIALLY IMPLEMENTED |
| GitHub | Actions minutes, workflow success/failure, missed backup runs, CI health | REST API | PLANNED |
| Resend | Volume, bounces/complaints, quota | Webhooks + outbox | PLANNED |
| Stripe | Subscription states, payment failures, webhook health | Synced tables + `billing_events` | AVAILABLE NOW (Staging) |

---

## 7. Alerts and external delivery

### 7.1 Alert model

`admin_alerts` (one row per open problem) and `admin_alert_events` (append-only history):

| Field | Meaning |
|---|---|
| `fingerprint` | Stable key (e.g. `backup.stale:innerdwes-production-backup`) used for de-duplication: one open alert per fingerprint |
| `source` / `provider` | e.g. `watchdog`, `stripe`, `supabase` |
| `severity` | `info` · `warning` · `critical` |
| `status` | `open` → `acknowledged` → `resolved` (auto-resolve when the condition clears; manual resolve requires a note) |
| `triggered_at`, `last_seen_at`, `resolved_at` | Timestamps (UTC) |
| `reason` | Why it fired, with the threshold and the observed value |
| `evidence_url` | Link to the run, log or provider page |
| `recommended_action` | Runbook step |
| `acknowledged_by/at`, resolution history | From `admin_alert_events`, also mirrored to `admin_audit_log` |

### 7.2 Alert catalogue (initial)

| Area | Alert | Severity |
|---|---|---|
| Backups | No verified successful backup within 12 h (warning at 8 h; owner 2026-10-13) | critical |
| Backups | Backup run failed / guard FAILED | critical |
| Backups | Guard BLOCKED (mass deletion, erosion, empty source, missing bucket) | critical |
| Backups | Source count drop > 5% vs 7-day max; destination ≠ source after a successful run | warning → critical |
| Backups | Hide markers in 24 h > max(10, 5%) | critical |
| Backups | Integrity check (download verification) failed; restore drill failed or older than its schedule | critical / warning |
| Backups | Immutable vault copy failed or older than 26 h (after WS-E) | critical |
| Infrastructure | Provider status incident affecting a used component | warning |
| Infrastructure | Usage ≥ 80% (warning) / ≥ 95% (critical) of a plan quota | warning / critical |
| Infrastructure | Month-to-date cost > 1.5× the same point last month, or above an owner-set budget | warning |
| Infrastructure | Worker/function error rate above baseline; failed Production deploy | warning / critical |
| Billing | Payment-failure spike; webhook processing failures; checkout stuck; subscription sync errors | warning / critical |
| Security | Operational key expiring in ≤ 14 days (warning) / ≤ 3 days (critical); backup key capabilities changed; new admin granted | warning / critical |

### 7.3 Delivery architecture (independent of the app)

> **Superseded in detail (2026-10-14)** by the implemented watchdog (infra `docs/watchdog-runbook.md`): the Worker runs
> every **30 min**; Healthchecks.io monitors the **watchdog** (period 30 min, grace 60 min); a backup-job ping check
> (4 h / 8 h) is optional phase F2; stale thresholds are 8 h / 12 h; the Worker has **no HTTP endpoint** and writes KV
> `summary/v1` only. How the dashboard reads it is an open decision: `ADMIN-METRIC-CONTRACTS.md` §5. The diagram
> below is kept for history.

Critical monitoring must work when Vercel, Supabase or the dashboard are down, and must detect a job that
**never started**.

```
GitHub Actions backup run ──(start / success / fail ping)──▶ healthchecks.io (dead-man switch) ──email──▶ owner
                    │
                    └─ writes _backup-state/storage-backup.json in B2
Cloudflare cron Worker (hourly, outside Vercel/Supabase)
   ├─ reads B2 with a read-only key: last_success, counts, hide markers, bytes
   ├─ reads GitHub runs API (Actions: read): last run start/conclusion
   ├─ evaluates rules, keeps alert state in KV (open/resolved, last notified)
   └─ sends email (Resend key used only for alerts, or Cloudflare Email Routing) + writes a summary the
      dashboard can display (the dashboard is a viewer, never the alerting path)
```

Rules for the backup watchdog (WS-F, BKP-09/BKP-15; DR plan §14.2):
- **Freshness from the data, not the scheduler:** "verified success" = `last_success.at` in the B2 state file
  (written only after verification) *and* a successful GitHub run; a missing run never counts as success.
- **Never-started detection:** healthchecks.io expects a success ping every 4 h with an 8 h grace (GitHub delays
  scheduled runs by up to ~3 h and drops some); the Worker independently alerts at 10 h.
- **Failed executions:** `/fail` ping from the job's failure path plus the run conclusion from the API.
- **No duplicates:** one notification when an alert opens, a reminder every 12 h while open, one **recovery**
  notification when it resolves. State is keyed by fingerprint in KV.
- **Evidence:** every email has the UTC timestamps, observed values, thresholds and links to the run and the
  dashboard page.
- Channel: email to the owner first. A second channel (e.g. SMS or push) is justified only for Critical alerts
  if email proves unreliable; REQUIRES RESEARCH for cost.

---

## 8. Data and integration architecture

- **Collectors** (server-side only): a Vercel cron route (existing pattern, bearer secret, fail-closed) for
  database-derived snapshots and provider APIs reachable from Vercel; the independent Cloudflare Worker for
  backup and critical checks. Each collector writes normalized rows and its own freshness record.
- **Tables (new, service-role only, no client privileges, like `admin_users`):**
  - `admin_metric_snapshots` (date, metric_key, dimensions jsonb, value numeric, unit, source, quality
    `actual|calculated|estimated|manual`).
  - `provider_usage_samples` (provider, metric, value, unit, period, collected_at, source_ref).
  - `provider_costs` (provider, period, amount_minor, currency, quality `invoice|api|calculated|forecast|manual`,
    evidence_ref, entered_by).
  - `manual_expenses` (owner-entered; audited).
  - `admin_alerts`, `admin_alert_events` (§7.1).
  - `integration_status` (provider, scope description, credential created/expires dates, last success/error;
    **never the secret**).
- **Refresh frequencies:** billing and Space counts on page load (exact counts, as today); usage snapshots daily;
  backup watchdog hourly; Stripe via webhooks plus a daily reconciliation; costs daily for calculated values and
  monthly for invoices; provider status every 15 min (status pages / RSS, REQUIRES RESEARCH per provider).
- **Retention:** raw usage samples 90 days, daily snapshots 2 years, alert history 1 year, audit log unchanged
  (append-only), financial records follow the legal/tax decision (Stripe remains the source of truth).
- **Rate limits:** collectors run once per period with back-off; one provider failing marks that card stale and
  raises a Warning; it never blocks other collectors.

---

## 9. Security and privacy

- Access: extend `admin_users` roles: `owner` (all sections, including Costs & Profitability), `billing_admin`
  (Revenue & Billing only, as today); a future read-only `ops_viewer` (Infrastructure, Backups, Alerts, without
  financials) needs owner approval. Same three server-side gates (session, `admin_users`, AAL2) on every page
  and server action; step-up for acknowledging Critical alerts and for manual expense edits.
- No provider secret in the browser, database or repository; least-privilege, read-only keys per provider;
  expiry dates tracked in `integration_status`.
- Backup credentials are never displayed; the dashboard shows only capability names and expiry.
- Every sensitive view of financial detail, every acknowledgement/resolution and every manual entry is written to
  `admin_audit_log`.
- Read-only boundary: no buttons that change infrastructure, trigger backups, rotate keys or alter billing in this
  plan. Any such control is a separate, approved change with explicit confirmation and step-up.
- Guest privacy per §5. Customer personal data shown only where needed (owner email on a Space detail page),
  never exported in bulk without a separate decision.

---

## 10. Implementation phases (each needs approval)

**Owner priority (2026-10-13):** after backup hardening Workstreams B/C are activated, the independent
missed-backup watchdog (Workstream F) is built **first**, before any expanded Admin UI. It must work without the
InnerDweS application. Its status, history and alerts are integrated into this dashboard later (Phases 2–3).

| Phase | Scope | Depends on | Status |
|---|---|---|---|
| 0 | Billing admin (today) | — | AVAILABLE NOW (Staging) |
| 1 (after WS-F) | Admin shell generalised: top-level nav for the nine sections (empty states for unconnected sources); **Overview + Spaces & Customers** from existing tables; daily `admin_metric_snapshots` | One migration (snapshot tables), role mapping | PLANNED |
| 2 → **first** | **Independent backup watchdog** (WS-F), outside the app, with email alerts and recovery notices; later the Backups & DR page reads its summary | TASK 032.6 released; read-only B2 key; GitHub token; healthchecks.io account | PLANNED (**owner priority: first, before Phase 1**) |
| 3 | Alerts & Incidents center (in-app list, ack/resolve, history) fed by the watchdog and app-side checks | Phase 1–2 | PLANNED |
| 4 | Provider usage collectors: Supabase SQL, B2, GitHub, Cloudflare GraphQL; Infrastructure & Providers page; quota alerts | Read-only tokens per provider; research rows | PLANNED |
| 5 | Costs & Profitability: manual expenses, calculated costs, Stripe fees/payouts | Stripe live and the Managed Payments decision (BIL-12) | PLANNED |
| 6 | Audio usage: library utilization now; listening minutes after observe-only metering ships (R2-06) | R2 W4 | PLANNED |
| 7 | MRR movements and churn from snapshots (needs ≥ 2 months of snapshots) | Phase 1 snapshots | PLANNED |

---

## 11. Credentials needed (future; none created now)

| Credential | Scope | Where it lives |
|---|---|---|
| B2 read-only key (watchdog) | listFiles, readFiles only; bucket-pinned, prefix `_backup-state/`; 365 d with expiry alerts (watchdog runbook §3) | Cloudflare Worker secret |
| Cloudflare KV read token (dashboard, proposed) | Workers KV Storage: Read (namespace-level scoping UNVERIFIED) | Vercel Production server env |
| GitHub fine-grained token | Actions: read on `innerdwes_backup_infra` only | Cloudflare Worker secret |
| healthchecks.io ping URLs | per check | GitHub Actions secret (low sensitivity) |
| Alert email sender | Resend key restricted to sending from an alerts address, or Cloudflare Email Routing | Cloudflare Worker secret |
| Cloudflare API token | Account Analytics: Read | Vercel env (server) |
| Stripe restricted key | Read-only: subscriptions, invoices, balance transactions, payouts | Vercel env (server) |
| Vercel token | Read deployments/usage (scope REQUIRES RESEARCH) | Vercel env (server) |
| Supabase PAT (optional) | Management API read (REQUIRES RESEARCH) | Vercel env (server) |

---

## 12. Expected additional operating cost (projected; verify current prices)

| Item | Expected | Note |
|---|---|---|
| Cloudflare Worker cron + KV for the watchdog | $0 | Within Workers Free (one run per hour) |
| healthchecks.io | $0 | Free tier (20 checks) per DR plan §14.2; verify terms |
| Alert email | $0 | Resend free tier or Cloudflare Email Routing; volume is a few emails a day at most |
| Snapshot tables in Supabase | ≈ $0 | Kilobytes per day |
| Vercel cron for collectors | $0 to plan-dependent | Cron limits depend on the Vercel plan (REQUIRES RESEARCH) |
| Provider API calls | $0 | Read-only, daily |
| Optional second alert channel (SMS) | small, usage-based | Only if justified |

Total expected: **$0–$20 per month**, dominated by any optional paid alert channel.
