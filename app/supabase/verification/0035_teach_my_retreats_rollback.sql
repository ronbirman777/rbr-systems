-- Rollback for 0035: restore 0028's build_teach_payload(). Stored teachRetreats rows stay (inert).
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
              'teachReadings', 'teachAudio', 'customPages'
            ])
            and (
              i.module_key not in ('teachReadings', 'teachAudio', 'customPages')
              or exists (
                select 1 from public.module_configs c
                where c.tenant_id = p_tenant_id
                  and c.module_key = i.module_key
                  and c.enabled = true
              )
            )
            and (
              i.module_key not in ('teachAvailability', 'customPages')
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
