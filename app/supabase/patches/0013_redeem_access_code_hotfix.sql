-- HOTFIX, not a new migration. Corrects a deployment mismatch: Production's
-- live public.redeem_access_code(uuid,text) is missing the per-tenant
-- FOR UPDATE lock that was reviewed and approved before migration 0013 was
-- applied - confirmed directly via pg_get_functiondef() in the Supabase SQL
-- Editor (has_tenant_lock = false). supabase/migrations/0013_commercial_
-- entitlements.sql in this repository already contains the correct,
-- approved version (it always has - the file was never committed to git,
-- so there is no divergent history; the mismatch happened at the manual
-- apply step, not in this repository). This patch makes Production match
-- that file exactly for this one function - nothing else.
--
-- Touches ONLY public.redeem_access_code(uuid,text) via CREATE OR REPLACE.
-- Does not create or alter any table. Does not touch publish_space(),
-- any RLS policy, the grandfathered entitlement rows, or any existing
-- redemption data. Byte-identical to the function body in
-- supabase/migrations/0013_commercial_entitlements.sql as it stands in
-- this repository today.

create or replace function public.redeem_access_code(p_tenant_id uuid, p_code text)
returns public.space_entitlements
language plpgsql
security definer
-- Deliberately excludes `public` from the search path. Every object this
-- function touches that lives in public is already schema-qualified
-- (public.is_tenant_owner, public.space_entitlements, public.access_codes,
-- public.access_code_redemptions) - the only *unqualified* names resolved
-- here are built-ins (upper, btrim, now, interval, uuid, operators), which
-- all live in pg_catalog. Since nothing depends on public being searched,
-- excluding it removes any search-path-shadowing risk from an object
-- later created in public with a colliding name - independent of whatever
-- CREATE privilege anon/authenticated do or don't have on that schema.
-- pg_temp stays included per the standard Postgres SECURITY DEFINER
-- guidance (temp-object resolution), even though this function creates
-- none.
set search_path = pg_catalog, pg_temp
as $$
declare
  v_existing public.space_entitlements;
  v_code_id uuid;
  v_duration_days integer;
  v_new_ends_at timestamptz;
  v_result public.space_entitlements;
begin
  -- Never trust caller-supplied tenant membership - re-validate inside
  -- the function even though this can only be called by an authenticated
  -- user. Only an owner may redeem a code for their Space (organizers
  -- with a non-owner role, if that ever exists, cannot self-grant access
  -- either).
  if not public.is_tenant_owner(p_tenant_id) then
    raise exception 'You do not have access to manage this Space';
  end if;

  -- Serialize every redemption attempt for this tenant, regardless of
  -- which code - see the function-level "Concurrency" comment in
  -- supabase/migrations/0013_commercial_entitlements.sql. tenants always
  -- has a row for p_tenant_id (is_tenant_owner() above already required
  -- one to exist), unlike space_entitlements, which may not exist yet for
  -- a Space that has never redeemed anything - so this is a stable lock
  -- target even in that case. PERFORM (not SELECT ... INTO) because the
  -- row's contents are irrelevant here; only the lock matters. This
  -- blocks a second concurrent caller for the same tenant until this
  -- transaction commits or rolls back, at which point it re-reads
  -- space_entitlements below and sees this transaction's result. THIS IS
  -- THE LINE THAT WAS MISSING IN PRODUCTION.
  perform 1 from public.tenants where id = p_tenant_id for update;

  select * into v_existing
  from public.space_entitlements
  where tenant_id = p_tenant_id;

  -- No-stacking / never-downgrade-active guard. Grace end is derived
  -- inline (access_ends_at + interval '168 hours' - there is no stored
  -- grace_ends_at column; hours, not days, so this is a fixed elapsed
  -- duration regardless of timezone/DST). Checking only the grace-end
  -- bound is sufficient and equivalent to checking access_ends_at OR
  -- grace end separately: grace end is always >= access_ends_at, so
  -- "now() <= access_ends_at + 168 hours" already covers the
  -- complimentary/active window too. Inclusive, matching
  -- deriveCommercialAvailability() exactly: a period whose grace ends at
  -- exactly now() is still considered valid, so redemption is still
  -- blocked at that instant.
  if v_existing.tenant_id is not null
     and now() <= v_existing.access_ends_at + interval '168 hours' then
    raise exception 'This Space already has valid access';
  end if;

  -- Atomic capacity claim: one UPDATE, row-locked by Postgres, so
  -- concurrent redemptions of the same code can never together exceed
  -- max_redemptions - the WHERE clause re-checks redemption_count against
  -- max_redemptions on every attempt, and only one concurrent writer can
  -- win the row lock at a time.
  update public.access_codes
  set redemption_count = redemption_count + 1,
      updated_at = now()
  where code = upper(btrim(p_code))
    and enabled
    and (expires_at is null or now() <= expires_at)
    and redemption_count < max_redemptions
  returning id, duration_days into v_code_id, v_duration_days;

  if v_code_id is null then
    raise exception 'That code is not valid';
  end if;

  v_new_ends_at := now() + (v_duration_days || ' days')::interval;

  -- Deliberately no exception handler here. A duplicate (code_id,
  -- tenant_id) must abort the whole transaction, rolling back the
  -- redemption_count claim above too.
  insert into public.access_code_redemptions (code_id, tenant_id, redeemed_by, access_ends_at_granted)
  values (v_code_id, p_tenant_id, auth.uid(), v_new_ends_at);

  insert into public.space_entitlements (tenant_id, access_type, starts_at, access_ends_at)
  values (p_tenant_id, 'complimentary', now(), v_new_ends_at)
  on conflict (tenant_id) do update set
    access_type = 'complimentary',
    starts_at = now(),
    access_ends_at = v_new_ends_at,
    updated_at = now()
  returning * into v_result;

  return v_result;
end;
$$;

-- Hardened per Phase 1 adjustment #4: no PUBLIC or anon execution, ever.
-- Supabase grants `anon`/`authenticated` direct EXECUTE on every new
-- function by default (a separate default-privilege rule PUBLIC-revoke
-- does not touch) - so anon must be revoked explicitly, not just PUBLIC.
-- Re-asserted here for safety even though CREATE OR REPLACE FUNCTION does
-- not reset an existing function's privileges - costs nothing to repeat.
revoke all on function public.redeem_access_code(uuid, text) from public;
revoke execute on function public.redeem_access_code(uuid, text) from anon;
grant execute on function public.redeem_access_code(uuid, text) to authenticated;
