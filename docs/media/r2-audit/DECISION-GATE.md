# Decision gate - TASK 032.5 (audio storage, streaming and metering on Cloudflare R2)

Date 2026-10-10. Branch `feat/032-commercial-platform-foundation` @ `05ab36b`. Audit and plan only: no code, migration, resource, DNS change or hosted query was made.

**Where the questions come from.** The canonical wording of TASK 032.5's ten gate questions is not in the repo (no 032.5 task file under `tasks/` or `docs/`). The questions below are rebuilt from the task brief. If the owner's list is worded differently, map each one by topic.

## The ten questions

**1. Does R2 actually lower cost at our scale?**
Yes. From about 10 Spaces at planning usage (80k min/Space/month), R2 + Worker costs about $5-$75/month, against $29-$10,358 for Supabase uncached egress at 10-2,000 Spaces. At low usage it wins from about 50 Spaces. The $5 audio add-on loses money on Supabase when fully used and is viable on R2. Prices are VERIFIED; workloads are ESTIMATES. Evidence: [03](./03-COST-MODEL.md), [02 §C](./02-VENDOR-RESEARCH.md).

**2. Can the bucket stay private, with security at least as strong as today?**
Yes, and stronger. The bucket stays private, with `r2.dev` disallowed and no custom domain. The Worker binding is the only reader. HMAC tokens are bound to tenant, key, kind, expiry and epoch, and are checked on every Range request. Content-Type and `nosniff` are forced. There is no edge caching. Revocation becomes a deadline cap plus a KV epoch, where today's 180 s window cannot be revoked. Of the 20 requirements, 8 are MET, 12 are MET WITH NEW WORK and 0 are GAP. Evidence: [04 Phase D](./04-SECURITY-STREAMING-METERING.md), [01 §6](./01-CURRENT-AUDIO-ARCHITECTURE.md).

**3. Do streaming and seeking work, including Safari and iOS?**
The design is complete: 206, Content-Range, Accept-Ranges, 416, worker-side If-Range, HEAD and 304. A 10-minute token per resource plus a client re-resolve handles expiry mid-playback. It is not proven yet. The browser behaviour, especially the Safari re-request pattern and iOS lock-screen playback beyond the TTL, is UNVERIFIED and must pass the Phase J benchmark and the browser matrix. Today's 60/180 s signed URLs may already fail on late seeks (01 §15, unverified). Evidence: [04 Phase E](./04-SECURITY-STREAMING-METERING.md), [05 Phase J](./05-MIGRATION-BENCHMARK-MONITORING.md), [00 §20](./00-EXECUTION-PLAN.md).

**4. Can listening be metered without identifying listeners?**
Yes. The recommended meter counts bytes in the Worker, deduplicated per random token nonce, and converts them to minutes as size ÷ duration from provenance. A Durable Object per tenant flushes hourly aggregates to Supabase, with an optional beacon and R2 analytics as cross-checks. No IP, user agent or listener id is stored. The meter cannot perfectly prevent manipulation: real repeat downloads can inflate a count, and offline playback can deflate it. Evidence: [04 Phase F](./04-SECURITY-STREAMING-METERING.md), [LISTENING-METERING-OPTIONS.md](../../billing/LISTENING-METERING-OPTIONS.md).

**5. How is the listening entitlement enforced without hurting guests?**
Through a proposal behind `ENFORCE_LISTENING`, off by default:
- at 70%, 85% and 95%, the organizer is notified
- at 100%, a grace period follows
- after grace, new playback sessions are blocked, but playback in progress is never cut, and continuation re-resolves are allowed
- an upsell appears only once an add-on purchase path exists, which it does not today

Enforcement needs a month of observe-only data and owner approval first. Evidence: [04 §F.6](./04-SECURITY-STREAMING-METERING.md), [ENTITLEMENTS.md](../../billing/ENTITLEMENTS.md).

