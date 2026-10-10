# 05 - Migration, DR, benchmark and monitoring (TASK 032.5, Phases G-K)

Date 2026-10-10. **Plan only.** Nothing here has been run, created or queried. No Staging or Production object counts are known (01, header), so every volume figure below is **[ESTIMATE]**. References: "01 §n" is `01-CURRENT-AUDIO-ARCHITECTURE.md`, "02 §x" is `02-VENDOR-RESEARCH.md`, "04 §x" is `04-SECURITY-STREAMING-METERING.md`.

---

# Phase G - responsibilities and the dual-storage transition

## G.1 Supabase versus R2 after migration

| Responsibility | Supabase (Postgres + Storage) | Cloudflare (R2 + Worker + KV + DO) | Next.js (Vercel) |
|---|---|---|---|
| Item rows, `audioRef`, `durationSeconds`, snapshot, `publish_space` | system of record | - | writes through the existing actions and RPCs |
| Provenance, quota triggers, `billing_audio_*` | system of record | - | calls the RPCs |
| **Object index and store marker** (`media_objects`, new) | system of record | - | the only writer (service role) |
| Authorization decision (snapshot, availability, Space, library and recording codes) | data | - | **decides** and mints the token |
| Per-request token validation and revocation epoch | - | Worker + KV | writes the epoch through the Worker admin endpoint |
| Audio bytes (draft + published) | **legacy objects until migrated** | R2 (new uploads on flagged tenants, then migrated) | - |
| Images | Supabase Storage (**unchanged**, because `?w=` transforms depend on Supabase, `route.ts` `signAndRedirect`) | - | unchanged |
| Upload | - | R2 (presigned PUT target) | prepares, mints the PUT, finalizes |
| Measurement + sha256 | - | read source | does the measuring and hashing (`audioDuration.ts`, `fingerprint.ts`) |
| Publish copy | - | R2 CopyObject | orchestrates and verifies |
| Listening metering | aggregates (`media_usage_*`) | Worker byte counting, DO accumulator | ingestion route, rollup in the billing cron |
| DR | DB backups (daily, PITR off, 01 §23) | R2 is the primary | - |
| DR copy of audio | - | - | **B2** via rclone (infra repo, Phase H) |

## G.2 Per-object store marker

- **Marker:** `media_objects.store in ('supabase','r2')`, keyed by `object_key` (unique). This is a row per object, not a field on `module_items.metadata`. It avoids touching Save carry-over, `publish_space` or `build_teach_payload` (01 §4.1), and it keeps the `{tenant}/.../{uploadId}/{draft|published}.<ext>` key shape that TS and SQL parse (01 §4.1).
- **Keys are identical in both stores.** A migrated object keeps its exact key, so the snapshot does not change and no republish is needed.
- **Read rule (`/api/media` after authorization):** look up `media_objects` by key. If the row says `store='r2'` and `state='present'`, mint a Worker token. If there is no row, or `store='supabase'`, use today's `createSignedUrl` path. With `MEDIA_DUAL_READ=on`, an R2 HEAD miss on an `r2` row falls back to Supabase **only while** the Supabase object is retained (migration window), and an alert fires.
- **Write rule:** new uploads go to the store named by the tenant's `MEDIA_STORE` flag (`media_store_overrides` row, else the environment default). Publish copies stay in the **same store as their draft**. A cross-store publish is refused, which removes a whole class of bugs.
- **Deletion:** every cleanup (`draftCleanup.ts`, `publishedCleanup.ts`, `tenantCleanup.ts`) resolves the store per key from `media_objects`. Space deletion and Replace list and delete in **both** stores, mark index rows `deleted`, and fail closed if either store errors (01 §4.7).

---

# Phase H - Backblaze B2 disaster recovery

**Do not weaken the existing posture.** Today there is no media DR in this repo (01 §23-24). The TASK 027 B2 snapshot pipeline lives in a **separate infra repo** (`tasks/027-closure-and-followups.md:8,17,33`, `infra main 7f9649b…`). It was a one-off for the legacy-media migration and still holds B2 and Supabase S3 credentials as secrets there. **The owner must verify** its current state: whether it still runs, what bucket and retention it uses, and whether its Supabase S3 credentials should be rotated or revoked. The R2 DR design must not reuse its credentials blindly. Until R2 is live, a **Supabase Storage to B2** copy of `tenant-media` audio would itself close Workstream 0's "no media DR" gap.

