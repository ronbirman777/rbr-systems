-- Rollback for 0034: restore 0033's publish_space(). Stored dailyInspiration
-- module_items rows are left in place (inert).
-- ===========================================================================
-- 3. publish_space(): the 0032 body, with the 0033 additions marked.
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
  -- 0033: the draft -> published rewrite, as a pair of locals rather than
  -- three copies of the same expression. Identical to the pattern 0028
  -- introduced for Teach: anchored on this tenant's own id so ordinary
  -- prose and external URLs are never touched.
  v_draft_pattern text := '("' || p_tenant_id::text || '/[^"]*)/draft\.([a-zA-Z0-9]+)"';
  v_draft_replace text := '\1/published.\2"';
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
         custom_navigation, custom_text, custom_surface,
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
    -- 0033: the schedule's eight fixed keys, plus whichever of the two
    -- new per-activity keys this row actually stores. An activity with an
    -- empty metadata object contributes nothing and publishes exactly the
    -- object 0032 published.
    select coalesce(jsonb_agg(jsonb_build_object(
      'date', date,
      'startTime', to_char(start_time, 'HH24:MI'),
      'endTime', case when end_time is null then null else to_char(end_time, 'HH24:MI') end,
      'title', title,
      'facilitator', facilitator,
      'location', location,
      'description', description,
      'category', category
    ) || public.jsonb_pick(metadata, array['whatToBring', 'whatToExpect'])
    order by date, start_time), '[]'::jsonb)
    into v_payload
    from public.schedule_items where tenant_id = p_tenant_id;
    v_modules := v_modules || jsonb_build_object('schedule', v_payload);
  end if;

  if 'facilitators' = any(v_enabled_modules) then
    -- 0033: `longBio` joins `bio`. `bio` keeps its meaning (the short one
    -- shown on the card); longBio is the full text on the detail screen,
    -- and is absent for every facilitator written before today.
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
    ) || public.jsonb_pick(metadata, array['longBio'])
    order by sort_order, created_at), '[]'::jsonb)
    into v_payload
    from public.module_items where tenant_id = p_tenant_id and module_key = 'facilitators';
    v_modules := v_modules || jsonb_build_object('facilitators', v_payload);
  end if;

  if 'meals' = any(v_enabled_modules) then
    -- Unchanged by 0033. The module-level introduction the Meals screen
    -- now shows above these entries is NOT a property of any one meal, so
    -- it is not here - it lives in moduleIntros, further down, where every
    -- other list-backed module can have one too.
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
    -- 0033: this module absorbs Wellness Extras rather than a second
    -- module being invented for them, so it gains what an extra needs and
    -- a treatment also wants: what it costs, in what currency, whether
    -- that is included in the retreat price or charged on top, and when it
    -- can be had. All four are absent on every existing row.
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
    ) || public.jsonb_pick(metadata, array['price', 'currency', 'chargeType', 'availability'])
    order by sort_order, created_at), '[]'::jsonb)
    into v_payload
    from public.module_items where tenant_id = p_tenant_id and module_key = 'treatments';
    v_modules := v_modules || jsonb_build_object('treatments', v_payload);
  end if;

  if 'facilities' = any(v_enabled_modules) then
    -- 0033: facilities get the short line for their card, in the SAME
    -- column treatments has always used for exactly that - module_items
    -- .subtitle. No metadata key and no DDL, and the two modules stay
    -- consistent. Nothing has ever written a facility's subtitle (the
    -- Studio sends null), so this is absent on every existing row, and
    -- merged only when present rather than emitted as null.
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
    ) || case when subtitle is null then '{}'::jsonb else jsonb_build_object('shortDescription', subtitle) end
    order by sort_order, created_at), '[]'::jsonb)
    into v_payload
    from public.module_items where tenant_id = p_tenant_id and module_key = 'facilities';
    v_modules := v_modules || jsonb_build_object('facilities', v_payload);
  end if;

  if 'arrivalInfo' = any(v_enabled_modules) then
    -- Unchanged. arrivalInfo.whatToBring stays exactly where it is: it is
    -- the LEGACY home of that list and remains authoritative for Spaces
    -- that filled it in, read second when retreatProfile.whatToBring is
    -- absent. Nothing is migrated out of it and nothing deletes it.
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

  -- 0033 NEW: guidelines. The house rules, quiet hours, phone policy -
  -- the things a retreat tells every guest once. Shaped like faq
  -- (title + body, organizer-ordered) because that is what it is: a short
  -- ordered list of headed paragraphs.
  if 'guidelines' = any(v_enabled_modules) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'title', title,
      'description', description
    ) order by sort_order, created_at), '[]'::jsonb)
    into v_payload
    from public.module_items where tenant_id = p_tenant_id and module_key = 'guidelines';
    v_modules := v_modules || jsonb_build_object('guidelines', v_payload);
  end if;

  -- 0033 NEW: readings and audio, Flow's half of the shared library.
  --
  -- The raw module_items envelope, like build_teach_payload's, so one
  -- shared schema reads both products. The whole array is rewritten as
  -- text in one pass, which is what moves a draft reference to its
  -- published sibling wherever it sits - image_ref AND metadata.audioRef -
  -- without this block needing to know which metadata keys hold media.
  -- The Studio copies the bytes to those published paths before calling
  -- publish_space; this only rewrites strings.
  if 'readings' = any(v_enabled_modules) then
    select coalesce(regexp_replace(jsonb_agg(jsonb_build_object(
      'id', id,
      'title', title,
      'subtitle', subtitle,
      'description', description,
      'imageRef', image_ref,
      'externalLink', external_link,
      'metadata', metadata
    ) order by sort_order, created_at)::text, v_draft_pattern, v_draft_replace, 'g')::jsonb, '[]'::jsonb)
    into v_payload
    from public.module_items where tenant_id = p_tenant_id and module_key = 'readings';
    v_modules := v_modules || jsonb_build_object('readings', v_payload);
  end if;

  if 'audio' = any(v_enabled_modules) then
    select coalesce(regexp_replace(jsonb_agg(jsonb_build_object(
      'id', id,
      'title', title,
      'subtitle', subtitle,
      'description', description,
      'imageRef', image_ref,
      'externalLink', external_link,
      'metadata', metadata
    ) order by sort_order, created_at)::text, v_draft_pattern, v_draft_replace, 'g')::jsonb, '[]'::jsonb)
    into v_payload
    from public.module_items where tenant_id = p_tenant_id and module_key = 'audio';
    v_modules := v_modules || jsonb_build_object('audio', v_payload);
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
  --
  -- 0033: the allowlist gains the three new Explore modules. This cannot
  -- change an existing snapshot - a module_configs row for 'readings',
  -- 'audio' or 'guidelines' with a cover image could not exist before
  -- this migration, because nothing wrote those keys.
  select coalesce(jsonb_object_agg(module_key, jsonb_build_object(
    'imageRef', regexp_replace(image_ref, '/draft\.([a-zA-Z0-9]+)$', '/published.\1'),
    'imagePosition', image_position
  )), '{}'::jsonb)
  into v_payload
  from public.module_configs
  where tenant_id = p_tenant_id
    and enabled = true
    and image_ref is not null
    and module_key in (
      'meals', 'treatments', 'facilities', 'arrivalInfo', 'faq', 'stayConnected',
      -- 0033
      'readings', 'audio', 'guidelines'
    );
  v_modules := v_modules || jsonb_build_object('moduleCovers', v_payload);

  -- 0033 NEW: retreatProfile - who this retreat is, said once. The Home
  -- screen's identity lines, and the retreat-level "what to bring" and
  -- "what to expect" that D3 makes canonical.
  --
  -- Published whole, like arrivalInfo and stayConnected, because the field
  -- list is validated by zod on both write and read and SQL has no
  -- business duplicating it. Not gated on module_configs: this is not an
  -- Explore module an organizer switches off, it is the Space's own
  -- description - the same reasoning as spaceSettings (0031).
  --
  -- Emitted ONLY when the row exists and holds something, so a Space that
  -- has not been edited publishes no such key at all.
  select data into v_payload
  from public.module_settings where tenant_id = p_tenant_id and module_key = 'retreatProfile';
  if v_payload is not null and v_payload <> '{}'::jsonb then
    v_modules := v_modules || jsonb_build_object(
      'retreatProfile',
      regexp_replace(v_payload::text, v_draft_pattern, v_draft_replace, 'g')::jsonb
    );
  end if;

  -- 0033 NEW: moduleIntros - one optional paragraph above a module's list.
  --
  -- Generic by design, and the reason there is no `mealsIntro` key: the
  -- shape is { "<module key>": { "intro": "..." } }, so Meals getting an
  -- introduction today costs one settings row, and Facilities getting one
  -- tomorrow costs nothing further here. Same table, same pattern, no new
  -- column, no new table.
  --
  -- Conditional for the same reason as retreatProfile.
  select data into v_payload
  from public.module_settings where tenant_id = p_tenant_id and module_key = 'moduleIntros';
  if v_payload is not null and v_payload <> '{}'::jsonb then
    v_modules := v_modules || jsonb_build_object('moduleIntros', v_payload);
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

  -- NEW (0028, Time to Teach): additive and product-gated. For every
  -- product_type other than 'teach' this block never runs, so the
  -- snapshot written below is exactly what 0025 produced.
  if v_tenant.product_type = 'teach' then
    v_modules := v_modules || jsonb_build_object('teach', public.build_teach_payload(p_tenant_id));
  end if;

  -- NEW (0031): the product-neutral Space Settings object (country,
  -- and from CP3 locale). Unconditional, because the setting is not
  -- product specific - Flow, Teach and Heal all publish it the same way.
  -- A Space with no row publishes '{}', which every reader already
  -- parses as "nothing configured", so no backfill is required and an
  -- older application build simply ignores the extra key.
  v_modules := v_modules || jsonb_build_object(
    'spaceSettings',
    coalesce((
      select data from public.module_settings
      where tenant_id = p_tenant_id and module_key = 'spaceSettings'
    ), '{}'::jsonb)
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
      'customText', v_brand.custom_text,
      -- NEW (0032): Surface/Tint, the fifth shared brand role. Null for
      -- every existing Space, which is exactly "no override" - readers
      -- fall back to the ground they already use.
      'customSurface', v_brand.custom_surface
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
revoke all on function public.publish_space(uuid) from public;
revoke execute on function public.publish_space(uuid) from anon;
grant execute on function public.publish_space(uuid) to authenticated;
