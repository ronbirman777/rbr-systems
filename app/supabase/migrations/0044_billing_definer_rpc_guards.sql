-- TASK 032 - Commercial Platform Foundation, follow-up: billing guards for the
-- SECURITY DEFINER Studio-write RPCs Guest Access and Featured.
--
-- Gap closed: set_guest_access_code(), disable_guest_access_code() and
-- submit_featured_listing() are SECURITY DEFINER, so the 0039 restrictive
-- "billing allows studio writes" policies never apply to the rows they write
-- (space_guest_access, space_featured_submissions). The Studio server actions
-- (guestAccessActions.ts, featuredActions.ts) ask space_studio_writable()
-- first, but a tenant owner could bypass that by calling the RPC directly
-- through PostgREST on a Studio-suspended or ended paid Space.
--
-- This migration RESTATES the three functions. Each body is byte-identical to
-- the definition currently in force (all three: 0017_space_management_slots.sql)
-- except for ONE block per function between the markers
--   -- >>> TASK 032 (0044) ...
--   -- <<< TASK 032 (0044)
-- which is purely additive (no original line is changed or moved). This is
-- checked mechanically by src/lib/spaceTypes/billingRollback.test.ts.
--
-- Behaviour: right after the existing ownership check and before any write,
-- each function refuses with hint 'BILLING_LOCKED' (errcode P0001) when
-- space_studio_writable(p_tenant_id) is false. That predicate (0038) is
--   coalesce((select studio_writable from space_access_state(t) where decided), true)
-- so it is TRUE for every Space billing does not decide (no billing row, or an
-- expired exemption) - legacy Spaces behave exactly as before - and TRUE for
-- exempt, active, payment_issue and guest_suspended paid Spaces. It is false
-- only for studio_suspended (payment failure >= 168 h), ended and
-- incomplete/paused subscriptions. Like the 0039 policies and the 0042 guards
-- this does not depend on the launch flag. Non-owners are still refused by the
-- ownership check first ('not authorized'), so they learn nothing about billing.
--
-- disable_guest_access_code() is gated too, matching the Studio action (which
-- already refuses it for a billing-locked Space): changing Guest Access in
-- either direction is a Studio write.
--
-- Signatures, LANGUAGE, SECURITY DEFINER and the pinned search_path are exactly
-- as before; CREATE OR REPLACE keeps the existing grants, which are restated
-- below verbatim from 0016 for clarity (idempotent).
--
-- Rollback: verification/0044_billing_definer_rpc_guards_rollback.sql restores
-- the 0017 bodies verbatim.
--
-- Never edit 0001-0043. Forward-only.

-- ===========================================================================
-- 1. set_guest_access_code(): the 0017 body with the TASK 032 (0044) block.
-- ===========================================================================
create or replace function public.set_guest_access_code(p_tenant_id uuid, p_code text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_tenant_owner(p_tenant_id) then raise exception 'not authorized'; end if;

  -- >>> TASK 032 (0044): a Space whose Studio billing has suspended/ended
  -- cannot change Guest Access. True for every Space billing does not decide (legacy).
  if not public.space_studio_writable(p_tenant_id) then
    raise exception 'Billing must be resolved before Guest Access can be changed' using errcode = 'P0001', hint = 'BILLING_LOCKED';
  end if;
  -- <<< TASK 032 (0044)

  if public.tenant_is_archived(p_tenant_id) then raise exception 'Space is archived'; end if;
  if p_code !~ '^[0-9]{6}$' then raise exception 'code must be exactly 6 digits'; end if;
  insert into public.space_guest_access (tenant_id, mode, code_hash, version, updated_at)
    values (p_tenant_id, 'code', extensions.crypt(p_code, extensions.gen_salt('bf', 10)), 1, now())
  on conflict (tenant_id) do update set
    mode = 'code', code_hash = extensions.crypt(p_code, extensions.gen_salt('bf', 10)),
    version = space_guest_access.version + 1, updated_at = now();
end;
$$;

-- ===========================================================================
-- 2. disable_guest_access_code(): the 0017 body with the TASK 032 (0044) block.
-- ===========================================================================
create or replace function public.disable_guest_access_code(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_tenant_owner(p_tenant_id) then raise exception 'not authorized'; end if;

  -- >>> TASK 032 (0044): a Space whose Studio billing has suspended/ended
  -- cannot change Guest Access. True for every Space billing does not decide (legacy).
  if not public.space_studio_writable(p_tenant_id) then
    raise exception 'Billing must be resolved before Guest Access can be changed' using errcode = 'P0001', hint = 'BILLING_LOCKED';
  end if;
  -- <<< TASK 032 (0044)

  -- Disabling a code (returning to public mode) is still allowed on an
  -- archived tenant - it is a strictly more restrictive/neutral action
  -- (and archived tenants are already unreachable regardless of mode via
  -- isSpacePubliclyAvailable() and the published_spaces RLS change
  -- above), so there is no reason to block it and every reason to allow
  -- an owner to clean up guest access state on their own archived Space.
  update public.space_guest_access
    set mode = 'public', code_hash = null, version = version + 1, updated_at = now()
    where tenant_id = p_tenant_id;
end;
$$;

-- ===========================================================================
-- 3. submit_featured_listing(): the 0017 body with the TASK 032 (0044) block.
-- ===========================================================================
create or replace function public.submit_featured_listing(
  p_tenant_id uuid, p_description text, p_location text, p_website text,
  p_instagram text, p_additional_links jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_tenant_owner(p_tenant_id) then raise exception 'not authorized'; end if;

  -- >>> TASK 032 (0044): a Space whose Studio billing has suspended/ended
  -- cannot submit a Featured listing. True for every Space billing does not decide (legacy).
  if not public.space_studio_writable(p_tenant_id) then
    raise exception 'Billing must be resolved before a Featured listing can be submitted' using errcode = 'P0001', hint = 'BILLING_LOCKED';
  end if;
  -- <<< TASK 032 (0044)

  if public.tenant_is_archived(p_tenant_id) then raise exception 'Space is archived'; end if;
  insert into public.space_featured_submissions
    (tenant_id, status, description, location, website, instagram, additional_links, submitted_at, reviewed_at, reviewed_by, updated_at)
  values (p_tenant_id, 'submitted', p_description, p_location, p_website, p_instagram,
    coalesce(p_additional_links, '[]'::jsonb), now(), null, null, now())
  on conflict (tenant_id) do update set
    status = 'submitted', description = excluded.description, location = excluded.location,
    website = excluded.website, instagram = excluded.instagram,
    additional_links = excluded.additional_links, submitted_at = now(),
    reviewed_at = null, reviewed_by = null, updated_at = now();
end;
$$;

-- Grants exactly as 0016 set them (unchanged; restated for clarity).
REVOKE EXECUTE ON FUNCTION public.set_guest_access_code(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_guest_access_code(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.disable_guest_access_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disable_guest_access_code(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_featured_listing(uuid,text,text,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_featured_listing(uuid,text,text,text,text,jsonb) TO authenticated;
