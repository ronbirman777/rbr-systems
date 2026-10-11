# 01 - Current audio architecture (TASK 032.5, Phase A + G + I inputs)

Read-only audit. Repo `app/` at branch `feat/032-commercial-platform-foundation`, HEAD `05ab36b`.
No hosted database, Storage, Cloudflare or Supabase resource was read, queried or created. **Staging and Production object counts were not queried.** Every statement below is taken from the repository unless it is marked **[assumption]** or **[unverified]**.

Path notation: `file:line` is relative to `app/` unless it starts with `docs/` or `tasks/`.

---

## 0. One-paragraph summary

All audio (Time to Teach `teachAudio`, Time to Flow `audio`) lives in a single private Supabase Storage bucket, `tenant-media`, at versioned keys `{tenant}/{teachAudioFile|audioFile}/{itemId}/{uploadId}/draft.<ext>` and a `published.<ext>` sibling in the same folder. The browser uploads the draft straight to Storage with the member's own session, on a path the server minted. A server action then checks the object through Storage metadata (`info`/`exists`). On a paid (enforced) Space it also downloads the bytes, measures the length (`audioDuration.ts`), takes a sha256 (`fingerprint.ts`), and records provenance (`billing_audio_verifications`, 0046) in the same transaction that writes `module_items.metadata.audioRef/durationSeconds`. Publish copies draft to published inside Storage (`copy`, create-only). On paid Spaces it re-hashes the published copy against the provenance row. `publish_space()` then rewrites `draft.` to `published.` in the snapshot JSON. Guests reach audio only through `/api/media/[...path]`. That route checks that the snapshot is a member and that the Space is available and passes the access code, then answers with a redirect to a Supabase signed URL that lasts 60 s (code-protected) or 180 s (public, with a `public, max-age=60` redirect). Range and seek requests go straight to Supabase Storage. Nothing meters listening. The app repo has no backup tooling for media, but **a standing Production Storage → Backblaze B2 sync does exist** in the separate infra repo (corrected 2026-10-11, see §23).

---

## 1. Lifecycle, step by step

### 1. Studio upload (browser -> Storage, three-step bracket)

| Step | Teach | Flow |
|---|---|---|
| Client pre-check (courtesy only) | `audioFileProblem()` `src/lib/media/audio.ts:71`, called at `src/app/(site)/configurator/teach/teach-studio-sections.tsx:1639` | same helper, `src/app/(site)/configurator/retreat/audio-step.tsx:394` |
| Browser duration probe (untrusted) | `detectAudioDuration()` `src/lib/media/audioUpload.ts:37`, at `teach-studio-sections.tsx:1643` | `audio-step.tsx:399` |
| 1. prepare: validate MIME and size, create the row if missing, mint the path | `prepareTeachAudioUpload` `src/app/(site)/configurator/teach/actions.ts:681` (wired at `teach-studio.tsx:493`) | `prepareFlowAudioUpload` `src/app/(site)/configurator/retreat/actions.ts:2081` |
| 2. upload: `storage.upload(path, file, { upsert:false, contentType:file.type })` through the browser Supabase client (`src/lib/supabase/client.ts`, publishable key + member JWT) | `uploadAudioDraftObject()` `src/lib/media/audioUpload.ts:15`, at `teach-studio-sections.tsx:1656` | `audio-step.tsx:413` |
| 3. attach: verify the stored object, write the ref, delete the replaced draft | `attachTeachAudio` `teach/actions.ts:726` | `attachFlowAudio` `retreat/actions.ts:2135` |
| detach | `detachTeachAudio` `teach/actions.ts:826` | `detachFlowAudio` `retreat/actions.ts:2237` |
| Studio preview URL after upload | `createSignedUrl(path, 3600)` with the member session, `teach-studio-sections.tsx:1666` | `audio-step.tsx:423` |

- This is **not** a signed *upload* URL (`createSignedUploadUrl` is not used anywhere). The browser writes under its own session, and Storage RLS is what authorizes the write (step 8).
- Path minting: `versionedMediaPath("draft", …)` with `newUploadId()` = `crypto.randomUUID()` (`src/lib/media/path.ts:81,106`). Folder keys: `TEACH_AUDIO_FOLDER_KEY = "teachAudioFile"` (`src/lib/teach/schemas.ts:82`), `FLOW_AUDIO_FOLDER_KEY = "audioFile"` (`src/lib/modules/flowLibrary.ts:144`). Module keys: `teachAudio`, `audio` (`flowLibrary.ts:31`).
- Server actions are capped at 10 MB, which is why audio bypasses them (`teach/actions.ts:651-652`).

### 2. Server validation

- MIME allowlist: `AUDIO_ALLOWED_TYPES` (mp3, m4a, aac, wav, ogg) `src/lib/media/audio.ts:9`. Extension map `:21`. Normalization `normalizeMimeType` `:38`.
- Size: `MAX_AUDIO_BYTES = 100 MiB` and `isAudioSizeAllowed` (`audio.ts:31-35`). Checked at prepare against the size the client *claims*, and at attach against `bucket.info(ref).size` (`teach/actions.ts:751-756`, `retreat/actions.ts:2163-2170`). The attach also requires `info.contentType` to map to the path's extension.
- **There is no bucket-level `file_size_limit` or `allowed_mime_types`**: the bucket is created in `supabase/migrations/0006_schedule_screen_and_storage.sql:23` with only `public=false`, and `supabase/config.toml` is absent. The 100 MB limit applies only *after* the bytes have landed. The real ceiling on the upload itself is the project's global Storage upload limit **[unverified, not in repo]**.
- Ref shape: `parseAudioDraftRef` (`audio.ts:47`) requires a versioned draft path with an audio extension. Each action also checks that the tenant, module folder and item match (`teach/actions.ts:734-736`, `retreat/actions.ts:2147-2149`; Teach Save `teach/actions.ts:443-448`).
- Byte-level audio validation runs **only on enforced (paid) Spaces**, through the duration parser below. Legacy and exempt Spaces get metadata checks only.

