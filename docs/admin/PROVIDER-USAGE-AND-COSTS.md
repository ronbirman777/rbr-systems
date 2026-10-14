# InnerDweS providers: plans, quotas, usage sources and cost model (PLANNING ONLY)

Status: **planning, 2026-10-14.** Facts come **only from repository documents**, cited per row. I called no provider
dashboard or API. Everything else is **UNKNOWN**, with how to verify it at implementation time. API names under
"How to read at implementation" are **candidates**: confirm each against the provider's current documentation before
use, because endpoints, plan gating and token scopes change.

This extends the base spec §3 (`ADMIN-OPERATIONS-DASHBOARD-SPEC.md`). Metric contracts: `ADMIN-METRIC-CONTRACTS.md` §3.5,
§3.8.

Quality badges: **Actual** (from the provider's billing/usage system), **Manual** (entered by the owner with an evidence
reference), **Estimated** (calculated or forecast).

---

## 1. Summary

| Provider | Used for | Plan (repo evidence) | Plan verified? | Usage source (candidate) | Cost quality achievable |
|---|---|---|---|---|---|
| Vercel | Hosting the Next.js app, cron, env per environment | **UNKNOWN** | No | REST deployments; usage API plan-dependent | Manual (invoice) until a billing API is verified |
| Supabase | Postgres, Auth, Storage. Production + Staging | **Pro** for Production (`02-VENDOR-RESEARCH.md` §C.A pricing basis; spec §3 "confirm") | Partially (Production managed daily backups fit Pro; the plan page has not been read) | SQL (sizes) now; Management API for the rest | Manual (invoice); Estimated (overage) |
| Cloudflare | R2 media POC Worker + KV + Queue + Analytics Engine. Future watchdog Worker + KV | **Workers Free** (owner-confirmed 2026-10-12, spec §3) | Yes (owner statement) | GraphQL Analytics; AE SQL | Actual = $0 while on Free; Estimated for R2 later |
| Backblaze B2 | Off-platform media backup `innerdwes-production-backup` | Pay-as-you-go (spec §3) | Partially | Native API (read-only key) | **Estimated** (no billing API, spec §3); Manual (invoice) |
| GitHub | Backup workflows (private infra repo), app repo `ronbirman777/rbr-systems` | **Free** (implied by BKP-13 "GitHub Free: no branch protection"; DR plan §9 "account plan was not verified") | **CONFLICTING/UNVERIFIED** | REST runs; billing usage endpoint | Actual (minutes); $0 if within the included minutes |
| Resend | Billing email (not configured); planned watchdog alerts | **UNKNOWN** (runbook quotes Free-plan limits as an assumption) | No | API / webhooks | Manual |
| Healthchecks.io | Dead-man check for the watchdog (planned) | Free "Hobbyist" assumed (runbook §2) | No (account not created) | Read-only API (candidate) | $0 Actual if Free |
| Stripe (later) | Payments, invoices, fees | Sandbox account (Singapore; Managed Payments "Eligible") | Sandbox only; Live not activated | Full API | Actual (fees, payouts) |
| Registrar | Domain `innerdwes.com` (others UNKNOWN) | **UNKNOWN** (Namecheap per spec §3, "owner to confirm") | No | Usually manual | Manual |
| Netlify (legacy) | No runtime dependency (CLAUDE.md) | UNKNOWN | No | Not monitored | Manual (track any remaining charge) |
| Google Workspace | Only if used for InnerDweS (spec §3) | UNKNOWN (scope) | No | — | Manual |

---

## 2. Per-provider detail

### 2.1 Vercel

| Item | Known (source) | Unknown → how to verify |
|---|---|---|
| Project / environments | Project "innerdwes", root directory `app`. Production; Preview (SSO-protected); a `staging` custom environment (project memory). Pushing `main` auto-deploys Production (ENVIRONMENT.md) | Plan tier: Vercel dashboard → Settings → Billing (owner reads; record as Manual) |
| Function region | `iad1` (Washington DC). `vercel.json` sets no `regions` (TASK-033-PLAN §4, observed `x-vercel-id`) | — |
| Cron | `vercel.json`: `/api/cron/billing` every 15 min. "Vercel Cron runs only on Production deployments" (EXTERNAL-SETUP-CHECKLIST C2) | **RISK: cron frequency limits depend on the plan.** Verify that the plan allows a 15-minute schedule **before** the billing release reaches Production |
| Quotas (bandwidth, invocations, build minutes, log retention) | none in the repo | Plan page; Vercel usage page; candidate REST usage endpoints (plan-gated; REQUIRES RESEARCH) |
| Read access | — | Candidate: a Vercel access token scoped to the team/project, read deployments only. Verify whether tokens can be read-only (if not, record the risk) |
| Monitoring metric | Failed Production deployments (`GET /v6/deployments?target=production&state=ERROR`, candidate); function error rate (log drains / observability, plan-dependent) | — |
| Cost | — | **Manual** monthly invoice entry. Estimated overage only after quotas are recorded |

