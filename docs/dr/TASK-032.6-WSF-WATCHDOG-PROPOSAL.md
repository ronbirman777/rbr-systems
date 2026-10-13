# TASK 032.6 Workstream F — independent backup watchdog (proposal, not implemented)

Status: **IMPLEMENTED ON A DEVELOPMENT BRANCH, NOT DEPLOYED** (infra `task-032.6-wsf-watchdog` @ `774cc00`, local).
Nothing live was created. Operational runbook: infra `docs/watchdog-runbook.md`. Builds on DR plan §14.2 and
`docs/admin/ADMIN-OPERATIONS-DASHBOARD-SPEC.md` §7 (matrix BKP-09, BKP-15, ADM-09).

## 1. Goal and independence

Detect, from outside GitHub, the owner's Mac and the InnerDweS app (Vercel/Supabase), and alert by email:
missed scheduled backups, failed or blocked runs, stuck runs, stale backups, abnormal deletions or count drops,
and expiring credentials — with one notification per problem, reminders while open, and a recovery notice.

Observed facts that shape the design (2026-10-12/13):
- GitHub delivers about 3.5 of 6 scheduled slots a day; gaps up to **11.5 h** were observed; slots run 2–3 h late.
- The guard writes `_backup-state/storage-backup.json` only after verification. Per run it records `run_id`, `at`,
  and per bucket `count`, `bytes`, `new`, `changed`, `deleted`; `last_attempt` holds `status` and a failure `reason`.
- The lock (`storage-backup.lock.json`) has `status` held/released; TTL 3 h; job timeout 120 min.
- The owner's current read-only key expires **2026-10-20 08:46Z**; the watchdog needs its own long-lived key.

## 2. Architecture (both components $0)

```
Cloudflare cron Worker "innerdwes-backup-watchdog" (every 30 min, Cloudflare account, not Vercel/Supabase)
  1. B2 (dedicated key, read-only, bucket + prefix "_backup-state/"): read state + lock JSON
  2. GitHub REST (fine-grained token, this repo only, Actions: read): latest runs of daily-storage-backup.yml
  3. evaluate rules (§3) → alert state in Workers KV keyed by fingerprint (open / last_notified / resolved)
  4. email only on open, 12 h reminder, and resolve (§4)
  5. ping healthchecks.io "watchdog-alive" at the end of every evaluation
healthchecks.io (dead-man switch for the watchdog itself; expects a ping every 30 min, grace 90 min) → email
```

- **No change to the backup workflow or Production data is needed for phase F1.** A direct run ping from the
  backup job to healthchecks.io (phase F2) needs a workflow change, i.e. a reviewed merge to `main`.
- Freshness is taken from the **data** (`last_success.at` in B2, written only after verification), confirmed by the
  GitHub run conclusion; a run that never started can never look like a success.

## 3. Rules (initial thresholds; all configurable)

| Fingerprint | Condition | Severity |
|---|---|---|
| `backup.stale` | now − `last_success.at` > 6 h (warning) / > 10 h (critical) — see decision D1 | warn → crit |
| `backup.never_started` | no `daily-storage-backup` run **created** for > 8 h | warning |
| `backup.failed` | latest completed run conclusion ≠ success, or `last_attempt.status` failed/blocked (reason quoted) | critical |
| `backup.stuck` | a run in progress > 130 min, or lock `held` > 3 h | critical |
| `backup.deletions` | Σ `deleted` over 24 h > max(10, 5% of count) | critical |
| `backup.count_drop` | latest `count` < 95% of the 7-day max in history | warning → critical |
| `backup.state_invalid` | state or lock missing, unreadable or malformed | critical |
| `credential.expiring` | watchdog B2 key or GitHub token expires in ≤ 14 d (warning) / ≤ 3 d (critical) | warn / crit |
| `watchdog.source_error` | B2 or GitHub unreachable for 3 consecutive evaluations | warning |

Watchdog failure itself (crash, Cloudflare outage, deleted Worker) → no ping → healthchecks.io emails.

## 4. Notifications and de-duplication

- KV record per fingerprint: `{status, severity, opened_at, last_notified_at, last_value}`.
- Email when an alert **opens** or **escalates** (warning → critical); reminder every **12 h** while open;
  one **RECOVERED** email when it clears (with the open duration). Nothing else.
- Every email: UTC timestamps, observed value vs threshold, run URL, recommended runbook step. No object names,
  no secrets. Subject prefix `[InnerDweS backup] CRITICAL|WARNING|RECOVERED`.