### 3. Server-measured duration

- `deriveAudioDuration(bytes, ext)` `src/lib/media/audioDuration.ts:78` (pure, 700 lines). It parses the frames and boxes that a decoder would actually play, so it returns an upper bound and never trusts a header's claimed length. `toWholeSeconds` `:58`.
- Caller: `measureStoredAudio(ref, ext)` `src/lib/billing/audioFinalize.server.ts:47`. It downloads the whole object with the **service role** (`createAdminClient`, `SUPABASE_SECRET_KEY`), fails closed on null, and from the same buffer produces `{seconds, sizeBytes, sha256}`.
- It runs only when `loadAudioQuotaPolicy(tenantId).mode === "enforced"` (`src/lib/billing/audioQuota.server.ts:14`). On legacy and exempt Spaces the browser-reported duration is stored (`checkAudioAttach` `src/lib/billing/audioQuota.ts:122-126`).
- Tests: `src/lib/media/audioDuration.test.ts`, `src/lib/billing/audioFinalize.server.test.ts`.

### 4. Provenance (0046)

- Table `public.billing_audio_verifications`, one row per item (`item_id` PK, FK cascade to `module_items`). It holds `audio_ref, duration_seconds, size_bytes, sha256, source(server|backfill), published_size_bytes/sha256/etag/verified_at` (`supabase/migrations/0046_billing_audio_provenance_and_exemption.sql:127-155`). RLS is on with no policies, so only the service role can touch it.
- Written by `billing_audio_attach_verified(...)` (SECURITY DEFINER, service_role only) `0046:181-254`. In one transaction it takes the per-tenant advisory lock, requires the ref to sit in the item's own folder, refuses `AUDIO_REUPLOAD` **when a `published.*` sibling already exists in `storage.objects`** (`0046:223-230`), upserts provenance and updates `module_items`.
- The app calls it through `writeEnforcedAudioFile` (`audioFinalize.server.ts:74`), after a `space_studio_writable` check.
- Enforced on reads by the trigger `billing_guard_module_item_audio` (restated `0046:259-342`, created `0043:180`) and by `billing_audio_assert_publishable` (restated `0046:348-430`; called inside `publish_space` (0043) and by the `published_spaces` trigger from 0045).
- Backfill: `billing_audio_backfill_record` `0046:435-505` and the audit table `billing_audio_backfill_findings` `0046:158-176`. Script `scripts/audio-duration-backfill.mjs` and `scripts/audioBackfillCore.mjs` (Staging only, dry-run by default, uses `SUPABASE_URL`/`SUPABASE_SECRET_KEY`). Test `scripts/audioBackfillCore.test.ts`. Doc `docs/billing/AUDIO-DURATION-BACKFILL.md`.
- Invariant trigger `billing_space_subscriptions_fresh_enforcement` `0046:597-624`: a Space cannot become non-exempt while it holds audio, a snapshot, **or any `storage.objects` row under its prefix**.

### 5. Hashing

- `sha256Hex`, `sameFingerprint` `src/lib/media/fingerprint.ts:8-16` (node:crypto over the full buffer).
- Used at attach (`measureStoredAudio`) and at publish (`fingerprintStoredObject` `src/lib/media/publish.ts:297` and `assertPublishedAudioFingerprint` `:306`). Publish skips the re-hash only when Storage `info().etag` and size equal the recorded `published_etag`/size (`publish.ts:321-323`). Recording happens in `recordPublishedAudioFingerprint` `audioFinalize.server.ts:146`.
- Concurrency limit: `AUDIO_PUBLISH_CONCURRENCY = 2` per server process (`publish.ts:65-78`).
- The design depends on Supabase Storage `etag` semantics, which `info()` exposes.

### 6. DB metadata

- `module_items.metadata.audioRef` (string, max 400) and `durationSeconds` (0..43200). Schema in `src/lib/modules/library.ts:84-86`, reused by Teach (`src/lib/teach/schemas.ts:509`) and Flow (`flowLibrary.ts:42`).
- Save actions never accept the file fields from the client on enforced Spaces. Teach: `saveTeachItems` `teach/actions.ts:522-539`. Flow: `saveFlowAudio` `retreat/actions.ts:2006-2047` (always carries the stored values over).
- Members cannot write the file fields on enforced Spaces: the 0043 trigger raises `AUDIO_SERVER_ONLY` (`0046:292-300`).
- The published copy of the ref lives in `published_spaces.modules`, as JSON: Teach under `teach.items.teachAudio[].metadata.audioRef`, Flow in the audio module payload. The fixture is at `src/lib/teach/postgresSnapshot.fixture.json:41`.

### 7. Object naming