**6. Do the library and per-recording access codes exist?**
No. Only one Space-level guest code exists (01 §13). Requirements 6-8 are new features. They need a migration (placeholder 0049), RPCs, Studio and guest UI in 7 locales, scoped HMAC cookies, a shared per-Space attempt budget, and a "every configured layer required" check in `/api/media`. The design works with either store. Evidence: [04 §D.1](./04-SECURITY-STREAMING-METERING.md).

**7. What replaces the 0046 database checks that read `storage.objects`?**
A service-role `media_objects` index table, which also holds the per-object store marker (placeholder 0048). The attach RPC checks it for a published sibling, and the fresh-enforcement trigger checks it for any present, pending or unindexed object. Both keep their `storage.objects` clauses during dual storage. Server code adds an R2 HEAD before the RPC, and a nightly reconciliation of R2 against the index alerts on drift. Evidence: [04 §D.3](./04-SECURITY-STREAMING-METERING.md), [01 §3](./01-CURRENT-AUDIO-ARCHITECTURE.md).

**8. Can existing audio migrate without downtime for Lena Teach and Return to Balance?**
Yes, by design. Keys stay identical, so neither the snapshot nor a republish changes. The 18 steps include a sha256 read-back against provenance, size and duration re-verification, and permission probes. Dual-read with retained Supabase copies means rollback is a one-transaction store flip. The canary runs synthetic Staging, then a synthetic Production Space, then low-traffic Spaces, then Return to Balance, then Lena Teach. The last two go separately, each with 7 days of dual-read. Evidence: [05 Phase I](./05-MIGRATION-BENCHMARK-MONITORING.md).

**9. What is the backup / DR posture, and does it weaken anything?**
It strengthens it. (Corrected 2026-10-11: v1 said "no media DR", which was wrong. A Production Storage → B2 sync runs every 4–10 h, audio included. It lacks immutability, checksums and a restore drill. See GAP-INVESTIGATION §B.) PITR is off. The plan is an hourly R2-to-B2 `rclone copy` with:
- a read-only token
- versioning and a 30-day governance-mode Object Lock
- SSE-B2 encryption and a sha256 manifest
- deletion propagated to B2 only after 30 days
- quarterly restore drills

Until R2 is live, an interim Supabase-to-B2 copy runs. The TASK 027 B2 pipeline lives in a separate infra repo and must be verified by the owner. Evidence: [05 Phase H](./05-MIGRATION-BENCHMARK-MONITORING.md), [01 §23-24](./01-CURRENT-AUDIO-ARCHITECTURE.md).

**10. What has to be fixed regardless of R2?**
These items are Workstream 0:
- the `tenant-media` bucket has no `file_size_limit` or `allowed_mime_types`
- unattached drafts are never swept
- deleting a Flow item leaks its draft audio (`retreat/actions.ts:1451-1482`, `saveModuleItemsGeneric`)
- media DR exists (Storage → B2 sync) but is not immutable and has never been restore-tested (corrected 2026-10-11)
- PITR is off

Evidence: [00 Workstream 0](./00-EXECUTION-PLAN.md), [01 §6, §19](./01-CURRENT-AUDIO-ARCHITECTURE.md).

## Verdict

**TASK 032.5 — READY FOR IMPLEMENTATION REVIEW**

**Why.** The plan is complete and accurate to the code:
- current architecture with file:line evidence (01)
- verified vendor facts (02)
- cost model (03)
- all 20 security requirements mapped, with none left as a GAP (04)
- streaming and metering designs (04)
- migration, DR, benchmark and monitoring plans (05)
- 30-section execution plan with parallel-safe workstreams and rollback (00)

No step requires a production mutation to be planned. What remains open are owner decisions and measurements, not design gaps. These block **implementation** of the affected workstreams; they do not block **review**.

**Owner decisions and unknowns required before implementation:**

