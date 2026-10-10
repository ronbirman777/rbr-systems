# 02 — Vendor Research: Supabase Storage vs Cloudflare R2 (+Workers/CDN) vs Backblaze B2

Date: 2026-10-10. Research only. No accounts, resources, or code were created or changed.

Legend:
- **VERIFIED**: read on the vendor's own current page or docs at the cited URL on 2026-10-10. Pages were read through a summarizing fetch tool, so the quoted figures are faithful to those pages but have not been checked character by character.
- **VERIFIED (vendor repo)**: from the vendor's own GitHub issue or PR, not from product docs.
- **ESTIMATE**: inferred, calculated, or taken from community/third-party sources. Not vendor-confirmed.

---

## C. Pricing

### C.A Supabase Storage (Pro plan)

| Item | Value | Status | Source |
|---|---|---|---|
| Pro base fee | $25/month, includes $10/month compute credits (1 Micro project) | VERIFIED | https://supabase.com/pricing |
| Storage included | Free 1 GB; Pro 100 GB | VERIFIED | https://supabase.com/docs/guides/platform/manage-your-usage/storage-size |
| Storage overage | $0.0213 per GB-month, billed as GB-hours (average, not peak) | VERIFIED | same |
| Egress included (Pro) | 250 GB uncached + 250 GB cached, with separate quotas | VERIFIED | https://supabase.com/docs/guides/platform/manage-your-usage/egress |
| Uncached egress overage | $0.09/GB | VERIFIED | same |
| Cached egress overage | $0.03/GB ("typically incurred for storage through our Smart CDN") | VERIFIED | same |
| Smart CDN | Enabled automatically on Pro and above; metadata sync revalidates on change/delete; invalidation takes up to 60 s | VERIFIED | https://supabase.com/docs/guides/storage/cdn/smart-cdn |
| Smart CDN and signed URLs | Each distinct signed-URL token is its own cache entry. Minting a new URL per request means "the cache will never be warm and every request hits the origin" (uncached egress). Deleting the object purges the entries for all tokens. | VERIFIED | same |
| Max upload size (Pro) | 500 GB | VERIFIED | https://supabase.com/pricing |
| Image transformations | Not relevant here: 100 origin images included, then $5 per 1,000 | VERIFIED | https://supabase.com/pricing |

### C.B Cloudflare R2 Standard

| Item | Value | Status | Source |
|---|---|---|---|
| Storage | $0.015/GB-month (Infrequent Access: $0.01, 30-day minimum, $0.01/GB retrieval) | VERIFIED | https://developers.cloudflare.com/r2/pricing/ |
| Class A (writes: PutObject, CreateMultipartUpload, UploadPart, ...) | $4.50 per million | VERIFIED | same |
| Class B (reads: GetObject, HeadObject, ...) | $0.36 per million | VERIFIED | same |
| Free operations | DeleteObject, DeleteBucket, AbortMultipartUpload | VERIFIED | same |
| Free tier (Standard only) | 10 GB-month storage, 1M Class A, 10M Class B per month | VERIFIED | same |
| Egress | Free via the Workers API, S3 API and r2.dev | VERIFIED | same |
| Minimum storage duration (Standard) | None | VERIFIED | same |

### C.C R2 + Workers

| Item | Value | Status | Source |
|---|---|---|---|
| Workers Paid base fee | $5/month | VERIFIED | https://developers.cloudflare.com/workers/platform/pricing/ |
| Requests | 10M included per month, then $0.30 per million | VERIFIED | same |
| CPU time | 30M CPU-ms included per month, then $0.02 per million CPU-ms | VERIFIED | same |
| Free plan | 100,000 requests/day; 10 ms CPU per invocation | VERIFIED | same |
| R2 access from a Worker | A binding `get()` is a Class B op; a `put()` is a Class A op | ESTIMATE (follows from the op classes; not stated per binding call) | https://developers.cloudflare.com/r2/pricing/ |

### C.D R2 + Cloudflare CDN/cache