- `src/lib/media/path.ts`: `MEDIA_BUCKET="tenant-media"` `:21`, `versionedMediaPath` `:106`, `parseVersionedMediaPath` `:121`, `isVersionedMediaPath` `:150`, `isDraftMediaPathForTenant` `:163`, `isDraftMediaPath` `:178`, `isPublishedMediaPath` `:183`, `publishedMediaPath` `:198` (string swap from draft to published), `publicMediaUrl` `:211` (`/api/media/<ref>`), `collectAudioRefs`/`collectMediaRefs` `:286,306`.
- The same draft-to-published swap is written in SQL: `regexp_replace(..., '/draft\.([a-zA-Z0-9]+)$', '/published.\1')` and the whole-payload text rewrite anchored on the tenant id (`0028:71-119`, `0033:181`, `0034:46,374`, `0035:44-94` `build_teach_payload`, `0043:255+` `publish_space`).
- **The object key is the public identifier.** It is stored verbatim in the snapshot, sent to the guest as `/api/media/<key>`, and used as the cache key.

### 8. Tenant ownership (Storage RLS)

| Policy | Migration | Effect |
|---|---|---|
| `tenant members can read/upload/replace/delete their own media` (select/insert/update/delete) | `0006:27-61`, made uuid-safe in `0030` | the first folder segment must be a tenant the caller belongs to (`is_tenant_member`) |
| `versioned media is immutable (no overwrite)` (restrictive update) | `0029` (`is_versioned_media_object`) | no member UPDATE of a 4-folder `draft|published.<ext>` object |
| `tenant media: billing allows studio writes (insert/update/delete)` (restrictive) | `0039:104-114` | members cannot write or delete when `space_studio_writable()` is false |
| `tenant media: paid spaces accept member uploads of draft audio only` (restrictive insert) / `... refuse member overwrites` (restrictive update) | `0045:84-127` (`billing_media_member_write_allowed`) | on enforced Spaces a member may INSERT only `.../{uploadId}/draft.(mp3|m4a|aac|wav|ogg)`, never UPDATE. DELETE is not restricted |

- On enforced Spaces the service role writes images and every published copy (`resolveMediaWriter` `src/lib/media/trustedMedia.server.ts:31`). Because the service role bypasses RLS, `resolveMediaWriter` checks membership (`is_tenant_member` RPC) and writability itself.
- Audit tests: `src/lib/media/storagePolicy.audit.test.ts`, `src/lib/media/versionedWriters.audit.test.ts`, `src/lib/media/realStack.0029.integration.test.ts` (`REAL_STACK_*` env), `src/app/(site)/configurator/mediaContentGuard.test.ts`. Verification SQL: `supabase/verification/0029_*`, `hosted/0029_*`, `hosted/0030_*`, `0045_*_rollback.sql`, `rehearse-billing-rollback.sh:345-349`.

### 9. Draft media

- A draft is mutable only in the sense that it can be deleted and re-created. Versioned paths are never overwritten (`upsert:false` plus 0029).
- Who deletes drafts: `removeDraftObjects` (`src/lib/media/draftCleanup.ts:14`, member session, `isDraftMediaPathForTenant` filter, best-effort). Callers:
  - attach replace and reject paths
  - detach
  - Teach `saveTeachItems` removed rows (`teach/actions.ts:548-553`, via `itemDraftRefs` `:382`, which **includes audioRef**)
  - Teach `deleteTeachItem` `:562`
- Draft preview in the Studio uses direct member-session signed URLs with a 3600 s TTL: Teach page `src/app/(site)/configurator/teach/[tenantId]/page.tsx:96` (`createSignedUrls`), Flow page `src/app/(site)/configurator/retreat/[tenantId]/page.tsx:63-66,438-441`.
- `/api/media` also has a draft-audio branch for signed-in members whose current draft row references the exact path (`serveDraftAudio` `src/app/api/media/[...path]/route.ts:191`, `isReferencedDraftAudio` `src/lib/media/draftAuthorization.ts:15`). **No current UI caller of that branch was found by grep.** The Studio uses the direct signed URLs above.

### 10. Published media

- Created only by publish: `copyDraftAudioToPublished` `src/lib/media/publish.ts:266` uses Storage server-side `copy` (`copyImmutableObject` `:212`), is create-only, and treats an existing identical object (size + etag, or bytes) as idempotent success (`objectsIdentical` `:192`, `sameBytes` `:173`).
- Removed only by the post-publish sweep `cleanupStalePublishedMedia` (`src/lib/media/publishedCleanup.ts:56`, member session). It removes previous-minus-current refs immediately, plus `published.*` orphans older than 10 min (`ORPHAN_GRACE_MS`). It recursively `list()`s the tenant prefix.
- Detaching or deleting a recording in the Studio does **not** remove it from guests until the next successful publish (by design).

### 11. Publish / republish

- Teach `publishTeachSpace` `teach/actions.ts:870-997`; Flow `publishSpace` `retreat/actions.ts:1523-1700` (audio at `:1577-1595`, `:1625-1660`).
- Order:
  1. commercial `canPublish`
  2. read the previous refs
  3. `checkAudioPublish` (`audioQuota.ts:164`)
  4. `resolveMediaWriter`
  5. load fingerprints when trusted (`loadAudioFingerprints` `audioFinalize.server.ts:107`)
  6. copy all media (failure means no RPC)
  7. `rpc("publish_space")`, which is SECURITY INVOKER: `0043:255` builds the snapshot, calls `billing_audio_assert_publishable` and runs `build_teach_payload` (`0035:37`)
  8. the `published_spaces` trigger `billing_guard_published_media` (`0045:132-175`) re-asserts
  9. re-read the snapshot, then run the sweep.
