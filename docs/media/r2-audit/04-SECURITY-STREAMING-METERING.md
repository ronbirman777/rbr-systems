# 04 - Security, streaming and metering design (TASK 032.5, Phases D, E, F)

Date 2026-10-10. **Design only.** No code, migration, Cloudflare resource, DNS record or hosted query was created or run. Facts about the current system cite `01-CURRENT-AUDIO-ARCHITECTURE.md` (written "01 §n") or the code (`file:line`, relative to `app/`). Vendor facts cite `02-VENDOR-RESEARCH.md` ("02 §x"). Anything else is marked **[ESTIMATE]**, **[ASSUMPTION]** or **[UNVERIFIED]**.

## Proposed design in one paragraph

Audio bytes move to a **private R2 bucket** (no `r2.dev`, no custom domain attached to the bucket). A **Cloudflare Worker** on an app-owned media subdomain (placeholder `media.<app-domain>`; owner decision D2) is the only reader. It reaches R2 through a binding, so no R2 credential leaves Cloudflare on the read path. Next.js `/api/media/[...path]` keeps every check it makes today: path shape, membership in the published snapshot, the field and extension match, the draft refusal, `resolveGuestAccessDetailed` (availability, then mode, then cookie). It adds the **new** library and recording code checks. When everything passes, it mints a **short-lived HMAC playback token** bound to `tenant + object key + expiry + kind (+ tenant epoch, random nonce)` and redirects to the Worker. The token carries no listener identity. The Worker re-validates the token on **every** request, including every Range request, and streams from R2 with a forced `Content-Type`, `nosniff`, and `Cache-Control: private, no-store`. Revocation has two parts. A token's expiry is capped at the Space's next known access deadline, and a per-tenant **epoch** in Workers KV covers event-driven revocation.

---

# Phase D - the 20 security requirements

## Where the list comes from

The canonical numbered list of TASK 032.5's 20 mandatory requirements is **not in the repository**: a grep over `tasks/` and `docs/` finds no 032.5 task file. The list below is rebuilt from the task brief, with requirements 6-8 being the library code, the recording code, and the rule that both apply together, as the brief states. **The owner should confirm the numbering.** If it differs, map the requirements by title.

**Legend:**
- **MET**: the proposed design satisfies it with no new product feature beyond the R2/Worker build itself.
- **MET WITH NEW WORK**: satisfiable, but needs a named new mechanism (schema, endpoint, job).
- **GAP**: not satisfiable as designed, or needs an owner decision first.