| Item | Value | Status | Source |
|---|---|---|---|
| Custom domain | The domain must be a zone in the same Cloudflare account. Attaching a custom domain makes the bucket **public**. Up to 100 custom domains per bucket. | VERIFIED | https://developers.cloudflare.com/r2/buckets/public-buckets/ ; https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/ ; https://developers.cloudflare.com/r2/reference/limits/ |
| Default caching | Only some file types are cached by default; Cache Rules control the rest. Objects over 512 MB (Free/Pro/Business) or 5 GB (Enterprise) are not cached. | VERIFIED | https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/ |
| Tiered Cache | Supported; it "reduces the number of requests that reach R2" | VERIFIED (current doc; older community posts say otherwise) | same |
| Edge cache hit → R2 Class B? | Community answers say no Class B op is charged on an edge-cache hit. No official doc page found that states this. | ESTIMATE | https://community.cloudflare.com/t/hit-on-r2-class-b-with-caching/861466 |
| Cache Reserve | $0.015/GB-month, $4.50/M writes, $0.36/M reads. A Cache Reserve hit costs one Class B op. Needs a minimum TTL of 10 h and Content-Length. "Requests to R2 public buckets linked to a zone's domain will not use Cache Reserve." | VERIFIED | https://developers.cloudflare.com/cache/advanced-configuration/cache-reserve/ |
| Worker Cache API | Free to use. The cache is local to each data center and does not replicate. | VERIFIED | https://developers.cloudflare.com/workers/runtime-apis/cache/ |

### C.E Backblaze B2 (backup / DR target only, not delivery)

| Item | Value | Status | Source |
|---|---|---|---|
| Storage | $6.95/TB-month (about $0.00695/GB); first 10 GB free | VERIFIED | https://www.backblaze.com/cloud-storage/pricing |
| Storage (conflicting figure) | The transaction-pricing page still says "$0.005/GB/month" | VERIFIED as text on the page, but conflicts with the pricing page (probably stale) | https://www.backblaze.com/cloud-storage/transaction-pricing |
| Egress | Free up to 3× average monthly stored data, then $0.01/GB | VERIFIED | https://www.backblaze.com/cloud-storage/pricing |
| CDN-partner egress | Unlimited free egress through Cloudflare, Fastly, bunny.net and others | VERIFIED | same |
| API classes | A (uploads), B (downloads), C (list/auth/copy): free. D (event-notification calls): 2,500/day free, then $0.004 per 10,000. | VERIFIED | https://www.backblaze.com/cloud-storage/transaction-pricing |
| Minimums | No minimum file size and no minimum storage-duration fees | VERIFIED | https://www.backblaze.com/cloud-storage/pricing |
| Bandwidth Alliance as a named program | Not confirmed on a current Cloudflare page; the B2 pricing page lists Cloudflare as a free-egress partner | ESTIMATE | https://www.cloudflare.com/partners/technology-partners/backblaze/ |

### C.F Worked illustration (all ESTIMATE, list prices, excludes tax and base fees)

Assumptions: 100 GB stored; 1 TB delivered per month; about 1M media requests per month (roughly 1 MB average Range response).

| Path | Storage | Delivery | Ops / compute | ≈ Variable total |
|---|---|---|---|---|
| Supabase Pro, all cache hits | $0 (in 100 GB) | 750 GB × $0.03 = $22.50 | n/a | ~$22.50 + $25 base |
| Supabase Pro, all uncached (fresh token per request) | $0 | 750 GB × $0.09 = $67.50 | n/a | ~$67.50 + $25 base |
| R2 behind a Worker (no edge cache) | 90 GB × $0.015 = $1.35 | $0 | 1M Class B and 1M Worker requests, both inside the included 10M | ~$1.35 + $5 Workers base |
| B2 backup copy | 0.09 TB × $6.95 ≈ $0.63 | not used for delivery | free classes | ~$0.63 |

---

## D. Security capabilities

