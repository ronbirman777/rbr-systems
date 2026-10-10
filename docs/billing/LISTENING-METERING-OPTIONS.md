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

---

# Verification of the recommended approach (E + A cross-check)

**Status: design verification only. Nothing below is implemented, migrated or deployed.** Figures marked *assumption* must be confirmed (Staging measurements, plan pages, legal review) before Phase 1 starts. Written 2026-10-10 against branch `feat/032-commercial-platform-foundation`.

## V0. Corrections to option E found while verifying

1. **The token cannot ride on the `/api/media` redirect.** The `<audio>` element follows the 302 itself; page JavaScript never sees that response's headers or body. And a public Space's published-media answer is `Cache-Control: public, max-age=60, immutable` (`PUBLISHED_MEDIA_CACHE_SECONDS`), so anything embedded in it would be shared by every listener behind the same CDN entry for 60 s. **Tokens must be minted by a separate, uncacheable request**: `POST /api/media/play` (`Cache-Control: private, no-store`), which re-runs the exact authorization `/api/media` uses (published snapshot references the object + `resolveGuestAccess`), through one shared function so the two can never drift.
2. **Signed audio URLs live 60 s** (`MEDIA_SIGNED_URL_TTL_SECONDS`). Long tracks and late seeks can make the player re-request `/api/media`. Token lifetime must therefore be independent of the signed URL and long enough for the whole play (below). Re-fetching media must not mint a new token: one token per *play intent* (user presses play on a track), not per HTTP request.
3. **Beacons should carry a cumulative counter, not "one more minute".** With `{ token, seq, playedSeconds }` (cumulative for this token), a lost beacon is recovered by the next one and a replayed beacon credits nothing. Only the tail after the last delivered beacon can be lost.
4. **Per-token cap.** Option E said "at most ceil(track duration) minutes per token". Re-listening a section is real listening, so the cap is `ceil(duration) + 2` minutes; when it is reached (loop, replay) the player mints a new token, which is subject to the per-Space mint cap.

## V1. Protocol under review

```
mint    POST /api/media/play      { tenant, objectPath }                    -> { token } | 404 (same bare 404 as /api/media)
credit  POST /api/media/progress  { token, seq, playedSeconds }  (sendBeacon / fetch keepalive)  -> 204 always
token = base64url( v | kid | tenantId | sha256(objectPath)[0..16] | nonce(128-bit random) | iat | exp | capSeconds ) + "." + HMAC-SHA256(key[kid], payload)
exp   = iat + duration + 30 min, never more than 6 h
```

Server on credit: verify HMAC and `exp` (no DB hit when invalid) -> one atomic statement on the nonce row:
`credited = least(cap, playedSeconds, (now - iat) + 60)`, applied only if `seq > last_seq` and `credited > credited_seconds`; the difference is added to the Space's monthly total. The response is always `204` so a forger learns nothing.

`playedSeconds` is **wall-clock time while actually playing** (sum of `timeupdate` intervals with `!paused`, each clamped to the real elapsed time), not media position. Seeking forward adds nothing; 2x speed counts real minutes listened.

## V2. Threat model

Assets: integrity of each Space's listening total (both directions), listener privacy, our infrastructure cost, and organizers' guests' ability to play (availability).

