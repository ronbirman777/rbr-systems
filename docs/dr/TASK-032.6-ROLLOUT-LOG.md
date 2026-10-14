# TASK 032.6 — Workstreams B/C rollout log

Infra repo `ronbirman777/innerdwes_backup_infra`. Counts, hashes and run IDs only; no object names, no credentials.
Private evidence (listings with names, run logs, validator, rollback script): `~/.config/innerdwes/dr-evidence/2026-10-13-guarded-rollout/` (0700/0600).
Verification uses the owner's read-only, bucket-restricted B2 key (no write/delete/bypass; expires 2026-10-20T08:46:24Z).

## Status

| Criterion | Status |
|---|---|
| First guarded Production backup | **PASS** (run 38379519351, 2026-10-13) |
| Independent Backblaze verification | **PASS** (12/12 validator checks, 12/12 SHA-256 spot checks) |
| R3 hide-marker / version recovery | **PARTIALLY VERIFIED** (owner, 2026-10-13): historical version recovery passed; new live hide-marker test not performed (no isolated write path; no destructive Production test) |
| Three scheduled guarded runs | in progress (1/3) |
| Stale branches | **retired** (3 deleted, see below) |
| Runbook + requirements matrix | pending final update |

## 1. Release (Gate R2.1), 2026-10-13

- Attempt 1 stopped 08:15Z without merging: delayed 04:00 legacy slot never delivered; old verification key expiring 09:57Z.
- Owner created a new 7-day read-only key (verified 08:48Z). Optional legacy manual run (step A) skipped by owner.
- Preflight 09:48Z: last backup 02:29:07Z (7 h 19 m), no active runs, CI green, PR head `5d5d31d`, main `7f9649b`.
  Supabase `storage.objects` (read-only SELECT, hashed names) vs B2 visible listing: 334 / 15,390,728 B both sides,
  name+size digest identical, 0 new / 0 changed / **0 deletions**.
- **Merged 09:49:09Z**: merge commit `1fca3e60e677032aebda7bc5cd34a6089943c010` (parents `7f9649b`, `5d5d31d`;
  tree identical to the reviewed branch; workflow blob `6c85e250`). No run triggered; B2 fingerprint unchanged.

## 2. First guarded Production backup (Step D/E)

- Preflight 09:52Z: main `1fca3e6`, workflow `6c85e250` active, no scheduled guarded run yet, no active runs,
  source digest unchanged, B2 baseline fp `44a5d681…` (1,077 versions).
