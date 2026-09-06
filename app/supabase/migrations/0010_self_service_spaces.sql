-- Self Service Phase 1: Space name + public address (slug) reservation.
--
-- Additive only. No existing table is dropped or renamed, no existing RLS
-- policy is loosened, and every existing tenant keeps working with slug
-- left null - this migration only adds the ability for a tenant to
-- optionally claim one. Nothing here implements wildcard DNS or Stripe;
-- it only lays the column/constraint/lookup groundwork so that work can
-- be added later without another migration to the tenants table itself.
--
-- Design:
--   1. tenants.slug - the organizer-chosen subdomain label
--      ("samadhi" for samadhi.innerdwes.com), nullable, format-checked,
--      reserved-word-checked, globally unique among non-null values.
--   2. published_spaces.slug - a denormalized copy, written only by
--      publish_space() at Publish/Republish time, exactly like every other
--      published field (name, theme, timezone, ...). This keeps the guest
--      route's existing invariant intact: it only ever reads
--      published_spaces, never tenants - so a slug-based guest lookup
--      needs its own copy here rather than a join back to the private
--      table.
--   3. Reservation is just an ordinary update to tenants.slug through the
--      EXISTING owner-update RLS policy (0001_init.sql) - no new bypass,
--      no new write path. The partial unique index is what makes
--      simultaneous-claim races safe: Postgres rejects the second
--      concurrent writer with a unique-violation, atomically, regardless
--      of what any prior "is it available" check returned.

-- ---------------------------------------------------------------------
-- Reserved words. A table, not just a hardcoded regex/array, so the list
-- can be extended later without a schema migration. Mirrors the
-- application-side RESERVED_SLUGS in src/lib/slug.ts - the two are
-- expected to stay in sync; the trigger below is the actual enforcement,
-- the TypeScript copy exists only so the UI can reject instantly without
-- a round trip.
-- ---------------------------------------------------------------------
create table if not exists public.reserved_slugs (
  slug text primary key
);

insert into public.reserved_slugs (slug) values
  ('www'), ('app'), ('admin'), ('api'), ('auth'), ('login'), ('log-in'),
  ('signup'), ('sign-up'), ('support'), ('help'), ('mail'), ('preview'),
  ('staging'), ('dashboard'), ('studio'), ('innerdwes'), ('create'),
  ('space'), ('configurator'), ('g'), ('s'), ('static'), ('assets'), ('cdn')
on conflict (slug) do nothing;

alter table public.reserved_slugs enable row level security;

-- Readable by any authenticated user (the configurator's client-side
-- format check wants to show "reserved" instantly) - it's just a list of
-- words, not sensitive, and nothing insertable/updatable by clients at all.
create policy "reserved_slugs: authenticated can select"
  on public.reserved_slugs for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- tenants.slug
-- ---------------------------------------------------------------------
alter table public.tenants add column if not exists slug text;

-- Format: lowercase letters/digits/hyphens, no leading/trailing hyphen,
-- 3-63 chars total - standard DNS-label-safe shape. Must stay identical to
-- the regex in src/lib/slug.ts (isValidSlugFormat).
alter table public.tenants drop constraint if exists tenants_slug_format;
alter table public.tenants add constraint tenants_slug_format
  check (slug is null or slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$');

-- Partial unique index (not a plain unique column) so any number of
-- existing/new tenants can keep slug = null without colliding with each
-- other, while every non-null value must be globally unique. This is the
-- actual concurrency guarantee: two simultaneous claims of the same slug
-- are resolved by Postgres, atomically, at the index level - not by
-- application logic.
drop index if exists tenants_slug_unique_idx;
create unique index tenants_slug_unique_idx on public.tenants (slug) where slug is not null;

create or replace function public.check_tenant_slug_not_reserved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.slug is not null and exists (
    select 1 from public.reserved_slugs where slug = new.slug
  ) then
    raise exception 'That address is reserved.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists tenants_check_slug_reserved on public.tenants;
create trigger tenants_check_slug_reserved
  before insert or update of slug on public.tenants
  for each row execute function public.check_tenant_slug_not_reserved();

-- Advisory-only availability check (the real enforcement is the unique
-- index + reserved-word trigger above, both of which fire regardless of
-- whether this function was ever called). SECURITY DEFINER is required
-- and safe here: it deliberately bypasses the tenants SELECT policy, but
-- only to answer a single yes/no question - it returns no tenant data,
-- exposes no other tenant's name/content/ownership, just whether a given
-- slug string is currently claimable.
create or replace function public.is_slug_available(check_slug text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if check_slug is null or check_slug !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' then
    return false;
  end if;
  if exists (select 1 from public.reserved_slugs where slug = check_slug) then
    return false;
  end if;
  if exists (select 1 from public.tenants where slug = check_slug) then
    return false;
  end if;
  return true;
end;
$$;

revoke all on function public.is_slug_available(text) from public;
grant execute on function public.is_slug_available(text) to authenticated;

-- ---------------------------------------------------------------------
-- published_spaces.slug - denormalized copy, written only by
-- publish_space(). Same partial-unique-index shape as tenants.slug; in
-- practice it can never collide (it's only ever set from an already-unique
-- tenants.slug), the index exists so that invariant is enforced by the
-- database too, not only by convention.
-- ---------------------------------------------------------------------
alter table public.published_spaces add column if not exists slug text;

drop index if exists published_spaces_slug_unique_idx;
create unique index published_spaces_slug_unique_idx on public.published_spaces (slug) where slug is not null;

-- Publish, updated only to also copy the tenant's current slug into the
-- published snapshot - every other line is unchanged from 0008's version.
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
  select name, product_type, timezone, slug into v_tenant
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
