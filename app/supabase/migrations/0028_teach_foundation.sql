-- TASK 027.5 Phase 4A - Time to Teach foundation.
--
-- Three changes, all additive. Time to Flow (product_type 'retreat')
-- publishes exactly what 0025 published.
--
--   1. tenants.product_type CHECK also allows 'teach'.
--   2. build_teach_payload(uuid): the Teach part of the published snapshot.
--   3. publish_space(): the 0025 body (the latest definition on main -
--      Postgres requires the whole body for CREATE OR REPLACE) with exactly
--      one new block, gated on product_type = 'teach', immediately before
--      the final insert. Nothing else in the body is touched, so
--      moduleCovers (+ image_position), every item imagePosition and the
--      brand block are preserved byte for byte.
--
-- Deliberately NOT here: any Storage policy change (a later migration) and
-- any change to existing tables, policies, grants or published snapshots.
-- No backfill.
--
-- Data model: Teach reuses the generic tables. module_items hold repeating
-- content (classes, private availability, readings, audio, gallery,
-- certificates, customPages); module_settings hold singletons (profile,
-- style, daily inspiration, about, contact, explore cards); module_configs
-- say which Explore modules are on. module_key is free text, so the only
-- schema change needed is the product_type CHECK. Every payload shape is
-- validated by zod in application code on write AND on read
-- (src/lib/teach/schemas.ts).

-- ===========================================================================
-- 1. tenants.product_type: allow 'teach'.
-- ===========================================================================
alter table public.tenants drop constraint if exists tenants_product_type_check;
alter table public.tenants add constraint tenants_product_type_check
  check (product_type in ('retreat', 'client_hub', 'teach'));

-- ===========================================================================
-- 2. build_teach_payload(): the Teach part of the published snapshot.
--
-- Shape (read by parsePublishedTeachSpace, src/lib/teach/guestData.ts):
--   { settings: { <settings key>: <module_settings.data> },
--     items:    { <module key>:   [ {id,title,subtitle,description,
--                                    imageRef,externalLink,metadata} ] } }
--
-- SECURITY INVOKER (like publish_space itself): every read runs under the
-- calling owner's own RLS. published_spaces is world-readable, so this only
-- includes what the Guest App can show:
--   * Explore modules (readings, audio, custom pages) only while switched
--     on in module_configs - hidden modules publish nothing;
--   * custom pages and private-availability windows only while their own
--     metadata.enabled is not false (the Guest App filters the same rows).
-- The six settings objects always publish: contact details also back the
-- availability cards and the About page, whatever Explore shows.
--
-- Media: a draft media reference is a whole JSON string value of the form
-- "<tenantId>/.../draft.<ext>" (image_ref, metadata.audioRef,
-- settings.*.imageRef - the versioned
-- "<tenant>/<module>/<item>/<uploadId>/draft.<ext>" shape and the legacy
-- "<tenant>/<module>/<item>/draft.<ext>" shape). It is rewritten to its
-- "/published.<ext>" sibling in the SAME folder (the same string convention
-- publish_space has used since 0007). The pattern is anchored on the quoted
-- tenant id prefix so ordinary text or external URLs are never rewritten.
-- publish_space() only transforms strings: the Studio's publishTeachSpace
-- action copies the draft bytes to those published paths BEFORE calling it.
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

-- ===========================================================================
-- 3. publish_space() - the 0025 body + one product-gated Teach block.
-- ===========================================================================
create or replace function public.publish_space(p_tenant_id uuid)
returns timestamptz
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant record;
  v_brand record;
  v_enabled_modules text[];
  v_modules jsonb := '{}'::jsonb;
  v_payload jsonb;
  v_published_at timestamptz := now();
  v_entitlement record;