- Tests: `teach/publishTeachSpace.test.ts`, `retreat/publishSpace.test.ts`, `retreat/publishedMediaImmutability.test.ts`, `src/lib/media/publish.test.ts`, `publishedCleanup.test.ts`, `src/lib/spaceTypes/publishSpaceRegression.test.ts`, `src/lib/modules/flowPublishContract.test.ts`, `src/lib/teach/postgresSnapshot.test.ts`, `src/lib/modules/dailyInspirationPublish.test.ts`.

### 12. Guest audio access (`/api/media/[...path]`)

`src/app/api/media/[...path]/route.ts`:
1. Shape check `isWellFormedMediaPath` (`path.ts:239`). `path[0]` must be a tenant uuid.
2. Draft audio returns `serveDraftAudio` (members only).
3. `published_spaces.modules` is read with the **anon/public client** (`:80-85`). The path must be in `collectMediaRefs`.
4. The extension must match the field that names it (`imageRef` → image extension, `audioRef` → `AUDIO_EXTENSIONS`) (`:99-102`).
5. Any `draft.*` path is refused (`:115`).
6. `resolveGuestAccessDetailed` (`src/lib/guestAccess/effectiveAccess.ts:44`) checks `isSpacePubliclyAvailable` (admin read of tenant status plus `getSpaceCommercialAvailability`), then `get_guest_access_mode` (anon RPC), then the HMAC cookie (`checkCookie.ts`, `cookieToken.ts`, `GUEST_ACCESS_TOKEN_SECRET`).
7. The admin client mints a signed URL and the route answers with a 307 redirect (`signAndRedirect` `:143`).
- Every denial is the same bare 404 with `private, no-store`. If an error occurs while reading access, the answer is 503.
- The preview gate exempts `/api/media` (`src/lib/preview-gate/config.ts:37`, `src/proxy.ts`).
- Tests: `src/app/api/media/[...path]/route.test.ts`, `src/lib/guestAccess/*.test.ts`, `src/lib/media/draftAuthorization.test.ts`.

### 13. Access-code protection: what exists versus what is planned

- **What exists:** exactly **one Space-level guest access code** per tenant. It is set and disabled with `setGuestAccessCode`/`disableGuestAccessCode` (`src/app/(site)/configurator/retreat/guestAccessActions.ts:52,96`) and the RPCs `set_guest_access_code`/`disable_guest_access_code` (0016, restated 0044). It is verified by `verifyAction.ts`, which issues an HMAC cookie `{tenantId, version, exp}` that is invalidated when the version bumps. IP rate-limiting uses `ipHmac.ts` with `GUEST_ACCESS_IP_HMAC_SECRET`. The code gates **all** media of the Space except the hero/logo identity images (`publishedIdentityImageRefs`). Audio is gated like any other item.
- **What does not exist:** **no optional library access code and no optional per-recording access code.** A grep over `app/src`, `app/supabase`, `docs` and `tasks` for library/recording codes and audio_access_code finds nothing except the per-recording *duration maximum* (an entitlement, not a code). The "both required when both are configured" rule is therefore **planned / owner-stated only**, with no schema, RPC, cookie or route support.

### 14. Playback

- Shared hook `useAudioPlayer` `src/components/shared/use-audio-player.ts:55`: `preload="metadata"`, no autoplay, pause on unmount, `<audio src>` set to `/api/media/<published ref>`.
- Flow guest: `src/components/guest/audio-screen.tsx:181-233`. The URL is built at `src/components/guest/published-space-screen.tsx:117`.
- Teach guest: `src/components/teach/teach-library.tsx:274`, with URLs from `src/lib/teach/guestData.ts:137-140`.
- Studio previews use bare `<audio controls preload="none">` (`audio-step.tsx:438`, `teach-studio-sections.tsx:1680`) with 3600 s signed URLs.
- No service worker, no MSE/HLS, no prefetch of audio (`src/lib/media/prefetch.ts` handles images only). Test: `src/components/shared/audioPlayer.test.ts`.

### 15. Range and seeking

- The app never proxies bytes. The browser follows the 307 to the Supabase signed URL, and Supabase Storage answers the Range requests (`docs/billing/LISTENING-METERING-OPTIONS.md:9`). `docs/tasks/029/media-journey.mjs:156` accepts 200 or 206 from the audio source, which shows the route works but does not prove that seeking works.
- **[unverified risk]** Once the signed URL expires (60 s or 180 s), a browser that keeps issuing Range requests against the redirected URL will get a Storage error on a later seek or resume. A guest who pauses a 60-minute track and seeks after 3 minutes may then hit `status="error"` (`use-audio-player.ts:111`). The code has no re-resolve or retry logic. Whether this happens depends on the browser (Chromium appears to reuse the redirect target; Safari behaviour is unknown). This needs a real-browser test before and after any R2 change.

### 16. Playback URL lifetime and caching

- `src/lib/media/cachePolicy.ts`:
  - Versioned published media in a **public** Space gets `Cache-Control: public, max-age=60, immutable`, a signed TTL of 180 s, and no `Vary` (`:47-48,140-147`).
  - Draft, legacy and code-protected media get `private, no-store`, a 60 s TTL and `Vary: Cookie` (`:51,87-91`).
- `MEDIA_SIGNED_URL_TTL_SECONDS = 60` (`path.ts:222`), also used by the share-image pipeline (`src/lib/share/publishedSocialSpace.ts:143`).
- The revocation window is at most max-age (browser and CDN) plus the signed TTL. A signed URL that has already been issued cannot be revoked (`cachePolicy.ts:19-45`).

### 17. Listening minutes