| Capability | Facts | Status | Source |
|---|---|---|---|
| Private by default | "By default, buckets are never publicly accessible." The r2.dev development URL can be disabled (type `disallow`). | VERIFIED | https://developers.cloudflare.com/r2/buckets/public-buckets/ |
| r2.dev | Rate-limited (429 beyond "hundreds of requests/second"), for development only, no cache/WAF/bot management | VERIFIED | https://developers.cloudflare.com/r2/reference/limits/ ; https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/ |
| Presigned URLs: signing | AWS SigV4, generated server-side from R2 API credentials | VERIFIED | https://developers.cloudflare.com/r2/api/s3/presigned-urls/ |
| Presigned URLs: max expiry | 1 s to 7 days (604,800 s) | VERIFIED | same |
| Presigned URLs: scope | "A single S3 operation on a single object" (GET, HEAD, PUT or DELETE; no POST) | VERIFIED | same |
| Presigned URLs: replay | "The same presigned URL can be reused multiple times until it expires." Treat it as a bearer token; it is not bound to a user, device or IP. | VERIFIED | same |
| Presigned URLs: domain | S3 API domain only; "cannot be used with custom domains" | VERIFIED | same |
| Presigned PUT Content-Type pinning | A Content-Type included in the signature makes mismatched uploads fail with 403 | VERIFIED | same |
| Worker as auth gateway | With a binding, "every incoming request has the ability to interact with your bucket." Authorization logic must be written in the Worker. The bucket itself needs no public exposure. | VERIFIED | https://developers.cloudflare.com/r2/api/workers/workers-api-usage/ |
| Validating our own HMAC/JWT in a Worker | Technically straightforward (WebCrypto is available in the Workers runtime); no specific vendor page cited | ESTIMATE | — |
| Custom domain + WAF/Access | Custom domains unlock WAF custom rules, Zero Trust Access and Bot Management. Not available on r2.dev. | VERIFIED | https://developers.cloudflare.com/r2/buckets/public-buckets/ |
| Custom domain caveat | A custom domain makes the bucket publicly reachable at that hostname. For private media, avoid a custom domain directly on the bucket and put a Worker route in front instead. | VERIFIED (public) / ESTIMATE (recommendation) | https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/ |
| Cache API rules | Local to one data center. `cache.put` rejects 206 responses and responses with `Set-Cookie`, and only GET is cacheable. `cache.match` can answer a Range request with 206 from a stored full 200 that has Content-Length. stale-while-revalidate is not supported. | VERIFIED | https://developers.cloudflare.com/workers/runtime-apis/cache/ |
| Cache-key isolation for private content | The Cache API key is whatever URL or Request the Worker chooses. Keying by object (not by token) lets a cache hit skip R2, but the token **must be validated before** `cache.match`, or authorization is bypassed. Never let a token-bearing URL be cached by the zone's normal CDN. Send `Cache-Control: private, no-store` to the browser. The Worker Cache API is separate from those browser headers (Worker code can store under its own key). | ESTIMATE (design inference from the above) | — |
| CORS | Per-bucket JSON (AllowedOrigins/Methods/Headers, ExposeHeaders, MaxAgeSeconds). Applies to custom domains and r2.dev, and is needed for browser use of presigned URLs. For Worker-served responses, the Worker sets its own CORS headers. | VERIFIED (bucket CORS) / ESTIMATE (Worker) | https://developers.cloudflare.com/r2/buckets/cors/ |
| R2 API tokens | Admin R/W, Admin RO, Object R/W, Object RO. Object tokens can be scoped to "a set of buckets." Account or user tokens. The secret is shown once. | VERIFIED | https://developers.cloudflare.com/r2/api/tokens/ |
| Workers secrets | Not visible in the dashboard or Wrangler after they are set. Set with `wrangler secret put`; one set per environment. Account-level Secrets Store is in beta. | VERIFIED | https://developers.cloudflare.com/workers/configuration/secrets/ |
| Supabase signed URLs | Token in the query string, valid until expiry, and "signed with a dedicated internal key" separate from the Auth JWT key | VERIFIED | https://supabase.com/docs/guides/storage/serving/downloads |

---

## E. Streaming (HTTP Range, conditionals, Safari)

