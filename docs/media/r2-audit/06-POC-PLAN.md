# 06 — Controlled Staging POC: Cloudflare R2 audio (TASK 032.5, Part 10)

Prepared 2026-10-11. **Nothing in this plan has been created or run.** It starts only after the owner approves the POC, with approvals A1–A6 in DECISION-GATE.md "POC approvals".

## 1. Scope and boundaries

- **Environment:**
  - Staging Supabase `kkqjsspxupyxytddiumf`.
  - A Staging-only Vercel deployment from a POC branch cut from the TASK 032 branch, behind a POC flag.
  - A Cloudflare **Staging** bucket and Worker only.
- **Data:** synthetic POC Spaces only, with run-id-tagged tenants. The 5 existing Staging tenants are untouched. **No Production media is read, copied or migrated.**
- **Billable resources (owner creates or approves):**
  - Workers Paid ($5/month);
  - 1 R2 bucket, `innerdwes-media-staging`;
  - 1 KV namespace (epoch);
  - 1 Queue (listening beacons);
  - Analytics Engine dataset.
- **Expected POC spend:** under **$10 in total** for the POC month [ESTIMATE]: the $5 base plus usage inside free tiers.
  - A Cloudflare budget alert at $10 is required. It notifies only and is not a cap.
  - Backblaze data caps set at a small daily value.
- **Not in the POC:**
  - the dual-storage migration of real data;
  - listening enforcement;
  - Production DNS;
  - any change to the TASK 032 Stripe integration.
- **Exit:** a POC report against the matrix below, plus measured costs, then a separate owner approval request for full implementation.

## 2. Prerequisites

| # | Prerequisite | Owner / Claude |
|---|---|---|
| P1 | Cloudflare account. The owner enables Workers Paid; Claude does not create accounts | Owner |
| P2 | Staging media hostname. Recommended: the `*.workers.dev` route for the POC, so **no DNS change** is needed. A custom subdomain is a DNS change and needs separate approval | Owner decides |
| P3 | A scoped API token for Worker deploy and bucket admin (Staging only). It goes into a local env file that is never committed | Owner creates; Claude uses |
| P4 | Backblaze: read-only confirmation of the TASK 027 pipeline (see GAP-INVESTIGATION §B) and a **separate** B2 test bucket for the R2 → B2 recovery test | Owner |
| P5 | Test devices: iPhone (iOS Safari, recent version), Mac Safari, Android Chrome, desktop Chrome and Firefox | Owner provides iOS / Safari access, or approves a device cloud |
| P6 | W0 safe fixes merged on the branch (bucket limits, Flow leak fix, orphan report) | Claude, after approval |

## 3. Test matrix

Legend:
- **Auto:** automated script against Staging.
- **Browser:** Playwright.
- **Device:** a real device, run manually by the owner or Claude.
- Every row records the run id, timestamp, observed result, and pass/fail.

### 3.1 Storage and access enforcement
| ID | Test | Method | Pass criterion |
|---|---|---|---|
| P-SEC-01 | The bucket is private: an anonymous S3 GET, an `r2.dev` URL and a public-access probe all fail | Auto | Each one returns 401, 403 or 404. The public `r2.dev` URL is disabled |
| P-SEC-02 | The Worker rejects a missing, malformed, wrong-`kid` or bad-HMAC token | Auto | 404 with identical bodies, and **no R2 operation** (Worker log shows no binding call) |
| P-SEC-03 | Valid token, wrong object key (token for A, URL for B) | Auto | 404 |
| P-SEC-04 | Cross-tenant: a token minted for tenant A is used on a tenant B key | Auto | 404 |
| P-SEC-05 | Predictable key: guessing `tenant/{id}/.../published.mp3` without a token | Auto | 404 |
| P-SEC-06 | Draft/published: a guest resolve for a draft key, and a draft token used on a published key and the reverse | Auto | Guests are never minted `kd=draft`. Mismatches return 404 |
| P-SEC-07 | Publication immutability: re-uploading over a published key with app credentials | Auto | Refused (create-only/conditional write). Result recorded, because `If-None-Match` on R2 is UNVERIFIED (02 §9) |
| P-SEC-08 | Forced headers: Content-Type from the extension, `nosniff`, `Cache-Control: private, no-store`, CORS exact origin | Auto | All headers exact. A `.html` key returns 404 |
| P-SEC-09 | No shared caching: two different tokens for the same object, both requests miss the cache | Auto | `cf-cache-status` is absent or BYPASS |
| P-SEC-10 | Privacy: Worker logs contain no IP, UA or token; the Workers Logs config is checked | Auto + dashboard | No such fields. The `CF-Connecting-IP` capture question (02 §F) is answered |
| P-SEC-11 | Credentials: the app token is limited to one bucket; the Staging token cannot list a second (dummy) bucket | Auto | 403 |

