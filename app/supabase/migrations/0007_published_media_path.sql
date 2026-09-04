-- Fixes a real draft/publish isolation gap found during end-to-end
-- verification of the Storage slice: publish_space() was writing the raw
-- DRAFT storage path straight into published_spaces.modules.facilitators[].
-- Since a Storage object is a live reference (not a copied value like every
-- other published field), replacing a facilitator's photo in Draft would
-- silently mutate the bytes at that same path - which the currently
-- published guest experience was already pointing at, and would then show
-- immediately, before any Republish. Text content never had this problem
-- because publish_space() already copies values, not references.
--
-- The fix (application side, in configurator/retreat/actions.ts'
-- publishSpace): every Publish/Republish now copies each facilitator's
-- current draft object to a separate, stable "published" path before this
-- function runs (see lib/media/path.ts: tenantMediaPath vs
-- publishedMediaPath - "{tenant_id}/{module_key}/{item_id}/draft.{ext}" vs
-- ".../published.{ext}"). This function is updated to reference that
-- published path instead of the draft path, by deriving it from image_ref
-- with the exact same string transform as publishedMediaPath() in
-- TypeScript - the two must stay in sync, which is why both are commented
-- pointing at each other.
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
begin
  select name, product_type, timezone into v_tenant
  from public.tenants where id = p_tenant_id;

  if not found then
    raise exception 'Space not found, or you do not have access to it';
  end if;

  select palette, atmosphere, image_style into v_brand
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
    -- image_ref holds the DRAFT object's path
    -- ("{tenant_id}/facilitators/{item_id}/draft.{ext}"); the published
    -- snapshot must reference the separately-copied PUBLISHED object
    -- instead ("{tenant_id}/facilitators/{item_id}/published.{ext}") -
    -- see the migration header comment and publishedMediaPath() in
    -- src/lib/media/path.ts, which this regex must stay identical to.
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', title,
      'role', subtitle,
      'bio', description,
      'imageRef', case
        when image_ref is null then null
        else regexp_replace(image_ref, '/draft\.([a-zA-Z0-9]+)$', '/published.\1')
      end
    ) order by sort_order, created_at), '[]'::jsonb)
    into v_payload
    from public.module_items where tenant_id = p_tenant_id and module_key = 'facilitators';
    v_modules := v_modules || jsonb_build_object('facilitators', v_payload);
  end if;

  insert into public.published_spaces (
    tenant_id, product_type, name, theme, timezone, enabled_modules, modules, published_at
  ) values (
    p_tenant_id,
    v_tenant.product_type,
    v_tenant.name,
    jsonb_build_object(
      'palette', coalesce(v_brand.palette, 'forest-sage'),
      'atmosphere', coalesce(v_brand.atmosphere, 'calm-organic'),
      'imageStyle', coalesce(v_brand.image_style, 'rounded')
    ),
    coalesce(v_tenant.timezone, 'UTC'),
    v_enabled_modules,
    v_modules,
    v_published_at
  )
  on conflict (tenant_id) do update set
    product_type = excluded.product_type,
    name = excluded.name,
    theme = excluded.theme,
    timezone = excluded.timezone,
    enabled_modules = excluded.enabled_modules,
    modules = excluded.modules,
    published_at = excluded.published_at;

  update public.tenants set status = 'live' where id = p_tenant_id;

  return v_published_at;
end;
$$;