## H.1 Design

| Item | Proposal |
|---|---|
| Direction | R2 to B2, one-way. B2 Cloud Replication cannot pull from R2 (B2 to B2 only, 02 §H), so use **rclone** |
| Runner | Scheduled job in the infra repo, for example a GitHub Actions cron like TASK 027. Credentials: **R2 Object Read-only** token for one bucket (04 §D.4) and a B2 application key limited to the DR bucket with `writeFiles` + `listFiles`, **without `deleteFiles`** |
| Schedule | Hourly incremental (`rclone copy --checksum` or size + modtime with `--fast-list`). Daily `rclone check` (size + hash). R2 single-part ETags are MD5, multipart are not **[ASSUMPTION]**, so hash comparison uses the **sha256 manifest** (below) for audio |
| Copy, not sync | `rclone copy`, so a deletion in R2 is **not** propagated by the sync job |
| Deletion propagation | A separate **delayed purge** job deletes from B2 only objects that have (a) a `media_objects` row with `state='deleted'` and (b) `deleted_at` older than **30 days** **[owner policy value; LIFECYCLE.md:49 retention question is still open]**. With versioning, the delete becomes a hide marker, removed by a lifecycle rule `daysFromHidingToDeleting` (02 §H) |
| Versioning | B2 keeps all versions by default (02 §H). Lifecycle: `daysFromHidingToDeleting = 30` |
| Object Lock | Enable on the DR bucket in **governance** mode, retention **30 days** **[owner decision]**. Compliance mode is irreversible (02 §H: "cannot be disabled once on"). Governance lets an authorized key fix mistakes. Locked versions block lifecycle deletes, so retention must match the deletion policy |
| Encryption | **SSE-B2** as bucket default (02 §H). Not SSE-C: losing the key means losing the data, and B2 replication does not support SSE-C |
| Manifest | Nightly, the job exports `media_objects` (key, size, sha256 from provenance, store, state) to `manifests/YYYY-MM-DD.jsonl` in the DR bucket. It holds keys and hashes only, no personal data |
| Restore | Restore is `rclone copy b2:dr/<prefix> r2:<bucket>/<prefix>` with a **temporary R/W token**, followed by a sha256 check against the manifest and re-indexing. Restored objects pass through the index reconciliation (04 §D.3), so no unindexed object goes live |
| DB pairing | Media restore is useless without the DB rows. The runbook pairs it with `MIGRATION-RECOVERY.md`. **PITR is off** (01 §23), so the RPO for DB is 24 h and for media about 1 h. That mismatch is recorded as a known risk. Recommend enabling PITR (Workstream 0) |
| Restore drills | Quarterly. (1) Restore one random tenant prefix to a **Staging** scratch bucket, sha256-verify 100%, measure RTO. (2) Annually, a full-bucket restore to scratch. Record results in `docs/media/DR-DRILLS.md` (future) |
| Cost | Storage $6.95/TB-month, egress for restores free up to 3x stored, API classes A/B/C free (02 §C.E). About $0.02-$4.80 per month at 10-2,000 Spaces (03). R2 Class B reads for the sync: about one per changed object per run, which is negligible **[ESTIMATE]** |
| Spend controls | B2 daily caps and 75%/100% alerts (02 §K) |

## H.2 Targets (proposal)

RPO 1 h for audio and 24 h for DB (PITR off). RTO 4 h for one tenant and 24 h for the full bucket **[ESTIMATE, to be measured in drills]**.

---

# Phase I - migration algorithm (existing Supabase audio to R2)

**Preconditions:** Workstreams 0-3 are done on Staging (00-EXECUTION-PLAN). The Phase J benchmark has passed. `media_objects` is backfilled with `store='supabase'` for every existing audio object. DR copy to B2 is running. There is an owner go decision for each Production step.

The 18 points:

1. **Inventory.** A service-role job lists `tenant-media` recursively (the `removeAllTenantMedia` listing pattern, `tenantCleanup.ts:75`), keeping audio extensions only. It joins to `module_items.metadata.audioRef`, `billing_audio_verifications` and `published_spaces.modules` (`collectAudioRefs`). Output is a manifest row per object: key, size, Supabase etag, role (draft-attached, published-live, published-stale, orphan), and provenance sha256 or null. The job is **read-only** and its output is stored outside the repo (it contains tenant ids).
2. **Classify.** `live` (named by a current snapshot or attached draft), `stale` (published but not named, swept by the next publish anyway), `orphan` (unattached draft or Flow-deleted item, 01 §19). Only `live` objects are migrated. Stale and orphan objects are listed for owner review and never deleted by the migration.
3. **Batches.** Per tenant, at most 50 objects or 2 GB per batch **[ESTIMATE]**, concurrency 4. One tenant is never split across a cutover, so a tenant is either fully on Supabase or fully on R2 for reads.
4. **Copy.** Download from Supabase with the service role (streaming) and PUT to R2 at the **identical key** with the forced Content-Type from the extension, using the time-boxed migration token. Use `If-None-Match: *` **[UNVERIFIED on R2]**. If the target exists, go to step 5 and do not overwrite.
5. **Checksum.** Compute sha256 on the bytes **read back from R2** (a second GET, not the upload stream). Compare with `billing_audio_verifications.sha256` where provenance exists, else with the sha256 of the Supabase source computed in step 4. Any mismatch fails the object, deletes the R2 copy, alerts, and leaves the tenant on Supabase.
6. **Byte size.** R2 HEAD size must equal the Supabase `info().size` and, where present, `size_bytes` (and `published_size_bytes` for published copies).
7. **Duration re-verify.** Run `deriveAudioDuration` (`audioDuration.ts:78`) on the R2 bytes. It must equal `durationSeconds` (whole seconds) for provenance-backed items. For legacy and exempt items it is recorded as a **finding** only and does not fail the object (their duration was browser-reported, 01 §3).
8. **Index.** Insert or update `media_objects(key, store='r2', state='present', size, sha256, etag, content_type, migrated_at)` while keeping `supabase_retained=true`. The store marker does **not** flip yet.
9. **Permission verification.** For each migrated key, check that an unauthenticated GET to the bare S3 endpoint and to the Worker **without** a token returns 403/404. A Worker request with a token for **another tenant's** key returns 404. A token of kind `draft` against a `published` key returns 404. Results are recorded per batch.
10. **Dual-read enable** (`MEDIA_DUAL_READ=on` for the tenant). Flip `store='r2'` for the tenant's keys in one transaction. `/api/media` now serves from R2 and falls back to Supabase on an R2 miss, with an alert.
11. **Verify live.** A scripted guest journey (`docs/tasks/029/media-journey.mjs` pattern) plays each published recording: 206 on `bytes=0-1`, a seek to 90%, and a re-resolve after the token expires. Errors at the Worker are expected to be 0. Watch for 24 h (tenant canary) or 7 days (the named Spaces below).
12. **Cutover.** Turn off dual-read for the tenant, which makes R2 authoritative. Turn on `MEDIA_STORE=r2` for the tenant so new uploads go to R2.
13. **Rollback (any time before step 16).** Flip the tenant's `media_objects.store` back to `supabase` in one transaction. Supabase objects are still there, so it is instant. Uploads made to R2 after cutover are **copied back** to Supabase (same verify steps) before the flip, or the tenant stays dual-read. The epoch bump invalidates outstanding Worker tokens.
14. **Orphans.** Orphans from step 2 are reported. After owner review they are deleted by the Workstream 0 sweeper, not by the migration. No new orphans: the migration writes only `live` keys.
15. **Retention of Supabase copies.** Keep them for **30 days** after cutover **[owner value]**. Delete them only after all of these: 30 days with no fallback alert, the B2 DR copy verified by `rclone check` against the manifest, and an owner go.
16. **Supabase deletion.** Remove the retained Supabase objects for the tenant, chunked by 100 (`tenantCleanup.ts` pattern), and set `supabase_retained=false`. The 0046 `storage.objects` probes then see nothing for those keys, which is why 0048 (index-aware) must already be live.
17. **DR check.** Confirm the tenant's R2 keys exist in B2 with a matching sha256 (manifest), and that one random object restores to the Staging scratch bucket.
18. **Performance check.** Compare the tenant's Worker p95 TTFB, error rate and re-resolve rate against the Phase J thresholds for 7 days. A breach triggers rollback (step 13).

