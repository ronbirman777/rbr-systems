-- Time to Teach v1 - Space type foundation (feat/time-to-teach-v1).
--
-- LOCAL / PREVIEW ONLY until the Time to Teach checkpoint is accepted.
-- Never apply to Production as part of this workstream.
--
-- Additive only. Time to Flow (product_type 'retreat') behavior is
-- unchanged: publish_space() below is the 0015 body reproduced verbatim
-- (Postgres requires the full body for CREATE OR REPLACE) with exactly one
-- new block, gated on product_type = 'teach', inserted immediately before
-- the final insert. No existing table, column, policy, grant or published
-- snapshot is altered; no backfill.
--
-- Data model (see the Time to Teach Figma "Cover & Architecture" page):
-- Teach reuses the existing generic tables - module_items (repeating
-- content: classes, private availability, readings, audio, gallery,
-- certificates, customPages) and module_settings (singletons: profile,
-- style, daily inspiration, about, contact, explore cards). module_key is
-- free text (never CHECK-constrained, see 0005); every payload shape is
-- validated by zod in application code on write AND on read
-- (src/lib/teach/schemas.ts). So the only schema change needed is the
-- product_type CHECK.

-- ===========================================================================
-- 1. tenants.product_type: allow 'teach'.
-- ===========================================================================
alter table public.tenants drop constraint if exists tenants_product_type_check;
alter table public.tenants add constraint tenants_product_type_check
  check (product_type in ('retreat', 'client_hub', 'teach'));

-- ===========================================================================
-- 2. build_teach_payload(): the Teach part of the published snapshot.
--
-- SECURITY INVOKER (like publish_space itself): every read runs under the
-- calling owner's own RLS. Returns the raw rows for the Teach module keys;
-- the Guest App parses every field through zod before rendering, and
-- Teach content is guest-facing by design (nothing private is stored under
-- these keys - see src/lib/teach/schemas.ts).
--
-- Media: every draft media reference belonging to THIS tenant
-- ("<tenantId>/.../draft.<ext>", wherever it sits in the JSON - image_ref,
-- metadata.audioRef, settings.*.imageRef) is rewritten to its
-- "/published.<ext>" counterpart, the same string convention publish_space
-- has used since 0007. The pattern is anchored on the tenant id prefix so
-- ordinary text or external URLs are never rewritten. The Studio's
-- publishTeachSpace action copies the draft bytes to those paths BEFORE
-- calling publish_space (same ordering as Time to Flow).
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
          select module_key,
                 jsonb_agg(jsonb_build_object(
                   'id', id,
                   'title', title,
                   'subtitle', subtitle,
                   'description', description,
                   'imageRef', image_ref,
                   'externalLink', external_link,
                   'metadata', metadata
                 ) order by sort_order, created_at) as items
          from public.module_items
          where tenant_id = p_tenant_id
            and module_key = any (array[
              'teachClasses', 'teachAvailability', 'teachReadings', 'teachAudio',
              'teachGallery', 'teachCertificates', 'customPages'
            ])
          group by module_key
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
-- 3. publish_space() - 0015 body verbatim + one product-gated Teach block.
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

  -- Commercial-access guard - byte-for-byte unchanged from 0014.
  select access_ends_at into v_entitlement
  from public.space_entitlements where tenant_id = p_tenant_id;

  if v_entitlement.access_ends_at is null
     or now() > v_entitlement.access_ends_at + interval '168 hours' then
    raise exception 'This Space does not currently have active commercial access';
  end if;

  -- Widened to also pull the two new Navigation/Text columns - everything
  -- else in this select is unchanged from 0014.
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
      'specialties', coalesce(metadata->'specialties', '[]'::jsonb)
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
      'location', metadata->>'location'
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
      'bookingInfo', metadata->>'bookingInfo'
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
      'importantInfo', metadata->>'importantInfo'
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

  if 'customPages' = any(v_enabled_modules) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'title', title,
      'body', description,
      'imageRef', case
        when image_ref is null then null
        else regexp_replace(image_ref, '/draft\.([a-zA-Z0-9]+)$', '/published.\1')
      end
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

  -- NEW (0019, Time to Teach): additive and product-gated. For every
  -- product_type other than 'teach' this block never runs, so the
  -- snapshot written below is byte-for-byte what 0015 produced.
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
      -- NEW: both nullable - a tenant with neither set keeps rendering
      -- from the resolved primary exactly as before (deriveThemeVars'
      -- existing `config.customNavigation ?? primary` / `customText ??
      -- primary` fallback - see src/lib/theme/deriveTheme.ts).
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

-- publish_space()'s own grant/revoke pair is unchanged from 0014 (still
-- authenticated-only) - reasserted here for the same reason 0014 did:
-- costs nothing, keeps this migration self-contained.
revoke all on function public.publish_space(uuid) from public;
revoke execute on function public.publish_space(uuid) from anon;
grant execute on function public.publish_space(uuid) to authenticated;
