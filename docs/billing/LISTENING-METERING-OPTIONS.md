# Listening minutes: metering options (analysis only)

**Status: the listening allowance is NOT enforced and NOT metered.** Nothing in the application or the database counts minutes listened, and nothing limits playback. The per-Space figure (100,000 minutes / month, +70,000 per `audio_pack` add-on, see `ENTITLEMENTS.md`) is display-only. It must not be advertised as metered, and no guest may be blocked because of it. This document compares ways to measure it later. It is not a design commitment and nothing here is implemented.

## Constraints any option must meet

- **No listener identity.** No accounts, cookies, device ids, fingerprints, IP addresses or user agents stored, and no cross-Space or cross-session linking. Metering is per Space (and per track at most), aggregated per month.
- **A stranger must not be able to switch a Space off.** The media route is anonymous. Any counter that a third party can inflate must never gate playback, or it becomes a denial-of-service lever against an organizer.
- **The current playback path.** `/api/media/[...path]` authorizes the request (published snapshot + guest access) and answers with a 302 to a short-lived signed Storage URL. The audio bytes, including every Range/seek request, go from Storage to the browser and never pass through the app. A public Space's media answer is cacheable for 60 s at the CDN, so origin hits undercount.
- **Cost and hot path.** Audio is long-running. Anything per second or per byte on the request path is expensive on Vercel.

## Options

Scores are 1 (poor) to 5 (good). For cost and complexity, 5 means cheap / simple.

| # | Option | Privacy | Abuse resistance | Accuracy | Cost | Complexity |
|---|---|---|---|---|---|---|
| A | Storage / CDN egress-log aggregation | 4 | 3 | 2 | 4 | 3 |
| B | Count signed-URL issuances in `/api/media` | 5 | 1 | 1 | 5 | 5 |
| C | Cookieless client progress beacons, server rate-limited per Space | 4 | 2 | 4 | 3 | 3 |
| D | Server-proxied streaming with byte accounting | 3 | 4 | 4 | 1 | 1 |
| E | HMAC per-play tokens (no identity) + progress beacons | 5 | 4 | 4 | 3 | 2 |

### A. Storage / CDN egress-log aggregation

A daily job reads Storage access logs, keeps only `(object path, bytes served, day)`, maps the path to its tenant (the first path segment) and converts bytes to minutes using the track's measured duration and size (bytes per second).

- Privacy: good if the job reads only path and byte columns and stores only per-tenant daily totals. The raw logs still contain IPs/user agents inside Supabase under its retention policy. We would not copy them, but we cannot claim that they do not exist.
- Abuse: anyone holding a fresh signed URL can download repeatedly and inflate a Space's count. Bounded by the URL's short life and the guest-access check, but not prevented.
- Accuracy: weak. Bytes are not minutes: preloading, seeking, partial Range requests, retries and CDN cache hits all distort the figure. Edge hits may not appear in origin logs at all.
- Cost: low (one batch job). Complexity: medium, and it depends on log availability and retention on our Supabase plan. This is **not verified**, and Log Explorer/API access is plan-dependent.
- Best use: an independent cross-check of another method, not the meter.

### B. Count signed-URL issuances

Increment a per-Space counter every time `/api/media` returns an audio redirect.

- Privacy: excellent (nothing about the caller).
- Abuse: worst. A `curl` loop inflates it freely, and the counter sits on the anonymous hot path.
- Accuracy: worst. One redirect is not a number of minutes. A track is fetched once per play or per URL expiry, and CDN caching hides repeats.
- Verdict: rejected. Useful only as a coarse "plays started" vanity number, and never for limits.

### C. Cookieless progress beacons, rate-limited per Space

The guest player sends `navigator.sendBeacon` once per minute of actual playback: `{ tenant, published object path, minute index }`. There is no cookie and no identifier. The server validates the object against the current published snapshot and the Space's guest access, then adds one minute to `space_listening_usage(tenant, month)`. A per-Space ceiling (for example "at most N minutes credited per wall-clock minute") bounds inflation.

