# Entitlements

Data-driven: the base bundle lives in `billing_plans.entitlements` (jsonb, `entitlement_version` 1) for plan `space_monthly_usd` ($25.00 USD / month / Space, `2500` minor units). Nothing is hard-coded in UI components. Metering is Space/resource level only: no listener identity, IP, user agent or cross-Space tracking.

## Base bundle (per Space)

| Entitlement | Value |
|---|---|
| Audio library | 240 minutes |
| Maximum single recording | 60 minutes |
| Listening | 100,000 minutes / month |

## Audio add-on (`audio_pack`)

Defined on the plan: price `500` USD minor units (+$5), +240 library minutes, +70,000 listening minutes per unit. Stored quantity in `space_subscription_addons (subscription_id, addon_key, quantity)`.

Math (`computeAudioEntitlements`, mirrored by `space_audio_entitlements(tenant)`):

```
library   = 240 + qty * 240
max rec   = 60                      (never increased by add-ons)
listening = 100000 + qty * 70000
```

| Add-on units | Library | Max recording | Listening / month |
|---|---|---|---|
| 0 | 240 | 60 | 100,000 |
| 1 | 480 | 60 | 170,000 |
| 2 | 720 | 60 | 240,000 |

Quantity must be a non-negative integer; a quantity above 0 on a plan without the add-on throws.

## Status: infrastructure only (add-on sales)

- No add-on is sold: no checkout line item, no Stripe price for it, and no code writes `space_subscription_addons`.
- `space_audio_entitlements` is executable by `service_role` only.
- TS and SQL arithmetic parity is pinned by tests (`domain.test.ts` reads the migration SQL and pins the numbers).

## Enforcement (TASK B4)

### Audit: state before B4

| Path | Code | Quota used before B4? |
|---|---|---|
| Teach upload mint | `prepareTeachAudioUpload` (`configurator/teach/actions.ts`) | No - MIME + 100 MB only |
| Teach finalize | `attachTeachAudio` | No - Storage `info()` size/MIME only; client duration clamped to 0..12 h, else `null` |
| Teach save | `saveTeachItems("teachAudio")` | No - and it wrote client-sent `audioRef`/`durationSeconds` as given |
| Flow upload mint / finalize | `prepareFlowAudioUpload` / `attachFlowAudio` (`configurator/retreat/actions.ts`) | No - same as Teach |
| Flow save | `saveFlowAudio` | No (already carries file fields over from the DB) |
| Publish (both) | `publishTeachSpace`, `publishSpace` -> `publish_space()` RPC | No |
| Playback | `/api/media/[...path]` -> 302 to a short-lived Storage signed URL | No - and the bytes never pass through the app |

**Duration is client-reported.** `detectAudioDuration` reads `<audio>.duration` in the browser and passes it to attach; the server cannot decode audio today (no decoder dependency, and the upload goes browser -> Storage directly).

### Policy (who is enforced)

Decided from the Space's own billing row (`loadAudioQuotaPolicy`, service-role read after the action has verified the user's tenant access), never from the global `paid_checkout_enabled` flag - turning the flag off cannot lift a paid Space's limits.

| Space | Behaviour |
|---|---|
| No `space_subscriptions` row (every legacy / flag-off Space) | Unchanged: no quota checks, pre-B4 duration normalization byte for byte |
| `status = 'exempt'` (internal/complimentary, incl. expired exemptions) | Not blocked. The base entitlement is display-only for them |
| Any other status | Enforced against `space_audio_entitlements(tenant)` (base bundle + `audio_pack` add-ons) |
| Row or entitlement unreadable / malformed | Fail closed: attach, paid-Space Teach audio save and publish refuse with `audioAllowanceUnavailable` |

### Enforcement matrix (what ships)

| Rule | Attach (finalize) | Teach save | Publish (server action) | Playback |
|---|---|---|---|---|
| Max 60:00 per recording (never raised by add-ons) | **Enforced**: 3600 s passes, 3601 s refused (whole seconds; client rounds). Rejected new upload is removed | n/a | **Enforced** over every attached file | n/a |
| Library total (240 + 240 x add-ons minutes) | **Enforced**: other attached items + this one <= allowance (exactly at allowance passes). The item's own previous file is not counted | File fields carried over from DB on enforced Spaces, so a snapshot can't change them | **Enforced**: sum of all attached files; refused before any media copy and before `publish_space()` | n/a |
| Unknown length | **Refused** on enforced Spaces (`audioDurationUnknown`; suggests MP3/M4A) | - | **Refused** (`publishAudioDurationUnknown`: re-upload) | n/a |
| Listening 100,000 + 70,000 x add-ons min/month | - | - | - | **Not implemented - launch blocker** (below) |

