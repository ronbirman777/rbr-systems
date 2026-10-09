-- TASK 032 - Commercial Platform Foundation, follow-up: billing guards for the
-- Space lifecycle RPCs (Restore / Replace).
--
-- Gap closed: restore_space() and replace_space() are SECURITY DEFINER, so the
-- 0039 restrictive "billing allows studio writes" policies never apply to the
-- rows they change, and neither function consulted billing. A Studio-suspended
-- or ended Space could therefore be reset (Replace) or brought back out of the
-- archive (Restore) by a direct RPC call, and restore_space() counted paid
-- Spaces against the legacy per-user slot allowance (a paid Space is one
-- subscription and never needs a legacy slot).
--
-- This migration RESTATES both functions. Each body is byte-identical to the
-- definition currently in force (restore_space: 0017; replace_space: 0027)
-- except for the blocks between the markers
--   -- >>> TASK 032 (0042) ...
--   -- <<< TASK 032 (0042)
-- which are purely additive (no original line is changed or moved). This is
-- checked mechanically by src/lib/spaceTypes/billingRollback.test.ts.
--
-- Behaviour (mirrors decideSpaceLifecycle() in src/lib/billing/lifecycleAccess.ts):
--
-- restore_space(p_tenant_id)
--   * Billing-governed Space (space_access_state(...).decided: a paid
--     subscription row, or an unexpired exemption): the legacy slot check is
--     skipped; the restore is allowed exactly when space_studio_writable() is
--     true, otherwise it raises hint 'BILLING_LOCKED'. Like the 0039 policies
--     this does not depend on the launch flag: a billing decision is a billing
--     decision.
--   * Legacy Space (no billing row, or an expired exemption): the 0017 slot
--     check, unchanged. Only while paid checkout is ON
--     (billing_is_paid_checkout_required()) is the usage re-counted over the
--     owner's LEGACY Spaces only (Spaces billing does not decide), so Spaces
--     bought one-by-one never eat the free allowance. With the flag OFF the
--     count is the original 0017 count, so a legacy restore has exactly the
--     pre-0042 outcome.
--
-- replace_space(p_tenant_id, p_new_name)
--   * Refuses with hint 'BILLING_LOCKED' when space_studio_writable() is false.
--     That predicate is true for every Space billing does not decide, so
--     legacy Spaces are unaffected.
--
-- archive_space() is deliberately NOT changed: archiving only retires a Space
-- (status + archived_at); it can never create capacity, skip a payment or
-- write content, and letting a suspended/ended customer archive a Space they
-- no longer want is desirable. Bringing it back (restore) or reusing it
-- (replace) is what billing must gate, and both are gated here.
--
-- Signatures, LANGUAGE, SECURITY DEFINER and the pinned search_path are exactly
-- as before; CREATE OR REPLACE keeps the existing grants, which are restated
-- below verbatim from 0017 for clarity (idempotent).
--
-- Rollback: verification/0042_billing_space_lifecycle_guards_rollback.sql
-- restores the 0017 restore_space and 0027 replace_space bodies verbatim.
--
-- Never edit 0001-0041. Forward-only.

-- ===========================================================================
-- 1. restore_space(): the 0017 body with the TASK 032 (0042) blocks (marked).
-- ===========================================================================
create or replace function public.restore_space(p_tenant_id uuid)
returns void
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
  if not public.is_tenant_owner(p_tenant_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- >>> TASK 032 (0042): a billing-governed Space follows the billing decision,
  -- never the legacy slot allowance.
  if coalesce((select a.decided from public.space_access_state(p_tenant_id) a), false) then
    if not public.space_studio_writable(p_tenant_id) then
      raise exception 'Billing must be resolved before this Space can be restored' using errcode = 'P0001', hint = 'BILLING_LOCKED';
    end if;
    update public.tenants
      set status = 'draft', archived_at = null, updated_at = now()
      where id = p_tenant_id and status = 'archived';
    return;
  end if;
  -- <<< TASK 032 (0042)

  insert into public.user_space_slots (user_id) values (v_user)
    on conflict (user_id) do nothing;

  select slots_allowed into v_allowed
    from public.user_space_slots
    where user_id = v_user
    for update;

  if not found then
    raise exception 'Space slot allowance could not be established' using errcode = 'P0001';
  end if;

  select count(*) into v_used
    from public.tenant_members
    where user_id = v_user and role = 'owner';

  -- >>> TASK 032 (0042): with paid checkout ON, only legacy Spaces (those
  -- billing does not decide) use the legacy allowance. Flag OFF: the count
  -- above stands unchanged.
  if public.billing_is_paid_checkout_required() then
    select count(*) into v_used
      from public.tenant_members tm
      where tm.user_id = v_user and tm.role = 'owner'
        and not coalesce((select a.decided from public.space_access_state(tm.tenant_id) a), false);
  end if;
  -- <<< TASK 032 (0042)

  -- v_used already includes this archived tenant (it was never removed
  -- from tenant_members), so the comparison is strictly greater-than, not
  -- greater-or-equal — restoring never adds a new owned tenant.
  if v_used > v_allowed then
    raise exception 'No available Space slots' using errcode = 'P0001', hint = 'SLOT_LIMIT_REACHED';
  end if;

  update public.tenants
    set status = 'draft', archived_at = null, updated_at = now()
    where id = p_tenant_id and status = 'archived';
end;
$$;

-- ===========================================================================
-- 2. replace_space(): the 0027 body with the TASK 032 (0042) block (marked).
-- ===========================================================================
create or replace function public.replace_space(p_tenant_id uuid, p_new_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_tenant_owner(p_tenant_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- >>> TASK 032 (0042): a Space whose Studio billing has suspended/ended
  -- cannot be reset. True for every Space billing does not decide (legacy).
  if not public.space_studio_writable(p_tenant_id) then
    raise exception 'Billing must be resolved before this Space can be replaced' using errcode = 'P0001', hint = 'BILLING_LOCKED';
  end if;
  -- <<< TASK 032 (0042)

  delete from public.published_spaces where tenant_id = p_tenant_id;
  delete from public.module_items where tenant_id = p_tenant_id;
  delete from public.module_settings where tenant_id = p_tenant_id;
  delete from public.schedule_items where tenant_id = p_tenant_id;
  update public.module_configs
    set enabled = false, image_ref = null, image_position = null
    where tenant_id = p_tenant_id;

  update public.space_guest_access
    set mode = 'public', code_hash = null, version = version + 1, updated_at = now()
    where tenant_id = p_tenant_id;

  update public.brand_configs
    set name = '',
        logo_ref = null,
        hero_image_ref = null,
        space_image_ref = null,
        palette = 'forest-sage',
        atmosphere = 'calm-organic',
        image_style = 'rounded',
        custom_primary = null,
        custom_secondary = null,
        custom_navigation = null,
        custom_text = null,
        updated_at = now()
    where tenant_id = p_tenant_id;

  update public.tenants
    set name = coalesce(nullif(trim(p_new_name), ''), 'Untitled Retreat'),
        status = 'draft',
        slug = null,
        archived_at = null,
        updated_at = now(),
        content_updated_at = now()
    where id = p_tenant_id;
end;
$$;

-- Grants exactly as 0017 set them (unchanged; restated for clarity).
revoke all on function public.restore_space(uuid) from public, anon;
revoke all on function public.replace_space(uuid, text) from public, anon;
grant execute on function public.restore_space(uuid) to authenticated;
grant execute on function public.replace_space(uuid, text) to authenticated;