- Privacy: good. The server sees the request's IP transiently, as it does for every request, but stores nothing about it.
- Abuse: weak on its own. Beacons are forgeable, so anyone can credit minutes up to the per-Space ceiling. The ceiling makes the damage finite but not zero.
- Accuracy: good for honest clients (it measures real listening, not bytes). Missed beacons (tab killed, offline) undercount slightly.
- Cost: one small write per listener-minute (about 100k/month for a Space at its allowance). That can be batched. Complexity: medium.

### D. Server-proxied streaming with byte accounting

Serve audio through an app route that streams from Storage, supports Range requests, and counts bytes per Space.

- Privacy: acceptable. The app sees transient request metadata, stores none.
- Abuse: good. Bytes really served are what is counted, and a download costs the downloader bandwidth too. Still inflatable by repeated downloads, but each one is real egress.
- Accuracy: good after converting bytes to minutes with the measured bitrate. Seeking and preloading still blur it.
- Cost: worst. Every listening second becomes Vercel function time and egress, 100 MB files stream through serverless functions, and latency rises. Complexity: high (Range, caching, timeouts, resumption).
- Verdict: rejected on cost unless audio moves to a dedicated streaming service.

### E. HMAC per-play tokens without identity, plus beacons (recommended)

When `/api/media` authorizes an audio request (snapshot + guest access, unchanged), it also returns a play token: `HMAC(server secret, tenant | object | random nonce | expiry)`. The token is random per play and carries no listener information. It is not stored, and it expires (for example after track duration + 30 min). The player's once-a-minute beacons carry the token. The server:

1. verifies the HMAC and expiry (stateless);
2. credits at most `ceil(track duration)` minutes per token, and at most one minute per real minute of token age, tracked in a short-lived per-token counter keyed only by the nonce and discarded at expiry;
3. caps tokens minted per Space per minute (a concurrency ceiling, not per listener);
4. adds credited minutes to `space_listening_usage(tenant, month)` through a `service_role`-only `SECURITY DEFINER` function.

- Privacy: excellent. No identity, no cookie, no IP/UA storage. The nonce exists only until the token expires and links nothing across plays.
- Abuse: good. Minutes cannot be credited without a token the server minted after an authorized media request. Each token is bounded by track length and wall-clock time, and minting is capped per Space. Inflation needs sustained, real-time effort and stays below the per-Space ceiling.
- Accuracy: good for honest clients (real listening minutes). It slightly undercounts lost beacons and never overcounts beyond track length.
- Cost: medium (one write per credited minute, batchable; a small ephemeral nonce store, e.g. a TTL table purged by the existing billing cron). Complexity: medium-high, with a secret, a token format, beacon endpoint, cap logic, a migration and player changes.

## Recommendation

1. **Measure with E** (HMAC per-play tokens + cookieless beacons), with per-Space rate ceilings. It is the only option that is privacy-clean, reasonably accurate and hard to inflate without making playback pass through the app.
2. **Cross-check with A** if Supabase log access on our plan allows it. Compare monthly per-Space totals and investigate large divergences. Do not bill or limit from A.
3. **Enforce softly, and only after proof.** Run the meter on Staging, then Production in observe-only mode, until it is shown accurate against controlled listening. After that, owner-facing banners/emails at 80% / 100% only. Never hard-block guests without an explicit product decision. A counter that a stranger can push, even within bounds, must never be able to stop a paying organizer's guests from listening.
4. Rejected: B (trivially inflatable, meaningless) and D (cost).

None of the recommended pieces stores a persistent listener identifier, IP address or user agent.

## Until then

- The listening allowance is not enforced and must be described as "included" or "fair use", never as metered.
- `ENTITLEMENTS.md` lists it as a launch blocker for any plan that promises a metered listening limit.
