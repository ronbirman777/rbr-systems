-- Rollback for 0040_billing_payments_invoices.sql (TASK 032).
-- Do NOT run unless the migration needs to be reverted. Rollback is NEVER
-- automatic: nothing in CI, the Supabase CLI or the application runs files in
-- supabase/verification/. A human runs it deliberately, after the checks below.
--
-- Read docs/billing/MIGRATION-RECOVERY.md first. A forward fix is preferred.
--
-- ORDER: 0041 -> 0040 (this file) -> 0039 -> 0038 -> 0037 -> 0036.
-- 0041's rollback must already have run (the guard checks it).
--
-- ===========================================================================
-- WHAT 0040 ADDED, AND WHAT THIS FILE DOES
-- ===========================================================================
--   table (dropped):     billing_invoices (+ its indexes and its SELECT policy
--                        "billing_invoices: billing owner can select")
--   functions (dropped): billing_upsert_invoice(jsonb),
--                        billing_set_invoice_refund(text, text, integer)
--   constraint (restored to 0036's list): billing_email_outbox_template_check
--                        (0040 added the 'payment_confirmation' template)
--   No pre-TASK-032 object was changed by 0040.
--
-- REVERSIBLE: functions and the constraint. Re-running 0040 re-creates them.
-- DATA-DESTRUCTIVE: dropping billing_invoices LOSES EVERY INVOICE ROW (the
--   customer-visible payment history mirror, refund amounts, Stripe-hosted
--   document URLs). Stripe remains the record of the documents, so the rows can
--   be re-synchronised from Stripe after a re-apply, but the local copy is gone.
--   EXPORT IT FIRST (step 0).
-- BLOCKING DATA: the 0036 constraint does not allow template
--   'payment_confirmation'. If any outbox row uses it, this file REFUSES (it
--   never deletes those rows itself). Export them, then a human decides whether
--   to delete them (commented statement in step 1b) - that is a separate,
--   explicitly approved, data-destructive action.
--
-- ===========================================================================
-- PREREQUISITES
-- ===========================================================================
--   1. 0041 already rolled back.
--   2. paid checkout OFF; no live paid subscription (cancelled in Stripe and
--      recorded by the webhook).
--   3. Production app on a pre-TASK-032 deployment (the 032 billing pages read
--      billing_invoices; the webhook writes it).
--   4. Fresh backup / PITR point recorded.
--
-- ===========================================================================
-- STEP 0 - EXPORT (read-only; store OUTSIDE the repository - personal data)
-- ===========================================================================
--   \copy (select * from public.billing_invoices order by created_at) to 'rb0040_billing_invoices.csv' csv header
--   \copy (select * from public.billing_email_outbox where template = 'payment_confirmation' order by created_at) to 'rb0040_outbox_payment_confirmation.csv' csv header
--   select count(*) from public.billing_invoices;   -- record the count next to the export
--
-- STEP 1b - ONLY IF the guard refused because of 'payment_confirmation' rows,
-- and only after the export and an explicit owner approval (DATA-DESTRUCTIVE):
--   -- delete from public.billing_email_outbox where template = 'payment_confirmation';
--
-- ===========================================================================
-- STEP 1 - RUN
-- ===========================================================================
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -c "set idw.rollback_confirm = '0040-exported'" \
--     -f supabase/verification/0040_billing_payments_invoices_rollback.sql
--
-- STEP 2 - LEDGER (separate, explicit): supabase migration repair --status reverted <0040 version>
-- STEP 3 - VERIFY: the read-only queries at the end of this file.

begin;

do $$
begin
  if coalesce(current_setting('idw.rollback_confirm', true), '') <> '0040-exported' then
    raise exception 'ROLLBACK 0040 REFUSED: set idw.rollback_confirm = ''0040-exported'' after exporting billing_invoices (step 0)';
  end if;
  if to_regprocedure('public.billing_claim_event(text, text, text, text, text, interval)') is not null then
    raise exception 'ROLLBACK 0040 REFUSED: 0041 is still applied; run the 0041 rollback first';
  end if;
  if exists (select 1 from public.billing_settings where paid_checkout_enabled) then
    raise exception 'ROLLBACK 0040 REFUSED: paid checkout is ON';
  end if;
  if exists (select 1 from public.space_subscriptions where status not in ('exempt', 'canceled', 'incomplete_expired')) then
    raise exception 'ROLLBACK 0040 REFUSED: a live paid subscription exists';
  end if;
  if exists (select 1 from public.billing_email_outbox where template = 'payment_confirmation') then
    raise exception 'ROLLBACK 0040 REFUSED: outbox rows with template payment_confirmation exist; export them and decide (step 1b)';
  end if;
end;
$$;

drop function public.billing_set_invoice_refund(text, text, integer);
drop function public.billing_upsert_invoice(jsonb);

-- Drops its indexes and its policy with it. No CASCADE: nothing else may
-- depend on this table.
drop table public.billing_invoices;

-- 0036's allow-list, verbatim.
alter table public.billing_email_outbox drop constraint billing_email_outbox_template_check;
alter table public.billing_email_outbox add constraint billing_email_outbox_template_check
  check (template in (
    'subscription_started', 'payment_failed', 'guest_unavailable', 'studio_suspended',
    'final_warning', 'cancellation_scheduled', 'subscription_ended', 'payment_recovered'
  ));

commit;

-- ===========================================================================
-- VERIFY (read-only). Expected: null, 0, and a definition without
-- 'payment_confirmation'.
-- ===========================================================================
select to_regclass('public.billing_invoices') as billing_invoices_table;

select count(*) as remaining_0040_functions
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('billing_upsert_invoice', 'billing_set_invoice_refund');

select pg_get_constraintdef(c.oid) as outbox_template_check
from pg_constraint c
where c.conrelid = 'public.billing_email_outbox'::regclass and c.conname = 'billing_email_outbox_template_check';
