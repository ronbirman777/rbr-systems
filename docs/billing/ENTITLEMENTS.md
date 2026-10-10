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
| Audio (or any non-image bytes) behind an image reference (0045) | n/a (images: see "Media content guard" below) | **Storage refuses** a member upload of any image object or published copy on a paid Space; a draft field may hold any string, but it cannot be published unless it names one of the Space's own image paths | **Enforced**: service-role copy, published image re-validated from its bytes | **Refused** (`MEDIA_REF_INVALID`), also for a direct owner write to `published_spaces` | `/api/media` serves an `imageRef` path only with an image extension |
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

- **Audio bytes under an image reference: closed on paid Spaces by 0045** (see "Media content guard" below). Still open by design on **legacy and exempt** Spaces, where a member can still write any bytes into their own folder through the Storage API and name them from an image field (the upload content check applies to them too, but the direct Storage/PostgREST path is unchanged there). The serve-time extension check in `/api/media` applies to every Space.
- **Draft audio swapped after measurement (paid Spaces).** A member may still DELETE a measured `draft.<audio>` object and upload different audio bytes at the same versioned path (0045 allows member inserts of draft audio, and deletes). The publish copy is server-side and does not re-measure, so the swapped bytes would be published under the measured length. Closing this needs either a stored content hash checked at publish or making draft-audio deletion service-role only. Not done in TASK A.
- **Rows written while a Space was unenforced** keep their browser-reported length. Today paid Spaces are always newly provisioned, so this only matters if an existing legacy/exempt Space is ever converted; the publish guard still sums those values.
- **Exempt Spaces** are never limited (by design).
- **Listening minutes**: not enforced and not metered - below.

### Media content guard (0045): no audio or other non-image bytes behind an image reference

Gap closed: Storage policies checked the tenant folder, never the content, and a member could write image refs directly (module_items, module_configs, brand_configs, settings JSON, and even `published_spaces.modules`, which the owner may write because `publish_space()` is SECURITY INVOKER). An hour of audio named `draft.webp` would have been served by `/api/media` as an "image" and never counted.

Where image refs are set, and how the bytes get there (map at the time of 0045):

| Ref | Set by | Bytes written by |
|---|---|---|
| `module_items.image_ref` (meals, treatments, facilities, facilitators, custom pages, Teach items/covers) | `uploadModuleItemPhoto` (upsert), item Saves carry it over | Server Action: upload -> magic-byte check -> sharp re-encode -> Storage |
| `module_configs.image_ref` (module covers) | `uploadModuleCoverPhoto` | same |
| `brand_configs.hero_image_ref / space_image_ref / logo_ref` | `uploadBrandImage` | same |
| `module_settings.data` `imageRef` (Teach About profile, Contact cover, Explore cards) | Studio stores the ref returned by `uploadTeachSettingsImage`, then `saveTeachSettings` | same |
| `published_spaces.modules` `imageRef` (every one of the above, draft -> published) | `publish_space()` (or a direct owner write) | Publish: `copyDraftToPublished` |
| `metadata.audioRef` (audio, for comparison) | `attachTeachAudio` / `attachFlowAudio` | Browser -> Storage directly (signed path minted by the server), measured by the service role at attach (0043) |

There is no browser-direct image upload: every image passes through a Server Action. The weakness was only the bypass (direct Storage upload + direct ref write).

| Layer | Every Space | Paid (billing-governed, non-exempt) Space |
|---|---|---|
| Upload content check (`lib/media/imageSignature.ts` `sniffImage`) | The uploaded bytes must be a JPEG, PNG or WebP (magic bytes + complete header, 1..16383 px) **before** sharp runs. Extension, declared MIME and folder are ignored. Refuses audio renamed `.jpg`, SVG/HTML (sharp would otherwise rasterise SVG), GIF/AVIF/HEIC, truncated headers | same |
| Re-encode | sharp -> WebP <= 2000 px (unchanged); nothing appended to the source survives | same |
| Who writes the image object | Member session (unchanged) | **Service role** (`lib/media/trustedMedia.server.ts` `storeDraftImage`), after checking the caller is a tenant member and `space_studio_writable()`; the stored bytes must be a canonical WebP (`isCanonicalStoredImage`: RIFF length covers the whole file, so no appended payload; dims <= 2000) |
| Storage (0045 restrictive policies) | unchanged | A member may INSERT only `{tenant}/{module}/{item}/{uploadId}/draft.{mp3,m4a,aac,wav,ogg}` (the browser-direct audio upload) and may never UPDATE (overwrite/move). DELETE unchanged. So no member-written bytes can sit at an image path or a published path |
| Publish copy | Member session (unchanged) | **Service role**, only for this tenant's own `draft.webp`; every newly created published image is downloaded and must be a canonical WebP, otherwise the published copy **and** the draft are deleted and the publish fails before the RPC. Audio copies: service role, tenant-checked |
| Snapshot (0045 trigger `billing_guard_published_media`) | unchanged | Every `imageRef` must be null/empty or `{tenant}/{2-3 segments}/{draft|published}.{webp,png,jpg,jpeg}`, else `MEDIA_REF_INVALID`; the 0043 audio rules are re-run on the row actually written (closes a direct `published_spaces` write that skipped `publish_space()`) |
| Serve (`/api/media`) | A path named only under `imageRef` must have an image extension, one named only under `audioRef` an audio extension; otherwise the usual bare 404 | same |

Design choice: unlike 0043 for audio, member writes of draft image refs are NOT forbidden at the four source tables. Those refs live in four tables and free-form settings JSON written by ordinary Save actions, and a draft ref is never served; the snapshot is the only thing `/api/media` serves. With the Storage policies, a snapshot image ref on a paid Space can only name bytes the trusted pipeline wrote. Serve-time sniffing was rejected as the primary control: `/api/media` redirects to a signed Storage URL and never sees the bytes (it would need a download per request, and the Content-Type/nosniff headers come from Storage, not from us).

Legacy and exempt Spaces: no behaviour change except the upload content check and the serve-time extension check (both pure safety: a real image always passes). Studio errors reuse existing messages (`imageNotProcessed`, `needsActiveAccess`, `couldNotPublishPhotos`/`couldNotPublishMedia`); no new strings.

Code: `src/lib/media/imageSignature.ts`, `src/lib/media/trustedMedia.server.ts`, `src/lib/media/publish.ts`, `src/lib/media/optimizeImage.ts`, the upload/publish actions in `configurator/retreat/actions.ts` and `configurator/teach/actions.ts`, `src/app/api/media/[...path]/route.ts`; database: `supabase/migrations/0045_billing_media_content_guard.sql` (rollback `supabase/verification/0045_billing_media_content_guard_rollback.sql`). Tests: `src/lib/media/imageSignature.test.ts`, `src/app/(site)/configurator/mediaContentGuard.test.ts`, `src/app/api/media/[...path]/route.test.ts`, `src/lib/spaceTypes/billingRollback.test.ts`; local database behaviour: `rehearse-billing-rollback.sh` step 4b (22 checks); Staging check: `scripts/billing-db-verify.mjs` section O (not run). Not applied to Staging or Production.

### Listening minutes / month - NOT ENFORCED (launch blocker)

The listening allowance is **display-only**: nothing counts minutes listened and nothing limits playback. It must not be advertised as metered. Why it cannot be done safely on the current playback path (302 to a short-lived signed Storage URL, CDN caching, anonymous route), and the options for doing it without listener tracking, are in [`LISTENING-METERING-OPTIONS.md`](./LISTENING-METERING-OPTIONS.md).
