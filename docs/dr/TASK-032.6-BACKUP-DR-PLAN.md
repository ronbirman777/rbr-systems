# TASK 032.6 — Backup and disaster-recovery hardening plan

Status: **Workstreams B + C implemented and tested on an isolated, unpushed branch (§13). Stopped at the release approval gate (§15).** Everything else is still plan only.

Nothing in this task changed any of the following:
- Production;
- the backup jobs;
- bucket settings, retention or Object Lock;
- credentials or Supabase configuration;
- deployed code.

Every hosted fact below comes from a dated read-only check made on 2026-10-12. Anything that could not be checked
is marked **UNVERIFIED**.

---

## 1. Verified current architecture (2026-10-12)

### 1.1 Media: Supabase Storage → Backblaze B2 mirror

| Item | Verified state | Evidence |
|---|---|---|
| Job | `innerdwes_backup_infra/.github/workflows/daily-storage-backup.yml` (private repo, owner `ronbirman777`, last push 2026-10-02) | Read via GitHub API |
| Schedule | cron `0 */4 * * *` (with `timezone: Asia/Bangkok`) plus manual dispatch | Workflow file |
| Actual cadence | Last 38 runs: 38 successes, 32 s average, 61 s maximum. Gaps between runs were 3.4 h to **11.4 h** (GitHub drops or delays scheduled runs) | `gh run list` |
| Last success | 2026-10-12T07:07Z | Run list; the newest B2 upload is at the same time |
| Source coverage | Every bucket the Supabase S3 key can list (`rclone lsf supabase: --dirs-only`). Production has exactly **one bucket**, `tenant-media` (private, 334 objects, 15.39 MB). | Read-only SQL on `storage.buckets` |
| Destination | `b2:innerdwes-production-backup/supabase-storage/<bucket>` | Workflow + B2 listing |
| Method | `rclone sync --update --use-server-modtime` | Workflow |
| Deletion propagation | **Yes.** `sync` hides destination files deleted at the source. There is no `--max-delete`, no source-count guard and no `--backup-dir`. Hidden versions are permanently deleted after 14 days. | Workflow; B2 hide markers: 30 on 10-01, 28 on 10-08, 4 on 10-11 |
| In-job verification | `rclone size` only, with no checksum comparison | Workflow |
| rclone install | `curl https://rclone.org/install.sh \| sudo bash`. **Unpinned**, and it runs in the same job as both credentials. | Workflow |
| Other workflows (manual only) | `backup-connection-test`, `backup-copy-test` (copy all buckets), `backup-sync-test` (`__backup_test` only), `task-027-recovery-snapshot`, `task-027-migration-gate` | Repo tree |
| Restore | **Tested 2026-10-12.** 334/334 objects restored; Production MD5 334/334, B2 SHA-1 334/334 and size 334/334 all match; 0 missing, 0 unexpected; 240.6 s. Audio decodes 2/2 and real images 90/90. 241 synthetic 1×1 placeholders (2 distinct blobs, byte-identical to Production) do not decode. | `infra/backup-restore-test/restore-test.mjs` (commit `9a5ca43`); evidence in `~/.config/innerdwes/dr-evidence/2026-10-12-b2-restore/` (`SHA256SUMS.txt` digest `e724b8d5…ece37`) |
| Restore runbook | **None** | — |

### 1.2 The B2 bucket `innerdwes-production-backup`

The bucket was read with the owner's read-only restore key.

| Item | State |
|---|---|
| Access | `allPrivate`. No CORS rules. |
| Encryption at rest | SSE-B2 (AES-256, keys managed by Backblaze). Default for the bucket. |
| Lifecycle | One rule for the whole bucket: `daysFromHidingToDeleting: 14`, `daysFromUploadingToHiding: null` |
| Versioning | On (as always in B2). `tenant-media`: 396 names, 334 live, 981 versions, 62 hide markers |
| Replication | None |
| Object Lock | **UNVERIFIED today.** The restore key lacks `readBucketRetentions`. It read `file_lock_enabled: false` on 2026-10-02 (preflight run `36965326687`). The bucket revision is 3. |
| Contents | `supabase-storage/tenant-media/` (33.1 MB across all versions) and `migrations/task-027/` (96 objects, 8.5 MB; TASK 027 snapshot plus one write probe) |
| Total stored | 41.6 MB across all versions |

### 1.3 Credentials

GitHub secret and variable **names** were read; their values cannot be read.

| Credential | Where it lives | Rights | Evidence |
|---|---|---|---|
| `B2_APPLICATION_KEY(_ID)` (CI) | GitHub Actions repo secrets, set 2026-09-30 | Restricted to the bucket, but holds `deleteFiles`, `writeFiles`, `writeBuckets`, `writeBucketLifecycleRules`, `writeBucketEncryption`, `writeBucketLogging`, `writeBucketNotifications` and `writeBucketReplications`. This is the console's "Read and Write" preset. | Preflight run `36965326687` log, 2026-10-02 |
| `SUPABASE_S3_ACCESS_KEY_ID/SECRET` (CI) | GitHub Actions repo secrets, set 2026-09-30 | **Full read/write/delete on every Production Storage bucket; bypasses RLS.** It cannot be scoped. | Supabase docs, *S3 Authentication*: "full access to all S3 operations across all buckets and bypass RLS policies" |
| `TASK_027_SUPABASE_SECRET_KEY`, `TASK_027_MANIFEST_KEY` | GitHub Actions repo secrets, set 2026-10-01 | Production secret API key (service-level), plus the manifest key | Secret names |
| Owner restore key | `~/.config/innerdwes/b2-restore-test.env` (0600), expires 2026-10-13T09:57Z | Read and list only, plus `shareFiles` | `b2_authorize_account` |
| First (unsafe) restore key | Replaced by the owner | Read-and-write preset | **Revocation UNVERIFIED.** Needs `listKeys`, which we deliberately do not hold. |