| # | Requirement | How the design satisfies it | Status |
|---|---|---|---|
| 1 | **Bucket is private and never public** | Bucket created with the default private setting (02 §D, "buckets are never publicly accessible"), `r2.dev` set to `disallow`, and **no custom domain attached to the bucket**, because a custom domain makes it public (02 §C.D). The only read path is the Worker binding. Monitoring (Phase K) alerts if `r2.dev` or a custom domain is ever enabled. | MET |
| 2 | **Single authorization gateway; guests never receive storage credentials or presigned GETs** | Guests get a Worker URL with an app-minted token, never an S3 presigned GET. Presigned GETs only work on the S3 API domain (02 §D) and could not be revoked. S3 credentials are used server-to-server only: upload PUT minting, HEAD, measurement GET, CopyObject, delete, migration. | MET |
| 3 | **Tenant isolation** | The token payload binds `tenantId` and the full object key. The Worker refuses unless (a) the path key equals the token key and (b) `key.split("/")[0] === token.tenantId`. Next.js mints only after the snapshot check for that tenant (`route.ts` reads `published_spaces` by `tenant_id`, then `collectMediaRefs`). Upload PUTs are minted only for `{tenant}/{module}/{item}/{uploadId}/draft.<ext>` after the membership check (`resolveMediaWriter`-style, `trustedMedia.server.ts:31`). | MET |
| 4 | **Guests receive only objects the current snapshot publishes; draft only for referencing members** | No change in Next.js. The `collectMediaRefs`, field/extension and `isDraftMediaPath` checks (`route.ts`) run before any token is minted. The token's `kind` is `pub` for guest tokens and `draft` for member previews. The Worker refuses a `pub` token whose key is not `.../published.<ext>`, and a `draft` token whose key is not `.../draft.<ext>`. | MET |
| 5 | **Space guest access code honoured** | Unchanged: `resolveGuestAccessDetailed` (`effectiveAccess.ts:44`) runs before minting. Code reset or rotation bumps `space_guest_access.version` (0016), and the app also bumps the tenant media epoch, so outstanding tokens die within the KV propagation window (req. 11). | MET WITH NEW WORK (epoch bump on code change) |
| 6 | **Optional library access code** | **Does not exist today** (01 §13: no schema, RPC, cookie or route). Designed below (§D.1): it needs schema, Studio UI, a guest prompt UI, a server check before minting, and a scoped cookie. | MET WITH NEW WORK (new feature) |
| 7 | **Optional per-recording access code** | **Does not exist today** (01 §13). Designed below (§D.1). | MET WITH NEW WORK (new feature) |
| 8 | **When both codes are configured, both are required; codes are hashed; scoped cookies; rate limited** | **Does not exist today.** §D.1: the guest needs the conjunction of every configured layer (Space, then library, then recording); bcrypt via `extensions.crypt` as 0016 does; one cookie per scope; one shared per-Space attempt budget. | MET WITH NEW WORK (new feature) |
| 9 | **Short-lived, scoped playback tokens with no listener identity** | §D.2 token format. TTL 10 min **[ESTIMATE, benchmark in Phase J]**, capped at the next access deadline. Payload is tenant, key, kind, exp, epoch, kid and a 96-bit random nonce. The nonce is per resolve and linked to nothing; it exists only to dedupe metering (Phase F). No IP, UA, cookie value or user id. HMAC-SHA256 with the WebCrypto key in a Worker secret. | MET |
| 10 | **Every Range request is authorized** | The Worker validates signature, expiry, key match, kind and epoch **before** any R2 call, on every GET and HEAD, and there is no session. Each Range request is a separate HTTP request (02 §E), so validation is naturally per request. A response that is already streaming is not cut when the token expires mid-stream; the next request is refused. | MET |
| 11 | **Suspension, cancellation, code change and archive revoke access in a bounded window** | Three layers. (a) **Deadline cap:** at mint, `exp = min(now + TTL, next_access_deadline)`. The deadline is `payment_failed_at + 24h` (guest suspension), period end + 6h (cancel at period end) or `exempt_expires_at`, all from the same `space_access_state` inputs (ARCHITECTURE.md table). Time-based suspension therefore never outlives the token. (b) **Tenant epoch in KV:** event-driven changes bump `ep:{tenant}`. These are a Stripe-driven immediate cancel, Admin archive, a code set, disable or rotate at any level, unpublish/Replace/Delete, and a manual kill. The Worker refuses any token with `token.ep < kv.ep`. KV propagation is "up to ~60 s" **[UNVERIFIED, Cloudflare KV is eventually consistent]**. (c) **TTL** as the backstop. Today's window is up to 180 s and cannot be revoked (`cachePolicy.ts`). The proposed window is about 60 s for event-driven changes and 0 s for deadline-driven ones. | MET WITH NEW WORK (KV namespace, epoch writer, deadline computation) |
| 12 | **Uniform denial, no existence oracle, abuse-limited minting** | Next.js keeps the bare 404 with `private, no-store` (`route.ts:notFound`). The Worker answers a bare 404 for **every** refusal: bad signature, expired, key mismatch, revoked epoch, missing object. Every token check runs before any R2 read, so a missing object is never distinguishable from an unauthorized one. Minting gets a per-tenant rate ceiling (Phase F §F.5) and a Vercel Firewall rule on `/api/media` **[owner config]**. | MET WITH NEW WORK (mint ceiling, firewall rule) |
| 13 | **Upload authorization before any byte lands; size and type bounded** | R2 has no RLS (01 §3), so the app authorizes in `prepare*AudioUpload`: membership, `space_studio_writable`, and the paid policy (draft audio only). Only then does it mint a **presigned PUT** for one key, with `Content-Type` in the signature (a mismatch fails with 403, 02 §D), TTL 15 min **[ESTIMATE]**, and `If-None-Match: *` signed if R2 honours it on presigned PUT **[UNVERIFIED]**. A presigned PUT cannot cap the body length (signing `Content-Length` on R2 is **[UNVERIFIED]**), so finalize HEADs the object, deletes anything over `MAX_AUDIO_BYTES`, and the orphan sweeper removes unfinalized keys (Workstream 0). The `media_objects` row is written `pending` at prepare, so an abandoned upload is always findable. | MET WITH NEW WORK |
| 14 | **Server-side content validation and provenance** | Unchanged logic (`audioDuration.ts`, `fingerprint.ts`, `billing_audio_attach_verified`). `measureStoredAudio` reads from R2 with an S3 GetObject instead of Supabase `download`. **Recommendation:** in R2, measure and hash on **every** Space, not only enforced ones. Legacy and exempt Spaces get no byte validation today (01 §6.5), and with no member credentials the server is the only writer anyway. Exempt-Space impact is a benchmark item (memory and time, 01 §6.9). | MET WITH NEW WORK |
| 15 | **Publish integrity: only the trusted path creates published objects, which are re-verified** | `copyDraftAudioToPublished` becomes an R2 `CopyObject` with `If-None-Match: *` (create-only) **[UNVERIFIED on R2; fallback: HEAD then copy under the per-tenant advisory lock]**. The published copy is re-hashed against `billing_audio_verifications.sha256`. **R2 multipart ETags are not content MD5s, and neither ETag kind is ever treated as a content hash: the sha256 provenance is the integrity anchor.** The ETag-plus-size skip (`publish.ts:321-323`) is kept only as an "unchanged since we hashed it" signal: keys are versioned and create-only, and only server credentials can write. | MET WITH NEW WORK |
| 16 | **Database-layer integrity that does not depend on `storage.objects`; deletion completeness across stores** | The two 0046 probes (`0046:223-230` planted published sibling; `0046:612-613` fresh-enforcement invariant) return false for R2 objects (01 §3). They are replaced by an R2-aware equivalent (§D.3): a service-role-only `media_objects` index plus a HEAD in server code before the RPC, and a nightly R2-to-index reconciliation. Space deletion and Replace list and delete in **both** stores and fail closed if either fails (`tenantCleanup.ts` pattern). | MET WITH NEW WORK |
| 17 | **Forced Content-Type, `nosniff`, no same-site script execution; restricted CORS** | The Worker ignores the stored Content-Type and sets it from the key's extension using `AUDIO_MIME_BY_EXTENSION` (`audio.ts:21`; mp3 `audio/mpeg`, m4a `audio/mp4`, aac `audio/aac`, wav `audio/wav`, ogg `audio/ogg`). Any other extension gets a 404. It also sets `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`, `Cross-Origin-Resource-Policy: same-site`, `Content-Security-Policy: default-src 'none'; sandbox` and `Referrer-Policy: no-referrer`. CORS is the exact guest origin per environment, with no credentials. The media subdomain sets no cookies and is not covered by the app's `Domain=` cookies, so guest-code cookies are host-only on the app origin (`verifyAction.ts`: no `domain`), which needs confirming **[ASSUMPTION]**. | MET |
| 18 | **No shared caching of authorized responses** | The Worker sends `Cache-Control: private, no-store`. It does not use the Worker Cache API, which cannot store 206 responses anyway (02 §D), and it never calls `fetch` with `cf.cacheEverything`. The zone gets a Cache Rule "bypass cache" for the media hostname as a second guard. The Next.js redirect for R2-backed media becomes `private, no-store` in **all** modes, including public Spaces: today's `public, max-age=60` redirect (`cachePolicy.ts`) would hand one token to every listener behind a CDN entry and break per-token metering dedupe. If edge caching is ever wanted, the key must be the object and the token must be validated before `cache.match` (02 §D). That is **not proposed**. | MET |
| 19 | **Credentials: least privilege, per environment, rotation, never in the browser** | See §D.4. In short: an R2 Object R/W token scoped to **one** bucket per environment, server-only; HMAC secrets as Worker secrets and Vercel server env, never `NEXT_PUBLIC_*`; `kid` dual-key rotation. | MET WITH NEW WORK |
| 20 | **Privacy: no listener identity, IP or UA stored; minimal logs** | The token has no identity (req. 9). Metering stores only per-tenant, per-resource, per-hour aggregates (Phase F). The Worker never reads `CF-Connecting-IP` and never logs headers or tokens. Workers Logs head sampling is set to 0 for the media Worker, or logs carry only status and duration (02 §F: logs record request metadata by default, and whether `CF-Connecting-IP` is captured is **[UNVERIFIED]**). Cloudflare still processes IPs transiently as a platform. The privacy notice must say so (legal review, LISTENING-METERING-OPTIONS.md V5). | MET WITH NEW WORK (log config + test) |

