-- TASK 032 - Commercial Platform Foundation, part 3 of 4: post-payment
-- provisioning, subscription state, failed-payment lifecycle, unified access
-- decision, and the "no Space before payment" tenant-creation guard.
--
-- This migration RESTATES two existing trigger functions (handle_new_tenant,
-- enforce_space_slot_capacity) with minimal, documented additions - each
-- restatement is byte-identical to the current Production definition except
-- for the clearly marked "TASK 032" blocks, and behaves EXACTLY as before while
-- billing_settings.paid_checkout_enabled is false (the launch flag defaults to
-- false and nothing in this migration turns it on).
--
-- All new functions are SECURITY DEFINER with a pinned search_path and are
-- executable by service_role ONLY (server code), except the two read-only
-- access helpers at the bottom, which authenticated RLS policies need.
--
-- Never edit 0001-0037. Forward-only.

-- ===========================================================================
-- 1. Launch-flag reader (definer: billing_settings has no client grants).
-- ===========================================================================
create function public.billing_is_paid_checkout_required()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select coalesce((select paid_checkout_enabled from public.billing_settings where singleton), false)
$$;
revoke all on function public.billing_is_paid_checkout_required() from public, anon, authenticated;
grant execute on function public.billing_is_paid_checkout_required() to service_role;

-- ===========================================================================
-- 2. handle_new_tenant - TASK 032 change: when there is no auth.uid() (the
--    server-side provisioning path creates the tenant on behalf of the buyer),
--    the owner is the explicit created_by. Behaviour for every authenticated
--    client insert is unchanged (auth.uid() is non-null there).
-- ===========================================================================
create or replace function public.handle_new_tenant()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.tenant_members (tenant_id, user_id, role)
  values (new.id, coalesce(auth.uid(), new.created_by), 'owner');
  return new;
end;
$$;

-- ===========================================================================
-- 3. enforce_space_slot_capacity - TASK 032 changes (marked):
--    (a) A tenant may be created WITHOUT a user session only by the paid
--        provisioning function. It proves itself with the transaction-local
--        setting idw.provisioning = <pending checkout id>; the trigger honours
--        it ONLY if that pending checkout exists, is in 'provisioning' and
--        belongs to new.created_by. A client cannot satisfy this (it would need
--        its own already-paid checkout in 'provisioning', which only server
--        code can set), and the setting cannot be reached through PostgREST.
--    (b) Once paid checkout is required (billing_settings), a DIRECT client
--        insert is refused with hint PAYMENT_REQUIRED - the database, not only
--        the UI, enforces "no personal Space before payment".
--    With the flag off and no provisioning context this function is identical
--    to the 0017 definition.
-- ===========================================================================
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
  v_prov text;
begin
  -- TASK 032 (a): trusted paid-provisioning path.
  v_prov := current_setting('idw.provisioning', true);
  if v_prov is not null and v_prov <> '' then
    if v_prov ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and new.created_by is not null
       and exists (
         select 1 from public.pending_space_checkouts
         where id = v_prov::uuid and status = 'provisioning' and user_id = new.created_by
       ) then
      return new;
    end if;
    raise exception 'Invalid Space provisioning context' using errcode = '42501';
  end if;

  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  -- TASK 032 (b): payment is required before any personal Space exists.
  if public.billing_is_paid_checkout_required() then
    raise exception 'Payment is required to create a Space' using errcode = 'P0001', hint = 'PAYMENT_REQUIRED';
  end if;

  -- Bind ownership identity to the authenticated server context only —
  -- never trust a client-submitted created_by for quota purposes.
  new.created_by := v_user;

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

  if v_used >= v_allowed then
    raise exception 'No available Space slots' using errcode = 'P0001', hint = 'SLOT_LIMIT_REACHED';
  end if;

  return new;
end;
$$;

-- ===========================================================================
-- 4. Never delete a Space that still has a live paid subscription: the owner
--    must cancel it first (otherwise the customer keeps being charged for a
--    Space that no longer exists). Exempt, ended and never-subscribed Spaces
--    delete exactly as before.
-- ===========================================================================
create function public.guard_tenant_delete_with_subscription()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if exists (
    select 1 from public.space_subscriptions s
    where s.tenant_id = old.id
      and s.status not in ('exempt', 'canceled', 'incomplete_expired')
  ) then
    raise exception 'Cancel the subscription before deleting this Space' using errcode = 'P0001', hint = 'ACTIVE_SUBSCRIPTION';
  end if;
  return old;
