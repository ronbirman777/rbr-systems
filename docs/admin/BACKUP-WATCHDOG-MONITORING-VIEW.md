# Admin section "Backups & Disaster Recovery": design (PLANNING ONLY)

Status: **design for approval, 2026-10-14.** Nothing is built. The watchdog it reads is **implemented but NOT deployed**
(infra branch `task-032.6-wsf-watchdog`, Worker `774cc00`, packet `bc078dd`, owner setup `fae9722`; matrix BKP-09, BKP-15,
ADM-09). Owner priority: the watchdog is deployed and verified **before** this view is built (spec §10; workboard §11.5).

Inputs:
- the R4/WS-F evidence model (`docs/dr/TASK-032.6-ROLLOUT-LOG.md` §5; `docs/dr/TASK-032.6-WSF-WATCHDOG-PROPOSAL.md` §8);
- infra `docs/watchdog-runbook.md`;
- the metric contracts (`ADMIN-METRIC-CONTRACTS.md` §3.6, §5).

## 1. Principles

1. **Viewer, never the alerting path.** Alerts are produced by the Cloudflare Worker and delivered by email (Resend). The
   watchdog itself is monitored by Healthchecks.io. The dashboard being down, wrong or stale changes no alert.
2. **Freshness from data.** "Verified backup" means `last_success.at` in the guard's B2 state (written only after
   verification), as the watchdog reports it. A scheduled run is never treated as a success.
3. **UNKNOWN is grey, never green.** That covers a source the watchdog could not read, a summary older than 90 min, and a summary that
   does not exist.
4. **Read-only.** No buttons that dispatch, cancel or alter backups, rotate keys or edit the lock or state. The runbook
   actions (for example, a default dispatch on `main`) are shown as text links to the runbook, not as controls (ADM-11).
