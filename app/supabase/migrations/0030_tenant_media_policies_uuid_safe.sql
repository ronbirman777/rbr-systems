-- 0030_tenant_media_policies_uuid_safe.sql
--
-- TASK 027.5 QA correction: the four `tenant-media` membership policies from
-- 0006 must never THROW on an object whose first path segment is not a UUID.
--
-- WHY
--   0006 evaluates `public.is_tenant_member(((storage.foldername(name))[1])::uuid)`.
--   The ::uuid cast raises 22P02 for a non-UUID first folder. Storage's
--   list/search runs as the caller under RLS, so ONE stray object such as
--   `tenant-media/__backup_test/.emptyFolderPlaceholder` makes every
--   storage.list() fail for EVERY authenticated user. Space deletion lists a
--   Space's media first (Storage-first cleanup), so every Space delete and
--   Replace failed with "Couldn't delete this Space" until the object was
--   removed. SQL does not guarantee left-to-right evaluation of AND, so
--   putting a regex test beside the cast is not enough; a CASE is.
--
-- WHAT CHANGES (security-neutral)
--   Each policy keeps the SAME roles, commands, bucket scope and the SAME
--   tenant-membership check. The only difference: when the first folder is not
--   a canonical UUID the predicate is FALSE (deny) instead of raising.
--   A valid UUID folder is evaluated exactly as before. Nothing is widened:
--   an object that errored before is now simply invisible to members.
--   The 0029 RESTRICTIVE UPDATE policy is not touched. service_role bypasses
--   RLS as before (server-side cleanup is unchanged).
--
-- NO DATA IS TOUCHED. No bucket, object or table row is read or rewritten; only
-- the four policy expressions change. Re-applying is a no-op (idempotent).
--
-- ROLLBACK (restores the exact 0006 predicates, INCLUDING their 22P02 hazard on
-- a non-UUID first folder - so remove any stray non-UUID object first):
--   alter policy "tenant members can read their own media" on storage.objects
--     using (bucket_id = 'tenant-media' and public.is_tenant_member(((storage.foldername(name))[1])::uuid));
--   alter policy "tenant members can upload their own media" on storage.objects
--     with check (bucket_id = 'tenant-media' and public.is_tenant_member(((storage.foldername(name))[1])::uuid));
--   alter policy "tenant members can replace their own media" on storage.objects
--     using (bucket_id = 'tenant-media' and public.is_tenant_member(((storage.foldername(name))[1])::uuid))
--     with check (bucket_id = 'tenant-media' and public.is_tenant_member(((storage.foldername(name))[1])::uuid));
--   alter policy "tenant members can delete their own media" on storage.objects
--     using (bucket_id = 'tenant-media' and public.is_tenant_member(((storage.foldername(name))[1])::uuid));
--
-- ALTER POLICY is used (not drop/create): atomic, no instant without a policy,
-- policy names and the one-per-command shape asserted by the catalog
-- verification stay intact.

alter policy "tenant members can read their own media"
  on storage.objects
  using (
    bucket_id = 'tenant-media'
    and case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.is_tenant_member(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

alter policy "tenant members can upload their own media"
  on storage.objects
  with check (
    bucket_id = 'tenant-media'
    and case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.is_tenant_member(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

alter policy "tenant members can replace their own media"
  on storage.objects
  using (
    bucket_id = 'tenant-media'
    and case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.is_tenant_member(((storage.foldername(name))[1])::uuid)
      else false
    end
  )
  with check (
    bucket_id = 'tenant-media'
    and case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.is_tenant_member(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

alter policy "tenant members can delete their own media"
  on storage.objects
  using (
    bucket_id = 'tenant-media'
    and case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.is_tenant_member(((storage.foldername(name))[1])::uuid)
      else false
    end
  );
