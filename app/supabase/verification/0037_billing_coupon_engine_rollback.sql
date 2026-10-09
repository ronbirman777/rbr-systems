-- Rollback for 0037_billing_coupon_engine.sql (TASK 032).
-- Do NOT run unless the migration needs to be reverted. Rollback is NEVER
-- automatic: nothing in CI, the Supabase CLI or the application runs files in
-- supabase/verification/. A human runs it deliberately, after the checks below.
--
-- Read docs/billing/MIGRATION-RECOVERY.md first. A forward fix is preferred.
--
-- ORDER: 0041 -> 0040 -> 0039 -> 0038 -> 0037 (this file) -> 0036.
-- 0038's rollback (billing_expire_open_checkouts and billing_provision_paid_space
-- call these functions) and 0041's rollback (billing_transition_checkout calls
-- billing_release_coupon_reservation) must already have run; the guard checks.
--
-- ===========================================================================
-- WHAT 0037 ADDED, AND WHAT THIS FILE DOES
-- ===========================================================================
--   functions (dropped): billing_normalize_coupon_code, billing_reserve_coupon,
--     billing_release_coupon_reservation, billing_expire_stale_reservations,
--     billing_finalize_coupon_redemption, billing_record_discount_cycle
--   0037 created no table and changed no existing object.
--
-- REVERSIBLE: fully. Re-running 0037 re-creates every function.
-- DATA-DESTRUCTIVE: nothing. coupons / coupon_redemptions rows (0036 tables)
--   stay; with these functions gone nothing can reserve or redeem a coupon,
--   and a 'reserved' row simply never moves again.
--
-- ===========================================================================
-- PREREQUISITES
-- ===========================================================================
--   1. 0041, 0040, 0039 and 0038 already rolled back.
--   2. paid checkout OFF; no live paid subscription.
--   3. Production app on a pre-TASK-032 deployment.
--   4. Fresh backup / PITR point recorded.
--
-- ===========================================================================
-- STEP 1 - RUN
-- ===========================================================================
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -c "set idw.rollback_confirm = '0037'" \
--     -f supabase/verification/0037_billing_coupon_engine_rollback.sql
--
-- STEP 2 - LEDGER (separate, explicit): supabase migration repair --status reverted <0037 version>
-- STEP 3 - VERIFY: the read-only query at the end of this file.

begin;

do $$
begin
  if coalesce(current_setting('idw.rollback_confirm', true), '') <> '0037' then
    raise exception 'ROLLBACK 0037 REFUSED: set idw.rollback_confirm = ''0037'' to confirm';
  end if;
  if to_regprocedure('public.billing_provision_paid_space(uuid, jsonb, text, text)') is not null
     or to_regprocedure('public.billing_expire_open_checkouts()') is not null then
    raise exception 'ROLLBACK 0037 REFUSED: 0038 is still applied; run the 0038 rollback first';
  end if;
  if to_regprocedure('public.billing_transition_checkout(uuid, text[], text, text, text)') is not null then
    raise exception 'ROLLBACK 0037 REFUSED: 0041 is still applied; run the 0041 rollback first';
  end if;
  if exists (select 1 from public.billing_settings where paid_checkout_enabled) then
    raise exception 'ROLLBACK 0037 REFUSED: paid checkout is ON';
  end if;
  if exists (select 1 from public.space_subscriptions where status not in ('exempt', 'canceled', 'incomplete_expired')) then
    raise exception 'ROLLBACK 0037 REFUSED: a live paid subscription exists';
  end if;
end;
$$;

drop function public.billing_record_discount_cycle(uuid, text, boolean, timestamptz);
drop function public.billing_finalize_coupon_redemption(uuid, uuid, uuid, timestamptz);
drop function public.billing_expire_stale_reservations();
drop function public.billing_release_coupon_reservation(uuid, text);
drop function public.billing_reserve_coupon(uuid, text, uuid, text, text, text, interval);
drop function public.billing_normalize_coupon_code(text);

commit;

-- ===========================================================================
-- VERIFY (read-only). Expected: 0.
-- ===========================================================================
select count(*) as remaining_0037_functions
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'billing_normalize_coupon_code', 'billing_reserve_coupon', 'billing_release_coupon_reservation',
  'billing_expire_stale_reservations', 'billing_finalize_coupon_redemption', 'billing_record_discount_cycle');
