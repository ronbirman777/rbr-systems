-- Rollback for 0041_billing_event_email_primitives.sql (TASK 032).
-- Do NOT run unless the migration needs to be reverted. Rollback is NEVER
-- automatic: nothing in CI, the Supabase CLI or the application runs files in
-- supabase/verification/. A human runs it deliberately, after the checks below.
--
-- Read docs/billing/MIGRATION-RECOVERY.md first. A forward fix (a new
-- migration that corrects the defect) is preferred over this rollback.
--
-- ORDER: TASK 032 rollbacks run in strict reverse order, one at a time:
--   0044 -> 0043 -> 0042 -> 0041 (this file) -> 0040 -> 0039 -> 0038 -> 0037 -> 0036.
-- 0042's rollback must already have run (the guard checks it: the restated
-- restore_space()/replace_space() must no longer carry the BILLING_LOCKED guard).
--
-- ===========================================================================
-- WHAT 0041 ADDED, AND WHAT THIS FILE DOES
-- ===========================================================================
--   functions (dropped): billing_set_next_payment_attempt, billing_claim_event,
--     billing_finish_event, billing_enqueue_email, billing_claim_emails,
--     billing_finish_email, billing_transition_checkout
--   columns (dropped):   space_subscriptions.next_payment_attempt_at
--                        billing_email_outbox.claimed_at
--   No existing (pre-TASK 032) function, table or policy was changed by 0041,
--   so there is no prior definition to restore.
--
-- REVERSIBLE: every function is dropped and can be re-created by re-running
--   0041 (after `supabase migration repair --status reverted` for its ledger
--   row - see the recovery doc).
-- DATA-DESTRUCTIVE (small): dropping the two columns loses their values.
--   next_payment_attempt_at is a copy of Stripe's next retry time (re-derivable
--   from Stripe by re-syncing the subscription); claimed_at is a send lease.
--   Neither is a financial record, but export them anyway (step 0).
--
-- ===========================================================================
-- PREREQUISITES (all must hold; the guard below re-checks what SQL can see)
-- ===========================================================================
--   1. billing_settings.paid_checkout_enabled = false (paid checkout OFF).
--   2. No live paid subscription: every space_subscriptions row is 'exempt',
--      'canceled' or 'incomplete_expired' (cancel in Stripe first; wait for the
--      webhook to record it).
--   3. Production app rolled back to a pre-TASK-032 deployment (or the billing
--      webhook endpoint disabled in Stripe AND the billing cron routes not
--      scheduled): the TASK 032 webhook/email code calls these functions.
--   4. The billing email worker is stopped: no outbox row is 'sending'.
--   5. A fresh backup / PITR point exists and its time is recorded.
--
-- ===========================================================================
-- STEP 0 - EXPORT (read-only; store OUTSIDE the repository, it holds user ids)
-- ===========================================================================
--   \copy (select id, next_payment_attempt_at from public.space_subscriptions where next_payment_attempt_at is not null) to 'rb0041_space_subscriptions_next_attempt.csv' csv header
--   \copy (select id, claimed_at from public.billing_email_outbox where claimed_at is not null) to 'rb0041_outbox_claimed_at.csv' csv header
--
-- ===========================================================================
-- STEP 1 - RUN (one transaction; refuses unless explicitly confirmed)
-- ===========================================================================
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -c "set idw.rollback_confirm = '0041-exported'" \
--     -f supabase/verification/0041_billing_event_email_primitives_rollback.sql
--
-- STEP 2 - LEDGER (separate, explicit): supabase migration repair --status reverted <0041 version>
-- STEP 3 - VERIFY: the read-only queries at the end of this file.

begin;

do $$
begin
  if coalesce(current_setting('idw.rollback_confirm', true), '') <> '0041-exported' then
    raise exception 'ROLLBACK 0041 REFUSED: set idw.rollback_confirm = ''0041-exported'' after exporting (step 0)';
  end if;
  if position('BILLING_LOCKED' in pg_get_functiondef('public.restore_space(uuid)'::regprocedure)) > 0
     or position('BILLING_LOCKED' in pg_get_functiondef('public.replace_space(uuid, text)'::regprocedure)) > 0 then
    raise exception 'ROLLBACK 0041 REFUSED: 0042 is still applied; run the 0042 rollback first';
  end if;
  if exists (select 1 from public.billing_settings where paid_checkout_enabled) then
    raise exception 'ROLLBACK 0041 REFUSED: paid checkout is ON (billing_settings.paid_checkout_enabled)';
  end if;
  if exists (select 1 from public.space_subscriptions where status not in ('exempt', 'canceled', 'incomplete_expired')) then
    raise exception 'ROLLBACK 0041 REFUSED: a live paid subscription exists';
  end if;
  if exists (select 1 from public.billing_email_outbox where status = 'sending') then
    raise exception 'ROLLBACK 0041 REFUSED: an outbox email is being sent; stop the email worker first';
  end if;
end;
$$;

-- No CASCADE anywhere: an unexpected dependent makes the transaction fail.
drop function public.billing_transition_checkout(uuid, text[], text, text, text);
drop function public.billing_finish_email(uuid, text, text, text);
drop function public.billing_claim_emails(integer);
drop function public.billing_enqueue_email(text, text, uuid, uuid, uuid, text, jsonb, timestamptz);
drop function public.billing_finish_event(text, text, text, text, text, uuid, uuid);
drop function public.billing_claim_event(text, text, text, text, text, interval);
drop function public.billing_set_next_payment_attempt(uuid, timestamptz);

alter table public.billing_email_outbox drop column claimed_at;
alter table public.space_subscriptions drop column next_payment_attempt_at;

commit;

-- ===========================================================================
-- VERIFY (read-only). Expected: 0 functions, 0 columns.
-- ===========================================================================
select count(*) as remaining_0041_functions
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'billing_set_next_payment_attempt', 'billing_claim_event', 'billing_finish_event',
  'billing_enqueue_email', 'billing_claim_emails', 'billing_finish_email', 'billing_transition_checkout');

select count(*) as remaining_0041_columns
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'space_subscriptions' and column_name = 'next_payment_attempt_at')
    or (table_name = 'billing_email_outbox' and column_name = 'claimed_at'));