| # | Scenario | Actor | Mitigation | Residual risk |
|---|---|---|---|---|
| T1 | **Inflation to exhaust an organizer's allowance** (script mints tokens and sends beacons) | Stranger with the public link, or anyone holding a shared guest code | Mint requires the same authorization as playback (code cookie for code-protected Spaces). Credit per token is bounded by `cap` and by token age (`now - iat + 60 s`), so a token cannot credit faster than real time. Per-Space **mint cap** (proposal: 30 tokens / minute, burst 60) and per-Space **credit ceiling** (proposal: 120 credited minutes per wall-clock minute). Minutes credited while a Space is at its ceiling are recorded as `suspect_seconds`, not as usage. **The meter never gates playback** and drives only owner notices after a human-reviewed go decision. | For a public Space, an attacker running ~120 parallel real-time tokens could add ~172,800 minutes/day of *suspect* usage. That is why the ceiling feeds a separate suspect bucket, Admin sees ceiling-hit alerts, and no limit is ever enforced on guests. Within the ceiling (e.g. 20 fake parallel listeners), inflation is indistinguishable from real listening; residual, accepted, bounded by real time and visible in the egress cross-check (fake beacons produce no egress). |
| T2 | **Deflation** to avoid overage | Organizer | The organizer does not control the Guest App player or the endpoints. Possible routes: telling guests to download files (signed URL directly, no beacons), or linking audio hosted elsewhere (out of scope: not our cost). | Downloads undercount. Detected by A: Storage egress bytes per Space far above `credited minutes x bytes-per-minute` -> flag for review. Accepted: allowance is fair-use. |
| T3 | **Replay** of a captured beacon or token | Anyone on-path or with devtools | Cumulative counter + `seq` monotonic per nonce: a replayed beacon credits 0. Expired tokens fail HMAC/exp check. Token binds tenant + object hash, so it cannot credit another Space. Sharing one token across many clients cannot exceed one real-time stream (age bound). HTTPS only. | None beyond T1. |
| T4 | **Bot / crawler traffic** | Search engines, link-preview bots, uptime checkers | Minting is a JS-initiated `POST` after a user play gesture, never a link-prefetchable `GET`; crawlers that fetch `/api/media` audio get bytes but no token, so they are never counted. Optional: transient User-Agent screen for declared bots at mint time (UA read, never stored). | Headless browsers that really "play" are T1. |
| T5 | **CDN caching** distorting counts | - | Mint and progress are `POST` + `no-store` (never cached). Audio bytes cached at the Storage CDN do not affect E. They do make A (origin egress logs) undercount, which is why A is a cross-check only. | A's numbers are a lower bound. |
| T6 | **Request flood against the endpoints** (cost attack, not counting) | Anyone | Invalid tokens rejected by HMAC before any DB call; per-Space mint cap; Vercel Firewall rate-limit rule on the two paths (transient, platform-level, nothing stored by us). Beacon endpoint does at most one DB statement. | Invocation cost of a flood until the firewall rule trips (see V3 unit costs). |
| T7 | **Secret compromise** | Insider / leak | `kid` in token, two active keys, rotation runbook; secret only in Vercel env (never `NEXT_PUBLIC_*`), separate per environment (Staging/Production). A leaked key lets an attacker forge tokens without the mint cap -> T1 without the cap, still bounded by the credit ceiling. | Until rotation, credit ceiling only. |
| T8 | **Races** (two beacons concurrently, two tabs) | Honest clients | Single atomic `UPDATE ... WHERE nonce = $1 AND seq < $2 ... RETURNING delta`; monthly total updated in the same transaction (or rolled up by cron, V3). Each tab has its own token. | None. |
| T9 | **Cross-Space linking / tracking** | Us, a processor, a subpoena | No identifier exists to link (V5). | None by design. |

## V3. Cost estimate

**Assumptions** (all to be measured on Staging): average play session 20 min; beacons every 60 s of playback plus one on pause/ended/pagehide; audio average 96 kbit/s (~0.72 MB per minute; real figure = measured bytes / measured duration per track); each endpoint call ~30-60 ms of function time; one Postgres statement per call.

Per **100,000 listening minutes**:

| Item | Unbatched (beacon every 60 s) | Batched (client sends every 5 min + on pause/pagehide) |
|---|---|---|
| Plays (mint calls) | ~5,000 | ~5,000 |
| Progress calls | ~100,000 + ~5,000 tail = ~105,000 | ~20,000 + ~5,000 = ~25,000 |
| **Vercel function invocations** | **~110,000** | **~30,000** |
| Function time (at ~50 ms) | ~1.5 h | ~0.4 h |
| DB statements (nonce insert / update) | ~5,000 inserts + ~105,000 updates | ~5,000 + ~25,000 |
| Monthly-total writes | rolled up by the existing 15-min billing cron: <= 2,880 upserts per active Space-month (independent of minutes) | same |
| Persistent row growth | `space_listening_usage`: **1 row per Space per month** (12 per Space per year) | same |
| Transient rows | nonce table: rows = plays within expiry window; average concurrency at 100k min/month ~2.3 listeners, peak assumed 50x -> ~150 rows; purged by cron <= 24 h after `exp` (~5,000 dead rows/month per 100k minutes, vacuumed) | same |
| Storage egress (not caused by metering, shown for the A cross-check) | ~72 GB at 96 kbit/s | same |

