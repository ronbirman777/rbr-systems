# 07 — POC delivered-bandwidth accounting and Worker CPU

TASK 032.5, controlled POC only (Worker `innerdwes-media-poc`, bucket `innerdwes-media-poc`, Workers Free).
Status: observe-only. Nothing here enforces entitlements. All numbers below are hosted Cloudflare measurements from
2026-10-12 (`test/poc-cpu.mjs`, `test/poc-hosted.mjs`) against the single synthetic 60-minute fixture
(AAC 96 kbps, 43,852,309 B).

## 1. Why this changed

The first hosted POC counted delivered bytes with a JavaScript `TransformStream` that ran once per chunk of the R2
body, which cost about 13 ms of CPU per MB delivered. Workers Free allows 10 ms of CPU per request. Once the
account's burst allowance was used up, Cloudflare terminated requests with `exceededResources`:
- all 3 full-file GETs;
- 2 of 3 8 MiB ranges;
- all interrupted streams.

## 2. Modes measured (`vars.ACCT_MODE`, server-side only)

| Mode | How | Delivered bytes: complete | Delivered bytes: client abort |
|---|---|---|---|
| old (per-chunk JS transform) | `pipeThrough(TransformStream)` | exact | exact |
| `pipe` | `r2Body.pipeTo(FixedLengthStream)`, fully native | exact | **unavailable**: low 0, high = requested |
| `chunk` | BYOB `readAtLeast` 256 KiB blocks, each written once | exact | bounded, ≤ 256 KiB in-flight block |
| **`seg` (selected)** | consecutive R2 range reads piped natively (`pipeTo`, `preventClose`); segments 2 → 4 → 8 MiB, capped at 8 MiB; next read prefetched; segments after the first use `onlyIf.etagMatches` | exact | bounded: ≤ 2 MiB in the first 2 MiB, ≤ 4 MiB up to 6 MiB, ≤ 8 MiB after that |

Worker CPU, in ms (Cloudflare `workersInvocationsAdaptive`). Each scenario ran alone in its own minute:

| Scenario | old | `pipe` | `chunk` | `seg` 2 MiB fixed | **`seg` 2→8 MiB (deployed)** |
|---|---|---|---|---|---|
| Full file GET ×3 (43.85 MB) | **killed ×3** | 2.1–3.6 | 78–89 | 12.7–15.2 | **5.5–6.8** |
| `bytes=0-1` ×10 | 1.7–2.2 | 1.7–2.4 | 2.0–2.6 | 1.7–2.6 | **1.8–2.8** |
| 64 KiB seeks ×10 | 2.9–3.5 | 1.7–2.1 | 1.9–2.2 | 1.6–1.9 | **1.6–2.0** |
| 1 MiB ranges ×10 | 13.9–26.1 | 1.8–2.4 | 3.2–3.6 | 1.8–2.6 | **1.7–2.2** |
| 8 MiB ranges ×3 | **2 of 3 killed**, else 113 | 1.6–2.4 | 12.9–20.3 | 3.3–3.8 | **3.2** |
| Open-ended range aborted after 2 MiB ×3 | **killed** | 2.2–2.8 | 7.0–9.3 | 3.1–3.7 | **3.0–3.5** |
| Full GET aborted after 20 MiB | **killed** | 2.4 | n/a | 8.5 | **4.3** |

On the deployed version (`9ba64f4d`, code `fe8b5f26`) across all 185 hosted requests: P99 5.86 ms, maximum 6.79 ms,
0 `exceededResources`.
- Each segment costs about 0.5 ms of CPU, so the worst case is a single response carrying the whole 60-minute file:
  7 segments, about 6.8 ms, 68% of the Free limit.
- A longer recording, or a lower segment cap, would raise it.

Abort accounting compared with Cloudflare's own `responseBodySize` (bytes actually sent), `seg` deployed:

| Scenario | Recorded low | Recorded high | Cloudflare sent | Client read |
|---|---|---|---|---|
| Open-ended range ×3, aborted after 2 MiB | 6.29 MB | 18.87 MB | 15.13 MB | 6.30 MB |
| Full GET aborted after 20 MiB | 14.68 MB | 23.07 MB | 22.26 MB | 20.97 MB |

