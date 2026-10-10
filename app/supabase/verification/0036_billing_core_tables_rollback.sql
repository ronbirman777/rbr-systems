-- Rollback for 0036_billing_core_tables.sql (TASK 032).
-- Do NOT run unless the migration needs to be reverted. Rollback is NEVER
-- automatic: nothing in CI, the Supabase CLI or the application runs files in
-- supabase/verification/. A human runs it deliberately, after the checks below.
--
-- THIS IS THE DATA-DESTRUCTIVE ONE. Read docs/billing/MIGRATION-RECOVERY.md
-- first. A forward fix is strongly preferred. If the goal is only "turn paid
-- billing off", do NOT run this: billing_settings.paid_checkout_enabled = false
-- (plus the 0039/0038 rollbacks if enforcement itself is the problem) already
-- restores legacy behaviour while keeping every billing record.
--
-- ORDER: 0044 -> 0043 -> 0042 -> 0041 -> 0040 -> 0039 -> 0038 -> 0037 -> 0036 (this file, LAST).
-- Every other TASK 032 rollback must already have run; the guard checks.
--
-- ===========================================================================
-- WHAT 0036 ADDED, AND WHAT THIS FILE DOES
-- ===========================================================================
--   tables (dropped, with their indexes, constraints, RLS policies, grants and
--   seed rows), in foreign-key order:
--     billing_email_outbox, billing_acceptances, billing_events,
--     coupon_redemptions, space_subscription_addons, space_subscriptions,
--     pending_space_checkouts, coupons, billing_customers, billing_plans,
--     billing_settings, admin_users
--   admin_audit_log (+ admin_audit_log_immutable() and its two triggers):
--     KEPT by default. The audit trail is append-only by design; dropping it
--     destroys history. It is dropped only with a second, separate
--     confirmation (idw.rollback_drop_audit, step 1c). Note that re-applying
--     0036 unchanged would then fail on `create table public.admin_audit_log`
--     - re-apply via a forward migration instead (see the recovery doc).
--   No pre-TASK-032 object was changed by 0036. Existing tenants, Spaces and
--   content are not touched (space_subscriptions' FK to tenants is ON DELETE
--   CASCADE from tenants, never the other way round).
--
-- REVERSIBLE: schema only (re-run 0036). THE DATA IS NOT: every billing row
--   below is lost - subscriptions incl. 'exempt' rows (Lena, Return to Balance,
--   QA), Stripe customer links, pending checkouts, coupons and their
--   redemption ledger (incl. snapshotted promised terms), webhook idempotency
--   records, legal acceptance evidence, the email outbox, Admin grants.
--   Stripe holds the financial truth for subscriptions/invoices, but the
--   coupon terms, acceptances and exemptions exist ONLY here.
--   EXPORT EVERYTHING FIRST (step 0) and keep the export as a financial/legal
--   record under the owner's control (never in the repository).
--
-- ===========================================================================
-- PREREQUISITES
-- ===========================================================================
--   1. 0041, 0040, 0039, 0038 and 0037 already rolled back.
--   2. paid checkout OFF; NO live paid subscription in Stripe or here; no open
--      or mid-payment checkout.
--   3. Production app on a pre-TASK-032 deployment; Stripe webhook endpoint
--      disabled; billing cron routes not scheduled.
--   4. Step 0 export completed and its row counts recorded.
--   5. Fresh backup / PITR point recorded (the only other way back).
--   6. Explicit owner approval for a data-destructive change.
--
-- ===========================================================================
-- STEP 0 - EXPORT (read-only; store OUTSIDE the repository - personal and
-- financial data)
-- ===========================================================================
--   \copy (select * from public.billing_settings) to 'rb0036_billing_settings.csv' csv header
--   \copy (select * from public.billing_plans) to 'rb0036_billing_plans.csv' csv header
--   \copy (select * from public.billing_customers) to 'rb0036_billing_customers.csv' csv header
--   \copy (select * from public.coupons) to 'rb0036_coupons.csv' csv header
--   \copy (select * from public.pending_space_checkouts) to 'rb0036_pending_space_checkouts.csv' csv header
--   \copy (select * from public.space_subscriptions) to 'rb0036_space_subscriptions.csv' csv header
--   \copy (select * from public.space_subscription_addons) to 'rb0036_space_subscription_addons.csv' csv header
--   \copy (select * from public.coupon_redemptions) to 'rb0036_coupon_redemptions.csv' csv header
--   \copy (select * from public.billing_events) to 'rb0036_billing_events.csv' csv header
--   \copy (select * from public.billing_acceptances) to 'rb0036_billing_acceptances.csv' csv header
--   \copy (select * from public.billing_email_outbox) to 'rb0036_billing_email_outbox.csv' csv header
--   \copy (select * from public.admin_users) to 'rb0036_admin_users.csv' csv header
--   \copy (select * from public.admin_audit_log) to 'rb0036_admin_audit_log.csv' csv header
--
-- ===========================================================================
-- STEP 1 - RUN
-- ===========================================================================
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -c "set idw.rollback_confirm = '0036-exported'" \
--     -f supabase/verification/0036_billing_core_tables_rollback.sql
--
-- STEP 1c - ONLY with a separate owner approval to destroy the audit trail,
-- add to the same command:  -c "set idw.rollback_drop_audit = '0036-audit-exported'"
--
-- STEP 2 - LEDGER (separate, explicit): supabase migration repair --status reverted <0036 version>
-- STEP 3 - VERIFY: the read-only queries at the end of this file.