- Not metered and not enforced anywhere. The allowance is display-only (`docs/billing/ENTITLEMENTS.md:170-172`, `ARCHITECTURE.md:120`, `LAUNCH-GATES.md:46`). The options analysis (A-E, with recommendations) is in `docs/billing/LISTENING-METERING-OPTIONS.md`. The value is carried as `listeningMinutesPerMonth` in `decideAudioQuotaPolicy` (`audioQuota.ts:59`). No beacon, counter table or route exists (no `sendBeacon` anywhere).

### 18. Entitlement enforcement

- App: `audioQuota.ts` (`checkAudioAttach` `:122`, `checkAudioPublish` `:164`, `summarizeLibrary` `:91`, `MAX_STORED_DURATION_SECONDS` 12 h `:36`). Policy loading is `audioQuota.server.ts:14` (service role, fails closed to `unavailable`).
- DB: `billing_audio_policy` (`0043:63`), the `billing_guard_module_item_audio` trigger (library total and per-recording maximum, advisory lock), `billing_audio_assert_publishable` (every snapshot `audioRef` must be a counted file), 0045's published-media trigger, and 0046's provenance requirement.
- Plan values: `docs/billing/ENTITLEMENTS.md`.
- Tests: `src/app/(site)/configurator/audioQuotaEnforcement.test.ts`, `src/lib/billing/audioQuota.test.ts`, `src/lib/billing/integration/journeys.int.test.ts`, `teach/audioLifecycle.test.ts`.

### 19. Audio deletion

- Detach and replace remove the one previous draft after the DB commit. The published copy stays until the next publish sweep. The provenance row stays (upserted on the next attach, or cascade-deleted with the item).
- Teach item deletion removes the draft audio (`itemDraftRefs` includes `audioRef`).
- **Gap: Flow item deletion does not remove the draft audio.** `deleteModuleItem` (`retreat/actions.ts:1451-1482`) selects and removes only `image_ref`, and so does `saveModuleItemsGeneric` for removed rows (`retreat/actions.ts:484`, the remove block around `:501-523`, which selects `id, image_ref`). The `{tenant}/audioFile/{item}/{uploadId}/draft.*` object becomes an orphan until the Space is deleted.
- Abandoned uploads (prepare → upload → never attach) are never swept. No draft-orphan sweeper exists. Only `published.*` orphans are swept.

### 20. Space deletion and replace

- `deleteSpaceCompletely` (`src/app/(site)/configurator/retreat/lifecycleActions.ts:339`) runs in this order:
  1. `loadSpaceDeletionGate` (`src/lib/billing/spaceDeletion.ts:46`; refuses while a live subscription exists)
  2. `removeSpaceMediaAsOwner` (`:304`) → `removeAllTenantMedia` (`src/lib/media/tenantCleanup.ts:75`): recursive list of `{tenant}/`, chunked remove of 100, throws on a short result. It uses the service role when the subscription has ended (`mediaVia:"service"`)
  3. the `delete_space` RPC (`supabase/migrations/0018_space_delete.sql`), which cascades the DB rows including `billing_audio_verifications`.
- Account deletion calls this for every owned Space: `src/app/(site)/(auth)/actions.ts:232`.
- `replaceSpace` (`lifecycleActions.ts:193`) removes all media first, then calls `replace_space` (0046 restatement `0046:510`).
- Tests: `retreat/lifecycleActions.test.ts`, `src/lib/media/tenantCleanup.test.ts`, `src/lib/billing/lifecycleAccess.test.ts`.

### 21. Subscription suspension

- From +24 h (`guest_suspended_at`): `isSpacePubliclyAvailable` is false, so `/api/media` returns 404 for every new request. Signed URLs that were already issued stay valid for up to 180 s, and cached public redirects for up to 60 s.
- From +168 h (`studio_suspended_at`): `space_studio_writable()` is false. The 0039 Storage policies refuse member insert, update and delete, `resolveMediaWriter` returns `studioLocked`, and `publish_space` refuses (`docs/billing/LIFECYCLE.md:8-9`).
- Suspension never touches the stored objects or the snapshot (`docs/billing/ARCHITECTURE.md:98`).

### 22. Payment recovery

- `billing_apply_subscription_state` clears `payment_failed_at` and the suspension stamps (`docs/billing/LIFECYCLE.md:55`). The guest app and media come back on the next request with **no republish and no media action**, because the objects and snapshot were never changed.
- Day 14 only stamps `eligible_for_deletion_at`. **No deletion job exists** (`LIFECYCLE.md:17,39-49`).

### 23. Backups

- **CORRECTION (2026-10-11).** The v1 text here said there was no standing media backup. That was wrong: v1 searched only the app repo.
- The verified state is in `docs/audits/GAP-INVESTIGATION-2026-10-11.md` §B:
  - The private repo `ronbirman777/innerdwes_backup_infra`, workflow `daily-storage-backup.yml`, rclone-syncs Production `tenant-media` (audio included) to B2 every ~4 h. In practice that is 4–10 h.
  - It has had 39 successful runs since 2026-09-30. The last was run `38119667145` on 2026-10-11, covering 332 objects, which matches Production's 332 objects / 2 audio.
  - B2 keeps hidden versions for 14 days.
- Gaps:
  - no Object Lock;
  - deletions propagate;
  - no checksum verification;
  - no restore drill;
  - B2 private/encryption status unverified;
  - no off-platform DB dump.