## I.1 Canary order (Lena Teach and Return to Balance must stay up throughout)

| Step | Environment | Tenant | Product path | Gate to next |
|---|---|---|---|---|
| 1 | Staging | synthetic Staging QA owner Spaces (memory: TASK 028 QA owner) | Teach + Flow | Steps 1-18 green. Browser matrix (00 §20) passed |
| 2 | Staging | Staging copies of the Lena Teach / Return to Balance shapes **[if they exist on Staging; unverified]** | Teach + Flow | 7 days clean |
| 3 | Production | a **new synthetic Production QA Space** (exempt), one Teach and one Flow recording | both | 72 h clean; permission checks (step 9) on Production |
| 4 | Production | **new uploads only** for the synthetic Space (`MEDIA_STORE=r2`) | both | 72 h clean |
| 5 | Production | low-traffic legacy Spaces, if any, one at a time **[owner selects]** | either | 72 h each |
| 6 | Production | **Return to Balance** (Flow, published 2026-10-08, memory) | Flow | 7 days in dual-read before cutover, then 7 days after |
| 7 | Production | **Lena Teach** (Teach) | Teach | 7 days in dual-read before cutover, then 7 days after |
| 8 | Production | default `MEDIA_STORE=r2` for new Spaces | - | 30 days, then Supabase copy deletion (steps 15-16) tenant by tenant |

Return to Balance and Lena are migrated **last, separately, never in the same window**, and always with dual-read on and Supabase copies retained. The rollback for either is a single `store` flip. Both are exempt Spaces (ARCHITECTURE.md "Legacy / internal exemption"), so the Replace refusal from 0046 and the exempt policy apply. Neither may be republished as part of the migration.

---

# Phase J - Staging benchmark plan

**No paid resource is created without explicit owner approval.** Benchmarks run against Staging data only (synthetic QA owner).

## J.1 What needs a Cloudflare account (owner action)

- A Cloudflare account with the app's zone, or a zone for the media subdomain. A Worker custom domain requires the zone in the same account (02 §C.D).
- An R2 subscription. Enabling R2 may require a payment method even within the free tier **[UNVERIFIED]**.
- Workers Free is enough for a functional test (100k requests/day, 10 ms CPU, 02 §C.C). **Workers Paid ($5/month) is needed** for realistic CPU limits, Durable Objects at volume, and Logs retention **[DO availability on Free: UNVERIFIED]**.
- One KV namespace, one DO class and one R2 bucket, all named `*-staging`.
- DNS: a `media-staging.<app-domain>` record (owner, DNS mutation needs authorization per CLAUDE.md).

## J.2 Test setup

- About 20 Staging objects copied (not moved) from Staging Supabase: MP3 128 kbps, M4A (faststart and moov-at-end), WAV, OGG, at 5, 30 and 60 min lengths, including a 95-100 MB file.
- Paired runs: the same object through **Supabase signed URL (today)** and **Worker (proposed)**, from 3 network locations (desktop on broadband, Android on 4G, iOS on Wi-Fi) **[owner devices]**.
- A load test at most 50 concurrent synthetic listeners against Staging, `bytes=` patterns recorded from real browsers. It is **only run within free or approved quotas**.

## J.3 Metrics and pass thresholds (thresholds are proposals)

| Metric | How | Pass |
|---|---|---|
| Time to first byte, `bytes=0-1` | scripted fetch, n ≥ 200 per location | Worker p95 ≤ Supabase p95 + 100 ms and ≤ 400 ms |
| Time to play (click to `playing`) | Playwright, real browsers | p95 ≤ 1.5 s on broadband, ≤ 3 s on 4G |
| Seek latency (seek to 50%/90% then `playing`) | browser script | p95 ≤ 1.0 s |
| Rebuffer events per 30-min play | browser | ≤ Supabase baseline |
| Long-pause resume (pause 12 min > TTL, then play) | browser | 100% resume via pre-emptive refresh; 0 user-visible errors |
| Seek after token expiry | browser | 100% recover within 3 retries |
| Worker CPU per request | Workers metrics | p99 ≤ 5 ms |
| Worker error rate (non-404) | Workers metrics | < 0.1% |
| Revocation latency (epoch bump, then first 404) | script | p95 ≤ 60 s **[KV propagation UNVERIFIED]** |
| Deadline cap | mint at deadline − 30 s | token refused at deadline + 0 s |
| Permission checks (04 req. 1-4, 17, 18) | script | 100% pass |
| Metering accuracy | scripted ground truth (continuous, seek, pause, two tabs, abort at 37%) | ±5% per scenario, aggregate −5%/+1% (LISTENING-METERING-OPTIONS.md V4 target), dedupe: replayed ranges add 0 |
| Metering pipeline lag | DO flush to `media_usage_hourly` | ≤ 70 min |
| Measured cost | Cloudflare billing for the window | within 2x of 03 per 1,000 minutes |
| Token TTL variants 5/10/15 min | all of the above | choose the shortest TTL that passes resume/seek on iOS |