**Result: 0 GAP, 8 MET (1, 2, 3, 4, 9, 10, 17, 18), 12 MET WITH NEW WORK (5, 6, 7, 8, 11, 12, 13, 14, 15, 16, 19, 20).** "MET" still means the R2/Worker build itself must implement it as described. None is satisfied by the current Supabase code alone. Requirements 6-8 are **new product features**. They need explicit owner approval of their scope (DECISION-GATE D4) before implementation. They are not part of "moving to R2" and can ship before, with or after it, because the check sits in Next.js before token minting, whichever store is used.

## D.1 Library and per-recording access codes (new feature design)

**Scope definitions (for owner approval):**
- **Library code:** one optional code per Space per audio library module. For Teach the module is `teachAudio`, for Flow it is `audio` (`flowLibrary.ts:31`). It gates the audio **bytes** of every recording in that module.
- **Recording code:** one optional code per `module_items` row with audio. It gates that recording's bytes.
- **Owner decision D4b:** whether titles and durations stay visible in the guest library while the bytes are locked. The recommended default is visible with a lock badge, because the snapshot is already public to anyone who passes the Space gate.

**Schema** (proposed migration `0049_media_access_codes`; no SQL written):

```
media_access_codes (
  id uuid pk,
  tenant_id uuid not null references tenants on delete cascade,
  scope text not null check (scope in ('library','recording')),
  module_key text not null,                  -- 'teachAudio' | 'audio'
  item_id uuid null references module_items on delete cascade,  -- required iff scope='recording'
  code_hash text not null,                   -- extensions.crypt(code, gen_salt('bf')) as 0016
  version int not null default 0,            -- bumped on set/rotate/disable -> cookie invalidation
  enabled boolean not null default true,
  failed_attempts int not null default 0,
  updated_at timestamptz not null default now(),
  unique (tenant_id, scope, module_key, coalesce(item_id, '00000000-0000-0000-0000-000000000000'))
)
RLS on, no policies, REVOKE ALL from anon/authenticated (same posture as space_guest_access, 0016:42-48).
```

**RPCs** (SECURITY DEFINER, `set search_path`, guard pattern as 0044):
- `set_media_access_code(tenant, scope, module_key, item_id, code)`: member and `space_studio_writable` check, code format `^[0-9]{6}$` as 0016 (owner may widen), bumps `version`.
- `disable_media_access_code(...)`: bumps `version`.
- `verify_media_access_code(tenant, scope, module_key, item_id, code) -> int|null`: service_role only, `FOR UPDATE`, `crypt` compare, increments `failed_attempts` on a miss.
- `get_media_access_requirements(tenant, item_id) -> {library:{required,version}, recording:{required,version}}`: service_role only. It is **not** granted to anon, unlike `get_guest_access_mode` (0016:69), so lock state is not an anonymous oracle. The guest page learns lock state through the server-rendered page only.