| ID | Item | Blocks |
|---|---|---|
| D1 | Cloudflare account (zone in the same account), and approval of paid resources: Workers Paid $5/month, R2 beyond the free tier | WS1, WS5, WS7, Phase J |
| D2 | Media subdomain name, and DNS record authorization for Staging and Production (DNS changes need explicit authorization per CLAUDE.md) | WS1, WS5 |
| D3 | Verify the TASK 027 B2 pipeline in the infra repo: whether it runs, its retention, and whether its Supabase S3 credentials should be rotated or revoked. Approve B2 for DR, including Object Lock mode and retention (30 days proposed) | WS0.4, WS8 |
| D4 | Approve the access-code feature scope: library and recording code definitions, code format, and whether titles stay visible while locked (D4b) | WS6 |
| D5 | Approve the metering enforcement policy: thresholds, grace length, degrade behaviour, whether over-ceiling mints are refused, and legal review of the privacy wording | WS11 (and METERING_ENABLED in Production) |
| D6 | Approve the Staging benchmark and its paid-resource budget; owner devices for the iOS and Android matrix | Phase J, WS9 |
| D7 | Retention values: Supabase copy retention after cutover (30 days proposed), the B2 deletion delay, and the LIFECYCLE.md backup-retention question | WS8, WS9 |
| D8 | Whether to enable PITR on Production (paid) | WS0.5 |
| D9 | Alert delivery channel | WS10 |

**UNVERIFIED items that implementation must check first:**
- KV propagation time
- `If-None-Match` support on R2 presigned PUT and CopyObject
- signing `Content-Length` on R2 presigned PUT
- Safari and iOS range and redirect behaviour
- Durable Object availability and limits on the chosen plan
- whether Workers Logs capture `CF-Connecting-IP`

Staging and Production object counts were not queried.


---

## v2 — POC approval gate (2026-10-11)

**Owner approved in principle (2026-10-11):**
- R2 as the preferred future audio delivery;
- a private bucket behind an authenticated Worker;
- privacy-preserving metering;
- verification of the existing Backblaze DR;
- separate library and recording access codes;
- observe-only metering before enforcement;
- a controlled Staging POC;
- no destructive migration without approval.

**This is not implementation authorisation.**

### Changes since v1
- The cost model was rebuilt (03 v2). The $75 figure is withdrawn. Metering is redesigned (Design B) so it does not depend on Durable Object duration.
- Metering v2 separates listening usage from delivered bandwidth (04 §F.7).
- Backups were verified (GAP-INVESTIGATION §B). D3 now means **harden** the existing pipeline, not "verify whether it exists".
- The access-code design is implementation-ready (04 §D.1b). The recommendation is to ship it before R2 (W3a).
- The POC plan has a 48-row matrix (06).
- W0 safe fixes are done locally (GAP-INVESTIGATION §G).

### POC approvals needed (A1–A6)
| ID | Approval | Notes |
|---|---|---|
| A1 | Run the Staging POC (06-POC-PLAN.md) | Staging only, synthetic tenants, budget ≤ $10 |
| A2 | Owner creates the Cloudflare account and enables Workers Paid ($5/month). Owner creates a Staging-scoped API token. Claude creates the Staging bucket, KV, Queue and Worker with it | Claude does not create accounts. Billable resources need this approval |
| A3 | POC hostname: `*.workers.dev` (no DNS change, recommended) or a custom subdomain (separate DNS approval) | |
| A4 | A separate B2 **test** bucket and key for the R2 → B2 restore test (P-DR) | The existing backup bucket and jobs are not touched |
| A5 | Device access for iOS Safari, Mac Safari and Android Chrome (owner devices or an approved device cloud) | Needed for P-STR-05/06/07 |
| A6 | Apply W0 (0047 + Flow fix) to Staging and deploy the W0 SHA to Staging before the POC | Staging only |

### Still open from v1
- D1, D2: covered by A2 and A3 for the POC; Production values come later.
- D3: B2 hardening and key narrowing.
- D4/D4b: access-code scope and code format.
- D5: enforcement policy, later.
- D6: covered by A1 and A5.
- D7: retention.
- D8: PITR.
- D9: alert channel.

### Verdict v2
**TASK 032.5 — READY FOR POC APPROVAL.** No R2 implementation without approval.