---

# Phase K - monitoring and alerts

## K.1 Threshold alerts at 70% / 85% / 95%

| Quantity | Threshold base | Source | Native or custom |
|---|---|---|---|
| Cloudflare usage-based spend | owner $ budget per month | Cloudflare **budget alerts** (account-wide, informational, no cap; 02 §K). Configure 3 alerts at 70/85/95% of budget | **Native** |
| R2 storage GB, Class A, Class B per month | budget or free-tier quotas | GraphQL `r2OperationsAdaptiveGroups` / storage (02 §F), daily job | **Custom** (per-product notification coverage for R2 is unconfirmed, 02 §K) |
| Workers requests and CPU-ms per month | 10M / 30M included | Workers metrics GraphQL, daily job | **Custom** |
| DO requests per month | 1M included | GraphQL, daily job | **Custom** |
| Supabase egress and storage (legacy plus images) | 250 GB uncached / 100 GB | Supabase usage page; spend cap stops usage, there are no threshold alerts (02 §K) | **Custom** (scrape/manual) plus native spend cap behaviour |
| B2 storage and transactions | daily cap | Backblaze caps send alerts at 75% and 100% (02 §K), so B2 cannot do 70/85/95 natively | **Native** (75/100) plus custom 70/85/95 |
| **Per-tenant listening minutes** | monthly entitlement | `media_usage_monthly` rollup in the billing cron | **Custom** (the organizer notices in 04 §F.6, plus Admin) |

## K.2 Immediate alerts

| Alert | Trigger | Native or custom |
|---|---|---|
| Worker 5xx | > 1% over 5 min | Custom (Workers metrics poll). Native Workers notifications **[UNVERIFIED]** |
| Token failure spike | 404-for-invalid-token rate > 10x baseline over 10 min (possible attack or key drift) | Custom (Worker emits a counter to the DO, no request data) |
| Mint ceiling hit | any tenant over the mint ceiling (04 §F.5) | Custom |
| R2 auth errors | any 401/403 from R2 in server code (credential expired or revoked) | Custom (app error reporting) |
| Bucket exposure drift | `r2.dev` enabled or a custom domain attached to the bucket | Custom (daily Cloudflare API check) |
| Unindexed R2 object | reconciliation finds an R2 object without a `media_objects` row | Custom |
| Index present but object missing | reconciliation | Custom |
| Dual-read fallback used | `/api/media` fell back to Supabase | Custom |
| Migration checksum, size or duration mismatch | Phase I steps 5-7 | Custom |
| Publish sha256 mismatch | `assertPublishedAudioFingerprint` refusal | Custom (exists as a refusal, needs an alert) |
| KV epoch write failure | app-to-Worker admin call failed after retries | Custom |
| Metering ingest failure or lag | ingest non-2xx, or newest `media_usage_hourly.hour` > 2 h old | Custom |
| DR sync failure / `rclone check` mismatch | infra job exit code | Custom (GitHub Actions failure notification is native) |
| DR job did not run | no manifest for the day | Custom |
| Secret rotation overdue | > 90 days since rotation | Custom (calendar/runbook) |
| Cloudflare budget crossed | native budget alert | **Native** |
| Supabase spend cap reached | billing email | **Native** |

**Delivery:** custom alerts go through the existing billing email outbox to an ops address, or to the Admin console's alert list. A new `ops_alerts` mechanism is out of scope until the owner picks a channel **[owner decision]**. **Privacy:** no alert carries IPs, UAs, tokens or nonces.