### 2.2 Supabase

| Item | Known (source) | Unknown → how to verify |
|---|---|---|
| Projects | Production `qzmsclkzbxrfohuxnitc` (region `ap-northeast-1`, matrix T33-07); Staging `kkqjsspxupyxytddiumf` (region UNKNOWN) | Staging plan/region: dashboard or Management API `GET /v1/projects/{ref}` (candidate) |
| Plan | Pro, as the pricing basis in `02-VENDOR-RESEARCH.md` §C.A: $25/month including $10 compute credits; 100 GB storage; 250 GB uncached + 250 GB cached egress; storage overage $0.0213/GB-month; uncached egress $0.09/GB; cached $0.03/GB (vendor pages read 2026-10-10) | The org's actual plan and add-ons (compute size, PITR off per BKP-01): billing page → Manual |
| Backups | 7 daily physical backups, PITR off (BKP-01, 2026-10-12) | — |
| Size today | DB 15 MB; Storage `tenant-media` 334 objects / 15,390,728 B (DR plan §1.4; rollout log 2026-10-14) | — |
| Usage source now | **SQL** (service role, read-only): `pg_database_size(current_database())`, largest relations, `storage.objects` bytes by bucket and tenant prefix | — |
| Usage not reachable by SQL | Egress, Auth MAU, compute hours, Realtime | Management API usage endpoints (REQUIRES RESEARCH; needs a personal access token, which is a **new, powerful secret**: record its scope risk) or Manual monthly |
| Cost | — | Manual invoice; Estimated overage = max(0, usage − included) × price above (re-read the prices at implementation) |

### 2.3 Cloudflare

| Item | Known (source) | Unknown → how to verify |
|---|---|---|
| Account | One account (R2 POC), Workers **Free** (owner-confirmed 2026-10-12) | Whether `innerdwes.com` is a zone on this account: UNKNOWN (dashboard) |
| Resources | POC Worker `innerdwes-media-poc` (seg mode, version `9ba64f4d`), private R2 bucket, KV, Queue `innerdwes-media-poc-listen`, Analytics Engine (enabled by the owner) (matrix §2.5; `07-POC-ACCOUNTING.md`). Planned: Worker + KV `innerdwes-backup-watchdog` | — |
| Free quotas (repo) | Workers Free 100,000 requests/day, 10 ms CPU/invocation (`02-VENDOR-RESEARCH` §C.C, VERIFIED 2026-10-10). KV Free 100,000 reads + 1,000 writes/day (`watchdog-runbook.md` §2). R2 free 10 GB-month, 1M Class A, 10M Class B per month; egress free (`02` §C.B) | Re-check at implementation. On Free there is no paid fallback, so overage cannot be billed: requests fail instead (runbook §2) |
| Paid prices (if adopted) | Workers Paid $5/month; 10M requests; 30M CPU-ms (`02` §C.C). AE paid 10M points/month, then $0.25/M (`02` line 137, "billing not yet active") | — |
| Usage source | Candidate: GraphQL Analytics API datasets for Worker invocations/CPU/errors and R2 storage/operations; AE SQL API for per-Space aggregates. **Dataset availability on Free: REQUIRES RESEARCH** (spec §6) | Token: Account Analytics: Read |
| Budget alerts | Cloudflare usage-based billing notifications exist for Pro+/pay-as-you-go; coverage of R2/Workers unconfirmed (`02` line 169) | — |
| Cost | $0 Actual while on Free; R2 later: Estimated from bytes and ops × price (`03-COST-MODEL.md`) | Invoice → Manual |

### 2.4 Backblaze B2

