-- Rollback for 0038_billing_provisioning_lifecycle.sql (TASK 032).
-- Do NOT run unless the migration needs to be reverted. Rollback is NEVER
-- automatic: nothing in CI, the Supabase CLI or the application runs files in
-- supabase/verification/. A human runs it deliberately, after the checks below.
--
-- Read docs/billing/MIGRATION-RECOVERY.md first. A forward fix is preferred.
--
-- ORDER: 0041 -> 0040 -> 0039 -> 0038 (this file) -> 0037 -> 0036.
-- 0039's rollback must already have run (its policies call
-- space_studio_writable(), and its publish_space() calls space_access_state();
-- the guard checks both).
--
-- ===========================================================================
-- WHAT 0038 CHANGED, AND WHAT THIS FILE DOES
-- ===========================================================================
--   restated pre-existing trigger functions (RESTORED verbatim):
--     handle_new_tenant()           -> 0001_init.sql's definition
--     enforce_space_slot_capacity() -> 0017_space_management_slots.sql's definition
--   Those are the migrations that last defined them before 0038 (nothing in
--   0002-0037 redefines or alters either). src/lib/spaceTypes/
--   billingRollback.test.ts checks mechanically that each restored body equals
--   that earlier body. md5(pg_get_functiondef(...)) of the restored text is
--     handle_new_tenant            e3526abc627aa30a11616295c39cebef
--     enforce_space_slot_capacity  708dde46d74624be4cb93b48d4972991
--   which are the values recorded on Staging before TASK 027.5
--   (tasks/staging-pre0028/public-functions.txt). The triggers on public.tenants
--   (on_tenant_created, enforce_space_slot_capacity_trigger) are untouched;
--   CREATE OR REPLACE keeps the functions' owner and ACL.
--   trigger (dropped): tenants_guard_delete_with_subscription
--   functions (dropped): guard_tenant_delete_with_subscription,
--     billing_is_paid_checkout_required, billing_confirm_checkout_payment,
--     billing_fail_checkout, billing_expire_open_checkouts,
--     billing_provision_paid_space, billing_apply_subscription_state,
--     billing_apply_lifecycle, billing_set_next_action,
--     billing_set_internal_exempt, billing_clear_internal_exempt,
--     space_access_state, space_studio_writable, space_audio_entitlements
--
-- REVERSIBLE: fully at the schema level. 0038 created no table and stored no
--   data; re-running 0038 re-applies it.
-- DATA-DESTRUCTIVE: nothing is deleted. BUT rows written THROUGH these
--   functions (space_subscriptions incl. 'exempt' rows, pending checkouts,
--   coupon redemptions) stay in the 0036 tables and become inert: nothing
--   reads them for access decisions any more.
-- BEHAVIOUR AFTER:
--   * tenant creation is the 0017 behaviour again: an authenticated user
--     within their slot allowance; no PAYMENT_REQUIRED refusal; the server-side
--     paid provisioning path no longer exists (a tenant insert without a user
--     session fails "Not authenticated").
--   * deleting a Space no longer checks for a live subscription.
--   * the owner of a Space created by paid provisioning stays its owner
--     (tenant_members rows are not touched).
--
-- ===========================================================================
-- PREREQUISITES
-- ===========================================================================
--   1. 0041, 0040 and 0039 already rolled back.
--   2. paid checkout OFF; no live paid subscription; no checkout mid-payment
--      (status payment_confirmed / provisioning) - a paid-but-unprovisioned
--      customer must be provisioned or refunded first.
--   3. Production app on a pre-TASK-032 deployment (the 032 app calls
--      space_access_state / billing_* RPCs and would fail closed).
--   4. Billing cron routes not scheduled; Stripe webhook endpoint disabled.
--   5. Fresh backup / PITR point recorded.
--
-- ===========================================================================
-- STEP 1 - RUN
-- ===========================================================================
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -c "set idw.rollback_confirm = '0038'" \
--     -f supabase/verification/0038_billing_provisioning_lifecycle_rollback.sql
--
-- STEP 2 - LEDGER (separate, explicit): supabase migration repair --status reverted <0038 version>
-- STEP 3 - VERIFY: the read-only queries at the end of this file.

begin;