**Rate limiting:** reuse `check_and_record_guest_attempt` (0016:84-108; 8 attempts per 10 min per `(tenant, ip_hmac)`, with the IP from the trusted Vercel header `x-vercel-forwarded-for`, `ipHmac.ts:43,153`). The **same per-Space budget** is shared across the Space code and every library and recording code. Separate per-recording buckets would let an attacker multiply guesses by the number of recordings. The existing fail-closed IP resolution (CLAUDE.md, trusted Vercel contract) is unchanged.

**Cookies:** one HMAC cookie per satisfied scope, payload `{tenantId, scope, scopeId, version, exp}`, signed with `GUEST_ACCESS_TOKEN_SECRET` through the existing `cookieToken.ts` primitives (WebCrypto, constant-time compare). Settings match the Space cookie: `httpOnly`, `secure`, `sameSite=lax`, host-only, `path=/`, 7 days. Names are `idw_lib_{tenant}_{moduleKey}` and `idw_rec_{tenant}_{itemId}`. A Space with many coded recordings could approach browser cookie limits (about 50+ per host **[ESTIMATE]**). If the owner expects more than 20 coded recordings per Space, use one signed per-tenant grants cookie holding a bounded list instead (design alternative; decide at implementation).

**Server check order in `/api/media`** (after the existing `resolveGuestAccessDetailed`, before minting): find the item owning the requested `audioRef` from the snapshot (same `collectAudioRefs` walk, extended to return `item_id` and `module_key`). Then call `get_media_access_requirements`. **Every** configured layer must have a valid cookie at the live version: Space (existing), then library, then recording. Any miss returns the same bare 404. The guest UI shows the prompt by asking a server action that returns which layer is locked, never the code or the hash. The Studio preview (member) bypasses library and recording codes.

**Snapshot:** codes are **live state** (like `space_guest_access`) and not part of `published_spaces.modules`, so changing a code needs no republish and is effective immediately (and bumps the epoch).

**Tests required:** both layers required, each alone insufficient, a version bump invalidates cookies, one budget across scopes, and a non-member cannot read requirements. The status probe returns the same 404 for "no such recording", "locked" and "wrong tenant".

## D.2 Playback token

```
token   = "v1." + kid + "." + b64url(payload) + "." + b64url(HMAC-SHA256(K[kid], "v1." + kid + "." + b64url(payload)))
payload = { t: tenantId, k: objectKey, kd: "pub" | "draft", x: expUnix, ep: tenantEpochAtMint, n: 96-bit random }
URL     = https://media.<app-domain>/o/<objectKey>?tk=<token>
```

- **Minting** happens in Next.js only: `/api/media` for guests and draft-audio members, and the Studio preview loaders (`teach/[tenantId]/page.tsx:96`, `retreat/[tenantId]/page.tsx:63`, `audio-step.tsx:423`, `teach-studio-sections.tsx:1666`). The Studio TTL drops from 3600 s to the same 10 min with a refresh, which removes 01 §6.8.
- **Key material:** `MEDIA_TOKEN_KEYS` is a set of `kid:secret` pairs, 32 random bytes each, present in both Vercel (server only) and the Worker secret. The Worker accepts the current and previous `kid`.
- **Why `ep` and `n`:** `ep` makes revocation possible (req. 11). `n` gives the metering dedupe window a stable key (Phase F). Neither links a person: a new resolve produces a new `n`.
- **Why the key is in the clear:** it is already in the path, and the snapshot (readable to anyone who passes the Space gate) already contains it.

## D.3 Replacing the two `storage.objects` checks from 0046

| 0046 check | Purpose | R2-aware replacement |
|---|---|---|
| `billing_audio_attach_verified` refuses `AUDIO_REUPLOAD` when `published.<ext>` exists next to the draft (`0046:223-230`) | Publish would adopt bytes this attach never measured | (1) **Server:** before the RPC, `HeadObject(published sibling)` in the object's store. If it exists, refuse (same refusal the Studio attach makes today). (2) **DB:** the RPC also refuses if `media_objects` has a row `(key = sibling, state <> 'deleted')`, keeping the `storage.objects` probe as well during dual storage. The index is written only by service-role server code at prepare (`pending`), finalize (`present`), publish copy (`present`) and delete (`deleted`). In R2 a member cannot plant anything, because members hold no R2 credential; only app, migration and DR-restore credentials can write. The DB check is defense in depth against a server bug or a restore job. |
| `billing_guard_subscription_enforcement` refuses `BILLING_SPACE_HAS_MEDIA` when any `tenant-media/{tenant}/%` object exists (`0046:612-613`) | A Space must never become enforced while holding unchecked media | Add `or exists (select 1 from media_objects where tenant_id = new.tenant_id and state <> 'deleted')`, keeping the `storage.objects` clause. `pending` rows count, so an un-finalized presigned upload blocks it too. |
| Drift between the index and R2 | Something writes R2 outside the app | **Nightly reconciliation job** (server, service role): `ListObjectsV2` per tenant prefix against `media_objects`. Any R2 object without an index row raises an immediate alert (Phase K) and is quarantined by an index row with `state='unindexed'`, which counts as present for both checks. Any index `present` row with no object raises an alert. |

