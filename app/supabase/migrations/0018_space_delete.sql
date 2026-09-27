-- Task 014 — My Spaces permanent delete.
--
-- Source-of-truth/necessity gate: confirmed by direct inspection before
-- writing this migration that no genuine tenant-deletion capability
-- exists anywhere in this product today. Archive/Restore/Replace
-- (0017_space_management_slots.sql) only ever change `tenants.status` or
-- reset content in place - none of them removes the tenant row, and
-- there is no DELETE policy on `tenants` in any prior migration (only
-- SELECT/INSERT/UPDATE exist - 0001, 0002, 0003, 0009). A real,
-- permanent "delete this Space" action requires this new capability.
--
-- Every table that references tenants(id) already does so with
-- `on delete cascade` (confirmed across 0001, 0004, 0005, 0013:
-- tenant_members, brand_configs, module_configs, module_items,
-- module_settings, schedule_items, published_spaces, space_entitlements,
-- space_guest_access, space_featured_submissions, guest_access_ip_attempts,
-- access_code_redemptions), so a plain `delete from tenants` cleanly
-- removes every dependent row with no manual cleanup here. Deleting the
-- owner's own `tenant_members` row this way is also what correctly frees
-- the Space slot: getSpaceSlotSummary() (lifecycleActions.ts) derives
-- `slots_used` as `count(*) from tenant_members where role='owner'` -
-- once that row is gone, the count drops on its own with no separate
-- slot bookkeeping required.
create or replace function public.delete_space(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_tenant_owner(p_tenant_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  delete from public.tenants where id = p_tenant_id;
end;
$$;

revoke all on function public.delete_space(uuid) from public, anon;
grant execute on function public.delete_space(uuid) to authenticated;