| Item | Known (source) | Unknown → how to verify |
|---|---|---|
| Bucket | `innerdwes-production-backup`: allPrivate, SSE-B2, lifecycle `daysFromHidingToDeleting: 14`, no replication; Object Lock false on 2026-10-02 (DR plan §1.2) | Bucket region: UNKNOWN (read the endpoint from `b2_authorize_account` at implementation; no secret is needed to record it) |
| Stored | 41.6 MB across all versions (2026-10-12); 1,081 versions after the first guarded run (rollout log) | — |
| Prices / free tier (repo) | First 10 GB free; $6.95/TB-month list price (to verify); Class B/C 2,500/day free; egress free up to 3× stored (DR plan §9, §14.1) | Re-read the price page at implementation |
| Usage source | Native API with a read-only key: `b2_list_buckets` (settings), `b2_list_file_versions` (bytes, versions, hide markers) | A **dedicated dashboard key** would be a new credential. The watchdog key is `_backup-state/`-only and cannot list media (by design) |
| Billing API | **None** (spec §3) | — |
| Cost | **Estimated** = stored GB-month × price above the free tier, plus class transactions above the free allowance; invoice → Manual | — |

### 2.5 GitHub

| Item | Known (source) | Unknown → how to verify |
|---|---|---|
| Repos | Infra `ronbirman777/innerdwes_backup_infra` (private); app `ronbirman777/rbr-systems` (git remote) | App repo visibility: UNKNOWN |
| Plan | "GitHub Free: no branch protection" (BKP-13) vs "account plan was not verified" (DR plan §9) | Settings → Billing and plans → Manual |
| Minutes | ≈ 180 min/month today; ≈ 400 with the planned jobs; Free includes 2,000 private-repo minutes (DR plan §9, §14.1) | Candidate billing usage endpoint (GitHub's billing API changed with "enhanced billing": REQUIRES RESEARCH) |
| Run health | Workflow runs API (the watchdog token already plans Actions: read on the infra repo) | The dashboard should **not reuse** the watchdog token. A separate token, or rely on the watchdog summary |
| Cost | $0 Actual within the included minutes; overage $0.008/min (DR plan §14.1, to verify) | — |

### 2.6 Resend

| Item | Known (source) | Unknown → how to verify |
|---|---|---|
| Domain | `innerdwes.com` verified for sending (read-only check 2026-10-13, HANDOFF-EVIDENCE contradiction #5) | Re-check at implementation |
| Keys | Billing: `RESEND_API_KEY` **not configured** on Staging (ENVIRONMENT.md). Watchdog: a separate Sending-access key, domain-restricted (planned) | — |
| Plan / quota | Runbook §2 quotes Free 3,000/month, 100/day as the basis for $0 | Account plan: UNKNOWN → Resend dashboard (Manual) |
| Usage source | Outbox counts (`billing_email_outbox`, AVAILABLE NOW on Staging); Resend webhooks for bounces/complaints (PLANNED); candidate `GET /emails` | A webhook needs a new app endpoint + signing secret (separate approval) |
| Cost | Manual | — |

### 2.7 Healthchecks.io

| Item | Known (source) | Unknown → how to verify |
|---|---|---|
| Account | **Not created** ("create the account if needed", `watchdog-owner-setup.md` §4) | — |
| Plan | Free / Hobbyist, 20 checks (runbook §2; DR plan §14.2), "verify terms" | Pricing page at signup → Manual |
| Checks | `backup-watchdog`: period 30 min, grace 60 min; optional F2 `backup-run`: 4 h / 8 h | — |
| Usage source | Candidate read-only API key (project-level) → check status `up`/`down`/`grace`, last ping | Verify read-only key support |
| Cost | $0 Actual on Free | — |

### 2.8 Stripe (later; payments are out of scope until a task includes them)

| Item | Known (source) | Unknown |
|---|---|---|
| Account | Sandbox (Singapore), Managed Payments "Eligible", not onboarded (HANDOFF-EVIDENCE #1; MP-v2) | Live activation, payout account, operator: undecided (LAUNCH-GATES) |
| Data | Synced tables (S-DB-BILL). Fees and payouts **not stored** (spec §4.2) | Restricted read key for balance transactions / payouts (Batch 6) |
| Cost of payments | Processing fees (+ MP fee if adopted) are **revenue deductions**, not infrastructure cost | Fee schedule depends on BIL-12 |

### 2.9 Registrar and domains

| Item | Known (source) | Unknown → how to verify |
|---|---|---|
| Registrar | Namecheap ("owner to confirm which domains", spec §3) | Owner confirms registrar, domain list, expiry dates, **auto-renew state**, registrar lock, account MFA |
| API | Namecheap API needs account eligibility and IP allow-listing (spec §3) | Not recommended: Manual entry with yearly reminders |
| Cost | — | Manual (yearly) |

---

## 3. Alerts derived from providers (thresholds from spec §7.2)

- Usage ≥ 80% (warning) / ≥ 95% (critical) of a **recorded** quota. **No quota recorded → no utilization alert**, and the card says
  "quota unknown". It must not look healthy.
- Collector failing (3 consecutive runs) → warning "provider data stale" (mirrors the watchdog rule).
- Month-to-date cost > 1.5× the same point last month, or above an owner budget → warning (needs ≥ 1 month of history).
- Plan or domain renewal ≤ 30 days with auto-renew off or unknown → warning.
- Credential expiry ≤ 14 d warning / ≤ 3 d critical (from `integration_status` metadata).

---

## 4. Cost model (Actual vs Estimated)

### 4.1 Record

`provider_costs` (proposed, spec §8): `provider`, `period` (month), `line` (`plan_fee` | `usage:<metric>` | `tax` |
`credit`), `amount_minor`, `currency`, `quality` (`actual` | `manual` | `estimated`), `method` (`billing_api` |
`invoice_entry` | `calculated` | `forecast`), `evidence_ref` (invoice number or file link: **required** for `manual`),
`inputs` (jsonb: usage, unit price, price source URL + date read, for `calculated`), `entered_by`, `entered_at`.

### 4.2 Precedence per provider and month

1. **Actual** from a billing API, once that provider's API is verified (likely Stripe fees only; probably not Vercel, Supabase or B2 at first).
2. **Manual** from the invoice (amount as billed, original currency, evidence ref). It replaces any estimate for the same period.
3. **Estimated / calculated**: usage sample × recorded unit price above the recorded free allowance. The price and its source date are stored
   with the value, so a later price change does not rewrite history.
4. **Estimated / forecast**: only for the current open month or future months (linear on the last 3 closed months).

Rules: one value per (provider, period, line) is "effective"; the others are kept for comparison (estimate vs invoice error is
itself a useful metric). Totals are per currency, with the Actual / Manual / Estimated split always visible. Taxes on provider invoices
are recorded as a separate line. A provider with no value for a period makes the total **partial**.

### 4.3 Expected values today (Estimated, from repo docs)

| Provider | Basis | Monthly |
|---|---|---|
| Supabase | Pro base fee (`02` §C.A); usage far under quota (15 MB DB, 15 MB storage) | $25 (Estimated; verify invoice) |
| Cloudflare | Workers Free | $0 |
| Backblaze | 41.6 MB ≪ 10 GB free | $0 |
| GitHub | ≈ 180–400 min ≪ 2,000 | $0 (if Free is confirmed) |
| Healthchecks / Resend (alerts) | Free tiers | $0 |
| Vercel | plan UNKNOWN | UNKNOWN |
| Registrar | UNKNOWN | UNKNOWN (yearly) |

So the **known** infrastructure total is about $25/month plus Vercel and domains (both UNKNOWN). That is not a statement of actual spend.

### 4.4 Allocation (Estimated only)

Cost per product type or Space: variable cost by measured usage share (storage bytes now; listening minutes once metered); fixed cost by
Space count (spec §4.3). Always Estimated, owner-only.

---

## 5. Verification checklist for the implementation batch (owner + Claude, read-only)

1. Owner reads each plan page and records plan, renewal date and key quotas as **Manual**, with the read date (Batch 5).
2. For each candidate API: confirm the endpoint, the plan gating and the **narrowest token scope**. Record any scope that is broader than read-only
   as a risk in `docs/security/ACCOUNT-SECURITY-INVENTORY.md`.
3. Create read-only credentials only after approval. Each lives in Vercel **Production** server env. Never reuse watchdog credentials.
4. Prove each collector against Staging-safe data or read-only Production metadata. Record its as-of semantics (period end vs sample time).

## 6. Proposed matrix row text (not edited here)

- **ADM-05** (append): "Provider facts from repo only; unknowns + verification path: `docs/admin/PROVIDER-USAGE-AND-COSTS.md`. Vercel plan UNKNOWN (cron 15-min
  frequency plan-dependent: verify before billing release); GitHub plan CONFLICTING (BKP-13 vs DR plan §9); Healthchecks account not created."
- **ADM-10** (append): "Cost precedence Actual(API) > Manual(invoice, evidence ref) > Estimated(calculated/forecast); per-currency; partial totals
  labelled (`PROVIDER-USAGE-AND-COSTS.md` §4)."
