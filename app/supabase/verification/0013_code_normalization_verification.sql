-- Verification script for 0013_commercial_entitlements.sql's code
-- normalization requirements. NOT a migration - never numbered into
-- supabase/migrations/, never applied automatically. Written so it can be
-- reviewed alongside the migration before approval, and run by hand
-- immediately after the migration is applied.
--
-- This file proves the DATABASE-CONSTRAINT half of code normalization
-- (parts A and B), the grace-end schema fix itself (part C - no stored
-- grace_ends_at column, both guards derive it inline via the
-- fixed-duration interval '168 hours', not the calendar-relative
-- interval '7 days'), and the structural presence of the concurrency fix
-- (part D - redeem_access_code() takes a FOR UPDATE lock on tenants) -
-- it needs no auth context and is wrapped in a transaction that always
-- rolls back, so it is safe to run against Production as-is with zero
-- lasting effect, independent of any other verification. It
-- intentionally does NOT insert any real code, tenant, or user.
--
-- Two things this file CANNOT prove, because they need two real
-- overlapping transactions rather than a single DO block:
--  1. The REDEMPTION half of normalization (a real tenant/user calling
--     redeem_access_code() with "ron60" / "  ron60  " and getting the
--     canonical row) - see the companion checklist below.
--  2. The concurrency fix actually preventing a race, not just being
--     present in the function body - see
--     0013_concurrency_verification.sh (same directory), which fires
--     genuinely concurrent redemption requests and asserts the outcome.
-- Both need a real authenticated tenant owner, per this session's
-- established pattern for every live check so far: created via the
-- service-role Admin API, exercised, then deleted immediately.

begin;

-- ---------------------------------------------------------------------
-- A. "RON60 stored canonically works" / "a non-canonical code cannot be
--    inserted directly" / "case/whitespace variants cannot create
--    duplicate logical promo codes"
-- ---------------------------------------------------------------------

-- A1. Canonical form inserts cleanly.
insert into public.access_codes (code, duration_days, max_redemptions)
values ('RON60', 60, 1);

do $$
begin
  if not exists (select 1 from public.access_codes where code = 'RON60') then
    raise exception 'FAIL: canonical code RON60 did not insert';
  end if;
  raise notice 'PASS: canonical code RON60 inserted';
end $$;

-- A2. Lowercase cannot be inserted directly - CHECK constraint must reject it.
do $$
begin
  begin
    insert into public.access_codes (code, duration_days, max_redemptions)
    values ('ron60-lower', 60, 1);
    raise exception 'FAIL: lowercase code was accepted by the CHECK constraint';
  exception
    when check_violation then
      raise notice 'PASS: lowercase code rejected by CHECK constraint';
  end;
end $$;

-- A3. Leading/trailing whitespace cannot be inserted directly either.
do $$
begin
  begin
    insert into public.access_codes (code, duration_days, max_redemptions)
    values (' RON60-PAD ', 60, 1);
    raise exception 'FAIL: whitespace-padded code was accepted by the CHECK constraint';
  exception
    when check_violation then
      raise notice 'PASS: whitespace-padded code rejected by CHECK constraint';
  end;
end $$;

-- A4. Structural duplicate-logical-code guarantee: since only the
-- canonical spelling can ever be stored, UNIQUE on `code` is already a
-- real logical-code guarantee - inserting the same canonical value twice
-- must fail, and there is no non-canonical spelling that could sneak a
-- second row in under a different byte representation of the same code.
do $$
begin
  begin
    insert into public.access_codes (code, duration_days, max_redemptions)
    values ('RON60', 90, 1);
    raise exception 'FAIL: duplicate canonical code was accepted';
  exception
    when unique_violation then
      raise notice 'PASS: duplicate canonical code rejected by UNIQUE constraint';
  end;
end $$;

-- ---------------------------------------------------------------------
-- B. redeem_access_code()'s lookup expression matches the constraint's
--    canonical form exactly, byte-for-byte (upper(btrim(...)) in both
--    places) - confirmed by inspecting pg_get_functiondef() rather than
--    by executing the function (which needs a real tenant owner).
-- ---------------------------------------------------------------------
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.redeem_access_code(uuid, text)'::regprocedure) into v_def;
  if v_def not like '%upper(btrim(p_code))%' then
    raise exception 'FAIL: redeem_access_code() lookup expression does not match upper(btrim(...))';
  end if;
  raise notice 'PASS: redeem_access_code() normalizes with upper(btrim(p_code)), matching the CHECK constraint';
end $$;

