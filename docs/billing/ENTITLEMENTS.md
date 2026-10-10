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

- **The add-on is entitlement-only: there is no purchase path of any kind** (audited 2026-10-10 on `feat/032` at 196db35):
  - Checkout: `startCheckout` -> `stripe/real.ts` sends exactly one line item, the plan's base price (`line_items: [{ price: a.priceId, quantity: 1 }]`). No add-on line item, no quantity selector, no upsell step.
  - Stripe: no Stripe product/price exists or is created for `audio_pack`. Admin "sync plan" creates only the base product/price; the plan's `addons.audio_pack.priceMinor` (500) is never sent to Stripe. `mapSubscription` reads only `items.data[0]` (the base price); a second subscription item would be ignored, not mapped to an add-on.
  - Admin: no Admin action, form or service function grants, sells or edits add-on quantity. Nothing in `app/src` writes `space_subscription_addons`.
  - Customer UI: the Billing page shows the computed entitlement only (`customerView.ts` reads the quantity, defaulting to 0); there is no "buy more audio" button. The marketing pricing section's add-on is the unrelated one-time "Done For You Setup" text, not `audio_pack`.
  - The only writer anywhere is the Staging verification script `scripts/billing-db-verify.mjs` (service role, synthetic rows, to prove the SQL arithmetic).
- Consequence: every paid Space is limited to the base bundle (240 / 60 / 100,000). An owner-side manual grant would be a direct service-role write to `space_subscription_addons` (a DB mutation that needs explicit task authorisation, is not audited in `admin_audit_log`, and does not charge anything); it is not a supported process.
- Selling the add-on needs a separate task: a Stripe price per mode, a second subscription item (or separate subscription), mapping that item's quantity into `space_subscription_addons` in `sync.ts`, proration rules, customer UI, emails and an Admin view. Do not advertise it before then.
- `space_audio_entitlements` is executable by `service_role` only.
- TS and SQL arithmetic parity is pinned by tests (`domain.test.ts` reads the migration SQL and pins the numbers).

## Enforcement (TASK B4, B4b)

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

**Before B4b, duration was client-reported.** `detectAudioDuration` reads `<audio>.duration` in the browser and passes it to attach. B4 bounded it from below by a byte-size floor; B4b replaced that with a server-side measurement of the stored bytes on paid Spaces (below). Legacy and exempt Spaces still store the browser value.

### Policy (who is enforced)

Decided from the Space's own billing row (`loadAudioQuotaPolicy`, service-role read after the action has verified the user's tenant access), never from the global `paid_checkout_enabled` flag - turning the flag off cannot lift a paid Space's limits.

| Space | Behaviour |
|---|---|
| No `space_subscriptions` row (every legacy / flag-off Space) | Unchanged: no quota checks, pre-B4 duration normalization byte for byte |
| `status = 'exempt'` (internal/complimentary, incl. expired exemptions) | Not blocked. The base entitlement is display-only for them |
| Any other status | Enforced against `space_audio_entitlements(tenant)` (base bundle + `audio_pack` add-ons) |
| Row or entitlement unreadable / malformed | Fail closed: attach, paid-Space Teach audio save and publish refuse with `audioAllowanceUnavailable` |

The database applies the same decision (`billing_audio_policy`, 0043), so the rule holds for direct PostgREST writes and direct RPC calls too.

### Enforcement matrix (what ships, B4 + B4b)

| Rule | Attach (finalize) | Direct PostgREST write (member) | Publish (server action) | Direct `publish_space()` RPC | Playback |
|---|---|---|---|---|---|
| Max 60:00 per recording (never raised by add-ons) | **Enforced on the server-measured length**: 3600 s passes, 3601 s refused. Rejected new upload is removed | **Refused**: a member cannot set or change `audioRef`/`durationSeconds` at all (`AUDIO_SERVER_ONLY`); the service-role write is re-checked (`AUDIO_LIMIT`) | **Enforced** over every attached file | **Enforced** (`AUDIO_LIMIT`) | n/a |
| Library total (240 + 240 x add-ons minutes) | **Enforced**: other files + this one <= allowance (exactly at allowance passes); re-checked by the database on the write under a per-Space lock | **Refused** (as above) | **Enforced**, before any media copy | **Enforced** (`AUDIO_LIMIT`) | n/a |
| Unknown length | **Refused** when the server cannot measure the file (`audioDurationUnknown`; suggests MP3/M4A) | **Refused** | **Refused** | **Refused** | n/a |
| Audio published from anywhere other than a counted file | n/a | n/a | n/a | **Refused**: every `"audioRef"` anywhere in the snapshot being published must be a counted file | n/a |
| Listening 100,000 + 70,000 x add-ons min/month | - | - | - | - | **Not enforced, not metered** (see below) |

Legacy (no billing row) and exempt Spaces are unchanged at every layer: no measurement download, the browser-reported duration normalized as before, member-session writes, and the database trigger and publish guard return immediately.

Errors are localized in the Studio namespace for en/de/es/fr/he; Studio tr/it are partial dictionaries and fall back to English until TASK 033 (pinned by `audioQuota.test.ts`). The database's own refusals (only reachable by bypassing the Studio, or in a race) are English messages with a stable hint (`AUDIO_SERVER_ONLY`, `AUDIO_LIMIT`).