- KV writes happen only on a state change (well inside the free tier).
- Channel options (decision D3): Cloudflare Email Routing `send_email` binding (no API key; can only send to verified
  owner addresses; needs the sending domain on Cloudflare Email Routing — **REQUIRES VERIFICATION**), or a dedicated
  Resend API key with sending-only access used for alerts only.

## 5. Least-privilege credentials (all new; owner creates them)

| Credential | Scope | Stored |
|---|---|---|
| B2 application key "watchdog" | bucket `innerdwes-production-backup`, **namePrefix `_backup-state/`**, capabilities `listFiles`, `readFiles` only; no expiry or 1 year | Worker secret |
| Optional B2 key "watchdog-list" | same bucket, `listFiles` only (no content), for an independent hide-marker count rather than trusting the guard's own `deleted` | Worker secret |
| GitHub fine-grained token | repository `innerdwes_backup_infra` only; Actions: read, Metadata: read; 1-year expiry (watched by `credential.expiring`) | Worker secret |
| healthchecks.io ping URL | one check | Worker secret (low sensitivity) |
| Email | Email Routing binding (no secret) or Resend sending-only key | Worker binding / secret |
| Cloudflare deploy token | Workers Scripts + KV edit on one account; used only to deploy | owner / CI secret, not in the Worker |

The watchdog cannot write to B2, GitHub or the app; a leaked Worker secret exposes backup **metadata** only.

## 6. Code, tests and deployment

- Code in the infra repo (`watchdog/`, TypeScript, no runtime dependencies), reviewed PR, CI tests:
  rule evaluation from fixtures (fresh, stale, failed, blocked, stuck, deletions, count drop, malformed state, API
  errors), de-dup/reminder/recovery state machine, email content has no names or secrets, clock-skew edges.
- Local run with Miniflare against recorded fixtures; then a **shadow week**: deployed, emailing a test address
  only, compared with R4/ongoing run history; then switch to the owner address.
- Fire drill without touching Production: a separate test deployment pointed at a fixture state, forced stale →
  verify one alert, one reminder, one recovery.
- Runtime is independent of the Mac; the one-time deploy uses wrangler (owner session or CI).

## 7. Admin dashboard integration (later)

The Worker writes a summary (`open alerts`, `last_success`, `last run`, `checked_at`) to KV and exposes it on an
authenticated read-only endpoint; the dashboard (ADM-09) only displays it and is never the alerting path.

## 8. Owner decisions (2026-10-13) and implementation

Decided: backups stay every 4 h; WARNING after 8 h and CRITICAL after 12 h without a verified success; failed and
blocked runs alert promptly; Cloudflare scheduled Worker every 30 min; Healthchecks.io monitors the watchdog;
Resend for email (least-privilege review below); **no automatic backups**; dashboard integration later.

Implemented (branch only): §3 rules with these thresholds plus `backup.missed_runs` (no run started > 8 h),
`backup.lock_invalid`, `credential.b2_privilege`; UNKNOWN health when a source cannot be read (never HEALTHY,
and no false recovery); pending outcomes held open while a new run is in progress; one email per evaluation;
Resend idempotency key; `/fail` heartbeat when email delivery, KV or configuration fails; KV incident history
(500 events) and `summary/v1` for the dashboard. 43 synthetic tests; read-only conformance check against the live
state format. Resend: `innerdwes.com` is already a verified sending domain, so a **Sending-access key restricted to
that domain** needs no DNS change; it must be separate from the app's key. The deletion count comes from the guard's
history because the watchdog key is limited to `_backup-state/` (an independent list-only key is optional).

## 9. Decisions and approvals needed (original proposal, kept for the record)

- **D1 Staleness threshold vs GitHub's schedule.** With observed gaps up to 11.5 h, a 10 h critical alert will fire
  on normal GitHub behaviour. Options: (a) keep 10 h and accept alerts; (b) 12 h critical; (c) let the watchdog
  dispatch the guarded backup when stale (needs Actions: write — more privilege; the guarded workflow's
  guards/lock/concurrency make it safe to dispatch, but it is a Production mutation by automation).
  Recommendation: (b) now, revisit (c) after a month of data.
- **D2** Create: Cloudflare Worker + KV (free), healthchecks.io account (free), the credentials in §5.
- **D3** Email channel: Email Routing (DNS/Email Routing change on the domain) or Resend sending key.
- **D4** Phase F2: add start/success/fail pings to `daily-storage-backup.yml` (reviewed merge to `main`).
- Implementation and deployment themselves require approval; none has been given.

Estimated effort: F1 code + tests ≈ 1 day; shadow week; F2 ≈ 1 hour plus review.
