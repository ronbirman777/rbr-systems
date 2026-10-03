-- 0029_versioned_media_update_deny.sql
--
-- TASK 027.5 Phase 4B: Storage UPDATE is denied for VERSIONED media in the
-- `tenant-media` bucket, while legacy stable-path media keeps its current
-- (0006) overwrite rights.
--
-- WHY
--   Since Phase 3C every new image and audio object is written under
--   {tenant}/{module}/{item}/{uploadId}/draft.<ext> and published by a
--   create-only server-side `copy` to .../published.<ext> in the same
--   folder. Those objects are immutable BY DESIGN - a Guest-visible
--   published.* must never change under a live snapshot. Until now that was
--   only an application convention: migration 0006's UPDATE policy lets a
--   tenant member overwrite ANY key in their folder. This migration makes it
--   a database rule.
--
-- EXACT PRE-EXISTING POLICIES (0006_schedule_screen_and_storage.sql; the
-- local stack carries the identical four, verified by pg_policies):
--   SELECT  "tenant members can read their own media"
--   INSERT  "tenant members can upload their own media"
--   UPDATE  "tenant members can replace their own media"
--           using / with check:
--             bucket_id = 'tenant-media'
--             and public.is_tenant_member(((storage.foldername(name))[1])::uuid)
--   DELETE  "tenant members can delete their own media"
--   No later migration touches storage.objects policies.
--
-- DESIGN
--   Nothing existing is dropped or rewritten. One RESTRICTIVE UPDATE policy
--   is ADDED; Postgres ANDs a restrictive policy with the permissive ones, so
--   an UPDATE now needs: (0006 membership) AND (neither the old nor the new
--   row is a versioned path).
--     - USING       protects the EXISTING row  (cannot overwrite/rename away)
--     - WITH CHECK  protects the RESULTING row (cannot rename/move a legacy
--                    object INTO a versioned path)
--   So an UPDATE-path transition (legacy <-> versioned) is blocked both ways,
--   and an INSERT ... ON CONFLICT DO UPDATE (upsert) onto a versioned key is
--   rejected too.
--   INSERT, SELECT, DELETE and every tenant-membership check are unchanged.
--   service_role bypasses RLS as before (server-side cleanup keeps working).
--   Other buckets are not affected (the policy is scoped to tenant-media).
--
-- VERSIONED PATH RULE (mirrors isVersionedMediaPath in src/lib/media/path.ts,
-- but deliberately BROADER so it errs toward immutable):
--   the object sits in exactly four folders (five path segments) and its
--   file name is draft.<ext> or published.<ext>, <ext> = [A-Za-z0-9]{1,8}.
--   The legacy layout ({tenant}/{module}/{item}/draft.<ext>, three folders)
--   never matches. The folder-segment character class is NOT checked in SQL:
--   any 4-folder draft/published object is treated as immutable.
--
-- ROLLBACK (no data is touched by this migration):
--   drop policy if exists "versioned media is immutable (no overwrite)" on storage.objects;
--   drop function if exists public.is_versioned_media_object(text);
--
-- Idempotent: safe to re-apply.

create or replace function public.is_versioned_media_object(p_name text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(cardinality(storage.foldername(p_name)), 0) = 4
     and storage.filename(p_name) ~ '^(draft|published)\.[A-Za-z0-9]{1,8}$'
$$;

revoke all on function public.is_versioned_media_object(text) from public, anon;
grant execute on function public.is_versioned_media_object(text) to authenticated, service_role;

drop policy if exists "versioned media is immutable (no overwrite)" on storage.objects;

create policy "versioned media is immutable (no overwrite)"
  on storage.objects
  as restrictive
  for update
  to authenticated
  using (
    bucket_id <> 'tenant-media'
    or not public.is_versioned_media_object(name)
  )
  with check (
    bucket_id <> 'tenant-media'
    or not public.is_versioned_media_object(name)
  );