**Why not a live HEAD from SQL:** Postgres cannot call R2 synchronously in a trigger without `pg_net` or HTTP extensions, which is fragile and new surface. **Why not pass a boolean into the RPC alone:** a trusted caller asserting "sibling absent" adds nothing over the server check. The index row is what gives the database its own evidence.

## D.4 Credentials and rotation

| Credential | Scope | Lives in | Rotation |
|---|---|---|---|
| R2 S3 token (app) | **Object Read & Write, one bucket** per environment (02 §D: tokens can be scoped to a set of buckets) | Vercel server env per environment (Preview, `staging`, Production). Never `NEXT_PUBLIC_*` | 90 days **[policy proposal]**. Create the new token, deploy, verify, revoke the old one. The secret is shown once (02 §D) |
| R2 S3 token (DR sync) | **Object Read only**, same bucket | B2 sync runner secret store only (infra repo, Phase H) | 90 days |
| R2 S3 token (migration job) | Object R/W, one bucket, **time-boxed** | Operator machine or CI secret for the migration window only | Revoked at migration close |
| Worker R2 binding | Bucket binding in `wrangler.toml` per environment | Cloudflare | n/a (no secret) |
| `MEDIA_TOKEN_KEYS` | HMAC for playback tokens | Worker secret (`wrangler secret put`, per environment, 02 §D) and Vercel server env | 90 days or on suspicion. Add the new `kid` to the Worker first, then mint with it, then drop the old `kid` after max TTL (10 min) |
| `MEDIA_WORKER_ADMIN_KEY` | HMAC for the app-to-Worker epoch and admin endpoint | Worker secret and Vercel server env | 90 days, dual key |
| `METERING_INGEST_KEY` | Worker-to-Supabase ingestion | Worker secret only. Calls a Next.js ingestion route that holds `SUPABASE_SECRET_KEY`, so the Worker never holds the Supabase service key | 90 days, dual key |
| Cloudflare API token (CI deploy) | Workers Scripts:Edit and KV:Edit for the media Worker's account only | CI secret | 90 days |

Staging and Production use **separate buckets, KV namespaces, Worker environments and keys**. No Preview or Staging credential can read the Production bucket (CLAUDE.md isolation rule).

---

# Phase E - streaming design

## E.1 Worker request handling

| Request | Worker behaviour |
|---|---|
| `OPTIONS` | CORS preflight: `Access-Control-Allow-Origin: <exact guest origin(s) for this env>`, `Allow-Methods: GET, HEAD`, `Allow-Headers: Range, If-Range`, `Max-Age: 600`. No credentials |
| `GET`/`HEAD` with no `Range` | Validate the token, then `env.BUCKET.get(key)` (GET) or `.head(key)` (HEAD). Answer **200** with `Content-Length: size` and `Accept-Ranges: bytes` |
| `GET` with `Range: bytes=a-b`, `a-` or `-n` | Validate, parse **one** range, then `get(key, { range })` (02 §E). Answer **206** with `Content-Range: bytes s-e/size` and `Content-Length: e-s+1`. The official example returns 200 for ranges, so this must be written explicitly (02 §E) |
| Multi-range (`bytes=0-1,5-9`) | Treat as no Range and answer 200 with the full body (RFC 9110 allows this). Browsers do not send multi-range for media **[ASSUMPTION]** |
| Unsatisfiable (`a >= size`) | **416** with `Content-Range: bytes */size` |
| `HEAD` with Range | 206 headers, no body (uses `head()`, a Class B op) |
| `If-Range` | The binding does not support it (02 §E). Keys are versioned and create-only, so the ETag of a key never changes. The Worker compares `If-Range` with `object.httpEtag`; a match means serve the range, a mismatch means serve 200 full |
| `If-None-Match` / `If-Modified-Since` | Pass to `onlyIf`, answer **304** on a match (body undefined, 02 §E) |
| Any token failure, missing object or wrong extension | Bare **404**, `Cache-Control: private, no-store`, CORS headers present so `fetch` probes can read the status |

**Always on 200/206/304:** `ETag: object.httpEtag`, `Last-Modified`, a forced `Content-Type` (req. 17), `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`, `Cache-Control: private, no-store`, `Cross-Origin-Resource-Policy: same-site`, and CORS `Access-Control-Expose-Headers: Content-Range, Accept-Ranges, Content-Length, ETag`. **No `Set-Cookie`, no `Vary: Cookie`**: the Worker reads no cookie.

**Body handling:** stream `object.body` through a counting `TransformStream` (Phase F) and never buffer it (128 MB isolate memory, 02 §E). Streaming time is not CPU time (02 §E). Expected CPU is under 2 ms per request **[ESTIMATE; 03 assumes 2 ms]**.

