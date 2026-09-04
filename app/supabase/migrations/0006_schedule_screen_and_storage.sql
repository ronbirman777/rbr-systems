-- Slice: Schedule guest screen + generic navigation + Storage/media architecture.
--
-- No new tables. Two things happen here:
--
-- 1. A private Storage bucket ("tenant-media") for tenant-scoped file
--    uploads, starting with Facilitator photos but path-namespaced so any
--    future module (meals, treatments, facilities, resources, branding...)
--    can reuse the exact same bucket and policy shape without a migration.
--    Path convention: {tenant_id}/{module_key}/{item_id}.{ext} - the first
--    path segment is always the tenant id, which is what the policies below
--    check against via storage.foldername(name).
--
-- 2. Storage RLS policies enforcing the same tenant-membership boundary
--    already used everywhere else (public.is_tenant_member). Only
--    `authenticated` gets any policy at all - anonymous has zero access to
--    this bucket, by omission, not by a public/private bucket flag alone.
--    Public guest delivery of specific already-published images is handled
--    entirely at the application layer (a narrow allow-listed route that
--    checks the request against the tenant's actual published snapshot
--    before minting a short-lived signed URL) rather than by making any
--    part of this bucket publicly readable - see src/app/api/media.

insert into storage.buckets (id, name, public)
values ('tenant-media', 'tenant-media', false)
on conflict (id) do nothing;

create policy "tenant members can read their own media"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'tenant-media'
    and public.is_tenant_member(((storage.foldername(name))[1])::uuid)
  );

create policy "tenant members can upload their own media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'tenant-media'
    and public.is_tenant_member(((storage.foldername(name))[1])::uuid)
  );

create policy "tenant members can replace their own media"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'tenant-media'
    and public.is_tenant_member(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'tenant-media'
    and public.is_tenant_member(((storage.foldername(name))[1])::uuid)
  );

create policy "tenant members can delete their own media"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'tenant-media'
    and public.is_tenant_member(((storage.foldername(name))[1])::uuid)
  );