- This app repo itself still contains no backup code: no `.github/workflows`, no rclone/b2 references.
- Database: daily physical backups (verified read-only 2026-10-11: 7 COMPLETED, latest 2026-10-10T22:06Z), **PITR off** (`docs/tasks/029/prod-release-gate.json:26-31`, `docs/billing/ROLLBACK-REHEARSAL.md:252,261`). A database restore does not restore Storage objects **[assumption, platform behaviour]**.

### 24. DR docs

- Database-only DR: `docs/billing/MIGRATION-RECOVERY.md`, `ROLLBACK-REHEARSAL.md`, `PRODUCTION-RELEASE-PLAN.md`, `supabase/verification/*_rollback.sql`, `rehearse-billing-rollback.sh`.
- **There is no media DR runbook**: no RPO/RTO for audio, no object inventory or manifest process in-repo, no restore test. `docs/billing/LIFECYCLE.md:49` lists "how long deleted data persists in backups" as an open retention question.

---

## 2. Environment variables touching audio

| Var | Where | Role |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `src/lib/supabase/{client,server,public,admin}.ts` | Storage endpoint for upload, signing and download |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | client, server, public | browser upload (member JWT), anon snapshot read |
| `SUPABASE_SECRET_KEY` | `src/lib/supabase/admin.ts:21`, backfill scripts | measure and hash, trusted copies, signing in `/api/media`, ended-Space deletion |
| `GUEST_ACCESS_TOKEN_SECRET`, `GUEST_ACCESS_IP_HMAC_SECRET` | `src/lib/guestAccess/*` | access-code cookie and rate limit gating media |
| `SUPABASE_URL` | scripts | backfill and verification scripts |
| `REAL_STACK_STORAGE_URL`, `REAL_STACK_REST_URL`, `REAL_STACK_JWT_SECRET` | `realStack.0029.integration.test.ts` | real-stack Storage policy test |

No R2, Cloudflare or S3 variables exist in the app today.

---

## 3. Responsibilities: stay in Supabase versus move to R2

| Responsibility | Stays in Supabase (Postgres) | Moves to R2 (or a Worker in front of it) |
|---|---|---|
| Item rows, `audioRef`, `durationSeconds` | yes | - |
| Provenance (`billing_audio_verifications`), quota triggers, `publish_space`, snapshot | yes | - |
| Tenant membership / Studio writability decision | yes (`is_tenant_member`, `space_studio_writable`) | the decision must be made *by the app* before minting an R2 presigned PUT; R2 has no RLS |
| Guest authorization (snapshot membership, availability, access code) | yes (decision) | R2 serves only after the app's decision (presigned GET or Worker with signed token) |
| Byte storage of draft and published audio | - | yes |
| Range, seeking, egress | - | yes (R2 supports Range natively **[assumption, verify]**) |
| Copy draft to published, existence and ETag checks | - | yes (S3 `CopyObject` with `If-None-Match:*` / HeadObject); R2 ETag semantics differ from Supabase |
| Deletion and sweeps (list prefix, remove) | - | yes (S3 ListObjectsV2 / DeleteObjects) |
| Images | stay in Supabase Storage unless decided otherwise (transforms `?w=` depend on Supabase image transformations) | - |
| Listening metering | counters in Postgres | optional R2/Worker logs or analytics as input |
| Backup / DR | DB backups | R2 to B2 replication or rclone (new) |

**DB-to-Storage coupling that breaks silently with R2:** `billing_audio_attach_verified` (`0046:223-230`) and `billing_guard_subscription_enforcement` (`0046:612-613`) query `storage.objects` directly. If audio moves to R2, those `exists` checks return false. A planted published sibling would no longer be refused at the database layer, and the fresh-enforcement invariant would ignore R2 objects. These checks must be replaced: either an app-side HeadObject plus an argument passed into the RPC, or an `r2_objects` shadow table that the app maintains.

---

## 4. What a dual-read transition would touch

A dual-read transition means old refs resolve from Supabase Storage and new refs from R2, chosen by a discriminator.

1. **The discriminator.** Today the ref is a bare key with no backend marker. Options are a new `metadata.audioStore: "r2"` field (it needs schema, Save carry-over and snapshot propagation in `publish_space`/`build_teach_payload`, which copy metadata verbatim) or a key-prefix convention. Avoid anything that changes the `{tenant}/…/{uploadId}/{draft|published}.<ext>` shape, which is parsed in TypeScript (`path.ts`) and in SQL regexes (0028/0033/0034/0035/0043/0045/0046).
2. **`/api/media` route.** Branch after authorization: an R2 presigned GET (or Worker token) versus Supabase `createSignedUrl`. Keep the 404 uniformity, cachePolicy and the TTL pair.
3. **Studio preview signing.** `teach/[tenantId]/page.tsx:96`, `retreat/[tenantId]/page.tsx:63`, `audio-step.tsx:423`, `teach-studio-sections.tsx:1666`.
4. **Upload.** `prepare*AudioUpload` returns a presigned R2 PUT URL with a pinned Content-Type and length. `uploadAudioDraftObject` changes from the Supabase SDK to a `fetch` PUT. Membership and writability are now checked in the app, because there is no RLS.
5. **Attach.** `bucket.info`/`exists` become HeadObject. `measureStoredAudio` reads from R2. The RPC's `storage.objects` check must be replaced.
6. **Publish copy, fingerprint and ETag skip** (`publish.ts`). R2 CopyObject. Re-validate the ETag-skip assumption for R2 multipart ETags.
7. **Sweeps and deletions.** `publishedCleanup.ts`, `draftCleanup.ts`, `tenantCleanup.ts`: list and delete in **both** stores during the transition. Space deletion must fail closed if either store fails.
8. **Backfill and migration copy job** (new, service-role). Copy existing objects to R2, verify sha256 against `billing_audio_verifications`, then flip the discriminator. Do not change the snapshot until republish, or rewrite it carefully under the 0045 trigger.
9. **DB functions** reading `storage.objects` (see §3).