The Cloudflare figure lay inside [low, high] in every measured abort (`chunk` and `seg`).

## 3. What each measurement means

| Measurement | Field | Accuracy |
|---|---|---|
| Requested bytes per response | BW `double2` | **Exact.** Equals Content-Length |
| Delivered, response completed (`blob4=complete`) | `double1` = `double4`, `double3`=1 | **Exact** |
| Delivered, client disconnected (`blob4=aborted`) | `double1` (low) .. `double4` (high), `double3`=0 | **Bounded** by one segment (§2). Low is never substituted with requested |
| Bytes the listener actually received | — | **Unavailable server-side.** The client can receive less than was sent (network buffering): in the old POC run 3.97 MB were sent for 2.0 MB read |
| Account-level bytes sent | Cloudflare GraphQL `responseBodySize` | **Exact**, but per minute/status/version, **not per tenant**. Use it to reconcile |
| Per-tenant totals from Analytics Engine | `SUM(_sample_interval * double1)` | **Estimate only** (see below) |
| Listening seconds | LISTEN dataset (Queue consumer) | **Client-reported, observe-only.** Capped per token at token lifetime + 60 s. Never derived from bytes |

"Delivered" means accepted by the Workers runtime for sending, not confirmed received.

**Analytics Engine samples, even at POC volume.**
- Of 152 BW rows written since 05:00Z, 66 were stored with `_sample_interval` 2 or 3.
- In the final hosted run, the one full-file response was stored as a single row with weight 2. The weighted sum
  (93.5 MB) therefore doubled the real total, while the raw sum (49.6 MB) matched the client's 49.5 MB.

Each stored row is exactly what the Worker wrote. Totals are statistical estimates that can be off by ×2 or more at
low volume, and rows can be dropped.

## 4. Manipulation analysis (for future entitlements)

- **Inflating another tenant's usage:** not possible without a token for that tenant's object. Tokens are
  HMAC-signed and bound to tenant + object key + kind + expiry + revocation epoch (hosted H-SEC-01..07). The
  accounting mode is a deploy-time variable checked by `scripts/guard.mjs`; no request can choose it.
- **Inflating one's own usage:** possible only by actually downloading. That is real egress and is counted as such.
- **Hiding usage by disconnecting early:**
  - With `seg`, a response is still counted to within one segment. The low bound counts only completed segments, so
    a client that always disconnects just before a segment boundary would make low under-report by up to one segment
    per response.
  - Enforcing on **high** removes that gap: high is never below what was sent. Each response also costs the client a
    Worker request, which Cloudflare's account analytics count.
  - With `pipe`, every abort is unbounded below (low = 0), so `pipe` must not be used for bandwidth entitlements.
- **Listening minutes:** client-reported beacons. A modified client can under-report; over-reporting is capped at
  token lifetime, and replays add nothing (per-token maximum). They stay observe-only and separate from bytes.
- **Analytics Engine:** sampled and best-effort (§3), so it must never be the enforcement ledger.

## 5. Recommendation (not implemented; needs separate approval)

1. Keep `seg` as the delivery path (CPU 2–7 ms on Free; exact on completion, bounded on abort).
2. Treat AE as measurement only. If bandwidth ever becomes an entitlement:
   - send each response's `{tenant, low, high, outcome}` to the existing Queue;
   - aggregate exact per-tenant daily rows in a durable store;
   - enforce on `high` and display `low`;
   - reconcile monthly against Cloudflare's account-level `responseBodySize`.
3. Before production: restrict `ALLOWED_ORIGIN`, add rate limiting, and re-measure CPU for the longest allowed
   recording.

## 6. Not verified hosted

- The `onlyIf.etagMatches` abort when an object is replaced mid-response: this would need a second upload of the
  same key, which is not approved. Code path only.
- Draft-object playback, forced Content-Type, `.html` refusal, WAV ranges and key rotation: local workerd evidence
  only (`test/poc-matrix.mjs`).
- Real browser/device playback: pending owner devices.