**Variant to benchmark:** `Cache-Control: private, max-age=<seconds left on the token>` instead of `no-store`. The browser cache key includes the token URL, so this is private to one browser. It may cut backward-seek refetches. It is not the default.

## E.2 Token expiry during playback

- **Token per resource, not per request.** One `/api/media` resolve yields one token for one object. All Range requests of that playback use the same final URL.
- **Redirect model kept.** `<audio src="/api/media/<ref>">` stays as it is (`use-audio-player.ts`, `published-space-screen.tsx:117`, `guestData.ts:137-140`). `/api/media` answers **307** to the Worker URL. Today it is a 307 to Supabase (`NextResponse.redirect` default). For R2 objects the redirect is always `private, no-store` (req. 18).
- **Client re-resolve** (new, `use-audio-player.ts`):
  1. Record `srcAssignedAt` whenever `src` is set.
  2. On `error`, or on `stalled` when `networkState === NETWORK_NO_SOURCE` or no progress for 10 s, re-assign `src = /api/media/<ref>?r=<counter>`. The counter defeats any client cache of the old redirect. Then set `currentTime = lastTime` on `loadedmetadata`, and resume if the element was playing. Allow at most 3 attempts with backoff of 0.5, 2 and 5 s, then show today's `status="error"`.
  3. **Pre-emptive refresh:** before `play()` or a `seek()`, if `now - srcAssignedAt > TTL - 90 s` (8.5 min at a 10 min TTL), re-resolve first. This covers the most common case, "paused for a long time, then pressed play", without an error round trip.
  4. Keep `preload="metadata"`. No autoplay change.
- **Why 10 min:** today's 60 s and 180 s TTLs, with no re-resolve, are the suspected cause of 01 §15's [unverified] seek failure. Ten minutes with re-resolve covers normal seeking without refreshes, keeps revocation bounded together with the epoch, and leaves the 80,000-minute planning scenario at about 1 resolve per 10 listening minutes **[ESTIMATE]**. Phase J tests 5, 10 and 15 min.

## E.3 Browser specifics (to verify in Phase J; all **[UNVERIFIED]** until measured)

| Browser | Expected behaviour | Design response |
|---|---|---|
| Chrome / Edge (desktop, Android) | `Range: bytes=0-` first and reuses the redirect target for later ranges. One long-lived streaming response for continuous play | A token that expires mid-stream does not cut the stream. A later seek past expiry gets a 404, which triggers re-resolve |
| Firefox | `bytes=0-`, then ranges. Follows redirects | Same |
| Safari macOS | Probes with a small range (for example `bytes=0-1`) and needs a correct 206 with Content-Range (02 §E). May re-request the **original** URL for later ranges | If Safari re-requests `/api/media`, each range costs a Vercel invocation and a fresh token. That works but is costly, so measure it. Mitigation if needed: give the player the Worker URL directly through a JSON resolve (`POST /api/media/resolve` returning `{url, exp}`) |
| iOS Safari / WebView | Media loading may run outside the page process. Lock-screen playback continues while JS is suspended. Cookies may not be sent on media requests | The token sits in the URL, so cookies are irrelevant to the Worker. Lock-screen playback longer than the TTL that needs a new range will fail. Pre-emptive refresh cannot run while JS is suspended. Mitigate by measuring, and by a longer TTL for audio if needed (15-30 min; trade-off is a longer non-event revocation, which the epoch still covers) |
| All | `preload="metadata"` may fetch the tail for M4A files whose `moov` box is at the end | Count those bytes as served (small). Recommend faststart M4A at a later stage (not required) |

## E.4 Comparison with today

| Aspect | Today (Supabase signed URL redirect) | Proposed (Worker + token) |
|---|---|---|
| Authorization at playback start | `/api/media` checks (unchanged) | Same, plus library and recording codes |
| Authorization per Range request | Signed-URL validity only | Token, epoch and key match on every request |
| Revocation | Up to 180 s, not revocable, plus a 60 s cached public redirect (`cachePolicy.ts`) | 0 s at deadlines, about 60 s for events (KV), 10 min worst case if KV fails open. **Fail closed on KV error is the recommendation**, at the cost of a 404 and re-resolve during a KV outage |
| Long-track seek after expiry | Fails, with no re-resolve (01 §15, unverified) | Re-resolve logic |
| Content-Type / nosniff control | Supabase decides | Forced by us |
| Metering possible | No (bytes bypass the app) | Yes (Worker byte accounting) |
| Edge cache | Smart CDN, keyed per token (02 §C.A), so effectively none | None, by design |
| Egress cost | $0.09/GB uncached (03) | $0 egress. Class B ops at $0.36/M and Worker requests (03) |
| New moving parts | none | Worker, KV, R2, DNS subdomain, metering pipeline |

## E.5 Recommendation (streaming)

Adopt the **Worker gateway with per-request token validation, a 10-minute token (benchmark 5/10/15), `private, no-store`, no edge caching, and the client re-resolve**. On cost, R2 + Worker is about $5-$75 per month against $29-$10,358 for Supabase uncached across 10-2,000 Spaces at 80,000 min per Space (03, planning scenario). On security it is stronger than today on revocation, Content-Type control and per-range authorization. On performance it should be equal or better, depending on Worker-to-R2 latency (Phase J must show it). On complexity it is moderate: one Worker of about 200-300 lines **[ESTIMATE]** plus KV, and the client change is small. Do **not** adopt presigned GETs for guests: they cannot be revoked, cannot be metered, and do not work on custom domains (02 §D).