do $$
begin
  if coalesce(current_setting('idw.rollback_confirm', true), '') <> '0038' then
    raise exception 'ROLLBACK 0038 REFUSED: set idw.rollback_confirm = ''0038'' to confirm';
  end if;
  if exists (select 1 from pg_policies where policyname like '%: billing allows studio writes (%') then
    raise exception 'ROLLBACK 0038 REFUSED: 0039 policies still exist; run the 0039 rollback first';
  end if;
  if position('space_access_state' in pg_get_functiondef('public.publish_space(uuid)'::regprocedure)) > 0 then
    raise exception 'ROLLBACK 0038 REFUSED: publish_space() still calls space_access_state(); run the 0039 rollback first';
  end if;
  if exists (select 1 from public.billing_settings where paid_checkout_enabled) then
    raise exception 'ROLLBACK 0038 REFUSED: paid checkout is ON';
  end if;
  if exists (select 1 from public.space_subscriptions where status not in ('exempt', 'canceled', 'incomplete_expired')) then
    raise exception 'ROLLBACK 0038 REFUSED: a live paid subscription exists';
  end if;
  if exists (select 1 from public.pending_space_checkouts where status in ('payment_confirmed', 'provisioning')) then
    raise exception 'ROLLBACK 0038 REFUSED: a paid checkout is not yet provisioned';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Restore the two pre-existing trigger functions FIRST (the 0038
--    enforce_space_slot_capacity calls billing_is_paid_checkout_required(),
--    which is dropped below).
-- ---------------------------------------------------------------------------
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

create or replace function public.enforce_space_slot_capacity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user uuid;
  v_allowed integer;
  v_used integer;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  -- Bind ownership identity to the authenticated server context only —
  -- never trust a client-submitted created_by for quota purposes.
  new.created_by := v_user;

  -- Bootstrap the approved default (Decision A) the first time this user
  -- ever attempts to create a Space. This is the actual approved default,
  -- not a fallback for a query failure — an unexpected error below still
  -- aborts the whole transaction (fails closed) rather than falling
  -- through to an implicit allow.
  insert into public.user_space_slots (user_id) values (v_user)
    on conflict (user_id) do nothing;

  -- Lock this user's row for the rest of this transaction so two
  -- concurrent creation attempts by the same user serialize: the second
  -- transaction blocks here until the first commits or rolls back, then
  -- re-reads/re-counts under its own fresh statement snapshot.
  select slots_allowed into v_allowed
    from public.user_space_slots
    where user_id = v_user
    for update;

  if not found then
    -- Unreachable after the insert above under normal operation; fail
    -- closed rather than silently allow if it somehow still doesn't exist.
    raise exception 'Space slot allowance could not be established' using errcode = 'P0001';
  end if;

  -- Every currently-owned tenant counts toward usage regardless of status
  -- — draft, ready_to_publish, live, or archived (Decision B: archive
  -- keeps consuming its slot). Draft + published snapshot of the SAME
  -- tenant is naturally one row here, never double-counted.
  select count(*) into v_used
    from public.tenant_members
    where user_id = v_user and role = 'owner';

  if v_used >= v_allowed then
    raise exception 'No available Space slots' using errcode = 'P0001', hint = 'SLOT_LIMIT_REACHED';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_space_slot_capacity() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Drop the delete guard (trigger before its function).
-- ---------------------------------------------------------------------------
drop trigger tenants_guard_delete_with_subscription on public.tenants;
drop function public.guard_tenant_delete_with_subscription();

-- ---------------------------------------------------------------------------
-- 3. Drop the new functions (dependents first; no CASCADE).
-- ---------------------------------------------------------------------------
drop function public.space_audio_entitlements(uuid);
drop function public.space_studio_writable(uuid);
drop function public.space_access_state(uuid, timestamptz);
drop function public.billing_clear_internal_exempt(uuid);
drop function public.billing_set_internal_exempt(uuid, text, uuid, timestamptz);
drop function public.billing_set_next_action(uuid, text, timestamptz, integer);
drop function public.billing_apply_lifecycle(timestamptz);
drop function public.billing_apply_subscription_state(text, text, jsonb, timestamptz);
drop function public.billing_provision_paid_space(uuid, jsonb, text, text);
drop function public.billing_expire_open_checkouts();
drop function public.billing_fail_checkout(uuid, text);
drop function public.billing_confirm_checkout_payment(uuid, text, text, text);
drop function public.billing_is_paid_checkout_required();

commit;

-- ===========================================================================
-- VERIFY (read-only).
--   remaining_0038_functions  expected 0
--   guard_trigger             expected 0
--   handle_new_tenant md5     expected e3526abc627aa30a11616295c39cebef
--   enforce_space_slot md5    expected 708dde46d74624be4cb93b48d4972991
-- ===========================================================================
select count(*) as remaining_0038_functions
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'guard_tenant_delete_with_subscription', 'billing_is_paid_checkout_required',
  'billing_confirm_checkout_payment', 'billing_fail_checkout', 'billing_expire_open_checkouts',
  'billing_provision_paid_space', 'billing_apply_subscription_state', 'billing_apply_lifecycle',
  'billing_set_next_action', 'billing_set_internal_exempt', 'billing_clear_internal_exempt',
  'space_access_state', 'space_studio_writable', 'space_audio_entitlements');

select count(*) as guard_trigger
from pg_trigger where tgname = 'tenants_guard_delete_with_subscription';

select md5(pg_get_functiondef('public.handle_new_tenant()'::regprocedure)) as handle_new_tenant_md5,
       md5(pg_get_functiondef('public.enforce_space_slot_capacity()'::regprocedure)) as enforce_space_slot_capacity_md5;