---

## 5. Affected-file inventory for an R2 migration

### Upload pipeline
- `src/lib/media/audioUpload.ts` (upload helper, browser duration probe)
- `src/lib/media/audio.ts` (MIME/size rules, `parseAudioDraftRef`)
- `src/lib/media/path.ts` (bucket constant, path builders, ref collectors, signed TTL)
- `src/app/(site)/configurator/teach/actions.ts` (`prepareTeachAudioUpload` :681, `attachTeachAudio` :726, `detachTeachAudio` :826, `saveTeachItems` :415, `deleteTeachItem` :562, `itemDraftRefs` :382)
- `src/app/(site)/configurator/retreat/actions.ts` (`prepareFlowAudioUpload` :2081, `attachFlowAudio` :2135, `detachFlowAudio` :2237, `saveFlowAudio` :2006, `deleteModuleItem` :1451, `saveModuleItemsGeneric` :484)
- `src/app/(site)/configurator/teach/teach-studio-sections.tsx` (:1638-1680), `teach-studio.tsx` (:493-501)
- `src/app/(site)/configurator/retreat/audio-step.tsx` (:394-438)
- `src/lib/billing/audioFinalize.server.ts` (`measureStoredAudio`, `writeEnforcedAudioFile`, `loadAudioFingerprints`, `recordPublishedAudioFingerprint`)
- `src/lib/media/trustedMedia.server.ts` (writer resolution; the R2 writer is always "trusted")
- `src/lib/media/audioDuration.ts` (unchanged logic; it may need streaming/ranged reads)
- `src/lib/media/fingerprint.ts` (streaming hash if files stop being fully buffered)
- `src/lib/media/draftAuthorization.ts`

### Publish pipeline
- `src/lib/media/publish.ts` (`copyDraftAudioToPublished`, `copyImmutableObject`, `objectsIdentical`, `fingerprintStoredObject`, `assertPublishedAudioFingerprint`)
- `src/lib/media/publishedCleanup.ts`
- `teach/actions.ts` `publishTeachSpace` :870; `retreat/actions.ts` `publishSpace` :1523
- SQL: `publish_space` (head 0043), `build_teach_payload` (0035), `billing_audio_assert_publishable` (0046), `billing_guard_published_media` (0045), `billing_audio_attach_verified` (0046, `storage.objects` check), `billing_guard_subscription_enforcement` (0046, `storage.objects` check). Any change needs a new forward migration, a rollback script and fingerprints (`docs/billing/MIGRATION-RECOVERY.md`).

### Playback / route
- `src/app/api/media/[...path]/route.ts`
- `src/lib/media/cachePolicy.ts`
- `src/lib/guestAccess/effectiveAccess.ts` (unchanged decision; it is reused by any Worker token issuer)
- `src/components/shared/use-audio-player.ts` (expiry and re-resolve handling)
- `src/components/guest/audio-screen.tsx`, `src/components/guest/published-space-screen.tsx:117`, `src/components/teach/teach-library.tsx`, `src/lib/teach/guestData.ts`
- Studio signing: `src/app/(site)/configurator/teach/[tenantId]/page.tsx:96`, `src/app/(site)/configurator/retreat/[tenantId]/page.tsx:63`
- `src/lib/preview-gate/config.ts`, `src/proxy.ts` (only if a new route or domain is added)
- `next.config.ts` (security headers; no CSP today, so no `media-src` change is needed unless a CSP is added)

### Metering
- `docs/billing/LISTENING-METERING-OPTIONS.md` (re-score options A/D/E against R2 and Workers)
- `src/lib/billing/audioQuota.ts` (`listeningMinutesPerMonth`)
- `src/lib/billing/entitlements.ts`, `billingPageModel.ts`, `customerView.ts` (display)
- new counters table and migration (not existing)

### Deletion
- `src/lib/media/draftCleanup.ts`, `src/lib/media/tenantCleanup.ts`, `src/lib/media/publishedCleanup.ts`
- `src/app/(site)/configurator/retreat/lifecycleActions.ts` (`replaceSpace` :193, `removeSpaceMediaAsOwner` :304, `deleteSpaceCompletely` :339)
- `src/lib/billing/spaceDeletion.ts`
- `src/app/(site)/(auth)/actions.ts:232` (account deletion)

### DR
- New: R2 inventory/manifest, R2 to B2 (or other) replication, restore runbook and restore test
- Reuse candidates (outside this repo): the TASK 027 infra-repo B2 pipeline
- `docs/billing/LIFECYCLE.md` §retention (backup retention question)

