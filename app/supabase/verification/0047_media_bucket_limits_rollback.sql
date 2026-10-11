-- Rollback for 0047_media_bucket_limits.sql (TASK 032.5 W0-1).
-- Do NOT run unless the migration needs to be reverted. Rollback is never
-- automatic; nothing in CI, the Supabase CLI or the app runs this folder.
--
-- WHAT 0047 CHANGED: storage.buckets row 'tenant-media' got
--   file_size_limit = 104857600 and an allowed_mime_types list.
-- WHAT THIS DOES: restores both to NULL (the 0006 state: no limits).
-- REVERSIBLE: fully. DATA-DESTRUCTIVE: nothing (no object is touched).
-- ORDER: independent of the TASK 032 billing chain (0036-0046); may run
--   before or after it.
-- After running: `supabase migration repair --status reverted 0047`.

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'tenant-media') then
    raise exception '0047 rollback: bucket tenant-media not found - wrong database?';
  end if;
end
$$;

update storage.buckets
   set file_size_limit = null,
       allowed_mime_types = null
 where id = 'tenant-media';