end;
$$;
revoke all on function public.guard_tenant_delete_with_subscription() from public, anon, authenticated;
create trigger tenants_guard_delete_with_subscription
  before delete on public.tenants
  for each row execute function public.guard_tenant_delete_with_subscription();

-- ===========================================================================
-- 5. Checkout state helpers (explicit transitions; idempotent).
-- ===========================================================================

-- Record that Stripe confirmed payment for this checkout (trusted caller only).
create function public.billing_confirm_checkout_payment(
  p_pending_checkout_id uuid,
  p_session_id text,
  p_customer_id text,
  p_subscription_id text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_c public.pending_space_checkouts;
begin
  select * into v_c from public.pending_space_checkouts where id = p_pending_checkout_id for update;
  if not found then
    raise exception 'unknown pending checkout';
  end if;
  if v_c.status in ('provisioned', 'provisioning') then
    return v_c.status;
  end if;
  update public.pending_space_checkouts
  set status = 'payment_confirmed',
      stripe_checkout_session_id = coalesce(stripe_checkout_session_id, p_session_id),
      stripe_customer_id = coalesce(p_customer_id, stripe_customer_id),
      stripe_subscription_id = coalesce(p_subscription_id, stripe_subscription_id),
      payment_confirmed_at = coalesce(payment_confirmed_at, now()),
      failure_code = null,
      updated_at = now()
  where id = p_pending_checkout_id;
  return 'payment_confirmed';
end;
$$;
revoke all on function public.billing_confirm_checkout_payment(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.billing_confirm_checkout_payment(uuid, text, text, text) to service_role;

create function public.billing_fail_checkout(p_pending_checkout_id uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  update public.pending_space_checkouts
  set status = 'failed', failure_code = left(p_code, 80), failed_at = now(), updated_at = now()
  where id = p_pending_checkout_id and status in ('payment_confirmed', 'provisioning', 'failed');
end;
$$;
revoke all on function public.billing_fail_checkout(uuid, text) from public, anon, authenticated;
grant execute on function public.billing_fail_checkout(uuid, text) to service_role;

-- Expire open checkouts past their deadline and free their coupon reservations.
create function public.billing_expire_open_checkouts()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_n integer := 0;
  r record;
begin
  for r in
    select id from public.pending_space_checkouts
    where status in ('created', 'checkout_created', 'awaiting_payment') and expires_at <= now()
    for update skip locked
  loop
    update public.pending_space_checkouts set status = 'expired', updated_at = now() where id = r.id;
    perform public.billing_release_coupon_reservation(r.id, 'expired');
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.billing_expire_open_checkouts() from public, anon, authenticated;
grant execute on function public.billing_expire_open_checkouts() to service_role;

-- ===========================================================================
-- 6. billing_provision_paid_space - THE ONE provisioning operation. One
--    transaction; idempotent; exactly one Space per checkout.
--
--    Concurrency/idempotency: the pending checkout row is locked first
--    (FOR UPDATE). A second call (duplicate webhook, reconcile, two tabs,
--    retry) blocks until the first commits and then returns the SAME tenant
--    ('already_provisioned'). If anything raises, the whole transaction
--    (tenant, owner, subscription, coupon redemption, status) rolls back - no
--    partially provisioned commercial state. The caller records the failure
--    in a separate statement (billing_fail_checkout) and a later retry
--    provisions normally.
--
--    Trust: this function trusts its arguments. It must only be called by
--    server code that has verified payment with Stripe (signed webhook, or a
--    server-to-server retrieve) - never from a browser-supplied value.
--
--    p_sub keys: stripe_subscription_id, stripe_customer_id, stripe_price_id,
--    status, currency, base_amount_minor, effective_amount_minor,
--    period_start, period_end, cancel_at_period_end, latest_invoice_id.
-- ===========================================================================
create function public.billing_provision_paid_space(
  p_pending_checkout_id uuid,
  p_sub jsonb,
  p_space_name text,
  p_timezone text default 'UTC'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_c public.pending_space_checkouts;
  v_customer_id uuid;
  v_tenant_id uuid;
  v_sub_id uuid;
  v_product_type text;
  v_coupon jsonb;
  v_status text;
begin
  select * into v_c from public.pending_space_checkouts where id = p_pending_checkout_id for update;
  if not found then
    raise exception 'unknown pending checkout';
  end if;
  if v_c.status = 'provisioned' and v_c.tenant_id is not null then
    return jsonb_build_object('status', 'already_provisioned', 'tenant_id', v_c.tenant_id);
  end if;
  if v_c.user_id is null then
    raise exception 'checkout owner no longer exists';
  end if;

  v_status := coalesce(p_sub ->> 'status', '');
  if v_status not in ('active', 'trialing') then
    -- Only a verified, paid, active subscription provisions a Space.
    raise exception 'subscription is not active (%)', v_status;
  end if;
  if coalesce(p_sub ->> 'stripe_subscription_id', '') = '' or coalesce(p_sub ->> 'stripe_customer_id', '') = '' then
    raise exception 'missing stripe ids';
  end if;

  update public.pending_space_checkouts
  set status = 'provisioning', provisioning_started_at = coalesce(provisioning_started_at, now()),
      stripe_subscription_id = p_sub ->> 'stripe_subscription_id',
      stripe_customer_id = p_sub ->> 'stripe_customer_id',
      payment_confirmed_at = coalesce(payment_confirmed_at, now()),
      updated_at = now()
  where id = v_c.id;

  -- Trusted-provisioning proof consumed by enforce_space_slot_capacity().
  perform set_config('idw.provisioning', v_c.id::text, true);

  -- ONE Stripe customer per account per mode.
  insert into public.billing_customers (user_id, stripe_mode, stripe_customer_id)
  values (v_c.user_id, v_c.stripe_mode, p_sub ->> 'stripe_customer_id')
  on conflict (stripe_mode, stripe_customer_id) do update set updated_at = now()
  returning id into v_customer_id;

  v_product_type := v_c.space_type;
  insert into public.tenants (name, product_type, timezone, created_by)
  values (left(btrim(p_space_name), 120), v_product_type, coalesce(nullif(p_timezone, ''), 'UTC'), v_c.user_id)
  returning id into v_tenant_id;

  insert into public.space_subscriptions (
    tenant_id, billing_owner_user_id, billing_customer_id, plan_id, stripe_mode,
    stripe_subscription_id, stripe_price_id, status, currency, base_amount_minor,
    current_effective_amount_minor, current_period_start, current_period_end,
    cancel_at_period_end, latest_invoice_id, last_paid_invoice_id
  ) values (
    v_tenant_id, v_c.user_id, v_customer_id, v_c.plan_id, v_c.stripe_mode,
    p_sub ->> 'stripe_subscription_id', p_sub ->> 'stripe_price_id', v_status,
    upper(p_sub ->> 'currency'), (p_sub ->> 'base_amount_minor')::integer,
    nullif(p_sub ->> 'effective_amount_minor', '')::integer,
    nullif(p_sub ->> 'period_start', '')::timestamptz, nullif(p_sub ->> 'period_end', '')::timestamptz,
    coalesce((p_sub ->> 'cancel_at_period_end')::boolean, false),
    p_sub ->> 'latest_invoice_id', p_sub ->> 'latest_invoice_id'
  )
  returning id into v_sub_id;

  v_coupon := public.billing_finalize_coupon_redemption(v_c.id, v_tenant_id, v_sub_id, coalesce(nullif(p_sub ->> 'period_start', '')::timestamptz, now()));

  update public.billing_acceptances
  set tenant_id = v_tenant_id, space_subscription_id = v_sub_id
  where pending_checkout_id = v_c.id;

  update public.pending_space_checkouts
  set status = 'provisioned', tenant_id = v_tenant_id, provisioned_at = now(), completed_at = now(),
      failure_code = null, updated_at = now()
  where id = v_c.id;

  return jsonb_build_object(
    'status', 'provisioned', 'tenant_id', v_tenant_id, 'subscription_id', v_sub_id,
    'user_id', v_c.user_id, 'space_type', v_c.space_type, 'coupon', v_coupon
  );
end;
$$;
revoke all on function public.billing_provision_paid_space(uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.billing_provision_paid_space(uuid, jsonb, text, text) to service_role;

-- ===========================================================================
-- 7. billing_apply_subscription_state - apply Stripe's CURRENT truth for a
--    subscription, idempotently. The webhook handler re-fetches the
--    subscription/invoice from Stripe and passes the result here, so event
--    ordering and duplicate delivery cannot corrupt state: applying the same
--    truth twice changes nothing.
--
--    Failure episode: payment_failed_at is the single clock for the 24h Guest
--    suspension, 7d Studio suspension, day-12 warning and day-14 deletion
--    eligibility. It is set once at the start of an episode and cleared only
--    by recovery. Recovery clears every suspension/deletion stamp (so a
--    pending action is cancelled) and stamps recovered_at.
--
--    p_s keys: status, price_id, currency, base_amount_minor,
--    effective_amount_minor, period_start, period_end, cancel_at_period_end,
--    cancel_at, canceled_at, ended_at, latest_invoice_id, latest_invoice_paid,
--    latest_invoice_failed, failure_observed_at.
-- ===========================================================================
create function public.billing_apply_subscription_state(
  p_mode text,
  p_stripe_subscription_id text,
  p_s jsonb,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_row public.space_subscriptions;
  v_new_status text := p_s ->> 'status';
  v_failed boolean := coalesce((p_s ->> 'latest_invoice_failed')::boolean, false);
  v_paid boolean := coalesce((p_s ->> 'latest_invoice_paid')::boolean, false);
  v_failed_started boolean := false;
  v_recovered boolean := false;
  v_ended boolean := false;
  v_failed_at timestamptz;
begin
  if v_new_status not in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'unpaid', 'canceled', 'paused') then
    raise exception 'unsupported subscription status %', v_new_status;
  end if;

  select * into v_row
  from public.space_subscriptions
  where stripe_mode = p_mode and stripe_subscription_id = p_stripe_subscription_id
  for update;
  if not found then
    return jsonb_build_object('result', 'unknown_subscription');
  end if;
  if v_row.status = 'exempt' then
    return jsonb_build_object('result', 'ignored_exempt', 'tenant_id', v_row.tenant_id);
  end if;

  v_failed_at := v_row.payment_failed_at;

  if v_new_status in ('past_due', 'unpaid') or (v_failed and v_new_status not in ('canceled', 'incomplete_expired')) then
    if v_failed_at is null then
      v_failed_at := coalesce(nullif(p_s ->> 'failure_observed_at', '')::timestamptz, p_now);
      v_failed_started := true;
    end if;
  elsif v_new_status in ('active', 'trialing') and not v_failed and v_failed_at is not null then
    v_recovered := true;
  end if;

  if v_new_status in ('canceled', 'incomplete_expired') and v_row.ended_at is null then
    v_ended := true;
  end if;

  update public.space_subscriptions
  set status = v_new_status,
      stripe_price_id = coalesce(p_s ->> 'price_id', stripe_price_id),
      currency = coalesce(upper(p_s ->> 'currency'), currency),
      base_amount_minor = coalesce((p_s ->> 'base_amount_minor')::integer, base_amount_minor),
      current_effective_amount_minor = case when p_s ? 'effective_amount_minor'
        then nullif(p_s ->> 'effective_amount_minor', '')::integer else current_effective_amount_minor end,
      current_period_start = coalesce(nullif(p_s ->> 'period_start', '')::timestamptz, current_period_start),
      current_period_end = coalesce(nullif(p_s ->> 'period_end', '')::timestamptz, current_period_end),
      cancel_at_period_end = coalesce((p_s ->> 'cancel_at_period_end')::boolean, cancel_at_period_end),
      cancel_at = case when p_s ? 'cancel_at' then nullif(p_s ->> 'cancel_at', '')::timestamptz else cancel_at end,
      canceled_at = case when p_s ? 'canceled_at' then nullif(p_s ->> 'canceled_at', '')::timestamptz else canceled_at end,
      ended_at = case when v_ended then coalesce(nullif(p_s ->> 'ended_at', '')::timestamptz, p_now) else ended_at end,
      latest_invoice_id = coalesce(p_s ->> 'latest_invoice_id', latest_invoice_id),
      last_paid_invoice_id = case when v_paid then coalesce(p_s ->> 'latest_invoice_id', last_paid_invoice_id) else last_paid_invoice_id end,
      payment_failed_at = case when v_recovered then null else v_failed_at end,
      guest_suspended_at = case when v_recovered then null else guest_suspended_at end,
      studio_suspended_at = case when v_recovered then null else studio_suspended_at end,
      deletion_warning_at = case when v_recovered then null else deletion_warning_at end,
      eligible_for_deletion_at = case when v_recovered then null else eligible_for_deletion_at end,
      recovered_at = case when v_recovered then p_now else recovered_at end,
      updated_at = now()
  where id = v_row.id;

  return jsonb_build_object(
    'result', 'applied', 'subscription_id', v_row.id, 'tenant_id', v_row.tenant_id,
    'user_id', v_row.billing_owner_user_id, 'status_before', v_row.status, 'status_after', v_new_status,
    'failed_started', v_failed_started, 'recovered', v_recovered, 'ended', v_ended,
    'cancel_at_period_end_before', v_row.cancel_at_period_end,
    'cancel_at_period_end_after', coalesce((p_s ->> 'cancel_at_period_end')::boolean, v_row.cancel_at_period_end)
  );
end;
$$;
revoke all on function public.billing_apply_subscription_state(text, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.billing_apply_subscription_state(text, text, jsonb, timestamptz) to service_role;

-- ===========================================================================
-- 8. billing_apply_lifecycle - the scheduled-job step for the failed-payment
--    timeline. IDEMPOTENT and safe to re-run: each stamp is set at most once,
--    to its deterministic deadline (payment_failed_at + fixed hours - never the
--    wall-clock of the job run), and ONLY while the failure episode is still
--    open - the WHERE/row-lock re-reads current state, so a subscription that
--    recovered a moment ago is never suspended by a stale action.
--
--    Timeline (all fixed elapsed hours, never calendar days / DST dependent):
--      +24h   Guest App unavailable for THAT Space   -> guest_suspended_at
--      +168h  Studio suspended (day 7)               -> studio_suspended_at
--      +288h  final warning (day 12)                 -> deletion_warning_at
--      +336h  eligible for the deletion WORKFLOW     -> eligible_for_deletion_at
--             (never an immediate hard delete: retention/backups still apply)
--    These constants are mirrored in src/lib/billing/lifecycle.ts and pinned by
--    a parity test; change both together.
-- ===========================================================================
create function public.billing_apply_lifecycle(p_now timestamptz default now())
returns table (subscription_id uuid, tenant_id uuid, user_id uuid, action text, occurred_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  r public.space_subscriptions;
  v_at timestamptz;
begin
  for r in
    select * from public.space_subscriptions
    where payment_failed_at is not null and status <> 'exempt'
    for update skip locked
  loop
    v_at := r.payment_failed_at + interval '24 hours';
    if r.guest_suspended_at is null and p_now >= v_at then
      update public.space_subscriptions set guest_suspended_at = v_at, updated_at = now() where id = r.id;
      return query select r.id, r.tenant_id, r.billing_owner_user_id, 'guest_suspended'::text, v_at;
    end if;

    v_at := r.payment_failed_at + interval '168 hours';
    if r.studio_suspended_at is null and p_now >= v_at then
      update public.space_subscriptions set studio_suspended_at = v_at, updated_at = now() where id = r.id;
      return query select r.id, r.tenant_id, r.billing_owner_user_id, 'studio_suspended'::text, v_at;
    end if;

    v_at := r.payment_failed_at + interval '288 hours';
    if r.deletion_warning_at is null and p_now >= v_at then
      update public.space_subscriptions set deletion_warning_at = v_at, updated_at = now() where id = r.id;
      return query select r.id, r.tenant_id, r.billing_owner_user_id, 'deletion_warning'::text, v_at;
    end if;

    v_at := r.payment_failed_at + interval '336 hours';
    if r.eligible_for_deletion_at is null and p_now >= v_at then
      update public.space_subscriptions set eligible_for_deletion_at = v_at, updated_at = now() where id = r.id;
      return query select r.id, r.tenant_id, r.billing_owner_user_id, 'deletion_eligible'::text, v_at;
    end if;
  end loop;
end;
$$;
revoke all on function public.billing_apply_lifecycle(timestamptz) from public, anon, authenticated;
grant execute on function public.billing_apply_lifecycle(timestamptz) to service_role;

-- ===========================================================================
-- 9. billing_set_next_action - persisted by the SINGLE calculator
--    (src/lib/billing/nextAction.ts). Admin, My Spaces and Billing all read
--    these columns (or recompute with the same function), so they cannot
--    disagree.
-- ===========================================================================
create function public.billing_set_next_action(
  p_subscription_id uuid,
  p_action text,
  p_at timestamptz,
  p_expected_charge_minor integer
)
returns void
language sql
security definer
set search_path = pg_catalog, pg_temp
as $$
  update public.space_subscriptions
  set next_action = p_action, next_action_at = p_at,
      next_expected_charge_minor = p_expected_charge_minor, updated_at = now()
  where id = p_subscription_id
    and (next_action is distinct from p_action
         or next_action_at is distinct from p_at
         or next_expected_charge_minor is distinct from p_expected_charge_minor)
$$;
revoke all on function public.billing_set_next_action(uuid, text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.billing_set_next_action(uuid, text, timestamptz, integer) to service_role;

-- ===========================================================================
-- 10. Explicit internal / legacy exemption. status = 'exempt' keeps demo and
--     internal Spaces fully operational, creates NO Stripe subscription, and is
--     excluded from every paying-customer metric. Writable only through this
--     function (service_role: Admin console with MFA step-up + audit, or the
--     documented release script) - never by an ordinary user. An exemption
--     states who/why/when and may expire (exempt_expires_at).
-- ===========================================================================
create function public.billing_set_internal_exempt(
  p_tenant_id uuid,
  p_reason text,
  p_actor uuid,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_id uuid;
  v_existing public.space_subscriptions;
begin
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'an exemption requires a reason';
  end if;
  select * into v_existing from public.space_subscriptions where tenant_id = p_tenant_id for update;
  if found and v_existing.status <> 'exempt' then
    raise exception 'Space already has a paid subscription; refusing to overwrite it';
  end if;
  insert into public.space_subscriptions (
    tenant_id, status, exempt_reason, exempt_by, exempt_at, exempt_expires_at
  ) values (p_tenant_id, 'exempt', btrim(p_reason), p_actor, now(), p_expires_at)
  on conflict (tenant_id) do update set
    exempt_reason = excluded.exempt_reason, exempt_by = excluded.exempt_by,
    exempt_at = excluded.exempt_at, exempt_expires_at = excluded.exempt_expires_at,
    updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.billing_set_internal_exempt(uuid, text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.billing_set_internal_exempt(uuid, text, uuid, timestamptz) to service_role;

create function public.billing_clear_internal_exempt(p_tenant_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_n integer;
begin
  delete from public.space_subscriptions where tenant_id = p_tenant_id and status = 'exempt';
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;
revoke all on function public.billing_clear_internal_exempt(uuid) from public, anon, authenticated;
grant execute on function public.billing_clear_internal_exempt(uuid) to service_role;

-- ===========================================================================
-- 11. space_access_state - THE unified access decision for a Space. Mirrored
--     exactly by deriveSpaceAccess() in src/lib/billing/access.ts (parity test
--     with shared vectors).
--
--     decided = false  -> this Space has no (usable) billing row: the caller
--     falls back to the pre-existing space_entitlements derivation (legacy
--     Spaces keep behaving exactly as before; nothing is locked unexpectedly).
--
--     decided = true:
--       exempt (not expired)     -> everything allowed
--       ended (canceled/expired) -> nothing allowed (the Space and its content
--                                   are preserved; only commercial availability
--                                   ends)
--       open failure episode     -> Guest allowed until payment_failed_at+24h,
--                                   Studio writes until +168h
--       otherwise                -> everything allowed
--     The published snapshot is never touched by suspension: when payment
--     recovers the Guest App returns without a republish.
-- ===========================================================================
create function public.space_access_state(p_tenant_id uuid, p_now timestamptz default now())
returns table (
  decided boolean,
  studio_writable boolean,
  guest_available boolean,
  can_publish boolean,
  reason text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  s public.space_subscriptions;
  v_ended boolean;
begin
  -- No cross-Space billing visibility: a signed-in caller who is not a member
  -- of this Space learns nothing about its billing state. (Service-role /
  -- internal callers have no auth.uid() and are not restricted.)
  if auth.uid() is not null and not public.is_tenant_member(p_tenant_id) then
    return query select false, true, null::boolean, null::boolean, 'forbidden'::text;
    return;
  end if;

  select * into s from public.space_subscriptions where tenant_id = p_tenant_id;
  if not found then
    return query select false, true, null::boolean, null::boolean, 'no_subscription'::text;
    return;
  end if;

  if s.status = 'exempt' then
    if s.exempt_expires_at is not null and p_now >= s.exempt_expires_at then
      return query select false, true, null::boolean, null::boolean, 'exemption_expired'::text;
    else
      return query select true, true, true, true, 'exempt'::text;
    end if;
    return;
  end if;

  v_ended := s.status in ('canceled', 'incomplete_expired')
    or (s.cancel_at_period_end and s.current_period_end is not null
        and p_now > s.current_period_end + interval '6 hours');
  if v_ended then
    return query select true, false, false, false, 'subscription_ended'::text;
    return;
  end if;
  if s.status in ('incomplete', 'paused') then
    return query select true, false, false, false, 'subscription_not_active'::text;
    return;
  end if;

  if s.payment_failed_at is not null then
    if p_now >= s.payment_failed_at + interval '168 hours' then
      return query select true, false, false, false, 'studio_suspended'::text;
    elsif p_now >= s.payment_failed_at + interval '24 hours' then
      return query select true, true, false, true, 'guest_suspended'::text;
    else
      return query select true, true, true, true, 'payment_issue'::text;
    end if;
    return;
  end if;

  return query select true, true, true, true, 'active'::text;
end;
$$;
revoke all on function public.space_access_state(uuid, timestamptz) from public, anon;
grant execute on function public.space_access_state(uuid, timestamptz) to authenticated, service_role;

-- Convenience predicate for RLS (0039) and server guards: true unless billing
-- has DECIDED that Studio writes are not allowed. Legacy Spaces -> true.
create function public.space_studio_writable(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select coalesce((select a.studio_writable from public.space_access_state(p_tenant_id) a where a.decided), true)
$$;
revoke all on function public.space_studio_writable(uuid) from public, anon;
grant execute on function public.space_studio_writable(uuid) to authenticated, service_role;

-- ===========================================================================
-- 12. Audio entitlement math (data-driven; mirrors
--     src/lib/billing/entitlements.ts). Base bundle comes from the plan row;
--     add-ons stack linearly; the single-recording maximum NEVER increases.
--       base:        240 library / 60 max / 100,000 listening
--       +1 add-on:   480 library / 60 max / 170,000 listening
--       +2 add-ons:  720 library / 60 max / 240,000 listening
--     Metering stays Space/resource level - no listener identity of any kind.
-- ===========================================================================
create function public.space_audio_entitlements(p_tenant_id uuid)
returns table (library_minutes integer, max_recording_minutes integer, listening_minutes_per_month integer)
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select
    (b.entitlements #>> '{audio,libraryMinutes}')::integer
      + coalesce(a.quantity, 0) * (b.entitlements #>> '{addons,audio_pack,libraryMinutes}')::integer,
    (b.entitlements #>> '{audio,maxRecordingMinutes}')::integer,
    (b.entitlements #>> '{audio,listeningMinutesPerMonth}')::integer
      + coalesce(a.quantity, 0) * (b.entitlements #>> '{addons,audio_pack,listeningMinutesPerMonth}')::integer
  from public.space_subscriptions s
  join public.billing_plans b on b.id = s.plan_id
  left join public.space_subscription_addons a on a.subscription_id = s.id and a.addon_key = 'audio_pack'
  where s.tenant_id = p_tenant_id
$$;
revoke all on function public.space_audio_entitlements(uuid) from public, anon, authenticated;
grant execute on function public.space_audio_entitlements(uuid) to service_role;
