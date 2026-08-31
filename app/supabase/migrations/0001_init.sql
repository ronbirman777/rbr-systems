-- RBR platform: initial schema for the Phase 1 vertical slice.
-- Entities beyond this (Retreat, ScheduleItem, Person, Resource, Client,
-- PracticeAssignment, Journey, JourneyChapter, Session, Reflection,
-- ChangeRequest) are designed for in the architecture plan but deferred
-- until the phases that need them.

create extension if not exists "pgcrypto";

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  product_type text not null check (product_type in ('retreat', 'client_hub')),
  status text not null default 'draft' check (status in ('draft', 'ready_to_publish', 'live')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_members (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'practitioner', 'client')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table if not exists public.brand_configs (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  name text not null default '',
  logo_url text,
  palette text not null default 'forest-sage'
    check (palette in ('forest-sage', 'warm-earth', 'soft-sand', 'deep-forest')),
  custom_primary text check (custom_primary is null or custom_primary ~ '^#[0-9a-fA-F]{6}$'),
  atmosphere text not null default 'calm-organic'
    check (atmosphere in ('calm-organic', 'warm-earthy', 'clean-minimal')),
  image_style text default 'rounded' check (image_style in ('rounded', 'square')),
  updated_at timestamptz not null default now()
);

create table if not exists public.module_configs (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  module_key text not null,
  enabled boolean not null default true,
  primary key (tenant_id, module_key)
);

-- A brand-new tenant needs its creator added as owner atomically, before any
-- tenant_members row can exist to satisfy the RLS policies below.
create or replace function public.handle_new_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tenant_members (tenant_id, user_id, role)
  values (new.id, auth.uid(), 'owner');
  return new;
end;
$$;

drop trigger if exists on_tenant_created on public.tenants;
create trigger on_tenant_created
  after insert on public.tenants
  for each row execute function public.handle_new_tenant();

alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.brand_configs enable row level security;
alter table public.module_configs enable row level security;

-- tenants: any signed-in user may create one (they become its owner via the
-- trigger above); only members may read/update it.
create policy "tenants: members can select"
  on public.tenants for select
  using (exists (
    select 1 from public.tenant_members m
    where m.tenant_id = tenants.id and m.user_id = auth.uid()
  ));

create policy "tenants: authenticated users can create"
  on public.tenants for insert
  with check (auth.uid() is not null);

create policy "tenants: owners can update"
  on public.tenants for update
  using (exists (
    select 1 from public.tenant_members m
    where m.tenant_id = tenants.id and m.user_id = auth.uid() and m.role = 'owner'
  ));

-- tenant_members: members can see their own tenant's roster; only the
-- trigger (security definer) inserts rows, never the client directly.
create policy "tenant_members: members can select their tenant roster"
  on public.tenant_members for select
  using (exists (
    select 1 from public.tenant_members m
    where m.tenant_id = tenant_members.tenant_id and m.user_id = auth.uid()
  ));

-- brand_configs / module_configs: readable and writable only by members of
-- the owning tenant.
create policy "brand_configs: members can select"
  on public.brand_configs for select
  using (exists (
    select 1 from public.tenant_members m
    where m.tenant_id = brand_configs.tenant_id and m.user_id = auth.uid()
  ));

create policy "brand_configs: members can upsert"
  on public.brand_configs for insert
  with check (exists (
    select 1 from public.tenant_members m
    where m.tenant_id = brand_configs.tenant_id and m.user_id = auth.uid()
  ));

create policy "brand_configs: members can update"
  on public.brand_configs for update
  using (exists (
    select 1 from public.tenant_members m
    where m.tenant_id = brand_configs.tenant_id and m.user_id = auth.uid()
  ));

create policy "module_configs: members can select"
  on public.module_configs for select
  using (exists (
    select 1 from public.tenant_members m
    where m.tenant_id = module_configs.tenant_id and m.user_id = auth.uid()
  ));

create policy "module_configs: members can upsert"
  on public.module_configs for insert
  with check (exists (
    select 1 from public.tenant_members m
    where m.tenant_id = module_configs.tenant_id and m.user_id = auth.uid()
  ));

create policy "module_configs: members can update"
  on public.module_configs for update
  using (exists (
    select 1 from public.tenant_members m
    where m.tenant_id = module_configs.tenant_id and m.user_id = auth.uid()
  ));