### 3.2 Streaming
| ID | Test | Method | Pass criterion |
|---|---|---|---|
| P-STR-01 | GET with no Range | Auto | 200, correct `Content-Length`, `Accept-Ranges: bytes` |
| P-STR-02 | `bytes=0-1`, `bytes=100-`, `bytes=-500`, unsatisfiable, multi-range | Auto | 206 with exact `Content-Range` for each. 416 for unsatisfiable. 200 for multi-range |
| P-STR-03 | HEAD, `If-None-Match`, `If-Range` match and mismatch | Auto | 200/206 headers, 304, range served or full 200 |
| P-STR-04 | Desktop Chrome, Firefox, Edge: play, seek forward and back, play to the end, 60-min file | Browser | No error. Seek latency is recorded |
| P-STR-05 | **Mac Safari:** play, the 0-1 probe, seek, a 60-min file | Device | No error. Request log shows whether Safari re-requests `/api/media` (cost implication) |
| P-STR-06 | **iOS Safari:** play, seek, lock screen for more than the token TTL and then seek, background tab, AirPods controls | Device | Playback continues. A seek after expiry recovers through re-resolve within 3 s, or the failure is documented with a TTL recommendation |
| P-STR-07 | Android Chrome: same as P-STR-06 | Device | Same |
| P-STR-08 | M4A with `moov` at the end, plus MP3, WAV, AAC and OGG samples | Browser | All play. Tail-fetch bytes are recorded |

### 3.3 Token lifecycle and revocation
| ID | Test | Method | Pass criterion |
|---|---|---|---|
| P-TOK-01 | Token expiry: TTL forced to 60 s for the test; seek after expiry | Browser | 404, then automatic re-resolve, then playback resumes at the same position (≤ 3 attempts) |
| P-TOK-02 | Pre-emptive renewal: pause 9 min at a 10-min TTL, then press play | Browser | A new token is minted before `play()`, with no error event |
| P-TOK-03 | Space guest-code change during playback | Browser + Auto | New ranges fail within ≤ 60 s (KV propagation measured). The guest is re-prompted |
| P-TOK-04 | Library/recording access-code revocation (once W3a exists; otherwise marked N/A for the POC) | Browser | Same as P-TOK-03 |
| P-TOK-05 | Subscription suspension: move the synthetic paid Space to the Guest-suspended state (24 h failed payment, via an admin test hook on Staging) | Auto | `/api/media` refuses to mint. Outstanding tokens die by the deadline cap or epoch bump. Time to effect is measured |
| P-TOK-06 | Expired subscription / archived Space | Auto | No mint. Existing tokens die within ≤ 60 s |
| P-TOK-07 | KV unavailable (simulated by a wrong namespace binding in a test Worker version) | Auto | Fail closed: 404. Recorded, then the binding is restored |
| P-TOK-08 | Key rotation: add a new `kid`, mint with it, then drop the old one | Auto | Old tokens are valid until expiry. After the drop they return 404 |