5. **Owner-only**, AAL2, server-rendered. No credential values. No object names (the watchdog's data has none, by design).

## 2. Page layout

```
Backups & Disaster Recovery                                   Production · as of <summary.checked_at> (<n> min ago)
┌ Status strip ─────────────────────────────────────────────────────────────────────────────────────────┐
│ Watchdog: HEALTHY|WARNING|CRITICAL|UNKNOWN|NOT CONNECTED   Last verified backup: 3 h 12 m ago (≤ 8 h)  │
│ Open watchdog alerts: 0     Dead-man check: up | down | not connected                                  │
└───────────────────────────────────────────────────────────────────────────────────────────────────────┘
[ Backup freshness ] [ Last run ] [ Objects & deletions ] [ Credentials ]       ← cards from summary.facts
[ Open alerts (watchdog) ]  table: fingerprint · severity · since · runbook step                         ← summary.open
[ Incident history ]  (only if state/v1 access is approved; otherwise "history is in the watchdog emails")
[ DR posture ]  evidence register: restore drills · vault · DB copy · PITR · lifecycle · credential posture
[ Data sources ]  watchdog summary · Healthchecks · evidence register: each with last read + state
```

Phone width: the strip stacks and the cards become one column. Tables use the existing responsive `RTable`. RTL works through the existing admin layout.

## 3. Cards and their exact sources

All fields come from KV `summary/v1`, written at `watchdog/src/index.ts:54-57`, unless stated otherwise.

| Card | Field(s) | Rendering rule |
|---|---|---|
| Watchdog health | `health`, `unknown[]` | The four states plus **NOT CONNECTED** (no summary, or access not approved). If `unknown` lists `b2` or `github`, show "cannot read <source>" |
| Summary age | `checked_at` | ≤ 90 min normal. Older → **STALE** banner: "The watchdog has not reported for N min. Healthchecks.io emails if it is down." The health badge goes grey |
| Backup freshness | `facts.last_success_at` | Age computed at render time. Green ≤ 8 h, amber > 8 h and ≤ 12 h, red > 12 h (owner 2026-10-13). Also shows the watchdog's own `backup.stale` severity if open. If the two disagree, the summary is old: show both |
| Last run | `facts.last_run_started_at`, `facts.last_attempt_status` | `missed_runs` threshold 8 h. The status is `success` / `failed` / `blocked` / `running` as the guard recorded it |
| Objects & deletions | `facts.backup_count`, `facts.deleted_24h` | Deletion limit: max(10, 5% of count) per 24 h. The count-drop thresholds (95% / 80% of the 7-day max) are shown as text. The 7-day maximum is not in the summary (§6, gap G-2) |
| Credentials | `facts["credential.b2_key_expires_at"]`, `facts["credential.github_token_expires_at"]` | Days left. ≤ 14 d amber, ≤ 3 d red. null → "expiry unknown" (amber). The values are never shown |
| Open alerts | `open[]` = `{fp, severity, since}` | Joined to a static map fingerprint → title → runbook response A–H (`watchdog-runbook.md` §4, §7). An unknown fingerprint is shown verbatim, so new rules never disappear |
| Dead-man check | Healthchecks.io check status (optional; needs a read-only API key, §5) | up / grace / down / not connected |

## 4. DR posture panel: the evidence register

DR facts are not live metrics. They are **dated, evidenced claims**. Each register row has: `claim`, `environment`,
`status` (VERIFIED / PARTIALLY VERIFIED / NOT EVIDENCED / MISSING), `evidence_ref` (run id, commit, digest, document
path), `verified_at`, `verified_by`, `next_due` (for recurring drills) and `source_doc`. Quality badge: **Manual**.
Entries are added by the owner (step-up, audited). Nothing is "verified" without an `evidence_ref`, mirroring the matrix §0 rule.

Seed content from the repository (as of 2026-10-14):

| Claim | Status | Evidence ref | Next due / gap |
|---|---|---|---|
| Guarded Storage → B2 backup live (infra `main` `1fca3e6`) | VERIFIED (Production) | First guarded run 38379519351 (2026-10-13); BKP-02, BKP-13 | — |
| R4: 3 scheduled guarded runs | VERIFIED (2026-10-14) | 38397997385, 38457678806, 38488794776; `r4_retro.py` RESULT PASS | — |
| R3: hide-marker / version recovery | PARTIALLY VERIFIED | Historical versions 2/2, version-at restore (rollout log §3) | Isolated fixture test awaits approval |
| Media restore drill | VERIFIED (one drill) | 2026-10-12: 334/334, `SHA256SUMS` digest `e724b8d5…` (BKP-07) | Recurring schedule: not set (DR plan §7; quarterly proposed) |
| Database restore drill | **NOT EVIDENCED** | — (BKP-07 "DB restore never tested") | WS-H |
| Off-platform DB copy | **MISSING** | BKP-08 | WS-G |
| Supabase managed backups | VERIFIED (2026-10-12) | 7 daily COMPLETED; PITR off (BKP-01) | Recovery point ~24 h |
| Prior versions retained 14 days | VERIFIED (2026-10-12) | Lifecycle `daysFromHidingToDeleting: 14` (BKP-04) | Observation due after 2026-10-15 ~04:10Z (rollout log §3) |
| Immutable vault (Object Lock) | **MISSING** | BKP-06 | WS-E (irreversible decision; lifecycle 31 d recommended vs 45 d) |
| Least-privilege backup credentials | **MISSING** | BKP-10: the CI B2 key holds `deleteFiles`; the Supabase S3 key is full access | WS-D / WS-J |
| First unsafe restore key revoked | **UNKNOWN** | BKP-12 | Owner console check |
| Independent watchdog | IMPLEMENTED, NOT DEPLOYED | BKP-09 / BKP-15 (`774cc00`, 43/43 tests) | Deployment packet §9 approval |
| Operator Mac encrypted (FileVault) | **UNVERIFIED** (was OFF on 2026-10-12) | BKP-11 | Owner (WS-A3) |

The panel is the only place where these facts appear in Admin. Its rule: a claim is shown with its date. An overdue `next_due` is shown amber,
and it raises an **app-side** warning alert (Batch 4), which is never a substitute for the watchdog.

## 5. Data access

The watchdog summary is read through **option A** of `ADMIN-METRIC-CONTRACTS.md` §5: a KV read-only token, server-side, Production only,
≤ 5 min cache, strict schema, and no writes. That choice is **pending owner approval**. Until it is approved and the watchdog is deployed, the page
shows the **NOT CONNECTED** state and the evidence register only.

Healthchecks.io status (optional): a read-only API key (support UNVERIFIED) in Vercel Production server env. If there is none, the card reads
"Dead-man check: monitored by Healthchecks email (not connected here)".

## 6. Gaps and follow-ups

| # | Gap | Proposed handling |
|---|---|---|
| G-1 | The summary has no thresholds, so the dashboard duplicates 8 / 12 h | Pin them in a dashboard test now. Later `summary/v2.thresholds` (an infra change; review + redeploy) |
| G-2 | The 7-day max count and the history are not in `summary/v1` | Read `state/v1` (separate approval) or extend the summary (infra change) |
| G-3 | Deletion counts come from the guard's own history; no independent hide-marker count | Optional list-only key (runbook §9). Owner decision |
| G-4 | There is no checksum or cost alert yet (workboard §5 A4) | Weekly checksum job (DR plan §5 layer 2); B2 bytes > 2× the 7-day median. Future infra work |
| G-5 | Phase F2 (the backup job pings Healthchecks) is not built | Needs a reviewed `daily-storage-backup.yml` change and a `main` merge (a live workflow change) |
| G-6 | The DB dump (WS-G) and vault (WS-E) cards have no source | Cards show MISSING from the register until those exist, then gain watchdog facts |
| G-7 | Future R2 audio backups (WS-I) | A separate card when R2 holds production audio |

## 7. Tests (Batch 3)

- The summary parser rejects an unknown version, an unknown `health` value, a non-ISO `checked_at` or a non-array `open` → `error` state (never HEALTHY).
- Age boundaries: exactly 8 h is green, 8 h + 1 s is amber, exactly 12 h is amber, 12 h + 1 s is red (matching `>` in `rules.ts`).
- A summary older than 90 min → STALE banner and grey health, even if `health = HEALTHY`.
- Missing summary or access not configured → NOT CONNECTED, with no "0 alerts" text.
- An unknown fingerprint renders verbatim. Fixtures contain no object names, and a test asserts the page renders no key/token-like strings.
- The page requires the `owner` role (a billing_admin gets 404) and AAL2. There is no form or server action on the page except evidence-register entry (step-up + audit).

## 8. Proposed matrix row text (not edited here)

- **ADM-09** (append to Evidence): "Backups & DR view designed: `docs/admin/BACKUP-WATCHDOG-MONITORING-VIEW.md` (summary/v1 field mapping, 8/12 h,
  90-min stale rule, NOT CONNECTED state, DR evidence register). Blocked on WS-F deployment + KV access decision."
- **New ADM-14** · "DR evidence register in Admin (dated claims with evidence refs; overdue drills raise app-side warnings)" · PLANNED · Batch 3.
