-- TASK 032 - Commercial Platform Foundation, part 2 of 4: coupon engine.
--
-- Functions only (no table changes). Every function is SECURITY DEFINER with a
-- pinned search_path, and EXECUTE is granted to service_role ONLY - never to
-- anon/authenticated. The browser can ask the server to "apply a coupon"; it
-- can never call these directly or choose an outcome.
--
-- HOW EACH USAGE POLICY IS ENFORCED (and why a single UNIQUE(user, coupon) is
-- NOT used - it would forbid the unlimited-during-validity policy):
--
--   Serialisation: every reserve/redeem for a coupon first takes
--   `SELECT ... FOR UPDATE` on that coupon's row. All concurrent attempts for
--   the same coupon therefore queue behind one another and re-read committed
--   state - this is what makes the LAST global-cap slot and a double-tab
--   once-per-user attempt race-safe. It is not "check then insert" without a
--   lock.
--
--   once_per_user             -> checked under the lock AND backed by the partial
--                                unique index coupon_redemptions_once_per_user_uidx
--                                (coupon_id, user_id) over reserved/redeemed/
--                                completed/canceled rows with that snapshotted rule.
--   once_per_space            -> partial unique index
--                                coupon_redemptions_once_per_space_uidx
--                                (coupon_id, tenant_id) over used rows. For a brand
--                                new Space purchase the Space does not exist at
--                                reservation time, so the rule is vacuous there and
--                                becomes binding the moment a tenant_id is attached
--                                (re-subscription / future reactivation flows).
--   unlimited_during_validity -> no per-user restriction; only the one-coupon-per-
--                                checkout index applies.
--   global_max_redemptions    -> counted under the coupon lock over SUCCESSFUL and
--                                currently-live RESERVED rows. Abandoned
--                                reservations are expired/released first, so they
--                                never permanently consume the cap.
--
-- Coupon validity vs discount duration are different concepts:
--   valid_from/valid_until only decide whether a NEW reservation may start.
--   A redeemed discount keeps running for its own cycles even after valid_until.
--   (billing_record_discount_cycle below never looks at valid_until.)
--
-- Never edit 0001-0036. Forward-only.

