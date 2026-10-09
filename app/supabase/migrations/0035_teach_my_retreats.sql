-- ===========================================================================
-- 0035  Time to Teach: My Retreats
-- ===========================================================================
-- TASK 031. Lets a Teach Space publish the retreats a teacher offers.
--
--   NO new tables, columns, constraints, policies or grants.
--   NO UPDATE or DELETE of anyone's data. No backfill.
--   NO change to publish_space(), and none to any Flow behaviour: Flow
--     Spaces never call build_teach_payload().
--
-- WHAT THIS IS. Retreats are module_items rows with module_key
-- 'teachRetreats' (title = name, description = short description,
-- image_ref = cover, metadata = location / dates / price / registration /
-- Flow link / enabled), exactly like every other Teach list module. The
-- only reason a migration is needed is that build_teach_payload() has hard
-- coded allowlists, so a new key never reaches a guest until it is named
-- here. The body below is 0028's, restated whole, with the three
-- 0035-marked additions:
--
--   1. 'teachRetreats' joins the published-item allowlist;
--   2. it is an Explore module, so its rows publish only while its
--      module_configs row is enabled;
--   3. each retreat carries a per-item metadata.enabled, honoured at
--      publish exactly like Custom Pages (disabled retreats never publish).
--
-- BACKWARD COMPATIBILITY. Items are grouped by module_key, so a Space with
-- no teachRetreats rows has no `teachRetreats` key at all: its snapshot is
-- byte-identical to what 0028 produced. The draft -> published image
-- rewrite is one regexp over the whole document, so a retreat cover needs
-- no extra SQL.
--
-- ROLLBACK: re-apply 0028's definition (see
-- verification/0035_teach_my_retreats_rollback.sql). Stored teachRetreats
-- rows are inert without the key in the allowlist.
-- ===========================================================================

create or replace function public.build_teach_payload(p_tenant_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select regexp_replace(
    jsonb_build_object(
      'settings', coalesce((
        select jsonb_object_agg(module_key, data)
        from public.module_settings
        where tenant_id = p_tenant_id
          and module_key = any (array[
            'teachProfile', 'teachStyle', 'dailyInspiration',
            'teachAbout', 'teachContact', 'teachExplore'
          ])
      ), '{}'::jsonb),
      'items', coalesce((
        select jsonb_object_agg(module_key, items)
        from (
          select i.module_key,
                 jsonb_agg(jsonb_build_object(
                   'id', i.id,
                   'title', i.title,
                   'subtitle', i.subtitle,
                   'description', i.description,
                   'imageRef', i.image_ref,
                   'externalLink', i.external_link,
                   'metadata', i.metadata
                 ) order by i.sort_order, i.created_at) as items
          from public.module_items i
          where i.tenant_id = p_tenant_id
            and i.module_key = any (array[
              'teachClasses', 'teachAvailability', 'teachGallery', 'teachCertificates',
              'teachReadings', 'teachAudio', 'customPages',
              -- 0035
              'teachRetreats'
            ])
            and (
              i.module_key not in ('teachReadings', 'teachAudio', 'customPages', 'teachRetreats')
              or exists (
                select 1 from public.module_configs c
                where c.tenant_id = p_tenant_id
                  and c.module_key = i.module_key
                  and c.enabled = true
              )
            )
            and (
              i.module_key not in ('teachAvailability', 'customPages', 'teachRetreats')
              or coalesce((i.metadata->>'enabled')::boolean, true) = true
            )
          group by i.module_key
        ) s
      ), '{}'::jsonb)
    )::text,
    '("' || p_tenant_id::text || '/[^"]*)/draft\.([a-zA-Z0-9]+)"',
    '\1/published.\2"',
    'g'
  )::jsonb;
$$;

revoke all on function public.build_teach_payload(uuid) from public;
revoke execute on function public.build_teach_payload(uuid) from anon;
grant execute on function public.build_teach_payload(uuid) to authenticated;