---

# Phase F - listening metering

## F.1 The six approaches

1. **Cloudflare analytics aggregation** (R2 GraphQL `r2BandwidthUsageAdaptiveGroups` by object, daily). This is option A of `LISTENING-METERING-OPTIONS.md`, rebased on R2.
2. **Count token mints** in `/api/media` (option B).
3. **Cookieless client progress beacons** with per-Space ceilings (option C).
4. **Worker byte accounting**: bytes actually delivered per token, deduplicated, converted to minutes (option D, now cheap because the Worker is already in the byte path).
5. **HMAC per-play tokens + cumulative beacons** (option E, the earlier recommendation for the Supabase path).
6. **Hybrid: Worker byte accounting as the meter, with a client progress beacon as cross-check** (4 + a light 5).

## F.2 Comparison

Scores: 1 is poor, 5 is good. For cost and DB write volume, 5 means cheap or low. All scores are **[ESTIMATE]**.

| Criterion | 1 Analytics | 2 Mint count | 3 Beacons | 4 Worker bytes | 5 Token + beacon | 6 Hybrid (4 + beacon check) |
|---|---|---|---|---|---|---|
| Accuracy (honest traffic) | 2. Excludes transfers under 100 KiB (02 §F); by object, not by play | 1 | 4 | 4. Bytes delivered divided by measured bitrate; buffering ahead overcounts slightly | 4 | **4-5**. Bytes plus a played-seconds sanity check |
| Replay resistance | 3 | 1 | 2 | **5**. Replaying a range adds 0 under per-token union dedupe | 5. Cumulative seq | **5** |
| Token sharing | n/a | 1 | 2 | 4. A shared token is still deduped to one copy of the file per token window | 4. Age bound | **4** |
| Offline / reconnect | under (buffered audio not refetched) | n/a | under (tail lost) | correct. Only fetched bytes count, so a reconnect that refetches is deduped within the token, and a new token after reconnect may re-count overlap (bounded) | under (tail) | correct, plus a flag on divergence |
| Partial playback | counts fetched, not listened | wrong | correct | counts fetched. Overcount equals the unplayed buffered-ahead bytes; back-pressure keeps it bounded | correct | bytes billed, beacon flags large gaps |
| Buffering / preload | overcount | n/a | none | overcount of the buffer **[ESTIMATE: up to a few minutes of audio per abandoned play]** | none | measured gap reported |
| Simultaneous sessions (two tabs) | sum | sum | sum | sum (two tokens) | sum | sum |
| Cost | ~0 | ~0 | Vercel invocation per beacon | Worker CPU already paid; a counter write per request (DO or Queue) | Vercel invocations (LISTENING V3: ~30-110k per 100k min) | Worker side ~0 extra; optional beacon 0.2/min |
| DB write volume | 1 row/tenant/day | 1/mint | 1/beacon (batched) | **1 row per tenant per resource per hour** after aggregation | nonce rows + updates | same as 4, plus beacon sums in the same hourly row |
| Privacy | 4. Vendor logs hold IPs | 5 | 4 | **5**. Nonce is per resolve, nothing stored but aggregates | 5 | **5** |
| Inflatable by a stranger | yes (real egress) | trivially | yes (forged beacons up to the ceiling) | yes, but only with **real downloads**, bounded by the mint ceiling and dedupe | bounded real-time | same as 4 |

## F.3 Recommendation

**Approach 6.** The meter is Worker byte accounting. Each byte range served is attributed to `(tenant, objectKey, hour)`, deduplicated per token nonce, and converted to minutes as `unique_bytes / (size_bytes / duration_seconds)`, with `size_bytes` and `duration_seconds` from `billing_audio_verifications`. Legacy and exempt objects without provenance use `media_objects.size_bytes` and the stored `durationSeconds`, flagged `confidence='client_duration'`. An **optional** client beacon (`playedSeconds`, cumulative per token, LISTENING-METERING-OPTIONS.md V1) feeds a cross-check column only and never adds billed minutes. Approach 1 (R2 analytics) runs as a monthly independent cross-check.

**This meter cannot perfectly prevent client manipulation.** Anyone entitled to play can download repeatedly with new tokens and inflate a Space's count. Each inflation costs the attacker real bandwidth, is bounded by the per-tenant mint ceiling, and is visible as a bytes-without-beacons anomaly. A client can also deflate by playing offline after one download. These are residual risks, not design defects, and they are why enforcement (F.6) is soft and needs owner approval.

## F.4 Dedupe and overlap

- **Unit of dedupe:** the token nonce `n` together with the object key. The Worker accumulator keeps a merged interval set of byte ranges delivered for that nonce. Counted bytes are the growth of the union, so a re-fetch of an already-delivered range adds 0.
- **Partial delivery:** the counting stream records bytes actually enqueued to the client. On client abort, `cancel` fires and only delivered bytes are recorded.
- **Window:** the nonce's state lives until `exp + 5 min`, then is dropped. Across tokens (a re-resolve), overlap is counted again. This is bounded by the number of re-resolves, one per TTL, and each re-resolve usually resumes at `currentTime`, not at 0.
- **What is never stored:** IP, UA, cookie, user id. The nonce never reaches Supabase. Only aggregates do.