### 1.4 Database

| Item | State | Evidence |
|---|---|---|
| Managed backups | 7 daily physical backups, all COMPLETED, about 22:06Z, 2026-10-05 → 2026-10-11 | `supabase backups list` (read-only) |
| PITR | `pitr_enabled: false` (WAL-G on). Recovery point up to about 24 h | Same |
| Size | 15 MB. Postgres 17.6. 17 public tables, 37 policies, 31 public functions, 53 auth users. Ledger at 0035 (34 rows). | Read-only SQL |
| Extensions | pg_stat_statements, pg_trgm, pgcrypto, plpgsql, supabase_vault, uuid-ossp | Read-only SQL |
| Off-platform copy | **None** | Workflows copy Storage only |
| Restore ever tested | **No** | — |

### 1.5 Monitoring

| Item | State |
|---|---|
| Failure alert | GitHub's default email for failed scheduled runs only. Whether it is delivered is **UNVERIFIED** (depends on the account's notification settings). |
| Missed or stale run | **None.** An 11.4 h gap went unnoticed. |
| Count, deletion, checksum or cost anomaly | **None** |

### 1.6 The operator's machine (found during Phase 1)

- **FileVault is OFF.** The Mac holds:
  - the restored copy of Production media;
  - Cloudflare, B2 and Supabase CLI credentials;
  - `~/.config/innerdwes/*`.

  All of it is unencrypted at rest. There is no Time Machine destination.
- The repo is on the Desktop. iCloud Desktop sync is off (`FXICloudDriveDesktop=0`).
- **Restored media: deleted 2026-10-12 with owner approval.** Before deletion it was verified that the folder held
  exactly the 334 restored objects (334/334 against the checksum manifest; sizes and MD5 334/334 against the
  Production inventory), that no process, code or schedule referenced it, and that the report, inventory, SIZES/MD5
  list and `SHA256SUMS.txt` were preserved in `~/.config/innerdwes/dr-evidence/2026-10-12-b2-restore/`. The empty
  folder from the refused first attempt was deleted too. Credentials were not touched.
- None of it is tracked by git. `git ls-files` contains no credentials, media or restore output; the only `.env*` file is the empty `app/.env.local.example`.

---

## 2. Confirmed security and DR gaps (ranked)

| # | Gap | Severity | Scenario |
|---|---|---|---|
| G1 | **Unpinned `curl … \| sudo bash` runs in the job holding a full-power Supabase S3 key and a delete-capable B2 key** | S1 | A compromise of rclone.org or its install script could delete Production Storage **and** the backup in the same run. |
| G2 | **The CI B2 key can delete files and rewrite lifecycle and encryption** | S1 | A leaked key, or a bug, removes every version, or sets the lifecycle to delete everything in 1 day. |
| G3 | **No deletion protection.** Sync propagates deletes, nothing caps them, and nothing is immutable. | S1 | A mass deletion in Supabase becomes permanent in B2 14 days later. Nobody notices, because there are no alerts. |
| G4 | **No off-platform database copy, and no DB restore ever tested** | S1 | A Supabase account or project loss leaves media files with no rows pointing to them. Managed backups live inside the same platform. |
| G5 | No missed-run, staleness, count, deletion, checksum or cost alerting | S2 | A silent failure, or an 11 h gap, goes unnoticed. |
| G6 | `TASK_027_SUPABASE_SECRET_KEY` (service-level) still sits in CI secrets after TASK 027 closed | S2 | Unnecessary standing exposure |
| G7 | Repo secrets are not bound to a protected environment or branch (**UNVERIFIED**: branch protection was not read) | S2 | Anyone who can push a workflow can exfiltrate every secret. |
| G8 | Media recovery point up to 11.4 h (target 4 h) | S3 | Up to about 11 h of uploads lost |
| G9 | The verification is only `rclone size` | S3 | Silent corruption or partial copies would pass. |
| G10 | FileVault is off on the operator Mac that holds Production media copies and credentials | S2 | Loss or theft of the laptop exposes data and keys. |
| G11 | Revocation of the first unsafe restore key is unverified | S2 | Until the owner confirms it is gone, a read-and-write key may still be live. It expires by itself only if it was created with an expiry. |
| G12 | 241 undecodable synthetic placeholder images in Production `tenant-media` | S4 | Test-data hygiene; a separate cleanup task |
| G13 | No restore runbook, and no RPO/RTO targets | S2 | Recovery would be improvised. |

---

## 3. Deletion-protection design

### 3.1 Options evaluated

