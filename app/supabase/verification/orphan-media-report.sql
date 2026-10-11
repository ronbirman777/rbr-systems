-- READ-ONLY orphan draft report for tenant-media (TASK 032.5 W0-2).
-- Lists counts only (no object names) of draft objects that no row references.
-- Run on Staging or Production with a read-only session. It deletes nothing.
-- Last run 2026-10-11: Staging 43 drafts / 0 orphans; Production 188 drafts / 0 orphans.
with refs as (
  select image_ref r from public.module_items where image_ref is not null
  union select metadata->>'audioRef' from public.module_items where metadata ? 'audioRef'
  union select image_ref from public.module_configs where image_ref is not null
  union select hero_image_ref from public.brand_configs where hero_image_ref is not null
  union select space_image_ref from public.brand_configs where space_image_ref is not null
  union select logo_ref from public.brand_configs where logo_ref is not null
)
select (o.name ~ '/(teachAudioFile|audioFile)/') as is_audio,
       count(*) filter (where o.name ~ '/draft\.[a-z0-9]+$') as drafts,
       count(*) filter (where o.name ~ '/draft\.[a-z0-9]+$' and o.name not in (select r from refs)) as orphan_drafts,
       count(*) filter (where o.name ~ '/draft\.[a-z0-9]+$' and o.name not in (select r from refs)
                          and o.created_at < now() - interval '24 hours') as orphan_drafts_older_24h,
       coalesce(sum((o.metadata->>'size')::bigint) filter (
         where o.name ~ '/draft\.[a-z0-9]+$' and o.name not in (select r from refs)), 0) as orphan_bytes
from storage.objects o
where o.bucket_id = 'tenant-media'
group by 1;