Code: `src/lib/media/audioDuration.ts` (pure parsers), `src/lib/billing/audioFinalize.server.ts` (service-role download + measured write), `src/lib/billing/audioQuota.ts` (pure rules), `src/lib/billing/audioQuota.server.ts` (policy read), call sites in `configurator/teach/actions.ts` and `configurator/retreat/actions.ts`; database: `supabase/migrations/0043_billing_audio_enforcement.sql`. Tests: `src/lib/media/audioDuration.test.ts`, `src/lib/billing/audioQuota.test.ts`, `src/app/(site)/configurator/audioQuotaEnforcement.test.ts`, `src/lib/spaceTypes/publishSpaceRegression.test.ts`, `src/lib/spaceTypes/billingRollback.test.ts`; Staging behaviour: `scripts/billing-db-verify.mjs` section M.

### Duration: server-derived on paid Spaces (B4b)

On an enforced Space the browser-reported length is ignored. `attachTeachAudio` / `attachFlowAudio` download the stored object with the service role (up to the existing 100 MB cap) and measure it in-process; no dependency was added. The parsers treat every header field as attacker-controlled and measure decodable content, taking the larger value where a header claims more (an upper bound on what a player plays):

| Container | How the length is measured | Refused (fail closed) |
|---|---|---|
| WAV | bytes after the `data` chunk header / byte rate (a too-small declared data size cannot hide samples); format fields must be self-consistent | non-PCM/float formats, RF64, inconsistent `fmt` |
| MP3 | full MPEG audio frame scan (Layer I/II/III, MPEG-1/2/2.5) with resync; Xing/Info/VBRI counts ignored; ID3v2/ID3v1/APE tags skipped | free-format bitrate; files whose frames do not cover the bytes (another container named .mp3, frames hidden among undecodable data) |
| AAC | ADTS frame scan (same rules); MP4 bytes named .aac use the MP4 parser | ADIF |
| M4A | per sound track: max(sum of `stts`, `mdhd`, `tkhd`, sum of `elst` segments - an edit list can repeat media), overall max with `mvhd` | fragmented MP4 (`moof`/`mvex`), `stts`/`stsz` count mismatch, boxes not chaining to the end, no sound track, edit rates other than 0/1 |
| OGG | Vorbis: per-packet decoded samples from the setup header's mode table; Opus: per-packet samples from the TOC byte; max with the last granule position | more than one logical stream (multiplexed/chained), FLAC/Speex in Ogg, pages not covering the file |

The stored `durationSeconds` is that measurement rounded to the nearest whole second (so an honest "60:00" export with a few hundredths of encoder padding passes). From 0043 on, only the service-role path can write it on a paid Space, so it is authoritative for the publish-time sum.

### Database enforcement (0043)

- Trigger `billing_guard_module_item_audio` (BEFORE INSERT/UPDATE on `module_items`): on an enforced Space a member session cannot set or change `metadata.audioRef` / `durationSeconds` on **any** row (Teach `teachAudio`, Flow `audio`, or any other module key); clearing both (detach) and edits that leave them untouched (Save, rename, reorder) still work. Any other writer (the finalize path) must store a whole-second length within the per-recording maximum and keep the library total within `space_audio_entitlements` (base + add-ons), serialised per Space.
- `publish_space()` = the 0039 body plus one marked call to `billing_audio_assert_publishable`, which re-checks every attached file (known length, <= max, sum <= allowance) and refuses any `"audioRef"` in the snapshot that is not one of those files (e.g. one smuggled into a settings object). Proven mechanically by `publishSpaceRegression.test.ts`.
- `billing_audio_policy(tenant)` mirrors `loadAudioQuotaPolicy`: legacy / exempt / enforced / unavailable (fail closed); a signed-in non-member gets `unavailable`.
- Verified so far on a throwaway local database only (35 behavioural checks and the 0043 -> 0042 rollback chain). Not yet applied to Staging or Production; `billing-db-verify.mjs` section M is the Staging check.

### What remains unenforced (explicit)

- **Audio bytes under an image reference.** A member can upload any bytes to their own tenant folder (Storage policies check the folder, not the content) and point an `image_ref` / `imageRef` at them; the guest media route serves any snapshot `imageRef`. Such a file is not counted. Closing this needs Storage-level rules (e.g. member uploads only as `draft.*`, publish copies made by the service role, content-type/magic-byte checks on images). Abuse requires a deliberately hostile paying organizer and only affects their own Space.
- **Rows written while a Space was unenforced** keep their browser-reported length. Today paid Spaces are always newly provisioned, so this only matters if an existing legacy/exempt Space is ever converted; the publish guard still sums those values.
- **Exempt Spaces** are never limited (by design).
- **Listening minutes**: not enforced and not metered - below.

### Listening minutes / month - NOT ENFORCED (launch blocker)

The listening allowance is **display-only**: nothing counts minutes listened and nothing limits playback. It must not be advertised as metered. Why it cannot be done safely on the current playback path (302 to a short-lived signed Storage URL, CDN caching, anonymous route), and the options for doing it without listener tracking, are in [`LISTENING-METERING-OPTIONS.md`](./LISTENING-METERING-OPTIONS.md).