| Option | Protects against | Compatibility with the current pipeline | Verdict |
|---|---|---|---|
| **A. Object Lock on the existing bucket** | Version deletion, including by a key with `deleteFiles` (governance mode can be bypassed only with `bypassGovernance`) | Enabling it is **irreversible** ("cannot disable" per the B2 docs). Default retention covers **new uploads only**, so the 981 existing versions stay unprotected. Interaction with the 14-day lifecycle and `sync` hide markers must be tested first. | Not first. An irreversible change to the bucket the live job writes to. |
| **B. Separate immutable vault bucket**: Object Lock in governance mode, 30-day default retention, written by `rclone copy` (never deletes) | Mass or malicious deletion, a compromised mirror key, sync bugs | New bucket, new job step and new key. **The existing mirror is untouched.** Rollback: stop writing; locked versions expire after the retention period. | **Recommended core** |
| **C. Delayed or guarded deletion in the mirror**: `--max-delete`, a source-count fail-closed check, `rclone check` | Accidental mass deletion, empty-listing bugs | Small workflow change. Revert the commit to undo. | **Recommended** (cheap, immediate) |
| **D. Version retention only** (today's 14-day lifecycle) | Accidental deletes noticed within 14 days | Already in place | Keep, but **insufficient alone**: any key with `deleteFiles` defeats it. |
| **E. Combination** | All four threats | — | **Recommended: B + C + D, plus least-privilege keys (§4)** |

### 3.2 Recommended design (E)

```
Supabase tenant-media ──(read)──► GitHub Actions job (pinned rclone, sha256-verified)
   │                                 ├─ guard: source count ≥ 90% of last count, else FAIL (no sync)
   │                                 ├─ MIRROR  rclone sync  --max-delete 25  → innerdwes-production-backup (versions 14 d)
   │                                 ├─ VAULT   rclone copy  (no deletes)     → innerdwes-backup-vault (Object Lock GOVERNANCE 30 d)
   │                                 └─ verify  rclone check --one-way (size+hash) and write status.json to the mirror
   └─ Postgres ──(read-only role)──► nightly pg_dump → age-encrypted → VAULT db/ (Object Lock 35 d)
```

**Threats and how the design answers them:**
- **Accidental mass deletion in Production:**
  - the source-count guard stops the sync;
  - `--max-delete` caps how many files one run can hide;
  - the vault still holds every object for 30 days or more.
- **Malicious deletion with a stolen mirror key:** the new mirror key has no `deleteFiles` (§4). Hide markers are still possible, but versions survive 14 days and the vault 30 days.
- **Stolen vault key:** it has `writeFiles` only, with no `deleteFiles` and no `bypassGovernance`. Overwrites create new versions, and the locked old versions survive.
- **Sync bug** (for example an empty listing): the count guard plus `--max-delete` stop it. Because `copy` never deletes, the vault is unaffected.
- **Owner or admin key compromise:** the admin key (`bypassGovernance`) is never stored in CI, and the Backblaze account needs MFA.
  - Compliance mode would remove this last risk but is irreversible per file.
  - Revisit it after 60 days of governance-mode operation.
- **Privacy:** deleted customer media would persist for up to 30 days in the vault. This must be stated in the privacy policy and the data-erasure procedure. Governance mode allows an admin override for a legal erasure request; compliance mode would not.

---

## 4. Least-privilege credential plan

| Key | Scope | Capabilities | Stored in | Used by |
|---|---|---|---|---|
| **K1 mirror-writer** | `innerdwes-production-backup` | `listBuckets, listFiles, readFiles, writeFiles` | GitHub environment `backup-prod` | Mirror sync |
| **K2 vault-writer** | `innerdwes-backup-vault` | `listBuckets, listFiles, readFiles, writeFiles` | GitHub environment `backup-prod` | Vault copy, DB dump upload |
| **K3 verifier (read-only)** | Both buckets (one key per bucket if a key can be limited to only one) | `listBuckets, listFiles, readFiles, readBuckets, readBucketRetentions, readBucketEncryption, readBucketLifecycleRules` | GitHub environment `backup-health`, plus the owner's local restore file | Health checks, restore drills |
| **K4 admin** | Account | All, including `bypassGovernance` and key management | Owner password manager only, MFA. **Never in CI.** | Bucket settings, legal erasure override |
| Supabase S3 key | Cannot be scoped | Full | GitHub environment `backup-prod` (main branch only, protected) | Mirror and vault read |
| Postgres `backup_reader` role | Read-only (`pg_read_all_data` or explicit SELECT grants); schema dump rights | SELECT only | GitHub environment `backup-prod` | DB dump |

Notes:
- `writeFiles` without `deleteFiles` still lets rclone hide files. Hiding uses `b2_hide_file`, and rclone's B2 backend hides by default (`--b2-hard-delete=false`). **This must be proven in step D2 below before any cutover.**
- The Supabase S3 key cannot be made read-only. Mitigations:
  - pin rclone;
  - keep the key in a main-only protected environment;
  - rotate it after hardening;
  - longer term, use Supabase S3 *session-token* auth with a JWT for a dedicated role that has SELECT-only Storage RLS (needs research; the docs say session tokens enforce RLS).

**Rotation sequence (for every key):**
1. Create the new key.
2. Add it under **new** secret names.
3. Run a manual dispatch against a test prefix.
4. Switch the workflow (one commit).
5. Wait for 3 consecutive successful scheduled runs.
6. Owner revokes the old key.

Rollback before step 6 is to revert the commit; the old key is still valid. **Nothing is revoked until its replacement has been proven.**

---

## 5. Monitoring and alerting

**Layer 1: in the backup job.** It fails the run, and GitHub emails the owner:
- the source-count guard fails;
- `--max-delete` is exceeded;
- `rclone check` finds a mismatch;
- the vault copy fails;
- the job writes `status.json` (time, counts, bytes, hides this run) to `b2:…/_health/`.

**Layer 2: a daily `backup-health` workflow**, using the read-only K3 key and a read-only Supabase query. It alerts on:

| Signal | Rule |
|---|---|
| Failed backup | Last run conclusion ≠ success |
| Missed or stale backup | Newest successful run, or newest `status.json`, older than **8 h** (warning) or **12 h** (alert) |
| Object-count drop | B2 live count < 95% of the previous day, or < Production count |
| Abnormal deletion | Hide markers in 24 h > max(10, 5% of live objects) |
| Checksum | Weekly: full download, MD5 vs Production eTag (as in the restore tool). Any mismatch alerts. |
| Storage or cost anomaly | Total stored bytes > 2× the 7-day median, or > 5 GB (half the free tier) |
| DB dump | Newest vault `db/` object > 26 h old, or the restore check failed |
| Key expiry | K3 within 14 days of expiry |

**Layer 3: an independent watchdog for missed runs.** If GitHub Actions itself stops, Layers 1–2 stop too. Options:
- **(a, recommended)** a Cloudflare Worker cron trigger (Workers Free) that calls the GitHub runs API with a fine-grained read-only token, and emails if the newest success is more than 12 h old;
- **(b)** a healthchecks.io free dead-man's switch that the job pings.

Either needs the owner to pick the alert channel and give approval.

---

## 6. Independent database backup

1. **Role:** create a `backup_reader` login role with `pg_read_all_data` (PG 14+) and no write rights. **Staging first.** Granting it on Supabase is a configuration change and needs approval.
2. **Dump job:** nightly GitHub Actions run at 23:30Z, after the managed backup.
   - Open one session.
   - Run `pg_export_snapshot()` in REPEATABLE READ.
   - Run `pg_dump --snapshot=<id> -Fc` of the `public`, `auth`, `storage` and `supabase_migrations` schemas, plus a roles-only dump.
   - In the **same snapshot**, record per-table row counts and fingerprints:
     - `pg_policies` md5;
     - function-definition md5s (`publish_space`, `build_teach_payload`, `jsonb_pick`, …);
     - the extension list;
     - the migration head;
     - the `storage.objects` count and md5 of (name, eTag).
3. **Encryption:** encrypt with `age` to an owner-held X25519 public key. The public key is committed in the infra repo; the private key is offline (password manager plus a paper copy). The plaintext dump exists only in `$RUNNER_TEMP` and is removed with `always()`.
4. **Upload:** to `innerdwes-backup-vault/db/YYYY/MM/DD/` with a manifest (sha256 of the ciphertext and of the plaintext).
5. **Retention:**
   - daily copies for 35 days (Object Lock 35 d);
   - the first of each month for 12 months (per-file retention set at upload).
6. **Automated verification**, every run, in the same job:
   - start an ephemeral `supabase/postgres:17.x` service container on the runner, which has the auth, storage and extensions schemas;
   - decrypt with a CI-only **verification** key. Alternatively, encrypt to two recipients: the owner key and a CI verify key held in the environment. The trade-off is documented: the CI key can decrypt dumps, so CI is trusted with the data anyway.
   - `pg_restore`, then compare:
     - row counts per table equal the snapshot counts;
     - policy, function and extension fingerprints equal the source;
     - RLS is enabled on every public table;
     - the migration head is 0035;
     - **reconciliation:** every `module_items.image_ref`, `audioRef` and brand ref resolves to a `storage.objects` row, and every `storage.objects` name exists in the B2 live listing (334 today).
   - Any mismatch fails the run, which triggers the alert.
7. **RPO/RTO targets (proposed):**

| Asset | RPO now | RPO target | RTO target |
|---|---|---|---|
| DB (managed) | ≤ 24 h | ≤ 24 h | ≤ 4 h (Supabase restore) |
| DB (independent) | none | ≤ 24 h | ≤ 8 h (new project + `pg_restore` + Storage re-upload) |
| Media | ≤ 11.4 h observed | ≤ 6 h (alert at 12 h) | ≤ 2 h (334 objects in 4 min today) |

PITR (paid add-on) would bring the database recovery point down to minutes. It is **not recommended now** (no paying customers). Revisit at commercial launch.

---

## 7. Database restore drill plan

| Drill | Where | Frequency | Pass criteria | Cost |
|---|---|---|---|---|
| D-auto | Ephemeral container in CI (§6.6) | Every night | All fingerprints and counts equal | $0 |
| D-local | Owner Mac, `supabase start` (local Docker stack), restore the latest vault dump plus Storage from B2. Run the app locally against it with **synthetic** sessions: published-space render, Teach, media signed URLs. | Quarterly | Smoke checklist passes; timed against the RTO | $0 |
| D-managed | Supabase "restore to a new project" from the managed backup, **temporary paid project** | Yearly, or before launch | Same checks plus Auth login with a synthetic user | Hours of compute; **owner approval required** |

No hosted database restore is performed in this task.

---

## 8. Future R2 coverage

This applies once audio moves to R2 (separate approval).

- **Backup:** a new step `rclone copy r2:innerdwes-media → b2 vault r2/` (never deletes), plus a mirror with guards like §3.2. It uses an R2 API token scoped to **Object Read only** on that one bucket.
- **Integrity:**
  - The upload path records sha256, size and content type per object in the Supabase media table.
  - The daily health job compares the R2 listing, B2 vault listing and DB rows (count plus sizes).
  - The weekly job does a full hash comparison against the stored sha256.
  - R2 ETags are MD5 only for single-part uploads, so the stored sha256 is the reference.
- **Version retention and immutability:** the vault's Object Lock covers R2-sourced copies. R2 has no B2-style version history; R2 bucket lock rules are to be evaluated separately.
- **Encryption:** R2 encrypts at rest by default; the vault uses SSE-B2.
- **Recovery:** restore from the vault into R2 (or Supabase as a fallback) by key path. Then re-run reconciliation: every DB row's object exists with a matching sha256.
- **Rollback during migration:** Supabase originals stay until R2, vault and DB reconciliation pass for 14 consecutive days. The cut-over flag can return reads to Supabase.
- **Metadata reconciliation:** a nightly diff of DB media rows against R2 against the vault. Orphans and missing objects are alerts, never automatic deletes.

---

## 9. Expected monthly cost

| Item | Estimate | Basis |
|---|---|---|
| B2 storage | **$0** | 41.6 MB today, under 1 GB with the vault and 13 months of DB dumps. First 10 GB free. Object Lock has "no extra cost". |
| B2 transactions and egress | **$0** | About 1,500 Class B per weekly checksum run, within the 2,500/day free allowance. Egress is free up to 3× stored. |
| GitHub Actions | **$0 if within the included minutes** | About 180 min/month today, plus vault (~0), DB dump and verify (~150), health (~60), checksum (~15): about 400 min/month. GitHub Free includes 2,000 min for private repos. The account plan was **not verified**. |
| Cloudflare watchdog | $0 | Workers Free cron |
| Supabase PITR | $0 (not recommended now) | Paid add-on; revisit at launch |
| D-managed yearly drill | A few dollars of compute for a few hours | Owner approval |

---

## 10. Implementation steps (independently reversible workstreams)

All infra changes are made in `innerdwes_backup_infra` through a branch and a PR. B2 console steps are done by the owner.

| WS | Steps | Reversal | Approval |
|---|---|---|---|
| **WS-A Local hygiene** | A1 owner confirms the first restore key is deleted. A2 delete the restored media folder and the empty folder (evidence already kept in `~/.config/innerdwes/dr-evidence/`). A3 owner enables FileVault. A4 restore key K-temp expires 2026-10-13. | A2 is irreversible (evidence kept) | **A2 needs explicit approval** |
| **WS-B CI supply chain** | B1 pin rclone (version plus sha256 of the release zip) instead of `curl \| sudo bash`. B2 move the secrets to a GitHub **environment** `backup-prod` limited to `main`. B3 branch protection on `main` (PR required). B4 remove `TASK_027_*` secrets after confirming they are unused. | Revert the PR; secrets can be re-added | Owner |
| **WS-C Mirror guards** | C1 source-count guard (fail if < 90% of the last `status.json`). C2 `--max-delete 25`. C3 `rclone check --one-way` after sync. C4 write `status.json`. Tested first with `backup-sync-test` on `__backup_test`. | Revert the PR | Owner |
| **WS-D Least-privilege keys** | D1 owner creates K1 (no delete or bucket rights). D2 **prove** that hides work on `__backup_test` with K1. D3 switch the mirror to K1 under new secret names. D4 three green scheduled runs. D5 owner revokes the old CI key. | Revert before D5 | Owner (D1, D5) |
| **WS-E Vault** | E1 owner creates the bucket `innerdwes-backup-vault` (private, SSE-B2, **Object Lock on, governance mode, 30-day default**). Lifecycle for previous versions: 45 d. E2 K2 vault-writer. E3 test lock behaviour on a `_probe/` file: delete must be refused with K2, and hide or overwrite must keep the old version. E4 add the `rclone copy` step. E5 record the first full copy count = 334. | Stop the step; the bucket can't be unlocked (by design); data expires after retention | **Owner (irreversible lock on the new bucket)** |
| **WS-F Monitoring** | F1 Layer 1 (in WS-C). F2 `backup-health.yml` daily with K3. F3 weekly checksum job (reuses the restore-tool logic). F4 independent watchdog (Cloudflare cron or healthchecks.io). F5 test each alert by forcing a failure on a test prefix. | Disable the workflow or Worker | Owner (channel choice, watchdog) |
| **WS-G DB off-platform** | G1 `backup_reader` role on **Staging**, then the dump and verify job against Staging. G2 owner generates the `age` keypair (private key offline). G3 Production role (Supabase change). G4 nightly job to the vault. G5 seven green nights. | Drop the role; disable the job | **Owner (Supabase role on Production)** |
| **WS-H Runbook and drills** | H1 `RESTORE-RUNBOOK.md`: media → Supabase/R2, DB → local, DB → new project. H2 first D-local drill, timed. H3 schedule quarterly. | Docs only | Owner |
| **WS-I R2 coverage** | Implement §8 together with the R2 migration workstream. | Per R2 plan | Later (R2 approval) |
| **WS-J Supabase S3 key rotation** | After WS-B: create a new S3 key, swap the secret, three green runs, revoke the old key. | Revert before revoke | Owner |

**Recommended order:** A → B → C → D → F (F1–F2) → E → G → H → J → F4. I comes later.

WS-B and WS-C remove the S1 supply-chain and mass-deletion paths within a day, at no cost.

---

## 11. Risks and rollback

| Risk | Mitigation |
|---|---|
| A key without `deleteFiles` breaks `rclone sync` hides | D2 proves it on a test prefix before cutover; the old key stays valid until D5 |
| The Object Lock interaction with the lifecycle is not as expected | E3 probe on the new bucket only; the existing bucket is never locked |
| `--max-delete` blocks a legitimate large cleanup | Manual dispatch input `allow_deletes=<n>` with confirmation, as in the TASK 027 pattern |
| The count guard trips on a legitimate bulk delete | Same override, logged |
| The DB dump exposes data in CI | `age` encryption, plaintext only in `$RUNNER_TEMP`, a main-only environment, and a read-only DB role |
| Vault retention conflicts with an erasure request | Governance mode allows an admin override; document it in the privacy policy |
| GitHub Actions minutes exceed the free plan | ~400 min/month estimate; check the account plan before WS-F/G |
| The operator Mac is compromised | FileVault (A3); restore copies deleted (A2); short-lived restore keys |

---

## 12. Owner approvals required

1. **A2:** delete the local restored Production media (evidence preserved).
2. **A1/A3:** confirm the first restore key is deleted; enable FileVault (your own actions).
3. **WS-B/C:** PRs to `innerdwes_backup_infra` (pin rclone, environment, guards). Approve the merge, which changes the live backup job.
4. **WS-D:** create K1. Later, revoke the current CI B2 key after three green runs.
5. **WS-E:** create the vault bucket with **Object Lock (governance, 30 d)**, an irreversible bucket property. Also approve the privacy-policy wording on retention.
6. **WS-F:** alert channel (email address or service) and the watchdog choice (Cloudflare cron vs healthchecks.io).
7. **WS-G:** `backup_reader` role on Staging, then Production. Generate the `age` keypair and keep the private key offline.
8. **RPO/RTO targets** in §6.7.
9. **D-managed yearly drill** (a temporary paid Supabase project), when wanted.
10. Separate task: clean up the 241 synthetic placeholder images in Production (G12).

---

## 13. Workstreams B + C: implementation status (2026-10-12)

**State: implemented and tested on an isolated branch. NOT released.** Remote `main` and the scheduled job are
unchanged.

| Item | Value |
|---|---|
| Repo / branch | `innerdwes_backup_infra`, branch `task-032.6-backup-hardening` from `main` `7f9649b`. **Local only (not pushed).** |
| Runbook | `docs/storage-backup-guard.md` in that branch |
| Guard | `scripts/storage_backup_guard.py`. Fail-closed mirror guard: run lock, saved state, double source listing, deletion and erosion guards, `--max-delete`, `--b2-hard-delete=false`, verification against the plan-time object set |
| Installer | `.github/actions/install-rclone`: rclone v1.75.2 linux-amd64, SHA-256 `349ac8fb…3702` checked against the GitHub asset digest, the release `SHA256SUMS` and a local hash. The PGP signature of `SHA256SUMS` was not checked. |
| Workflows | `daily-storage-backup.yml` and the 3 manual workflows: `permissions: {}`, a main-only job gate, the shared writer concurrency group, pinned checkout, install before credentials, env-only remotes, no `rclone config create`. New `backup-guard-tests.yml` (no secrets). |
| Tests | 38 guard tests (real rclone v1.75.2 on synthetic data; `rclone serve s3` for auth failures and outages; fault injection), 18 static workflow checks, and the existing TASK 027 suites. Full results are in §13.1. |

### 13.1 Test evidence (local, macOS, rclone v1.75.2 osx-arm64 sha `610ab7d4…`)

Every scenario in the TASK 032.6 testing list maps to at least one test:

| Scenario | Test(s) | Outcome asserted |
|---|---|---|
| Normal / initial backup | `test_normal_backup_no_changes`, `test_initial_backup`, `test_backup_through_s3_endpoint` | Success; state written |
| One new / changed / expected deletion | `test_one_new_object`, `test_one_changed_object`, `test_one_expected_deletion` | Success, exact effect |
| Unexpected mass deletion | `test_unexpected_mass_deletion_blocked_before_sync` | BLOCKED, `sync` never invoked, backup untouched |
| Large percentage reduction | `test_large_percentage_reduction_over_several_runs_blocked` | Slow erosion of 2 per run is BLOCKED at > 20% |
| Small dataset deletion | `test_small_dataset_deletion` | 3 of 5 blocked; 1 of 5 allowed |
| Empty source | `test_empty_source_bucket_blocked`, `test_empty_source_cannot_be_overridden`, `test_bucket_disappeared_blocked` | BLOCKED even with an override |
| Authentication failure | `test_source_authentication_failure` | FAILED before sync |
| Partial listing | `test_partial_listing_unreadable_directory`, `test_truncated_listing_output`, `test_listings_that_disagree_fail_closed` | FAILED before sync; a partial listing never becomes deletions |
| Source / destination outage | `test_source_outage`, `test_destination_outage`, `test_destination_listing_failure_after_lock`, `test_destination_listing_empty_after_previous_backup_blocked` | FAILED / BLOCKED before sync. A dead endpoint fails in about 24 s. |
| Network interruption / incomplete transfer | `test_network_interruption_during_sync_then_recovery`, `test_incomplete_transfer_skips_deletions_then_recovers` | FAILED; rclone skipped deletions; the next run reports it and recovers |
| Checksum mismatch | `test_checksum_mismatch_detected`, `test_download_check_of_new_objects_failure`, `test_unexplained_object_in_backup_fails_verification` | FAILED |
| Concurrent execution | `test_concurrent_run_blocked_by_fresh_lock`, `test_two_simultaneous_runs_at_most_one_syncs` (3 races per run), `test_stale_lock_from_interrupted_run_is_reported_and_recovered` | At most one run syncs |
| Missing credentials | `test_missing_credentials` | FAILED with **zero** rclone calls |
| Recovery after a failed run | Interruption and incomplete-transfer tests | Next run succeeds and reports the previous outcome |
| Live changes during a run | `test_upload_during_run_is_not_a_false_failure`, `test_delete_during_run_is_not_a_false_failure` | No false failure; the change is handled by the next run |

**Defects found and fixed by these tests before release:**
1. An unreachable endpoint made the guard wait up to an hour per call. Bounded timeouts and retries now fail it in about 24 s.
2. Post-sync verification raced with live uploads; it now verifies the plan-time object set.
3. "Changed" compared timestamps as text across backend formats; it now parses them. The first parser dropped
   fractional seconds with time zones, and `test_parse_time_handles_backend_formats` caught it.

**Final local run (2026-10-12): 263 tests, all OK in 77 s.** That is 38 guard tests, 18 static checks and 207
existing TASK 027 tests. Infra branch HEAD `c51b26a`.

**Not testable locally:** B2 hide-marker semantics (asserted statically; release gate R3).

### 13.2 GitHub Actions permission and secret-exposure review

| Finding | Status |
|---|---|
| `curl \| sudo bash` in 4 workflows | **Fixed on the branch** (pinned, verified, no sudo) |
| Workflow token permissions | Repo default is `read` and Actions cannot approve PRs (verified). The branch sets `permissions: {}` plus a job-level `contents: read`. |
| Third-party actions | Only `actions/checkout`, pinned to the full SHA of v4.4.0. The repo setting `sha_pinning_required` is `false`; **recommend enabling it** (owner setting). |
| Secrets reachable from other branches | **Fixed on the branch** (job `if: github.ref == 'refs/heads/main'`). Old branches `task-027-hosted-integration`, `task-027-migration-gate` and `task-027-recovery-snapshot` still contain the **old** workflows, which can be dispatched with the Production secrets. **Recommend deleting those branches** (owner approval). |
| Branch protection / rulesets | **Not available**: GitHub Free, private repo (API 403). Mitigations: the single collaborator (`ronbirman777`); a main-only job gate; the static tests. Option: GitHub Pro ($4/month) for protection and required reviews. |
| Environment-scoped secrets | Environments API reachable, 0 environments. Moving the secrets into an environment `backup-prod` limited to `main` is recommended at release (owner step); availability on Free private repos is to be confirmed in the UI. |
| Fork PRs | `allow_forking: true`, private repo, 0 forks. Fork PRs never receive secrets; recommend disabling forking. |
| Obsolete secrets (not rotated or deleted) | `TASK_027_SUPABASE_SECRET_KEY` and `TASK_027_MANIFEST_KEY` (TASK 027 closed). `TASK_027_APPLY_APPROVAL_CODE` is referenced by `task-027-migration-gate.yml` but **does not exist**. |
| Remaining unavoidable exposure | The Supabase S3 key (full access) and the current B2 key (read-and-write) are still needed by the job until WS-D/WS-J. |

### 13.3 Runtime impact

- **Today:** two source listings plus one destination listing, plus a size check and a download comparison of
  changed objects. That adds roughly 10–30 s to a run that averages 32 s, for 334 objects (estimate; to be measured
  at release gate R2).
- **The lock-settle wait** adds 3 s.

---

## 14. Cloud-only DR architecture and scale

**Principle:** no step depends on the owner's Mac.
- Backups, verification, restore tests and the watchdog run on GitHub Actions and Cloudflare.
- Backups are stored on Backblaze B2.
- Restores run on ephemeral cloud runners.
- The Mac is only for development, administration and optional emergency access.
- The 2026-10-12 local restore was a one-off verification, and its copies are deleted.

```
Supabase Storage ─┐                         ┌─► B2 mirror  innerdwes-production-backup (versions 14 d)
R2 audio (future) ├─► GitHub Actions jobs ──┤
Supabase DB ──────┘   (pinned tools,        └─► B2 vault   innerdwes-backup-vault (Object Lock 30 d; DB dumps 35 d / 12 mo)
                       guard, encrypt)
       restore drills: ephemeral runner + service containers (synthetic + Production-derived, auto-deleted)
       watchdog: healthchecks.io dead-man switch  +  Cloudflare cron Worker (content checks)  ─► owner email
```

### 14.1 Scale

These are assumptions to revisit, not measurements:
- **Per Space:** 25 images (10 MB) plus 5 h of audio at 96 kbps (216 MB), so about 40 objects and 226 MB.
- **Change rate:** about 1% of the data per day.
- **B2:** $6.95/TB-month list price, to verify at purchase; the first 10 GB are free.
- **Stored total:** mirror plus 14-day versions plus a 30-day vault, about 2.1× the data.

| Spaces | Objects | Data | B2 stored (×2.1) | B2 storage $/mo | Incremental run (4-hourly) | Initial full copy | Full media restore (RTO) |
|---|---|---|---|---|---|---|---|
| 100 | 4k | 23 GB | 47 GB | ≈ $0.26 | < 1 min | ~10 min | < 30 min |
| 500 | 20k | 113 GB | 237 GB | ≈ $1.6 | ~1–2 min | ~40 min | ~1 h |
| 1,000 | 40k | 226 GB | 475 GB | ≈ $3.2 | ~2–3 min | ~1.5 h | ~2 h |
| 2,000 | 80k | 452 GB | 950 GB | ≈ $6.5 | ~3–5 min | ~3 h | ~3–4 h |
| 5,000 | 200k | 1.13 TB | 2.37 TB | ≈ $16 | ~5–10 min | ~6–8 h (**exceeds one job's 6 h**) | ~6–8 h (prioritised: active Spaces first in ~1 h) |

**What changes with scale:**
- **Runtime:** listings are 1,000 objects per call, so 200k objects means about 600 list calls per run, which is
  fine. From about 2,000 Spaces, the initial seed and full restores must be **sharded by tenant prefix** (matrix
  jobs) or use `--max-duration` with resumable runs.
- **API limits:** B2 Class C (list) calls reach about 2,400/day at 5,000 Spaces, at the free 2,500/day cap. The
  overage is about $0.004 per 1,000, which is negligible. Supabase S3 listing has no published hard limit; spread
  shards over time.
- **Egress:**
  - incremental reads from Supabase are about 1% of data per day (≈ 340 GB/month at 5,000 Spaces, ≈ $8/month
    beyond the 250 GB included);
  - a **weekly full download verification from Supabase is NOT viable at scale** (≈ $400/month at 5,000 Spaces).
    From 500 Spaces, verification uses stored SHA-256 (recorded at upload) plus a 1% random sample;
  - with R2 as the source, egress is free, so full verification is possible;
  - B2 egress is free up to 3× stored.
- **GitHub Actions minutes** (private repo):
  - about 400 min/month today, within the Free plan's 2,000;
  - about 1,500–2,500 min/month at 2,000 Spaces;
  - about 3,000–4,000 min/month at 5,000 Spaces → GitHub Pro (3,000 min, $4/month) or overage at $0.008/min
    (≈ $10–30/month).
- **Encryption:** SSE-B2 at rest on both buckets. DB dumps are `age`-encrypted before upload. Media is not
  client-side encrypted (same trust level as Supabase/R2). Optional: an rclone `crypt` layer for the vault (key
  management cost; decide later).
- **DB/media consistency:**
  - the nightly DB snapshot is at time T;
  - the vault retains every media version for at least 30 days, so a restore takes the DB at T plus media
    versions as of T or later;
  - reconciliation reports DB rows whose media is missing, never deleting anything automatically.

### 14.2 Monitoring and watchdog

The watchdog must detect a run that **never started**.

| Option | Detects a missing run | Content checks (staleness, counts, deletions, cost) | Cost | Notes |
|---|---|---|---|---|
| **healthchecks.io** (dead-man switch) | **Yes, natively** (no ping within period + grace → alert); also start/fail pings and duration | No (only what the job reports) | $0 (free tier: 20 checks) | New third-party account; the ping URL is a low-sensitivity secret |
| **Cloudflare scheduled Worker** | Yes, by reading the GitHub runs API (fine-grained token, Actions: read) and B2 `_backup-state` (read-only key) | **Yes** | $0 (Workers Free cron) | We own the code; alerts via Cloudflare Email Routing `send_email` or Resend |
| GitHub default failure email | **No** (only failures of runs that started) | No | $0 | Keep as a baseline |
| Cronitor / Better Stack heartbeats | Yes | No | Free tiers are limited | Alternatives to healthchecks.io |
| UptimeRobot heartbeat | Yes | No | Paid feature | — |

**Recommendation:**
- healthchecks.io for missed and failed runs and duration anomalies;
- plus a daily Cloudflare cron Worker for content checks:
  - newest success older than 12 h;
  - live count below 95% of the 7-day max;
  - more than max(10, 5%) hide markers in 24 h;
  - weekly checksum result;
  - stored bytes over 2× the 7-day median or 5 GB;
  - DB dump older than 26 h;
  - key expiry.

Two independent systems, both $0.

The alert rules, de-duplication, recovery notices and the dashboard view of this watchdog are specified in `docs/admin/ADMIN-OPERATIONS-DASHBOARD-SPEC.md` §7 (matrix ADM-09). The dashboard only displays watchdog state; it is never the alerting path.

### 14.3 Immutable vault (next workstream, WS-E; nothing created)

| Decision | Recommendation | Why |
|---|---|---|
| Separate bucket vs. locking the mirror | **Separate bucket** `innerdwes-backup-vault` | Object Lock can't be turned off; the live mirror stays untouched |
| Mode | **Governance**, 30-day default retention | Admin override (`bypassGovernance`, owner-held key, MFA) remains possible for legal erasure. Move to compliance mode only after 60 days and a privacy-policy review. |
| Write pattern | Append-only: `rclone copy` (never `sync`), no `--b2-hard-delete` | Overwrites create new versions; locked versions survive |
| Lifecycle | Previous versions deleted 31 days after they stop being current (after the lock expires); to be verified in E3 | Bounded storage |
| Credentials | Vault writer: `listBuckets, listFiles, readFiles, writeFiles` only. Vault reader (restore drills): read only. Admin: owner only. | A compromised writer can't delete; a compromised reader can't write |
| Independent recovery access | A read-only vault key in the owner's password manager plus a sealed copy (second trustee) | Recovery doesn't depend on GitHub or the Mac |
| Optional | A separate Backblaze account for the vault | Protects against compromise of the main account (owner decision) |

### 14.4 Database backups (WS-G; nothing created)

See §6 for the pipeline. Implementation details:
- **Role:** `backup_reader` with `pg_read_all_data`, tried on Staging first. A pooled connection is not usable for
  `pg_export_snapshot`, so the job uses the direct connection.
- **Key management:**
  - `age` recipients are the owner's offline key and a CI verify key;
  - the CI verify key is stored as a secret, used only by the restore-check job, and rotated yearly.
- **Integrity verification:**
  - sha256 of the ciphertext and of the plaintext in a manifest;
  - a nightly restore into an ephemeral `supabase/postgres:17.x` service container;
  - checks: table counts, fingerprints of `pg_policies`, functions, extensions and grants, RLS flags, migration
    head, and tenant-isolation probes (as role `authenticated` with two synthetic JWTs: tenant A cannot read
    tenant B's rows);
  - media reconciliation against the B2 listing.
- **Cleanup of Production-derived data:** the decrypted dump and the container exist only on the ephemeral runner
  and are destroyed with the job. No artifact upload.
- **RPO/RTO:**

  | | RPO | RTO |
  |---|---|---|
  | DB | ≤ 24 h | ≤ 4 h managed, ≤ 8 h independent |
  | Media | ≤ 6 h (alert at 12 h) | ≤ 2 h up to 1,000 Spaces, sharded/prioritised beyond |

---

## 15. Release gates for Workstreams B + C (owner approval needed)

| Gate | Action | Who |
|---|---|---|
| R0 | Approve pushing the branch (CI runs the tests on GitHub with no secrets) | Owner |
| R1 | Review the PR; CI green | Owner |
| R2 | Merge to `main`, then immediately a manual **`dry_run: true`** dispatch: the plan shows 0 deletions and counts = Production (334). The dry run writes only `_backup-state/`. | Owner approves the merge (a live change) |
| R3 | Manual `backup-sync-test` on `__backup_test` confirms hide markers (no hard deletes) | Owner |
| R4 | First scheduled run; watch 3 consecutive successes; check the job summary | Owner |
| Rollback | Revert the merge on `main`. Backup data is untouched; the guard only writes under `_backup-state/`. | Owner |