Errors are localized in the Studio namespace for en/de/es/fr/he; Studio tr/it are partial dictionaries and fall back to English until TASK 033 (pinned by `audioQuota.test.ts`).

Code: `src/lib/billing/audioQuota.ts` (pure rules), `src/lib/billing/audioQuota.server.ts` (policy read), call sites in `configurator/teach/actions.ts` and `configurator/retreat/actions.ts`. Tests: `src/lib/billing/audioQuota.test.ts`, `src/app/(site)/configurator/audioQuotaEnforcement.test.ts`.

### Trust gap (duration) - explicit

- The server validates the client claim (finite, >= 0) and **raises it to a byte-size floor** computed from Storage's own `size` for the stored object: `ceil(size / maxPlausibleByteRate)`, with 64,000 B/s (512 kbit/s) for mp3/m4a/aac/ogg and 576,000 B/s (24-bit/96 kHz stereo) for wav. On enforced Spaces the stored `durationSeconds` is the raised value, so the publish-time sum uses it too. Side effect: an honest compressed file with very large embedded artwork can show a slightly longer duration in the guest app.
- What the floor does NOT stop: under-reporting a low-bitrate file. Example: a 100 MB 32 kbit/s MP3 is ~7 h; the floor is ~27 min, so a forged claim of 27 min would pass. Closing this needs **server-side duration derivation** (parse container headers - WAV `fmt`/`data`, MP3 Xing/VBRI or CBR frame header, MP4 `mvhd` - from a ranged read of the stored object). Launch blocker if the 60-minute cap must be strict against a hostile organizer.
- Bypasses outside the server actions: a tenant member can write `module_items.metadata` directly through PostgREST (RLS allows member updates, 0017) and can call the `publish_space()` RPC directly. The action-level publish check does not run on a direct RPC call. Closing this needs DB-level enforcement (a trigger on `module_items` audio metadata and/or a check inside `publish_space()` - new migration, re-pinned publish fingerprints). Launch blocker for strict enforcement; acceptable residual risk for a soft launch because the abuse requires a deliberately hostile paying organizer and only affects their own Space's storage cost.
- Concurrency: two simultaneous attaches can each pass the library check; the publish-time re-check catches the result before it goes live.

### Listening minutes / month - LAUNCH BLOCKER (not implemented)

Not implemented in B4 because it cannot be done safely and accurately on the current playback path:

1. `/api/media` only issues a 302 to a signed Storage URL; the audio bytes (and every Range/seek request) go to Storage, so the app never sees minutes listened - at best one hit per play start or URL refresh.
2. Published media in a public Space is `Cache-Control: public, max-age=60` at the CDN, so origin hits undercount.
3. The route is anonymous. Any counter it increments can be inflated by anyone with `curl`; if that counter ever gated playback it would let a stranger switch off an organizer's Space (DoS). It must not be used for enforcement as-is.
4. A DB write per anonymous request adds hot-path cost and an abuse surface.

Design for a follow-up (privacy-preserving, no listener identifiers, no cookies, no IP/UA):

- Table `space_listening_usage (tenant_id uuid, month date, minutes bigint, primary key (tenant_id, month))`, RLS on, no client grants; owner read via a SECURITY DEFINER getter.
- `record_space_listening(p_tenant_id uuid, p_minutes integer)` SECURITY DEFINER, `service_role` only, `insert ... on conflict do update set minutes = minutes + least(p_minutes, cap)`; `p_minutes` bounded to the track's stored duration (ceil minutes), month = `date_trunc('month', now() at time zone 'UTC')`.
- Measurement source: a first-party, cookieless beacon from the guest player (`navigator.sendBeacon` on 1-minute progress ticks for the published object), server-validated against the published snapshot and the Space's access state, coarse-rate-limited per Space (not per listener) so inflation is bounded per minute of wall-clock time. Alternative: Storage egress/log export aggregated per tenant folder daily.
- Enforcement only after the counter is proven accurate on Staging: soft (owner warning emails / Studio banner at 80% / 100%) first; never hard-block guests without an explicit product decision.

Until this ships, the listening allowance is display-only and must not be advertised as metered.