begin;

do $$
begin
  if coalesce(current_setting('idw.rollback_confirm', true), '') <> '0036-exported' then
    raise exception 'ROLLBACK 0036 REFUSED: set idw.rollback_confirm = ''0036-exported'' after exporting every billing table (step 0)';
  end if;
  if to_regprocedure('public.billing_reserve_coupon(uuid, text, uuid, text, text, text, interval)') is not null then
    raise exception 'ROLLBACK 0036 REFUSED: 0037 is still applied; run the 0037 rollback first';
  end if;
  if to_regprocedure('public.space_access_state(uuid, timestamptz)') is not null then
    raise exception 'ROLLBACK 0036 REFUSED: 0038 is still applied; run the 0038 rollback first';
  end if;
  if to_regclass('public.billing_invoices') is not null then
    raise exception 'ROLLBACK 0036 REFUSED: 0040 is still applied; run the 0040 rollback first';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'billing_email_outbox' and column_name = 'claimed_at') then
    raise exception 'ROLLBACK 0036 REFUSED: 0041 is still applied; run the 0041 rollback first';
  end if;
  if exists (select 1 from public.billing_settings where paid_checkout_enabled) then
    raise exception 'ROLLBACK 0036 REFUSED: paid checkout is ON';
  end if;
  if exists (select 1 from public.space_subscriptions where status not in ('exempt', 'canceled', 'incomplete_expired')) then
    raise exception 'ROLLBACK 0036 REFUSED: a live paid subscription exists';
  end if;
  if exists (select 1 from public.pending_space_checkouts
             where status in ('created', 'checkout_created', 'awaiting_payment', 'payment_confirmed', 'provisioning')) then
    raise exception 'ROLLBACK 0036 REFUSED: an open or mid-payment checkout exists';
  end if;
  -- Printed so the operator can compare with the step 0 export before COMMIT.
  raise notice 'ROLLBACK 0036 row counts being dropped: subscriptions=%, customers=%, checkouts=%, coupons=%, redemptions=%, events=%, acceptances=%, outbox=%, admin_users=%',
    (select count(*) from public.space_subscriptions), (select count(*) from public.billing_customers),
    (select count(*) from public.pending_space_checkouts), (select count(*) from public.coupons),
    (select count(*) from public.coupon_redemptions), (select count(*) from public.billing_events),
    (select count(*) from public.billing_acceptances), (select count(*) from public.billing_email_outbox),
    (select count(*) from public.admin_users);
end;
$$;

-- Foreign-key order, dependents first. No CASCADE: an unexpected dependent
-- (a view, a later migration's FK) makes the whole transaction fail.
drop table public.billing_email_outbox;
drop table public.billing_acceptances;
drop table public.billing_events;
drop table public.coupon_redemptions;
drop table public.space_subscription_addons;
drop table public.space_subscriptions;
drop table public.pending_space_checkouts;
drop table public.coupons;
drop table public.billing_customers;
drop table public.billing_plans;
drop table public.billing_settings;
drop table public.admin_users;

-- Step 1c: the audit trail, only with its own confirmation.
do $$
begin
  if coalesce(current_setting('idw.rollback_drop_audit', true), '') = '0036-audit-exported' then
    execute 'drop table public.admin_audit_log';
    execute 'drop function public.admin_audit_log_immutable()';
    raise notice 'ROLLBACK 0036: admin_audit_log DROPPED (separately confirmed)';
  else
    raise notice 'ROLLBACK 0036: admin_audit_log KEPT (append-only audit trail)';
  end if;
end;
$$;

commit;

-- ===========================================================================
-- VERIFY (read-only). Expected: 0 remaining billing tables (1 if the audit log
-- was kept: admin_audit_log), and the pre-TASK-032 table count.
-- ===========================================================================
select count(*) as remaining_0036_tables, string_agg(table_name, ', ') as names
from information_schema.tables
where table_schema = 'public' and table_name in (
  'billing_settings', 'billing_plans', 'billing_customers', 'coupons', 'pending_space_checkouts',
  'space_subscriptions', 'space_subscription_addons', 'coupon_redemptions', 'billing_events',
  'billing_acceptances', 'billing_email_outbox', 'admin_users', 'admin_audit_log');

select count(*) as public_tables from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE';
