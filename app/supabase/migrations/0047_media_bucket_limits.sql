-- 0047 - tenant-media bucket limits (TASK 032.5 W0-1, media security gap closure).
--
-- Gap: the bucket was created in 0006 with only (id, name, public). It had no
-- file_size_limit and no allowed_mime_types, so a signed-in member could put
-- any object of any size and any declared type into their own tenant folder
-- straight through the Storage API, on legacy and paid Spaces alike (0045 only
-- narrows WHERE paid-Space members may write, not what or how big).
--
-- This sets Storage-enforced limits that match the application exactly:
--   * file_size_limit = 104857600 (100 MiB) = MAX_AUDIO_BYTES (src/lib/media/audio.ts).
--     Images are re-encoded to WebP server-side and are far smaller.
--   * allowed_mime_types = the image types the app writes (image/webp from
--     sharp; image/png and image/jpeg from legacyMigration.ts) plus exactly the
--     AUDIO_ALLOWED_TYPES keys the browser upload validates against.
--
-- Existing objects are untouched (Storage checks limits on upload only).
-- Inventory taken read-only on 2026-10-11 before writing this file:
--   Staging    tenant-media: image/webp 63, image/png 3, audio/wav 2, audio/mpeg 2,
--              application/octet-stream 1 (0-byte placeholder); largest 374 KB.
--   Production tenant-media: image/png 221, image/webp 82, image/jpeg 26,
--              audio/mpeg 2, application/octet-stream 1 (0-byte); largest 668 KB.
-- Every type the app currently writes is in the list; nothing existing exceeds the limit.
--
-- Limits: the MIME check is on the DECLARED content type, so it is a coarse
-- filter, not content validation (the magic-byte and decoder checks in the
-- Studio actions and 0045/0046 remain the content gate). The project-wide
-- Storage upload limit (Supabase dashboard setting, not in the repo) still
-- applies on top; if it is below 100 MiB it is the effective cap.
--
-- Rollback: supabase/verification/0047_media_bucket_limits_rollback.sql.

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'tenant-media') then
    raise exception '0047: bucket tenant-media not found - wrong database?';
  end if;
end
$$;

update storage.buckets
   set file_size_limit = 104857600,
       allowed_mime_types = array[
         'image/webp', 'image/png', 'image/jpeg',
         'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac',
         'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg'
       ]
 where id = 'tenant-media';
