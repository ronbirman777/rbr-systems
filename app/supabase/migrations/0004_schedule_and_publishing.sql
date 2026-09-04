-- Schedule (first real content module) + the private/published boundary.
--
-- Private workspace data (tenants, brand_configs, schedule_items) stays
-- member-scoped, exactly like every table before it - no anonymous access
-- of any kind is added to any of them in this migration.
--
-- published_spaces is the one deliberate exception: a separate table that
-- only ever contains what an explicit Publish action chose to put there.
-- It is not a view over the private tables and does not read them at
-- request time - the guest route only ever queries this table, so a
-- private field added to schedule_items later cannot leak through it
-- without a developer deliberately adding it to the publish payload.

create table if not exists public.schedule_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time,
  title text not null,
  facilitator text,
  location text,
  description text,
  category text,
  -- Reserved, forward-compatible primitives for recurring retreat programs.
  -- Unused by any UI or logic yet - intentionally not designed further
  -- until the recurring-retreat workflow itself is defined.
  recurrence_rule text,
  recurrence_parent_id uuid references public.schedule_items (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.schedule_items enable row level security;

create policy "schedule_items: members can select"
  on public.schedule_items for select
  using (public.is_tenant_member(tenant_id));

create policy "schedule_items: members can insert"
  on public.schedule_items for insert
  with check (public.is_tenant_member(tenant_id));

create policy "schedule_items: members can update"
  on public.schedule_items for update
  using (public.is_tenant_member(tenant_id));

create policy "schedule_items: members can delete"
  on public.schedule_items for delete
  using (public.is_tenant_member(tenant_id));

-- Tracks when a tenant's editable content last changed, independent of
-- when it was last published - lets the dashboard show "unpublished
-- changes" without a separate status flag that could drift out of sync.
alter table public.tenants
  add column if not exists content_updated_at timestamptz not null default now();

create or replace function public.touch_tenant_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tenants
  set content_updated_at = now()
  where id = coalesce(new.tenant_id, old.tenant_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists touch_tenant_content_on_brand_configs on public.brand_configs;
create trigger touch_tenant_content_on_brand_configs
  after insert or update on public.brand_configs
  for each row execute function public.touch_tenant_content();

drop trigger if exists touch_tenant_content_on_schedule_items on public.schedule_items;
create trigger touch_tenant_content_on_schedule_items
  after insert or update or delete on public.schedule_items
  for each row execute function public.touch_tenant_content();

-- The public data contract. Every column here is something a developer
-- chose to publish; nothing is inherited from the private tables' shape.
create table if not exists public.published_spaces (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  product_type text not null,
  name text not null,
  theme jsonb not null,
  schedule jsonb not null default '[]'::jsonb,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users (id)
);

alter table public.published_spaces enable row level security;

-- The only `using (true)` policy in the entire schema - deliberately, and
-- safe only because nothing reaches this table except through the
-- explicit, owner-authorized publish action below.
create policy "published_spaces: anyone can read"
  on public.published_spaces for select
  using (true);

create policy "published_spaces: owner can publish"
  on public.published_spaces for insert
  with check (public.is_tenant_owner(tenant_id));

create policy "published_spaces: owner can republish"
  on public.published_spaces for update
  using (public.is_tenant_owner(tenant_id))
  with check (public.is_tenant_owner(tenant_id));

create policy "published_spaces: owner can unpublish"
  on public.published_spaces for delete
  using (public.is_tenant_owner(tenant_id));