### Tests (existing ones that encode Supabase Storage behaviour)
- `src/app/api/media/[...path]/route.test.ts`
- `src/lib/media/{publish,publishedCleanup,tenantCleanup,draftAuthorization,path,audioDuration,storagePolicy.audit,versionedWriters.audit,realStack.0029.integration,prefetch}.test.ts`
- `src/lib/media/fakeSupabase.test-util.ts` (Storage fake; R2 needs its own fake)
- `src/lib/billing/{audioFinalize.server,audioQuota}.test.ts`, `src/lib/billing/integration/journeys.int.test.ts`, `src/lib/billing/testing/fakeStore.ts`
- `src/app/(site)/configurator/{audioQuotaEnforcement,mediaContentGuard}.test.ts`
- `src/app/(site)/configurator/teach/{audioLifecycle,actions,publishTeachSpace,saveTeachModules,studioStateRace}.test.ts`
- `src/app/(site)/configurator/retreat/{publishSpace,publishedMediaImmutability,lifecycleActions,saveDraftSlots,saveCustomPages}.test.ts`
- `src/components/shared/audioPlayer.test.ts`, `src/components/guestMediaPrefetch.test.ts`
- `src/lib/teach/postgresSnapshot.test.ts` (+ fixture), `src/lib/spaceTypes/{publishSpaceRegression,billingRollback}.test.ts`, `src/lib/modules/flowPublishContract.test.ts`
- `scripts/audioBackfillCore.test.ts`
- SQL: `supabase/verification/0028_*`, `0029_*`, `0045_*_rollback.sql`, `0046_*_rollback.sql`, `hosted/0028_0029_*`, `hosted/0029_*`, `hosted/0030_*`, `rehearse-billing-rollback.sh`
- Browser journeys: `docs/tasks/029/media-journey.mjs`, `preview-journey.mjs`

### Docs
- `docs/billing/ENTITLEMENTS.md`, `ARCHITECTURE.md`, `LISTENING-METERING-OPTIONS.md`, `AUDIO-DURATION-BACKFILL.md`, `RLS-GRANTS.md`, `MIGRATION-RECOVERY.md`, `ROLLBACK-REHEARSAL.md`, `PRODUCTION-RELEASE-PLAN.md`, `LAUNCH-GATES.md`, `ENVIRONMENT.md`, `EXTERNAL-SETUP-CHECKLIST.md`, `OPERATIONS.md`, `LIFECYCLE.md`

### Env
- New (proposed, not existing): R2 account id, access key id, secret, bucket name(s), optional public/custom domain, and Worker signing secret. They must be scoped per Vercel environment (Preview, `staging` custom env, Production), isolated from Production per `CLAUDE.md`.
- Existing: `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_*` (keep, for images and the DB).

### Ops scripts
- `scripts/audio-duration-backfill.mjs`, `scripts/audioBackfillCore.mjs` (read from R2 for migrated items)
- `scripts/billing-db-verify.mjs`, `scripts/customer-funnel-qa.mjs`, `scripts/admin-qa.mjs` (audio references)
- `src/lib/media/legacyMigration.ts`, `migrationScope.ts` (TASK 027 image-legacy tooling; a pattern for a copy-and-verify job)

---

## 6. Security gaps and risks noticed in the current design

Ordered by estimated impact. None were exploited or tested against hosted systems.

1. **No bucket-level size or MIME limit.** The browser-direct upload is bounded only by the project-global limit **[unverified value]**. `MAX_AUDIO_BYTES` is checked after the bytes have landed. Any member, on any Space type, can store large objects in their own folder. That is a storage-cost abuse vector.
2. **Unattached drafts are never swept.** Abandoned uploads, and on enforced Spaces any number of `.../draft.mp3` inserts that are never attached, accumulate and are not counted against the audio library allowance. Combined with (1), a paid member can hold unbounded uncounted bytes. Only `published.*` orphans are swept.
3. **Flow item deletion leaves the draft audio orphaned** (`retreat/actions.ts:1466-1479` and `saveModuleItemsGeneric`): only `image_ref` is removed. Teach handles this correctly.
4. **DB integrity checks depend on `storage.objects`** (`0046:223-230`, `0046:612-613`). This is safe today but becomes a silent bypass after any move of audio out of Supabase Storage (see §3).
5. **Legacy and exempt Spaces get no byte validation of audio.** Content-Type is whatever the browser declared, and on legacy Spaces the owner can write `published_spaces` directly (SECURITY INVOKER publish, no 0045 guard). Served from the Supabase domain, this cannot script against the app origin. If R2 is ever exposed on an app-owned (sub)domain, force `Content-Type` from the extension and `X-Content-Type-Options: nosniff`, and consider `Content-Disposition`, or arbitrary uploaded bytes become same-site content.
6. **Signed URLs cannot be revoked**: up to 180 s (public) or 60 s (code-protected) after suspension, code change or archive, plus a 60 s cached public redirect. This is documented and accepted, but it applies to audio too. A shared signed URL also works for anyone during that window.
7. **[unverified] Seek or resume after signed-URL expiry** may fail for long recordings (§15). This is a functional issue that matters for any short-TTL design, including R2 presigned URLs.
8. **Studio draft URLs last 3600 s** (member-session signing). A removed member keeps working draft links for up to an hour. This is low risk.
9. **Server-side full buffering.** Attach and publish download and hash up to 100 MB per file in a serverless function (publish concurrency 2 per process). This is a memory and time risk on Vercel and a DoS lever for a paid member who triggers repeated attaches.
10. **No media backup or DR in-repo; PITR off.** A Storage loss or accidental tenant-prefix deletion has no documented recovery. The TASK 027 B2 snapshot was a one-off, held in another repo.
11. **The access-code model is Space-wide only.** The owner-described library and per-recording codes do not exist, so any audio that should be gated separately is currently visible to every guest who has the Space code.
12. **The `/api/media` draft-audio branch has no UI caller** (dead but reachable code path). It is correctly authorized, but it adds surface, so keep it in mind when changing the route.
