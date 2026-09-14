-- Time to Flow Product Data Model Phase 2 - PROPOSED, NOT APPLIED.
--
-- Adds persistence for: Today Hero Photography, Space Image, independent
-- Accent Color (Primary already had a column - custom_primary - this adds
-- its sibling), Stay Connected, Facilitator social links, Facilitator
-- specialties, FAQ, Custom Pages. Extends publish_space() so all of the
-- above can reach the published Guest App.
--
-- Deliberately small at the table level: exactly THREE new nullable
-- columns, all on the existing brand_configs table (custom_secondary,
-- hero_image_ref, space_image_ref) - no new tables. Everything else
-- (Stay Connected, Facilitator socials/specialties, FAQ, Custom Pages)
-- is a pure application-layer change: new module_key values in the
-- already-generic module_items/module_settings tables (module_key is
-- free text, never CHECK-constrained - see 0005), new metadata jsonb
-- shapes (module_items.metadata already exists on every row), and new
-- publish_space() blocks. This follows the exact same pattern already
-- proven by meals/treatments/facilities/arrivalInfo in 0008 - it is not
-- a new architecture, just more modules using the one that already
-- exists.
--
-- Explicitly NOT changed: palette/atmosphere columns and their CHECK
-- constraints (kept exactly as-is - Atmosphere stays a real, working
-- column, simply no longer organizer-facing in the UI, a decision
-- already applied in the previous session with zero data changes).
-- Explicitly NOT added: retreat location, retreat start/end dates, guest
-- greeting name (see the accompanying report's Identity-gaps section for
-- why each was deliberately left out of this migration).
--
-- Backward compatibility: every new column is nullable with no default
-- change to existing rows - every existing brand_configs row gets NULL
-- for all three new columns automatically. Every new modules/theme JSON
-- key is additive - an ALREADY-published published_spaces row (one that
-- is not republished after this migration applies) is completely
-- untouched by this migration; it keeps rendering exactly as it did
-- before, because publish_space() only runs (and only writes new-shaped
-- JSON) the next time an organizer actually publishes. No backfill of
-- published_spaces is performed or needed.

-- ===========================================================================
-- 1. brand_configs: rename logo_url -> logo_ref, plus two new nullable
--    image-ref columns and one new nullable color column.
-- ===========================================================================

