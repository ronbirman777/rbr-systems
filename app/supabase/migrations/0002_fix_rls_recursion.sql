-- Fixes "infinite recursion detected in policy for relation tenant_members".
--
-- The original tenant_members SELECT policy queried tenant_members from
-- inside its own USING clause (to check "is auth.uid() a member of this
-- row's tenant"), which re-triggers that same policy on the subquery,
-- recursively, forever. The standard fix: move the membership check into a
-- SECURITY DEFINER function, which queries the table with RLS bypassed
-- (running as the function owner), breaking the recursive chain while
-- staying logically identical. All four tables' policies are recreated
-- against these two helper functions for consistency.

create or replace function public.is_tenant_member(check_tenant_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.tenant_members
    where tenant_id = check_tenant_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_tenant_owner(check_tenant_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.tenant_members
    where tenant_id = check_tenant_id and user_id = auth.uid() and role = 'owner'
  );
$$;

drop policy if exists "tenants: members can select" on public.tenants;
create policy "tenants: members can select"
  on public.tenants for select
  using (public.is_tenant_member(id));

drop policy if exists "tenants: owners can update" on public.tenants;
create policy "tenants: owners can update"
  on public.tenants for update
  using (public.is_tenant_owner(id));

drop policy if exists "tenant_members: members can select their tenant roster" on public.tenant_members;
create policy "tenant_members: members can select their tenant roster"
  on public.tenant_members for select
  using (public.is_tenant_member(tenant_id));

drop policy if exists "brand_configs: members can select" on public.brand_configs;
create policy "brand_configs: members can select"
  on public.brand_configs for select
  using (public.is_tenant_member(tenant_id));

drop policy if exists "brand_configs: members can upsert" on public.brand_configs;
create policy "brand_configs: members can upsert"
  on public.brand_configs for insert
  with check (public.is_tenant_member(tenant_id));

drop policy if exists "brand_configs: members can update" on public.brand_configs;
create policy "brand_configs: members can update"
  on public.brand_configs for update
  using (public.is_tenant_member(tenant_id));

drop policy if exists "module_configs: members can select" on public.module_configs;
create policy "module_configs: members can select"
  on public.module_configs for select
  using (public.is_tenant_member(tenant_id));

drop policy if exists "module_configs: members can upsert" on public.module_configs;
create policy "module_configs: members can upsert"
  on public.module_configs for insert
  with check (public.is_tenant_member(tenant_id));

drop policy if exists "module_configs: members can update" on public.module_configs;
create policy "module_configs: members can update"
  on public.module_configs for update
  using (public.is_tenant_member(tenant_id));