-- ---------------------------------------------------------------------
-- C. Confirms the schema-fix itself (the reason this file was revised):
--    no stored grace_ends_at column exists anywhere on space_entitlements
--    - the original `generated ... stored` design that Postgres rejected
--    with 42P17 ("generation expression is not immutable") - and both
--    guard functions derive grace end inline via interval '168 hours'
--    (a fixed elapsed duration, deliberately not the calendar-relative
--    interval '7 days') instead of reading a column.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'space_entitlements'
      and column_name = 'grace_ends_at'
  ) then
    raise exception 'FAIL: space_entitlements still has a grace_ends_at column';
  end if;
  raise notice 'PASS: space_entitlements has no grace_ends_at column - access_ends_at is the sole persisted timestamp';
end $$;

do $$
declare
  v_redeem_def text;
  v_publish_def text;
begin
  select pg_get_functiondef('public.redeem_access_code(uuid, text)'::regprocedure) into v_redeem_def;
  if v_redeem_def not like '%interval ''168 hours''%' then
    raise exception 'FAIL: redeem_access_code() does not derive grace end inline via interval ''168 hours''';
  end if;
  if v_redeem_def like '%interval ''7 days''%' then
    raise exception 'FAIL: redeem_access_code() still contains the calendar-day interval ''7 days'' - should be 168 hours only';
  end if;
  raise notice 'PASS: redeem_access_code() derives grace end inline via the fixed-duration interval ''168 hours'' (not ''7 days'')';

  select pg_get_functiondef('public.publish_space(uuid)'::regprocedure) into v_publish_def;
  if v_publish_def not like '%interval ''168 hours''%' then
    raise exception 'FAIL: publish_space() does not derive grace end inline via interval ''168 hours''';
  end if;
  if v_publish_def like '%interval ''7 days''%' then
    raise exception 'FAIL: publish_space() still contains the calendar-day interval ''7 days'' - should be 168 hours only';
  end if;
  raise notice 'PASS: publish_space() derives grace end inline via the fixed-duration interval ''168 hours'' (not ''7 days'')';
end $$;

-- ---------------------------------------------------------------------
-- D. Confirms the concurrency fix: redeem_access_code() takes a row lock
--    on tenants (FOR UPDATE) before reading space_entitlements, so two
--    concurrent redemptions of DIFFERENT codes for the SAME tenant are
--    serialized rather than racing each other to the space_entitlements
--    UPSERT. Structural proof via pg_get_functiondef(); the actual
--    concurrent-request proof (two codes really racing, only one really
--    winning) needs two real overlapping transactions and is run
--    separately - see 0013_concurrency_verification.sh.
-- ---------------------------------------------------------------------
do $$
declare
  v_redeem_def text;
begin
  select pg_get_functiondef('public.redeem_access_code(uuid, text)'::regprocedure) into v_redeem_def;
  if v_redeem_def not like '%from public.tenants where id = p_tenant_id for update%' then
    raise exception 'FAIL: redeem_access_code() does not take a FOR UPDATE lock on tenants before reading space_entitlements';
  end if;
  raise notice 'PASS: redeem_access_code() locks the tenant row (FOR UPDATE) before its eligibility check, serializing concurrent redemptions per tenant';
end $$;

rollback;

-- ===========================================================================
-- Companion checklist - the REDEMPTION half of normalization, run with
-- disposable test data as part of live verification after the migration
-- is applied (not part of this file, listed here so the full proof is
-- reviewable in one place before approval):
--
--  1. Create a disposable test tenant + owner user via the service-role
--     Admin API.
--  2. As that user, call redeem_access_code(tenant_id, 'ron60') (lowercase)
--     against a live 'RON60' code -> must succeed and grant access tied
--     to the RON60 row (same code_id in access_code_redemptions).
--  3. Create a second disposable tenant/owner, call
--     redeem_access_code(tenant_id_2, '  ron60  ') (padded + lowercase)
--     against the SAME 'RON60' code -> must also succeed, resolving the
--     same RON60 row (proves both trim and case normalization happen at
--     lookup time, not just at insert time).
--  4. Delete both disposable tenants/users and the test access_codes row,
--     re-sweep to confirm zero residue - per this session's established
--     cleanup pattern for every live check.
--
-- For the CONCURRENCY proofs (two different codes racing for one tenant;
-- multiple tenants racing for one code's last slot), see the companion
-- script 0013_concurrency_verification.sh in this same directory - those
-- need genuinely overlapping requests, which a single SQL session can't
-- produce.
-- ===========================================================================
