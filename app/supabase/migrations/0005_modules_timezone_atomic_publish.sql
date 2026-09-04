-- Module system foundation (Facilitators as the first real module),
-- Space timezone, and a rewritten, atomic, unified publish operation.

-- ---------------------------------------------------------------------
-- Repeating structured content (Facilitators now; Meals/Treatments/
-- Facilities/Resources/Audio/Announcements later reuse this same table
-- rather than each getting a bespoke one).
-- ---------------------------------------------------------------------
create table if not exists public.module_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  module_key text not null,
  title text not null,
  subtitle text,
  description text,
  image_ref text, -- reserved: nullable until Storage exists, architecturally ready
  external_link text,
  sort_order integer not null default 0,
  -- Module-specific structured extras (e.g. a meal's dietary tags, a
  -- treatment's duration). Each module_key has its own zod schema in
  -- application code validating this shape on write - never freeform.
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.module_items enable row level security;

create policy "module_items: members can select"
  on public.module_items for select using (public.is_tenant_member(tenant_id));
create policy "module_items: members can insert"
  on public.module_items for insert with check (public.is_tenant_member(tenant_id));
create policy "module_items: members can update"
  on public.module_items for update using (public.is_tenant_member(tenant_id));
create policy "module_items: members can delete"
  on public.module_items for delete using (public.is_tenant_member(tenant_id));

-- ---------------------------------------------------------------------
-- Singleton structured content (Arrival Information, General Information,
-- Contact, Home's own settings later). Unused by any editor in this slice -
-- created now so the pattern exists before those modules are built.
-- ---------------------------------------------------------------------
create table if not exists public.module_settings (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  module_key text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, module_key)
);

alter table public.module_settings enable row level security;

create policy "module_settings: members can select"
  on public.module_settings for select using (public.is_tenant_member(tenant_id));
create policy "module_settings: members can insert"
  on public.module_settings for insert with check (public.is_tenant_member(tenant_id));
create policy "module_settings: members can update"
  on public.module_settings for update using (public.is_tenant_member(tenant_id));
create policy "module_settings: members can delete"
  on public.module_settings for delete using (public.is_tenant_member(tenant_id));

-- Same content-change tracking as schedule_items/brand_configs already have.
drop trigger if exists touch_tenant_content_on_module_items on public.module_items;
create trigger touch_tenant_content_on_module_items
  after insert or update or delete on public.module_items
  for each row execute function public.touch_tenant_content();

drop trigger if exists touch_tenant_content_on_module_settings on public.module_settings;
create trigger touch_tenant_content_on_module_settings
  after insert or update or delete on public.module_settings
  for each row execute function public.touch_tenant_content();

drop trigger if exists touch_tenant_content_on_module_configs on public.module_configs;
create trigger touch_tenant_content_on_module_configs
  after insert or update or delete on public.module_configs
  for each row execute function public.touch_tenant_content();

-- ---------------------------------------------------------------------
-- Space-level IANA timezone. Schedule times are meaningless without it -
-- "today" and "happening now" must be computed relative to this, not the
-- guest's device or the server's timezone.
-- ---------------------------------------------------------------------
alter table public.tenants
  add column if not exists timezone text not null default 'UTC';

-- ---------------------------------------------------------------------
-- Unified published snapshot. Replaces the single `schedule` column with
-- a `modules` object keyed by module_key, plus `enabled_modules` (an
-- explicit ordered allow-list - presence in `modules` alone isn't enough,
-- since an enabled module can have zero content yet). Drops `published_by`:
-- RLS is row-level, not column-level, so anything in a `using (true)`-read
-- table is queryable by anyone via the raw API regardless of what our own
-- route selects - an audit-only field like this doesn't belong here at all.
-- ---------------------------------------------------------------------
alter table public.published_spaces drop column if exists schedule;
alter table public.published_spaces drop column if exists published_by;
alter table public.published_spaces add column if not exists timezone text not null default 'UTC';
alter table public.published_spaces add column if not exists enabled_modules text[] not null default '{}';
alter table public.published_spaces add column if not exists modules jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------
-- Publish, as one atomic transaction. SECURITY INVOKER (the default) is
-- deliberate: every read and write inside this function runs under the
-- CALLING user's own RLS, exactly like calling each statement separately
-- would - this function does not bypass authorization, it just makes the
-- multi-table write atomic. A non-owner calling this fails at the first
-- RLS-gated select or the final insert, same as before, just now within
-- a single all-or-nothing transaction instead of several separate ones.
-- ---------------------------------------------------------------------
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
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', title,
      'role', subtitle,
      'bio', description,
      'imageRef', image_ref
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

revoke all on function public.publish_space(uuid) from public;
grant execute on function public.publish_space(uuid) to authenticated;