create function public.billing_normalize_coupon_code(p_code text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$ select upper(btrim(p_code)) $$;
revoke all on function public.billing_normalize_coupon_code(text) from public, anon, authenticated;
grant execute on function public.billing_normalize_coupon_code(text) to service_role;

-- ---------------------------------------------------------------------------
-- billing_reserve_coupon: validate + reserve a coupon for one open checkout.
-- Returns jsonb {ok, reason, ...snapshot}. Business refusals are returned
-- (never raised) so the server can map them to friendly localised messages.
-- reason is one of: invalid, inactive, not_started, expired, not_applicable,
-- unavailable, already_used, in_use_elsewhere, limit_reached, checkout_closed.
-- ---------------------------------------------------------------------------
create function public.billing_reserve_coupon(
  p_user_id uuid,
  p_code text,
  p_pending_checkout_id uuid,
  p_space_type text,
  p_plan_key text,
  p_stripe_mode text,
  p_reservation_ttl interval default interval '75 minutes'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_coupon_id uuid;
  v_coupon public.coupons;
  v_plan public.billing_plans;
  v_checkout public.pending_space_checkouts;
  v_stripe_coupon text;
  v_existing public.coupon_redemptions;
  v_used integer;
  v_id uuid;
begin
  if p_stripe_mode not in ('test', 'live') then
    raise exception 'invalid stripe mode';
  end if;

  select id into v_coupon_id
  from public.coupons
  where normalized_code = public.billing_normalize_coupon_code(p_code);
  if v_coupon_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  -- Serialise every reservation/redemption of THIS coupon (see header).
  select * into v_coupon from public.coupons where id = v_coupon_id for update;

  select * into v_checkout from public.pending_space_checkouts where id = p_pending_checkout_id;
  if not found
     or v_checkout.user_id is distinct from p_user_id
     or v_checkout.status not in ('created', 'checkout_created', 'awaiting_payment')
     or v_checkout.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'checkout_closed');
  end if;

  if not v_coupon.active then
    return jsonb_build_object('ok', false, 'reason', 'inactive');
  end if;
  if v_coupon.valid_from is not null and now() < v_coupon.valid_from then
    return jsonb_build_object('ok', false, 'reason', 'not_started');
  end if;
  if v_coupon.valid_until is not null and now() > v_coupon.valid_until then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  select * into v_plan from public.billing_plans where plan_key = p_plan_key and active;
  if not found
     or (v_coupon.plan_keys is not null and not (p_plan_key = any (v_coupon.plan_keys)))
     or (v_coupon.space_types is not null and not (p_space_type = any (v_coupon.space_types)))
     or (v_coupon.discount_type = 'fixed_amount' and v_coupon.currency is distinct from v_plan.currency)
     or (v_coupon.discount_type = 'fixed_amount' and v_coupon.amount_off_minor >= v_plan.unit_amount_minor) then
    -- A fixed discount that would make the charge zero/negative is not a
    -- valid purchase coupon either: treated as not applicable.
    return jsonb_build_object('ok', false, 'reason', 'not_applicable');
  end if;

  v_stripe_coupon := case p_stripe_mode when 'test' then v_coupon.stripe_test_coupon_id else v_coupon.stripe_live_coupon_id end;
  if v_stripe_coupon is null then
    -- Not yet synchronised to Stripe in this mode: never offer a discount
    -- Stripe cannot actually apply (prevents Admin-says-10%-Stripe-charges-20%).
    return jsonb_build_object('ok', false, 'reason', 'unavailable');
  end if;

  -- Drop stale reservations for this coupon so abandoned checkouts never
  -- consume a once-per-user allowance or the global cap.
  update public.coupon_redemptions
  set status = 'expired', released_reason = 'reservation_expired', updated_at = now()
  where coupon_id = v_coupon.id and status = 'reserved' and reservation_expires_at <= now();

  -- Idempotent re-apply on the same checkout.
  select * into v_existing
  from public.coupon_redemptions
  where pending_checkout_id = p_pending_checkout_id
    and status in ('reserved', 'redeemed', 'completed', 'canceled');
  if found then
    if v_existing.coupon_id = v_coupon.id then
      return jsonb_build_object(
        'ok', true, 'reason', 'already_reserved', 'redemption_id', v_existing.id,
        'coupon_id', v_coupon.id, 'stripe_coupon_id', v_existing.stripe_coupon_id,
        'discount_type', v_existing.discount_type, 'percent_off', v_existing.percent_off,
        'amount_off_minor', v_existing.amount_off_minor, 'currency', v_existing.currency,
        'duration_type', v_existing.duration_type, 'duration_cycles', v_existing.duration_cycles,
        'usage_rule', v_existing.usage_rule, 'reservation_expires_at', v_existing.reservation_expires_at
      );
    elsif v_existing.status = 'reserved' then
      -- Switching coupons on the same open checkout: release the previous one.
      update public.coupon_redemptions
      set status = 'released', released_reason = 'replaced_by_other_coupon', updated_at = now()
      where id = v_existing.id;
    else
      return jsonb_build_object('ok', false, 'reason', 'checkout_closed');
    end if;
  end if;

  if v_coupon.usage_rule = 'once_per_user' then
    select * into v_existing
    from public.coupon_redemptions
    where coupon_id = v_coupon.id and user_id = p_user_id
      and status in ('reserved', 'redeemed', 'completed', 'canceled')
      and pending_checkout_id <> p_pending_checkout_id
    limit 1;
    if found then
      return jsonb_build_object(
        'ok', false,
        'reason', case when v_existing.status = 'reserved' then 'in_use_elsewhere' else 'already_used' end
      );
    end if;
  end if;

  if v_coupon.max_redemptions_per_user is not null then
    select count(*) into v_used
    from public.coupon_redemptions
    where coupon_id = v_coupon.id and user_id = p_user_id
      and status in ('reserved', 'redeemed', 'completed', 'canceled');
    if v_used >= v_coupon.max_redemptions_per_user then
      return jsonb_build_object('ok', false, 'reason', 'already_used');
    end if;
  end if;

  if v_coupon.global_max_redemptions is not null then
    select count(*) into v_used
    from public.coupon_redemptions
    where coupon_id = v_coupon.id and status in ('reserved', 'redeemed', 'completed', 'canceled');
    if v_used >= v_coupon.global_max_redemptions then
      return jsonb_build_object('ok', false, 'reason', 'limit_reached');
    end if;
  end if;

  -- The partial unique indexes are the final backstop; under the coupon lock
  -- reaching this INSERT with a conflict would indicate a logic error and
  -- aborts the whole transaction (fail closed).
  insert into public.coupon_redemptions (
    coupon_id, user_id, pending_checkout_id, status,
    usage_rule, discount_type, percent_off, amount_off_minor, currency,
    duration_type, duration_cycles, stripe_mode, stripe_coupon_id,
    reservation_expires_at
  ) values (
    v_coupon.id, p_user_id, p_pending_checkout_id, 'reserved',
    v_coupon.usage_rule, v_coupon.discount_type, v_coupon.percent_off, v_coupon.amount_off_minor, v_coupon.currency,
    v_coupon.duration_type, v_coupon.duration_cycles, p_stripe_mode, v_stripe_coupon,
    now() + p_reservation_ttl
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true, 'reason', 'reserved', 'redemption_id', v_id,
    'coupon_id', v_coupon.id, 'stripe_coupon_id', v_stripe_coupon,
    'discount_type', v_coupon.discount_type, 'percent_off', v_coupon.percent_off,
    'amount_off_minor', v_coupon.amount_off_minor, 'currency', v_coupon.currency,
    'duration_type', v_coupon.duration_type, 'duration_cycles', v_coupon.duration_cycles,
    'usage_rule', v_coupon.usage_rule,
    'reservation_expires_at', now() + p_reservation_ttl
  );
end;
$$;
revoke all on function public.billing_reserve_coupon(uuid, text, uuid, text, text, text, interval) from public, anon, authenticated;
grant execute on function public.billing_reserve_coupon(uuid, text, uuid, text, text, text, interval) to service_role;

-- ---------------------------------------------------------------------------
-- billing_release_coupon_reservation: release a still-reserved coupon for a
-- checkout (checkout canceled/expired, coupon removed). Idempotent; never
-- touches an already-redeemed row.
-- ---------------------------------------------------------------------------
create function public.billing_release_coupon_reservation(p_pending_checkout_id uuid, p_reason text default 'released')
returns integer
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_n integer;
begin
  update public.coupon_redemptions
  set status = case when p_reason = 'expired' then 'expired' else 'released' end,
      released_reason = left(p_reason, 80), updated_at = now()
  where pending_checkout_id = p_pending_checkout_id and status = 'reserved';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.billing_release_coupon_reservation(uuid, text) from public, anon, authenticated;
grant execute on function public.billing_release_coupon_reservation(uuid, text) to service_role;

-- Bulk expiry for the scheduled job (also done lazily per coupon above).
create function public.billing_expire_stale_reservations()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_n integer;
begin
  update public.coupon_redemptions
  set status = 'expired', released_reason = 'reservation_expired', updated_at = now()
  where status = 'reserved' and reservation_expires_at <= now();
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.billing_expire_stale_reservations() from public, anon, authenticated;
grant execute on function public.billing_expire_stale_reservations() to service_role;

-- ---------------------------------------------------------------------------
-- billing_finalize_coupon_redemption: called by provisioning (0038) in the
-- SAME transaction that creates the Space + subscription. Turns the
-- reservation into a successful redemption and stamps the discount window.
--
-- If the reservation had already been released/expired (a slow payment) but
-- the customer genuinely paid the discounted price, the discount is honoured
-- (Stripe is authoritative for money). The redemption is revived when the
-- usage policy still allows it; if it no longer does (another customer took
-- the allowance meanwhile) the function reports 'coupon_overrun' instead of
-- failing the provisioning - the paying customer must never lose their Space.
-- ---------------------------------------------------------------------------
create function public.billing_finalize_coupon_redemption(
  p_pending_checkout_id uuid,
  p_tenant_id uuid,
  p_subscription_id uuid,
  p_started_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_r public.coupon_redemptions;
  v_total integer;
  v_ends timestamptz;
begin
  select * into v_r
  from public.coupon_redemptions
  where pending_checkout_id = p_pending_checkout_id
  order by created_at desc
  limit 1
  for update;
  if not found then
    return jsonb_build_object('status', 'no_coupon');
  end if;
  if v_r.status in ('redeemed', 'completed', 'canceled') then
    return jsonb_build_object('status', 'already_redeemed', 'redemption_id', v_r.id);
  end if;

  v_total := case v_r.duration_type when 'once' then 1 when 'repeating' then v_r.duration_cycles else null end;
  -- Monthly plan: one cycle = one month. 'forever' has no end.
  v_ends := case when v_total is null then null else p_started_at + (v_total || ' months')::interval end;

  begin
    update public.coupon_redemptions
    set status = 'redeemed',
        tenant_id = p_tenant_id,
        space_subscription_id = p_subscription_id,
        redeemed_at = now(),
        discount_starts_at = p_started_at,
        discount_ends_at = v_ends,
        cycles_total = v_total,
        cycles_completed = 0,
        released_reason = null,
        updated_at = now()
    where id = v_r.id;
  exception when unique_violation then
    return jsonb_build_object('status', 'coupon_overrun', 'redemption_id', v_r.id);
  end;
  return jsonb_build_object('status', 'redeemed', 'redemption_id', v_r.id, 'cycles_total', v_total, 'discount_ends_at', v_ends);
end;
$$;
revoke all on function public.billing_finalize_coupon_redemption(uuid, uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.billing_finalize_coupon_redemption(uuid, uuid, uuid, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- billing_record_discount_cycle: count ONE paid invoice toward a redeemed
-- discount, idempotently per invoice, and complete the discount when its
-- cycles are used up. Deliberately never inspects the coupon's valid_until:
-- a discount already redeemed keeps its full duration after the coupon's
-- availability window closes.
--
-- p_discount_applied is Stripe's truth for that invoice. If Stripe applied no
-- discount although cycles remain, the discount has ended on Stripe's side and
-- InnerDweS closes it out too (so Admin never claims a discount Stripe stopped
-- giving).
-- ---------------------------------------------------------------------------
create function public.billing_record_discount_cycle(
  p_subscription_id uuid,
  p_invoice_id text,
  p_discount_applied boolean,
  p_paid_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_r public.coupon_redemptions;
  v_done integer;
begin
  select * into v_r
  from public.coupon_redemptions
  where space_subscription_id = p_subscription_id and status = 'redeemed'
  order by redeemed_at desc
  limit 1
  for update;
  if not found then
    return jsonb_build_object('status', 'no_active_discount');
  end if;
  if v_r.last_cycle_invoice_id = p_invoice_id then
    return jsonb_build_object('status', 'already_counted', 'cycles_completed', v_r.cycles_completed);
  end if;

  if not p_discount_applied then
    update public.coupon_redemptions
    set status = 'completed', discount_ends_at = coalesce(discount_ends_at, p_paid_at),
        last_cycle_invoice_id = p_invoice_id, updated_at = now()
    where id = v_r.id;
    return jsonb_build_object('status', 'completed_discount_not_applied', 'cycles_completed', v_r.cycles_completed);
  end if;

  v_done := v_r.cycles_completed + 1;
  if v_r.cycles_total is not null and v_done >= v_r.cycles_total then
    update public.coupon_redemptions
    set cycles_completed = v_done, status = 'completed',
        discount_ends_at = coalesce(discount_ends_at, p_paid_at),
        last_cycle_invoice_id = p_invoice_id, updated_at = now()
    where id = v_r.id;
    return jsonb_build_object('status', 'completed', 'cycles_completed', v_done);
  end if;

  update public.coupon_redemptions
  set cycles_completed = v_done, last_cycle_invoice_id = p_invoice_id, updated_at = now()
  where id = v_r.id;
  return jsonb_build_object('status', 'counted', 'cycles_completed', v_done);
end;
$$;
revoke all on function public.billing_record_discount_cycle(uuid, text, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.billing_record_discount_cycle(uuid, text, boolean, timestamptz) to service_role;