Notes: the batched variant loses up to 5 min of tail per session if the last beacon is lost (V4), so batching trades accuracy for ~4x fewer invocations; recommended start is 60 s on Staging, then measure. Vercel pricing/limits for invocations and active CPU are plan-dependent and were **not** re-verified for this document (*assumption*: well inside an included monthly allowance at these volumes for a launch-size customer base; re-check on the current plan page before Phase 2). Each updated nonce row should only change non-indexed columns so updates stay HOT.

## V4. Accuracy analysis

Ground truth = real minutes a listener spent with audio playing.

| Effect | Direction | Expected size | Handling |
|---|---|---|---|
| Lost final beacon (tab closed, app killed) | under | <= 60 s per affected session (<= 5 min batched). *Assumption*: 5-15% of sessions lose the final beacon on mobile -> ~0.3-1.3% of minutes at 20-min sessions | `pagehide` + `visibilitychange:hidden` send via `sendBeacon`; cumulative counter means only the tail can be lost |
| Lost intermediate beacons (flaky network) | none | recovered by the next beacon (cumulative) | - |
| Offline mid-play (buffered audio keeps playing) | under only if the token expires first | small: token lives duration + 30 min | resend cumulative value when back online |
| Fully offline / downloaded playback | under | 100% of those minutes | not countable without tracking; covered by A cross-check |
| Seeking forward | none | wall-clock based | - |
| Seeking back / re-listening | counted (real listening) | - | token cap = duration + 2 min, then a new token |
| Background tab timers throttled (Chrome intensive throttling, ~1 timer/min after minutes hidden) | none | `playedSeconds` is computed from `timeupdate`/media time deltas, not from counting timer ticks | send on visibility change |
| iOS lock screen / background: audio continues, JS may be suspended | under, if the page is never foregrounded again before `exp` | *unknown - must be measured*; potentially the largest error source for meditation-style listening | cumulative value sent on resume/pagehide; extend `exp` to duration + 30 min; measure in Phase 4 |
| Playback rate > 1 | none (wall-clock) | - | product decision documented |
| Muted playback | over | unknowable, assumed rare | accepted |
| Overcount by honest clients | - | 0 beyond rounding (credit <= age + 60 s, <= cap) | - |

**Expected band for honest traffic: -0.5% to -3% overall** on desktop and Android (dominated by lost tails), with iOS background listening as an open unknown that could reach -10% or more for those sessions until measured. Never systematically over. **Acceptance target for Phase 4:** within ±5% of ground truth per scripted scenario and within -5%/+1% aggregated, on every browser in the matrix.

## V5. Privacy review

- **No persistent identifiers.** The token holds tenant id, an object-path hash, a random per-play nonce, timestamps and a cap. It lives only in the player's memory: no cookie, no `localStorage`/IndexedDB, nothing written to the device (relevant to ePrivacy art. 5(3)).
- **Stored by us:** (a) nonce row `(nonce, tenant_id, object_hash, cap_seconds, credited_seconds, last_seq, expires_at)`, deleted by the billing cron within 24 h after `expires_at`; (b) `space_listening_usage (tenant_id, month, seconds, suspect_seconds)`. **No IP address, user agent, referrer, guest code, cookie value, geolocation or per-listener timestamp** is stored. The nonce cannot be linked to a person or to another play.
- **Token lifetime:** `duration + 30 min`, hard maximum 6 h. Keys rotated with `kid`; old key accepted only until its tokens expire.
- **Logs:** our code must never log the token, nonce, `playedSeconds` per request, IP or UA (add a test that the two routes do not call `console.*` with request data). Vercel request logs and Supabase API logs inherently contain IP/UA for the platform's own plan-dependent retention; we do not export or copy them. The privacy notice should say that hosting providers keep transient technical logs. For option A we read only `path`, `bytes`, `day` columns and store only per-Space daily byte totals.
- **Legal (needs review, not decided here):** whether audience metering for the organizer's plan qualifies as strictly necessary, and whether aggregated per-Space minutes are personal data of the organizer (likely yes, as billing data of the account holder; not of listeners).