- Dispatched 09:53:12Z, defaults only (`dry_run=false`, no overrides):
  [run 38379519351](https://github.com/ronbirman777/innerdwes_backup_infra/actions/runs/38379519351), attempt 1,
  09:53:14Z → 09:53:53Z, **success**.
- Guard: `NOTE no backup state found: guards seeded from the backup (1 bucket prefixes)`;
  `PLAN tenant-media: source 334, backup 334, new 0, changed 0, delete 0, allowed 16`.
- TIMING: lock 6.2 s (incl. 3 s race-detection settle), state 2.0, inventory 3.0, plan 0.5, sync 0.7, verify 11.4, record 0.9;
  guard step 26 s, job 39 s.
- Log: 6 masked values, 0 annotations, 0 object paths; the 12 "error" matches are echoed script source only.
- Independent verification (`validate_first_run.py before after 38379519351-1 0 0 0`): **RESULT PASS**
  - no version removed; nothing written outside media + the two state objects; 0 hide markers; 0 media uploads;
  - state 2 versions (running, success), lock 2 versions (held, released), lock released by this run;
  - state last_attempt success by this run; state count 334 = visible backup count; history seed + run; nothing retired.
- After: fp `8cc386ca…`, 1,081 versions (+4, all `_backup-state/`), 334 visible / 15,390,728 B.
- Post-run Supabase vs B2: 334 / 334, bytes equal, 0 new / 0 deleted / 0 size differences.
- SHA-256 spot check vs the 2026-10-12 restore evidence (`SHA256SUMS.txt`, 334 entries): 12/12 random objects match.

## 3. R3 — hide-marker and version recovery

**Isolation finding.** The only `__backup_test` location is *inside* the real data: Supabase bucket `tenant-media/__backup_test/`
and B2 `supabase-storage/tenant-media/__backup_test/`, which the guarded backup mirrors and counts. No write path exists that is
isolated from tenant-media and real backup data without a restricted action: the verification key is read-only (correctly);
the only B2 write credential is the Production CI key in GitHub secrets, reachable only by code on `main` (merging is not
authorized) or by dispatching unreviewed branch code with Production write secrets (bypasses the main-only control). A
Supabase-side test would write to the Production `tenant-media` bucket. **Active write test: BLOCKED.**

**Read-only validation (PASS)** on synthetic history created by the 2026-10-01 sync test: `backup-test.txt` (33 B,
content "InnerDweS backup test 2026-10-01.") uploaded 03:37:29Z and 03:57:02Z, hidden 04:10:11Z by `rclone sync`.
- Current view: hidden (only `.emptyFolderPlaceholder` visible). Hide marker present; both prior versions present.
- Both prior versions downloaded by file ID: SHA-1 matches the B2 record (2/2).
- `rclone lsf --b2-version-at` 04:00Z / 03:40Z shows the file at the right version; `rclone copy --b2-version-at
  2026-10-01T04:00:00Z` to local disk restored it, SHA-1 `c90d3de8…` = B2 record.
- `--b2-version-at 2026-10-13T09:00Z` on tenant-media lists 334 (matches current).
- Pending observation: lifecycle `daysFromHidingToDeleting: 14` should remove the hidden versions on or after
  **2026-10-15 ~04:10Z** (read-only check; confirms the 14-day recovery window ends as documented).

## 4. Branch cleanup (09:57Z)

Each re-verified: 0 commits ahead of main, unprotected, no PRs (any state, head or base), no runs, no tags; references in
main are workflow/doc names, not branch refs. Deleted:
- `task-027-hosted-integration` @ `6260a830614604fa704478a51cc5d8589aade48c`
- `task-027-migration-gate` @ `329eb90f8565cf929813d94766ef2d4012e27d29`
- `task-027-recovery-snapshot` @ `477d86e91b012fe97032fc67f93180d023e3e984`

Remaining: `main` (`1fca3e6`), `task-032.6-backup-hardening` (`5d5d31d`).

## 5. Scheduled guarded runs (R4)

Monitoring is **resumable**: `r4_retro.py` (private evidence folder, see `RESUME-R4.md`) rebuilds every check from GitHub
(run logs kept 90 days) and B2 version history, attributing each new B2 version to the run whose time window contains it;
any version outside a run window is unexplained. No local process has to stay alive. Schedule events only; manual and
dry runs are not counted. Each run: conclusion, guard PLAN/NOTE/TIMING, annotations, object-path scan, hide markers =
planned deletions, media uploads = new + changed, 2 state + 2 lock versions, source = backup − delete + new; then the
current lock released, state last_attempt = latest run, state count = visible backup count, every run in history.
Plus a read-only Supabase `storage.objects` count/bytes/digest check against the B2 visible listing.

| # | Run | Completed (UTC) | Plan | Validator | Notes |
|---|---|---|---|---|---|
| 1 | [38397997385](https://github.com/ronbirman777/innerdwes_backup_infra/actions/runs/38397997385) (schedule, attempt 1, `1fca3e6`) | 2026-10-13 12:32:50Z | source 334, backup 334, new 0, changed 0, delete 0 | PASS (0 hides, 0 uploads, 2 state + 2 lock versions, lock released, state count 334 = visible 334, 0 unexplained B2 versions) | guard step 32 s (lock 8.7, state 3.4, inventory 3.8, sync 1.4, verify 11.9, record 0.7); 0 annotations; Supabase 334 / 15,390,728 B, digest unchanged; first scheduled slot delivered after a 10 h 4 m gap since 02:28Z |
| 2 | [38457678806](https://github.com/ronbirman777/innerdwes_backup_infra/actions/runs/38457678806) (schedule, attempt 1, `1fca3e6`) | 2026-10-13 19:48:23Z | source 334, backup 334, new 0, changed 0, delete 0 | PASS (0 hides, 0 uploads, 2 state + 2 lock versions, lock released, state count 334 = visible 334, 0 unexplained B2 versions) | guard step 25 s (lock 6.1, state 1.8, inventory 3.9, sync 0.9, verify 10.0, record 0.6); 0 annotations; Supabase 334 / 15,390,728 B, digest unchanged (`da8e67bf`); scheduled slot 7 h 15 m after run 1 |
| 3 | [38488794776](https://github.com/ronbirman777/innerdwes_backup_infra/actions/runs/38488794776) (schedule, attempt 1, `1fca3e6`) | 2026-10-14 00:12:46Z | source 334, backup 334, new 0, changed 0, delete 0 | PASS (0 hides, 0 uploads, 2 state + 2 lock versions, lock released, state count 334 = visible 334, 0 unexplained B2 versions) | guard step 25 s (lock 5.4, state 1.5, inventory 3.5, sync 1.0, verify 11.5, record 0.5); 0 annotations; Supabase 334 / 15,390,728 B, digest unchanged (`da8e67bf`); slot 4 h 24 m after run 2 |

**R4 COMPLETE 2026-10-14 00:13Z: 3/3 scheduled guarded runs PASS** (`r4_retro.py`: `RESULT PASS | R4 COMPLETE`, 0 unexplained B2 versions since release). Observed slot delivery: 12:32Z → 19:48Z → 00:12Z (GitHub schedule drift; the WS-F watchdog thresholds 8 h warning / 12 h critical cover the observed gaps). R3 remains PARTIALLY VERIFIED.