-- logo_url has been a real column since 0001 but has never been written
-- to by any code path (confirmed: 100% null across all 22 Production
-- brand_configs rows, verified directly before writing this migration) -
-- renaming it is zero-risk. Its name was always going to be misleading
-- for what it's about to hold: a tenant-media Storage REFERENCE (the
-- exact same kind of value as module_items.image_ref - a path like
-- "{tenantId}/brand/logo/draft.webp"), never a URL, signed or otherwise.
-- Renamed rather than redefined-in-place so its semantics are unambiguous
-- going forward, per the explicit "do not leave mixed logo_url/logo_ref
-- semantics" requirement - every application-code reference was searched
-- and updated in the same batch as this migration (see the accompanying
-- report's full-repo search).
alter table public.brand_configs rename column logo_url to logo_ref;

alter table public.brand_configs
  -- Accent Color's independent hex override - identical pattern/CHECK to
  -- the existing custom_primary (added in 0001), just its sibling. Null
  -- means "no override yet", exactly like custom_primary today.
  add column if not exists custom_secondary text
    check (custom_secondary is null or custom_secondary ~ '^#[0-9a-fA-F]{6}$'),
  -- Today Hero Photography and Space Image are both single, brand-level
  -- image references - the same kind of value logo_ref already is.
  -- Storage path convention is unchanged: tenantMediaPath(tenantId,
  -- "brand", "hero" | "space" | "logo", ext) - the existing draft/
  -- published split (draft.<ext> -> published.<ext>) and the existing
  -- tenant-media bucket RLS (keyed on the path's first segment being the
  -- tenant id, see 0006) apply with zero changes, because moduleKey/
  -- itemId are plain path segments, not a constrained vocabulary.
  add column if not exists hero_image_ref text,
  add column if not exists space_image_ref text;

-- No RLS policy changes anywhere in this migration. brand_configs'
-- existing "members can select/upsert/update" policies (0001, 0002) are
-- row-level, not column-level - they already cover every column on the
-- table, including these three new ones, with no additional grant. The
-- same is true for every module_items/module_settings row this migration
-- adds (module_key='faq' | 'customPages' | 'stayConnected', or existing
-- 'facilitators' rows gaining new metadata keys) - they ride the
-- existing tenant-membership policies on those tables (0005) unchanged.

-- ===========================================================================
-- 2. publish_space() - additive changes only. Full function body
--    reproduced (Postgres requires the complete body for CREATE OR
--    REPLACE) - everything from 0013 is preserved verbatim, including the
--    commercial-access guard, which this migration does not touch or
--    weaken in any way.
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

  -- Commercial-access guard - byte-for-byte unchanged from 0013.
  select access_ends_at into v_entitlement
  from public.space_entitlements where tenant_id = p_tenant_id;

  if v_entitlement.access_ends_at is null
     or now() > v_entitlement.access_ends_at + interval '168 hours' then
    raise exception 'This Space does not currently have active commercial access';
  end if;

  -- Widened to also pull the new Accent Color / Hero / Space / Logo
  -- columns - everything else in this select is unchanged from 0013.
  select palette, atmosphere, image_style, custom_primary, custom_secondary,
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
    -- socialLinks/specialties are new - both read from metadata (already
    -- present on every module_items row), defaulting to an empty array
    -- when absent so older facilitator rows (created before this
    -- migration) publish exactly as they always have, just with two
    -- extra always-empty-array fields the Guest App already treats as
    -- optional/absent-safe.
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

  -- NEW: FAQ - module_items, module_key='faq'. title=question,
  -- description=answer, sort_order=organizer's reorder. Per-item
  -- enabled/disabled lives in metadata (module_items has no boolean
  -- column of its own) - disabled items are filtered out here, at
  -- publish time, so a disabled FAQ item never reaches a guest even if
  -- the organizer forgets to remove it outright.
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

  -- NEW: Custom Pages - module_items, module_key='customPages'. Same
  -- shape/reasoning as FAQ above; multiple pages supported natively
  -- (one row per page) with no new table.
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

  -- NEW: Stay Connected - module_settings singleton, module_key=
  -- 'stayConnected', data={"links":[{"platform":"instagram","url":"..."},
  -- ...]}. An array of typed link objects (not one fixed-key object with
  -- instagram/facebook/... as named fields) so a future platform can be
  -- added purely in application code - no migration, no new column,
  -- ever, for any future platform.
  if 'stayConnected' = any(v_enabled_modules) then
    select data into v_payload
    from public.module_settings where tenant_id = p_tenant_id and module_key = 'stayConnected';
    v_modules := v_modules || jsonb_build_object('stayConnected', coalesce(v_payload, jsonb_build_object('links', '[]'::jsonb)));
  end if;

  -- NEW: brand-level media (Hero, Space, Logo). Deliberately
  -- UNCONDITIONAL, not gated by v_enabled_modules - these are core
  -- identity assets, not optional modules (Today, which Hero belongs to,
  -- is always on; a Space's own image and logo are not toggleable
  -- either). Nested under a literal "imageRef" key at every level so the
  -- existing generic media-security walker (collectImageRefs, which
  -- scans the whole modules tree for that exact key name - see
  -- src/lib/media/path.ts) finds them with zero code changes; this is
  -- also why these live under "modules" rather than "theme" - the
  -- guest-media route only ever trusts refs found inside modules.
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
      -- NEW: both nullable - a tenant with neither set keeps rendering
      -- from palette exactly as before (deriveThemeVars' existing
      -- `config.customPrimary ?? palette.primary` fallback, mirrored for
      -- secondary).
      'customPrimary', v_brand.custom_primary,
      'customSecondary', v_brand.custom_secondary
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

-- publish_space()'s own grant/revoke pair is unchanged from 0005/0013
-- (still authenticated-only) - reasserted here for the same reason 0013
-- did: costs nothing, keeps this migration self-contained.
revoke all on function public.publish_space(uuid) from public;
revoke execute on function public.publish_space(uuid) from anon;
grant execute on function public.publish_space(uuid) to authenticated;

-- ===========================================================================
-- No backfill section. Unlike 0013 (which needed a one-time
-- grandfathering pass because it introduced an enforcement gate that
-- could otherwise lock out already-live tenants), this migration
-- introduces no new enforcement and no new required field - every new
-- column and every new modules/theme JSON key is optional and defaults
-- to null/absent/empty-array. Existing tenants need no data backfill to
-- keep working exactly as they do today.
-- ===========================================================================