## V6. Implementation plan (future; requires its own task)

| Phase | Scope | Exit criteria |
|---|---|---|
| 0. Decisions | Product: unit (wall-clock playing time), "never hard-block guests", cap/ceiling values. Verify Supabase log access for A on our plan; verify Vercel invocation/CPU pricing; legal review of V5 | Written decisions in this doc |
| 1. Schema | New forward-only migration (number assigned at the time): nonce table + usage table, RLS deny-all, `service_role`-only `SECURITY DEFINER` functions `listening_mint`, `listening_credit`, `listening_rollup`, `listening_purge`; owner `SELECT` on own usage only. Local rehearsal + rollback script | Migration tests + rollback rehearsal green locally, then Staging |
| 2. Endpoints | `POST /api/media/play` (shared authorization with `/api/media`, no-store, mint cap), `POST /api/media/progress` (HMAC, always 204), secret `LISTENING_TOKEN_SECRET` per environment with `kid`; cron rollup + purge step | Unit tests for every T-row, fuzzed token parsing, no logging test |
| 3. Player | `use-audio-player.ts`: mint on play intent, cumulative seconds, beacons on interval/pause/ended/hidden/pagehide, `fetch(keepalive)` fallback. **Any failure is silent and never affects playback** | Existing audio player tests unchanged + new ones |
| 4. Staging observe-only | Scripted ground-truth matrix: desktop Chrome/Safari/Firefox, Android Chrome background, iOS Safari foreground + lock screen, seek, 2x, offline mid-play, two tabs, forged/replayed beacons | V4 acceptance target met; T1-T8 reproduced and contained |
| 5. Production shadow | Behind a flag, observe-only for >= 1 full calendar month; Admin read-only view of usage, suspect seconds and ceiling alerts; monthly A cross-check | Divergence vs A explained; no unexplained ceiling hits |
| 6. Soft notices | Owner-facing 80% / 100% banner + email (localized, 7 locales). No guest blocking | Explicit owner go decision |

## V7. Go / no-go checklist (before Phase 6 is allowed)

- [ ] Product decision recorded: listening is never enforced against guests; unit is wall-clock playing time.
- [ ] Legal review of V5 done (ePrivacy/GDPR wording in the privacy notice).
- [ ] Staging accuracy within the V4 target on every browser in the matrix, including iOS lock screen (or that case explicitly excluded with a measured error figure).
- [ ] T1-T8 abuse tests pass on Staging: forged/replayed/expired tokens credit 0; one token cannot exceed real time; mint cap and credit ceiling hold; suspect seconds are separated.
- [ ] No IP/UA/identifier in any table, and a test proves the routes do not log request data.
- [ ] Cost measured on Staging matches V3 within 2x; firewall rate-limit rule configured.
- [ ] One full month of Production shadow data with A cross-check divergence explained.
- [ ] Key rotation runbook rehearsed; secrets separate per environment.
- [ ] Rollback: flag off stops minting and crediting; player keeps playing; migration rollback rehearsed.
- [ ] `ENTITLEMENTS.md` / marketing copy updated only after all of the above ("metered" may be said only then).

**Verdict of this verification:** option E remains the recommendation, with the four corrections in V0 (separate uncacheable mint endpoint, token per play intent, cumulative beacons, cap = duration + 2 min). Residual risk that cannot be designed away: bounded, real-time inflation of a public Space's total by a determined stranger, and undercounting of offline/downloaded and some iOS background listening. Both are acceptable only because the meter never limits playback.
