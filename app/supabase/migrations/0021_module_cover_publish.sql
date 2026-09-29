-- Explore Module Hero Image support, part 2: publish module_configs'
-- new image_ref (0020) into the published snapshot.
--
-- `create or replace function` on the exact same signature as 0015's
-- version - the established pattern for evolving this function (0005,
-- 0007, 0008, 0010, 0013, 0014, 0015 each replaced it the same way).
-- Every line below through the stayConnected block is unchanged from
-- 0015; only the new "moduleCovers" block (right after stayConnected)
-- and this header comment are new.
--
-- Shape: modules.moduleCovers = { "meals": {"imageRef": "..."}, ... } -
-- nested under a literal "imageRef" key (not a bare path string) so the
-- existing generic media-security walker (collectImageRefs, which scans
-- the whole modules tree for exactly that key name - see
-- src/lib/media/path.ts) finds these paths with zero code changes,
-- exactly like every other image reference already published this way.
-- Only the six module keys that render as an Explore landing CARD get a
-- cover (meals, treatments, facilities, arrivalInfo, faq, stayConnected)
-- - "customPages" is deliberately excluded here: each custom page is
-- already its own Explore card with its own per-item imageRef (see the
-- customPages block above), so a module-level cover would be a second,
-- redundant image concept for that one module. "schedule"/"facilitators"
-- are excluded because neither renders as an Explore landing card at all
-- (Facilitators has its own screen reached elsewhere; Schedule feeds
-- Today, not Explore).
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

  -- NEW: Explore module hero/cover images - one entry per module_key
  -- that has a cover set, keyed under "moduleCovers" (see this
  -- migration's header comment for the exact shape and why it's nested
  -- under "imageRef").
  select coalesce(jsonb_object_agg(module_key, jsonb_build_object(
    'imageRef', regexp_replace(image_ref, '/draft\.([a-zA-Z0-9]+)$', '/published.\1')
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