| Topic | Facts | Status | Source |
|---|---|---|---|
| R2 binding range read | `get(key, { range })` takes offset/length, length only, or suffix; it also accepts a `Headers` object | VERIFIED | https://developers.cloudflare.com/r2/api/workers/workers-api-reference/ |
| R2 conditionals | `onlyIf` supports etagMatches/DoesNotMatch and uploadedBefore/After, or standard conditional headers (**If-Range not supported**). On a failed precondition it returns an R2Object with `body` undefined, not null. | VERIFIED | same |
| ETag | `httpEtag` (quoted, ready for HTTP); `writeHttpMetadata()` copies the stored Content-Type and Cache-Control | VERIFIED | same |
| 206 from a Worker | The official example returns **200 even for ranged reads** and does not set Content-Range or Accept-Ranges. The Worker must set 206, `Content-Range: bytes start-end/size` (from `object.range` and `object.size`) and `Accept-Ranges: bytes` itself. | VERIFIED (example code) / ESTIMATE (fix) | https://developers.cloudflare.com/r2/api/workers/workers-api-usage/ |
| Safari/iOS | iOS media servers "must support byte-range requests". Safari probes with small ranges (for example `bytes=0-1`) and expects a correct 206 plus Content-Range. | VERIFIED (requirement) / ESTIMATE (probe detail) | https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/CreatingVideoforSafarioniPhone/CreatingVideoforSafarioniPhone.html |
| Response size | No enforced limit on Worker response bodies (but the CDN cache limit is 512 MB on non-Enterprise plans) | VERIFIED | https://developers.cloudflare.com/workers/platform/limits/ |
| Duration vs CPU | No hard wall-clock limit while the client stays connected. Streaming time does not count as CPU. Paid CPU defaults to 30 s and can be raised to 5 min. Memory is 128 MB per isolate, so stream bodies and do not buffer them. | VERIFIED | same |
| Request body (uploads through a Worker) | 100 MB on Free/Pro zones, 200 MB Business, up to 5 GB Enterprise | VERIFIED | same |
| R2 object limits | 4.995 TiB per object; single-part upload 4.995 GiB; 1 write/s to the same key | VERIFIED | https://developers.cloudflare.com/r2/reference/limits/ |
| Token expiry mid-playback | Each Range request is a new HTTP request, so a Worker re-checks the token on every request. A token that expires mid-playback causes 401/403 on the next range unless the TTL covers the session or the player refreshes it. | ESTIMATE (follows from HTTP semantics) | — |
| Simultaneous playback | No R2 or Worker limit stated per object for reads (the 1/s limit is for writes to one key). Concurrency limits are left to our own token policy. | ESTIMATE | https://developers.cloudflare.com/r2/reference/limits/ |
| Supabase signed URL Range | Range reads return 206 + Content-Range. Recent fixes: case-insensitive `bytes` unit (#1475/#1476) and If-Match forwarding (#1466/#1467). Open issue (2026-10-08): S3 GetObject omits `Accept-Ranges` (#1489). | VERIFIED (vendor repo) | https://github.com/supabase/storage/issues/1489 ; https://github.com/supabase/storage/issues/1466 |
| Supabase signed URL TTL | `expiresIn` is in seconds. The docs give no maximum. One third-party source claims 7 days. | VERIFIED (units) / ESTIMATE (max) | https://supabase.com/docs/guides/storage/serving/downloads |

---

## F. Metering-relevant facts and privacy

| Topic | Facts | Status | Source |
|---|---|---|---|
| Counting bytes served | Pipe `object.body` through a TransformStream that adds up chunk lengths, then record the total in `ctx.waitUntil()`. waitUntil gets at most 30 s after the response ends or the client disconnects (shared by all calls in the request); overruns are cancelled. For durable writes, Cloudflare recommends Queues. | VERIFIED (waitUntil) / ESTIMATE (byte-count pattern; the TransformStream doc does not describe it) | https://developers.cloudflare.com/workers/runtime-apis/context/ ; https://developers.cloudflare.com/workers/runtime-apis/streams/transformstream/ |
| Analytics Engine | Paid plan: 10M data points written/month, then $0.25/M; 1M reads, then $1.00/M. **Billing not yet active.** | VERIFIED | https://developers.cloudflare.com/analytics/analytics-engine/pricing/ |
| KV | Writes: 1M included, then $5.00/M; reads 10M included, then $0.50/M; 1 GB stored, then $0.50/GB-month. Poor fit for counters. | VERIFIED (price) / ESTIMATE (fit) | https://developers.cloudflare.com/workers/platform/pricing/ |
| D1 | Rows written: 50M included, then $1.00/M; rows read: 25B included; storage 5 GB, then $0.75/GB-month | VERIFIED | same |
| Durable Objects | Requests: 1M, then $0.15/M; duration: 400k GB-s, then $12.50/M GB-s; SQLite writes 50M included, then $1.00/M | VERIFIED | same |
| R2 op counting | GraphQL `r2OperationsAdaptiveGroups` (actionType, bucketName, objectName, status); `r2BandwidthUsageAdaptiveGroups` (bytesDownload; **excludes transfers <100 KiB**); 31-day max query range | VERIFIED | https://developers.cloudflare.com/r2/platform/metrics-analytics/ |
| Supabase metering writes | Just Postgres rows; no per-write fee beyond compute and disk (8 GB included, then $0.125/GB) | VERIFIED (disk price) / ESTIMATE (no per-write fee) | https://supabase.com/pricing |
| Client IP visible to the Worker | `CF-Connecting-IP` carries the client IP. Workers can read request headers. **Do not store it.** Workers Logs record request metadata by default, so set head sampling or avoid logging headers. | VERIFIED (header) / ESTIMATE (logging detail) | https://developers.cloudflare.com/fundamentals/reference/http-headers/ ; https://developers.cloudflare.com/workers/observability/logs/workers-logs/ |
| Workers Logs retention | Free 3 days, Paid 7 days. 20M events/month included, then $0.60/M. On by default for new Workers; head sampling 0–1. | VERIFIED | https://developers.cloudflare.com/workers/observability/logs/workers-logs/ |
| Workers metrics retention | Up to 3 months back, in 1-week windows | VERIFIED | https://developers.cloudflare.com/workers/observability/metrics-and-analytics/ |

---

## H. Backblaze DR

| Topic | Facts | Status | Source |
|---|---|---|---|
| Object Lock | Governance mode (can be overridden by authorized keys) or compliance mode (immutable); legal hold works separately. Can be enabled on existing buckets but **cannot be disabled** once on. Retention 1–3,000 days. Locked files block lifecycle deletes. Works on S3 and Native APIs. | VERIFIED | https://www.backblaze.com/docs/cloud-storage-object-lock |
| Versioning | All versions kept by default; replaced files are "hidden" | VERIFIED | https://www.backblaze.com/docs/cloud-storage-file-versions |
| Lifecycle rules | fileNamePrefix, daysFromUploadingToHiding, daysFromHidingToDeleting, daysFromStartingToCancelingUnfinishedLargeFiles | VERIFIED | https://www.backblaze.com/docs/cloud-storage-lifecycle-rules |
| Encryption | SSE-B2 (Backblaze-managed AES-256, can be the bucket default) or SSE-C (customer key; lost key means unrecoverable data). No extra cost. SSE files cannot be downloaded from the web Browse page. | VERIFIED | https://www.backblaze.com/docs/cloud-storage-server-side-encryption |
| B2 Cloud Replication | **B2→B2 only** (cannot pull from R2). Cross-region needs a separate account. No replication fee. Existing files replicate daily at 00:00 UTC. SSE-C not supported. Object Lock is required on the destination if the source has it. Hide markers are not replicated. | VERIFIED | https://www.backblaze.com/b2/docs/replication.html |
| R2 → B2 sync | rclone (s3, provider=Cloudflare, `acl=private`, `no_check_bucket=true` for object-scoped tokens, v1.59 or later). Reading R2 costs Class B ops, R2 egress is free, and B2 Class A uploads are free. | VERIFIED (rclone config) / ESTIMATE (cost chain) | https://developers.cloudflare.com/r2/examples/rclone/ |
| Migration INTO R2 | Super Slurper (bulk; S3, GCS, R2, S3-compatible; B2 tested; skips objects >1 TB). Sippy (on-demand copy on read; S3, GCS, Azure, S3-compatible). Pricing for either was not stated on the pages read. | VERIFIED | https://developers.cloudflare.com/r2/data-migration/super-slurper/ ; https://developers.cloudflare.com/r2/data-migration/sippy/ |
| Restore verification | Not a vendor feature. Do it ourselves: `rclone check` (size and hash) or periodic test restores against a checksum manifest. | ESTIMATE | — |

---

## K. Monitoring and spend controls

| Vendor | Facts | Status | Source |
|---|---|---|---|
| Cloudflare budget alerts | Pay-as-you-go accounts. Emails when **account-wide usage-based** spend crosses a $ threshold. **Informational only, no cap.** Excludes subscription fees such as the $5 Workers base. A changelog says it is on by default with a $10 threshold since 2026-06-15; the docs page does not mention a default. | VERIFIED (docs) / VERIFIED (changelog, default) | https://developers.cloudflare.com/billing/manage/budget-alerts/ ; https://developers.cloudflare.com/changelog/post/2026-06-15-budget-alerts-default-on/ |
| Cloudflare Usage Based Billing notification | Pro plan and above, Pay-as-you-go; per-product thresholds. Whether R2 and Workers are among the selectable products was not confirmed. | VERIFIED (exists) / unconfirmed (R2/Workers coverage) | https://developers.cloudflare.com/notifications/notification-available/ |
| Cloudflare hard spend cap | None found for R2/Workers | ESTIMATE | — |
| Cloudflare GraphQL | R2 datasets as in F (31-day range); Workers metrics up to 3 months | VERIFIED | https://developers.cloudflare.com/r2/platform/metrics-analytics/ |
| Supabase spend cap | Pro only. Covers Egress, Storage Size, Disk, MAU, Realtime and other items; when hit, "further usage of that item is disallowed until the next billing cycle." Excludes Compute, PITR, custom domain, IPv4 and others. No fine-grained budgets or threshold alerts. Over-quota notices go to the billing email. | VERIFIED | https://supabase.com/docs/guides/platform/cost-control ; https://supabase.com/docs/guides/platform/billing-faq |
| Backblaze caps and alerts | Daily $ caps on storage and Class A/B/C transactions (Class D cannot be capped). Alerts at 75% and 100%. Reset at 00:00 GMT. Unlimited if no cap is set. | VERIFIED | https://www.backblaze.com/docs/cloud-storage-data-caps-and-alerts |

---

## Facts that could not be verified from an official vendor page

1. Whether an **edge-cache hit on an R2 custom domain avoids a Class B op**. Only community answers say so; Cache Reserve hits are documented as costing one Class B.
2. **Maximum `expiresIn` for Supabase signed URLs**. Not in the Supabase docs; a third-party source claims 7 days.
3. Whether the Supabase **REST signed-URL path always returns `Accept-Ranges: bytes`**. The open issue #1489 covers only the S3 GetObject path.
4. **Super Slurper and Sippy pricing** (and any R2 Class A charges during migration). Not stated on the pages read.
5. Whether R2 and Workers can be selected in the Cloudflare **Usage Based Billing notification**, and the full product list.
6. Whether any **hard spend cap** exists for R2 or Workers (none found).
7. **Retention of Cloudflare HTTP request logs** outside Workers Logs (Logpush/Log Explorer) for non-Enterprise plans.
8. Exact **Workers GraphQL dataset names and fields** (for example per-invocation response bytes). The metrics page links to a tutorial that was not read.
9. **Bandwidth Alliance** as a still-active named program. The B2 pricing page does list Cloudflare as a free-egress partner.
10. **B2 storage price inconsistency**: $6.95/TB on the pricing page vs $0.005/GB on the transaction page. The pricing page is assumed to be current.
11. The exact list of headers that Workers Logs record (whether `CF-Connecting-IP` is captured by default).
12. Safari's exact probe sequence (`bytes=0-1`). The Apple doc states only that byte-range support is required.