begin
  select name, product_type, timezone, slug into v_tenant
  from public.tenants where id = p_tenant_id;

  if not found then
    raise exception 'Space not found, or you do not have access to it';
  end if;

  select access_ends_at into v_entitlement
  from public.space_entitlements where tenant_id = p_tenant_id;

  if v_entitlement.access_ends_at is null
     or now() > v_entitlement.access_ends_at + interval '168 hours' then
    raise exception 'This Space does not currently have active commercial access';
  end if;

  select palette, atmosphere, image_style, custom_primary, custom_secondary,
         custom_navigation, custom_text,
         hero_image_ref, space_image_ref, logo_ref
  into v_brand
  from public.brand_configs where tenant_id = p_tenant_id;

  select coalesce(array_agg(module_key order by module_key), '{}')
  into v_enabled_modules
  from public.module_configs
  where tenant_id = p_tenant_id and enabled = true;

  if v_enabled_modules is null then
    v_enabled_modules := '{}';
  end if;

  if 'schedule' = any(v_enabled_modules) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'date', date,
      'startTime', to_char(start_time, 'HH24:MI'),
      'endTime', case when end_time is null then null else to_char(end_time, 'HH24:MI') end,
      'title', title,
      'facilitator', facilitator,
      'location', location,
      'description', description,
      'category', category
    ) order by date, start_time), '[]'::jsonb)
    into v_payload
    from public.schedule_items where tenant_id = p_tenant_id;
    v_modules := v_modules || jsonb_build_object('schedule', v_payload);
  end if;

  if 'facilitators' = any(v_enabled_modules) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', title,
      'role', subtitle,
      'bio', description,
      'imageRef', case
        when image_ref is null then null
        else regexp_replace(image_ref, '/draft\.([a-zA-Z0-9]+)$', '/published.\1')
      end,
      'socialLinks', coalesce(metadata->'socialLinks', '[]'::jsonb),
      'specialties', coalesce(metadata->'specialties', '[]'::jsonb),
      'imagePosition', metadata->'imagePosition'
    ) order by sort_order, created_at), '[]'::jsonb)
    into v_payload
    from public.module_items where tenant_id = p_tenant_id and module_key = 'facilitators';
    v_modules := v_modules || jsonb_build_object('facilitators', v_payload);
  end if;

  if 'meals' = any(v_enabled_modules) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', title,
      'mealType', metadata->>'mealType',
      'startTime', metadata->>'startTime',
      'endTime', metadata->>'endTime',
      'description', description,
      'imageRef', case
        when image_ref is null then null
        else regexp_replace(image_ref, '/draft\.([a-zA-Z0-9]+)$', '/published.\1')
      end,
      'dietaryTags', coalesce(metadata->'dietaryTags', '[]'::jsonb),
      'location', metadata->>'location',
      'imagePosition', metadata->'imagePosition'
    ) order by sort_order, created_at), '[]'::jsonb)
    into v_payload
    from public.module_items where tenant_id = p_tenant_id and module_key = 'meals';
    v_modules := v_modules || jsonb_build_object('meals', v_payload);
  end if;

  if 'treatments' = any(v_enabled_modules) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', title,
      'shortDescription', subtitle,
      'description', description,
      'durationMinutes', case when metadata->>'durationMinutes' is null then null else (metadata->>'durationMinutes')::int end,
      'imageRef', case
        when image_ref is null then null
        else regexp_replace(image_ref, '/draft\.([a-zA-Z0-9]+)$', '/published.\1')
      end,
      'provider', metadata->>'provider',
      'location', metadata->>'location',
      'bookingInfo', metadata->>'bookingInfo',
      'imagePosition', metadata->'imagePosition'
    ) order by sort_order, created_at), '[]'::jsonb)
    into v_payload
    from public.module_items where tenant_id = p_tenant_id and module_key = 'treatments';
    v_modules := v_modules || jsonb_build_object('treatments', v_payload);
  end if;

  if 'facilities' = any(v_enabled_modules) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', title,
      'description', description,
      'imageRef', case
        when image_ref is null then null
        else regexp_replace(image_ref, '/draft\.([a-zA-Z0-9]+)$', '/published.\1')
      end,
      'openingHours', metadata->>'openingHours',
      'location', metadata->>'location',
      'importantInfo', metadata->>'importantInfo',
      'imagePosition', metadata->'imagePosition'
    ) order by sort_order, created_at), '[]'::jsonb)
    into v_payload
    from public.module_items where tenant_id = p_tenant_id and module_key = 'facilities';
    v_modules := v_modules || jsonb_build_object('facilities', v_payload);
  end if;

  if 'arrivalInfo' = any(v_enabled_modules) then
    select data into v_payload
    from public.module_settings where tenant_id = p_tenant_id and module_key = 'arrivalInfo';
    v_modules := v_modules || jsonb_build_object('arrivalInfo', coalesce(v_payload, '{}'::jsonb));
  end if;

  if 'faq' = any(v_enabled_modules) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'question', title,
      'answer', description
    ) order by sort_order, created_at), '[]'::jsonb)
    into v_payload
    from public.module_items
    where tenant_id = p_tenant_id and module_key = 'faq'
      and coalesce((metadata->>'enabled')::boolean, true) = true;
    v_modules := v_modules || jsonb_build_object('faq', v_payload);
  end if;

  -- Teach publishes its custom pages under modules.teach.items.customPages
  -- (build_teach_payload); the Retreat-shaped top-level block is skipped for
  -- Teach so the same page is not emitted twice. Every other product type
  -- (retreat, client_hub) is unchanged.
  if 'customPages' = any(v_enabled_modules) and v_tenant.product_type is distinct from 'teach' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'title', title,
      'body', description,
      'imageRef', case
        when image_ref is null then null
        else regexp_replace(image_ref, '/draft\.([a-zA-Z0-9]+)$', '/published.\1')
      end,
      'imagePosition', metadata->'imagePosition'
    ) order by sort_order, created_at), '[]'::jsonb)
    into v_payload
    from public.module_items
    where tenant_id = p_tenant_id and module_key = 'customPages'
      and coalesce((metadata->>'enabled')::boolean, true) = true;
    v_modules := v_modules || jsonb_build_object('customPages', v_payload);
  end if;

  if 'stayConnected' = any(v_enabled_modules) then
    select data into v_payload
    from public.module_settings where tenant_id = p_tenant_id and module_key = 'stayConnected';
    v_modules := v_modules || jsonb_build_object('stayConnected', coalesce(v_payload, jsonb_build_object('links', '[]'::jsonb)));
  end if;

  -- moduleCovers: now also carries image_position (0024) alongside
  -- imageRef, so a module cover's own independently-chosen focus point
  -- (distinct from any item's - see this file's header comment) reaches
  -- the guest app too.
  select coalesce(jsonb_object_agg(module_key, jsonb_build_object(
    'imageRef', regexp_replace(image_ref, '/draft\.([a-zA-Z0-9]+)$', '/published.\1'),
    'imagePosition', image_position
  )), '{}'::jsonb)
  into v_payload
  from public.module_configs
  where tenant_id = p_tenant_id
    and enabled = true
    and image_ref is not null
    and module_key in ('meals', 'treatments', 'facilities', 'arrivalInfo', 'faq', 'stayConnected');
  v_modules := v_modules || jsonb_build_object('moduleCovers', v_payload);

  v_modules := v_modules || jsonb_build_object(
    'brand', jsonb_build_object(
      'hero', jsonb_build_object('imageRef', case
        when v_brand.hero_image_ref is null then null
        else regexp_replace(v_brand.hero_image_ref, '/draft\.([a-zA-Z0-9]+)$', '/published.\1')
      end),
      'space', jsonb_build_object('imageRef', case
        when v_brand.space_image_ref is null then null
        else regexp_replace(v_brand.space_image_ref, '/draft\.([a-zA-Z0-9]+)$', '/published.\1')
      end),
      'logo', jsonb_build_object('imageRef', case
        when v_brand.logo_ref is null then null
        else regexp_replace(v_brand.logo_ref, '/draft\.([a-zA-Z0-9]+)$', '/published.\1')
      end)
    )
  );

  -- NEW (0028, Time to Teach): additive and product-gated. For every
  -- product_type other than 'teach' this block never runs, so the
  -- snapshot written below is exactly what 0025 produced.
  if v_tenant.product_type = 'teach' then
    v_modules := v_modules || jsonb_build_object('teach', public.build_teach_payload(p_tenant_id));
  end if;

  insert into public.published_spaces (
    tenant_id, product_type, name, slug, theme, timezone, enabled_modules, modules, published_at
  ) values (
    p_tenant_id,
    v_tenant.product_type,
    v_tenant.name,
    v_tenant.slug,
    jsonb_build_object(
      'palette', coalesce(v_brand.palette, 'forest-sage'),
      'atmosphere', coalesce(v_brand.atmosphere, 'calm-organic'),
      'imageStyle', coalesce(v_brand.image_style, 'rounded'),
      'customPrimary', v_brand.custom_primary,
      'customSecondary', v_brand.custom_secondary,
      'customNavigation', v_brand.custom_navigation,
      'customText', v_brand.custom_text
    ),
    coalesce(v_tenant.timezone, 'UTC'),
    v_enabled_modules,
    v_modules,
    v_published_at
  )
  on conflict (tenant_id) do update set
    product_type = excluded.product_type,
    name = excluded.name,
    slug = excluded.slug,
    theme = excluded.theme,
    timezone = excluded.timezone,
    enabled_modules = excluded.enabled_modules,
    modules = excluded.modules,
    published_at = excluded.published_at;

  update public.tenants set status = 'live' where id = p_tenant_id;

  return v_published_at;
end;
$$;

-- publish_space()'s grant/revoke pair is unchanged since 0014 (authenticated
-- only) - reasserted so this migration is self-contained.
revoke all on function public.publish_space(uuid) from public;
revoke execute on function public.publish_space(uuid) from anon;
grant execute on function public.publish_space(uuid) to authenticated;
