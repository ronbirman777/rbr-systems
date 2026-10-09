-- TASK 032 - atomic primitives for webhook idempotency, the email outbox and
-- guarded checkout transitions. Additive: one nullable column and new
-- functions; no existing function is changed.
--
-- All functions are SECURITY DEFINER, pinned search_path, EXECUTE for
-- service_role only.
--
-- Never edit 0001-0040. Forward-only.

-- Stripe's next payment retry for the open failed invoice, so the shared
-- next-action model can say WHEN the next retry happens.
alter table public.space_subscriptions add column next_payment_attempt_at timestamptz;

create function public.billing_set_next_payment_attempt(p_subscription_id uuid, p_at timestamptz)
returns void
language sql
security definer
set search_path = pg_catalog, pg_temp
as $$
  update public.space_subscriptions
  set next_payment_attempt_at = p_at, updated_at = now()
  where id = p_subscription_id and next_payment_attempt_at is distinct from p_at
$$;
revoke all on function public.billing_set_next_payment_attempt(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.billing_set_next_payment_attempt(uuid, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Webhook idempotency. billing_claim_event returns:
--   'claimed'     this caller now owns processing of the event
--   'duplicate'   already processed/ignored - do nothing, answer 200
--   'in_progress' another delivery is processing it right now - answer 5xx so
--                 Stripe retries later (never process twice concurrently)
-- A 'failed' event, or a 'processing' claim older than p_stale_after (a crashed
-- worker), is re-claimed. The (stripe_mode, stripe_event_id) unique key makes the
-- first INSERT the single winner under any concurrency.
-- ---------------------------------------------------------------------------
create function public.billing_claim_event(
  p_mode text,
  p_event_id text,
  p_type text,
  p_customer_id text default null,
  p_subscription_id text default null,
  p_stale_after interval default interval '5 minutes'
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_row public.billing_events;
  v_inserted integer;
begin
  insert into public.billing_events (stripe_event_id, stripe_mode, event_type, status, attempts, processing_started_at, stripe_customer_id, stripe_subscription_id)
  values (p_event_id, p_mode, p_type, 'processing', 1, now(), p_customer_id, p_subscription_id)
  on conflict (stripe_mode, stripe_event_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    return 'claimed';
  end if;

  select * into v_row from public.billing_events
  where stripe_mode = p_mode and stripe_event_id = p_event_id for update;

  if v_row.status in ('processed', 'ignored') then
    return 'duplicate';
  end if;
  if v_row.status = 'processing' and v_row.processing_started_at > now() - p_stale_after then
    return 'in_progress';
  end if;

  update public.billing_events
  set status = 'processing', attempts = attempts + 1, processing_started_at = now(), error_code = null, error_detail = null
  where id = v_row.id;
  return 'claimed';
end;
$$;
revoke all on function public.billing_claim_event(text, text, text, text, text, interval) from public, anon, authenticated;
grant execute on function public.billing_claim_event(text, text, text, text, text, interval) to service_role;

create function public.billing_finish_event(
  p_mode text,
  p_event_id text,
  p_status text,
  p_error_code text default null,
  p_error_detail text default null,
  p_tenant_id uuid default null,
  p_pending_checkout_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_status not in ('processed', 'failed', 'ignored') then
    raise exception 'invalid final event status';
  end if;
  update public.billing_events
  set status = p_status,
      processed_at = case when p_status = 'failed' then null else now() end,
      error_code = left(p_error_code, 80),
      error_detail = left(p_error_detail, 500),
      tenant_id = coalesce(p_tenant_id, tenant_id),
      pending_checkout_id = coalesce(p_pending_checkout_id, pending_checkout_id)
  where stripe_mode = p_mode and stripe_event_id = p_event_id;
end;
$$;
revoke all on function public.billing_finish_event(text, text, text, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.billing_finish_event(text, text, text, text, text, uuid, uuid) to service_role;

-- Lease timestamp: a row stuck in 'sending' is only re-leased when ITS OWN claim
-- is older than the lease window (never because the email itself is old).
alter table public.billing_email_outbox add column claimed_at timestamptz;

-- ---------------------------------------------------------------------------
-- Email outbox. Enqueue is idempotent on dedupe_key (a duplicate webhook or a
-- re-run job can never queue the same email twice). Claiming leases rows so two
-- workers never send the same one, and re-leases a row stuck in 'sending'.
-- ---------------------------------------------------------------------------
create function public.billing_enqueue_email(
  p_dedupe_key text,
  p_template text,
  p_user_id uuid,
  p_tenant_id uuid,
  p_subscription_id uuid,
  p_locale text,
  p_payload jsonb,
  p_scheduled_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_n integer;
begin
  insert into public.billing_email_outbox (dedupe_key, template, user_id, tenant_id, space_subscription_id, locale, payload, scheduled_at)
  values (p_dedupe_key, p_template, p_user_id, p_tenant_id, p_subscription_id, coalesce(nullif(p_locale, ''), 'en'), coalesce(p_payload, '{}'::jsonb), p_scheduled_at)
  on conflict (dedupe_key) do nothing;
  get diagnostics v_n = row_count;
  return v_n = 1;
end;
$$;
revoke all on function public.billing_enqueue_email(text, text, uuid, uuid, uuid, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.billing_enqueue_email(text, text, uuid, uuid, uuid, text, jsonb, timestamptz) to service_role;

create function public.billing_claim_emails(p_limit integer default 20)
returns setof public.billing_email_outbox
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  return query
  with due as (
    select id from public.billing_email_outbox
    where scheduled_at <= now() and attempts < 5
      and (status in ('pending', 'failed')
           or (status = 'sending' and claimed_at < now() - interval '10 minutes' and sent_at is null))
    order by scheduled_at
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  )
  update public.billing_email_outbox o
  set status = 'sending', attempts = o.attempts + 1, claimed_at = now()
  from due where o.id = due.id
  returning o.*;
end;
$$;
revoke all on function public.billing_claim_emails(integer) from public, anon, authenticated;
grant execute on function public.billing_claim_emails(integer) to service_role;

create function public.billing_finish_email(p_id uuid, p_status text, p_provider_id text default null, p_error text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_status not in ('sent', 'failed', 'skipped') then
    raise exception 'invalid final email status';
  end if;
  update public.billing_email_outbox
  set status = p_status,
      provider_message_id = coalesce(p_provider_id, provider_message_id),
      last_error = left(p_error, 300),
      sent_at = case when p_status = 'sent' then now() else sent_at end
  where id = p_id and status = 'sending';
end;
$$;
revoke all on function public.billing_finish_email(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.billing_finish_email(uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Guarded checkout transition for the NON-payment states (the payment/provision
-- states are moved only by billing_confirm_checkout_payment /
-- billing_provision_paid_space / billing_fail_checkout). A transition applies
-- only when the current status is in p_allowed_from; it can never move a
-- confirmed/provisioning/provisioned checkout, and never grants Studio access.
-- ---------------------------------------------------------------------------
create function public.billing_transition_checkout(
  p_id uuid,
  p_allowed_from text[],
  p_to text,
  p_session_id text default null,
  p_customer_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_n integer;
begin
  if p_to not in ('checkout_created', 'awaiting_payment', 'canceled', 'expired') then
    raise exception 'transition target not permitted here';
  end if;
  update public.pending_space_checkouts
  set status = p_to,
      stripe_checkout_session_id = coalesce(p_session_id, stripe_checkout_session_id),
      stripe_customer_id = coalesce(p_customer_id, stripe_customer_id),
      updated_at = now()
  where id = p_id and status = any (p_allowed_from)
    and status not in ('payment_confirmed', 'provisioning', 'provisioned');
  get diagnostics v_n = row_count;
  if v_n = 1 and p_to in ('canceled', 'expired') then
    perform public.billing_release_coupon_reservation(p_id, case when p_to = 'expired' then 'expired' else 'canceled' end);
  end if;
  return v_n = 1;
end;
$$;
revoke all on function public.billing_transition_checkout(uuid, text[], text, text, text) from public, anon, authenticated;
grant execute on function public.billing_transition_checkout(uuid, text[], text, text, text) to service_role;