### 3.4 Upload, provenance and integrity
| ID | Test | Method | Pass criterion |
|---|---|---|---|
| P-UPL-01 | Presigned PUT with a pinned Content-Type and length; a mismatched type or oversize body | Auto | 403 on mismatch. Whether `Content-Length` signing is enforced is recorded (02 §9 UNVERIFIED) |
| P-UPL-02 | Server-side duration measurement from R2 (range reads) for each format | Auto | Matches the existing in-repo parser results on the same files (±0.5 s) |
| P-UPL-03 | Provenance row written by `billing_audio_attach_verified` with sha256 | Auto | Row present. sha256 equals a local hash |
| P-UPL-04 | Publish copy: CopyObject, then re-hash of the published object | Auto | sha256 equal. Publish refused if it differs (planted-byte test) |
| P-UPL-05 | `media_objects` index replaces the 0046 `storage.objects` probes (AUDIO_REUPLOAD, BILLING_SPACE_HAS_MEDIA) | Auto (local DB + Staging) | Both refusals still fire with R2-only objects |
| P-UPL-06 | Over-limit file (61 min; library over 240 min) on a paid POC Space | Auto | Refused server-side and in the DB |
| P-UPL-07 | Non-audio bytes renamed `.mp3` | Auto | Refused (magic bytes) |

### 3.5 Metering (observe-only)
| ID | Test | Method | Pass criterion |
|---|---|---|---|
| P-MET-01 | Scripted ground truth: play exactly N minutes per browser (including pauses, seeks, abandon) | Browser + Device | Credited listening is within ±5% of N. Delivered bandwidth is reported separately |
| P-MET-02 | Token sharing: one token on 3 clients | Auto | Credited listening ≤ wall-clock bound. The anomaly flag fires when bytes ≫ listening |
| P-MET-03 | Forged beacon (bad token, huge `playedSeconds`) | Auto | Dropped or capped |
| P-MET-04 | Beacon blocked | Browser | Under-count recorded. The bandwidth/listening gap is visible |
| P-MET-05 | Privacy: inspect the Queue messages, `media_listen_tokens` (24 h TTL) and `media_usage_hourly` | Auto | No IP, UA or user id. Nonce stored only as a hash and deleted after 24 h |

### 3.6 Recovery (Backblaze)
| ID | Test | Method | Pass criterion |
|---|---|---|---|
| P-DR-01 | rclone R2 → B2 test bucket (Object Read-only R2 token) | Auto | Object count and sha256 manifest match |
| P-DR-02 | Delete one object in the POC bucket and restore it from B2 | Auto | Restored, sha256 equal, playable. RTO measured |
| P-DR-03 | Confirm the existing TASK 027 pipeline covers Supabase `tenant-media` audio (read-only) | Owner-assisted | Last successful sync timestamp and object count recorded |

### 3.7 Cost and performance
| ID | Test | Method | Pass criterion |
|---|---|---|---|
| P-COST-01 | Requests per listening minute per browser (Class B, Worker requests) | Measured during P-STR/P-MET | Compared with 03 assumptions (0.3/0.5/1.0). Cost model re-run |
| P-COST-02 | Worker CPU ms per request (p50/p95) | Dashboard | ≤ 5 ms p95 |
| P-COST-03 | Queue ops and Analytics Engine points per listening minute | Dashboard | Within ±50% of the 03 Design B assumptions |
| P-COST-04 | Actual Cloudflare invoice preview for the POC period | Dashboard | ≤ $10 |
| P-PERF-01 | Time to first byte and first audio, `/api/media` → Worker vs `/api/media` → Supabase, same file, 30 runs each, from 2 regions | Auto | R2 p95 TTFB ≤ Supabase p95 + 100 ms |
| P-PERF-02 | Seek latency, R2 vs Supabase | Browser | R2 ≤ Supabase + 150 ms p95 |

## 4. Teardown

POC teardown runs only after the owner reviews the report, and only with approval, because it is destructive:
- empty and delete the bucket;
- delete the Worker, KV and Queue;
- revoke the tokens;
- delete the synthetic Staging tenants with a run-scoped cleanup that asserts the Staging ref and exact counts.

Until then, the resources stay idle. The idle cost is the $5 base.

## 5. Deliverable

`docs/media/r2-audit/POC-REPORT.md`:
- every matrix row with evidence;
- the re-run cost model with measured densities;
- the TTL decision;
- the Safari/iOS findings;
- a go / no-go recommendation for W2–W6.