## F.5 Aggregation pipeline

```
Worker (per request)  --stub.fetch-->  Durable Object "meter:{tenant}"  (in-memory + DO SQLite storage)
   counts delivered bytes                 - per nonce: interval set (TTL exp+5m)
   in waitUntil (<=30 s, 02 §F)           - per (objectKey, hour): unique_bytes, ranges, tokens
                                           - alarm hourly (+ on 1,000 pending rows):
                                               POST https://<app>/api/internal/metering/ingest
                                               (HMAC METERING_INGEST_KEY, batch jsonb, idempotency key = tenant|hour|flushSeq)
Next.js ingest route  --service role-->  rpc media_usage_ingest(batch)  -> upsert media_usage_hourly
Billing cron (existing */15, vercel.json) --> media_usage_rollup -> media_usage_monthly (tenant, month, minutes, bytes, suspect_minutes)
```

- **Why a Durable Object:** it gives a single consistent writer per tenant, which makes interval dedupe correct, and its alarm flushes reliably. Cost is 1 DO request per media request: about 1M per month at 1M media requests, inside or near the 1M included, then $0.15/M (02 §F). That is negligible at the volumes in 03 **[ESTIMATE]**.
- **Alternatives:** (a) Cloudflare Queues, with a consumer that batches and dedupes per batch only. Weaker dedupe, and pricing not verified in 02. (b) D1 with a nightly roll-up to Supabase. Workable, but adds a second system of record. (c) Analytics Engine. Cheap, but billing is not yet active (02 §F) and its sampling makes it unsuitable as a billing meter.
- **Supabase tables** (proposed `0050_media_usage`):
  - `media_usage_hourly(tenant_id, object_key_hash bytea, hour timestamptz, unique_bytes bigint, minutes numeric(12,2), ranges int, tokens int, beacon_seconds bigint null, confidence text, flush_key text unique, primary key (tenant_id, object_key_hash, hour))`
  - `media_usage_monthly(tenant_id, month date, minutes, bytes, suspect_minutes, primary key (tenant_id, month))`
  - RLS on. Owner `SELECT` on own monthly rows via a SECURITY DEFINER read RPC. Writes are service role only.
  - Write volume is at most 1 row per active recording per hour per Space **[ESTIMATE: ≤ ~720 rows per recording per month, usually far fewer]**.
- **Idempotency:** `flush_key` unique, so a retried flush is a no-op. A DO that loses in-memory state before a flush (eviction) loses at most one partial hour, mitigated by persisting the hour buckets to DO storage on every update **[ESTIMATE]**.
- **Mint ceiling (anti-inflation):** at most 30 tokens per tenant per minute, burst 60 (LISTENING-METERING-OPTIONS.md V2 T1 proposal), enforced in `/api/media` with a Postgres counter keyed by tenant and minute. Over the ceiling, the token is still minted (playback is never refused for metering reasons) but marked `sx=1`, and its bytes go to `suspect_minutes`. **Owner decision** whether over-ceiling plays are refused instead.

## F.6 Enforcement policy (proposal; needs owner approval, flag `ENFORCE_LISTENING` default off)

Entitlement is `listening = 100000 + qty * 70000` minutes per month (ENTITLEMENTS.md). Usage is billed `minutes` for the calendar month (UTC), excluding `suspect_minutes`.

| Threshold | Action |
|---|---|
| 70% | Organizer email (outbox template `listening_70`) and a Studio and Billing page banner. No guest effect |
| 85% | Email + banner. Add-on upsell shown **only once an add-on purchase path exists**, which it does not today (ENTITLEMENTS.md "no purchase path") |
| 95% | Email + banner, plus an Admin alert |
| 100% | **Grace period**: playback continues for 72 h or up to +10% of the allowance, whichever comes first **[owner value]**. Daily email |
| After grace | **Degrade**: `/api/media` refuses to mint a **new playback session** for that Space's audio. The guest sees a localized "audio temporarily unavailable" message, not a 404. **Never cut mid-play**: outstanding tokens are honoured until `exp`. A re-resolve that presents the previous token for the same object, expired less than 15 min ago, counts as a continuation and is allowed. Images and the rest of the Guest App are unaffected |
| Next month or add-on | Lifts immediately (no epoch bump needed) |

- **Organizer-facing usage meter:** the Billing page (`billingPageModel.ts`, `customerView.ts`) shows minutes used, allowance, percentage, a last-updated time (up to 1 h behind) and a note that usage is estimated from audio delivered.
- **Prerequisites before `ENFORCE_LISTENING=on`:** the LISTENING-METERING-OPTIONS.md V7 checklist adapted to approach 6. That means Staging accuracy within ±5% of scripted ground truth on every browser in the matrix, one month of Production observe-only data with the R2-analytics cross-check divergence explained, legal review, and an explicit owner go decision. **A stranger can push a public Space towards its limit with real downloads.** Enforcement therefore stays reviewable: an Admin can reset suspect usage or grant a manual extension, audited.
