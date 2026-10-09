-- TASK 032 - Commercial Platform Foundation, part 1 of 4: core billing tables.
--
-- ADDITIVE ONLY. Creates new tables, indexes, constraints, RLS and a small
-- seed (the single base plan + the launch-flag singleton). It does not touch
-- any existing table, policy, function or trigger, and it does not read or
-- write any tenant/content data. Part 2 (0037) adds the coupon engine,
-- part 3 (0038) the provisioning/lifecycle functions and the tenant-creation
-- guard, part 4 (0039) the access-enforcement policies.
--
-- Authority split (see docs/billing/ARCHITECTURE.md):
--   * Stripe is authoritative for the financial transaction and for the
--     subscription's billing state.
--   * These tables are the InnerDweS product/business state synchronised from
--     verified Stripe events: who pays, for which Space, which plan, which
--     coupon, what happens next. Stripe is never the only dashboard.
--
-- Security stance (applies to EVERY table below): RLS is enabled, the default
-- privileges Supabase grants to anon/authenticated are revoked explicitly, and
-- only the narrow, documented SELECT policies exist. Every write goes through
-- the service-role server code or the SECURITY DEFINER functions in 0037-0038.
-- No browser client can write any billing row, substitute a Stripe id, or
-- change a price.
--
-- Money is always integer minor units (never float). All timestamps are
-- timestamptz and are always set by the server/database clock.
--
-- Stripe Test vs Live separation is explicit: rows that hold Stripe ids carry
-- `stripe_mode` ('test' | 'live') and uniqueness is per mode, so a test id can
-- never be confused with a live id (and the server only reads rows of the mode
-- its own secret key belongs to).
--
-- Never edit 0001-0035. Forward-only.

-- ===========================================================================
-- 1. billing_settings - singleton control row. The server-side launch flag
--    for paid checkout lives HERE (not only in an env var and never only in
--    client code) so the same flag can be read by the application AND by the
--    database guard that refuses direct client tenant creation once paid
--    checkout is required (0038).
--
--    RLS intent: no client access at all (server/service-role read & write).
-- ===========================================================================
create table public.billing_settings (
  singleton boolean primary key default true check (singleton),
  -- false = legacy behaviour is untouched (paid checkout disabled).
  paid_checkout_enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.billing_settings enable row level security;
revoke all on public.billing_settings from public, anon, authenticated;

insert into public.billing_settings (singleton, paid_checkout_enabled) values (true, false)
on conflict (singleton) do nothing;

-- ===========================================================================
-- 2. billing_plans - the trusted commercial plan catalog. The server resolves
--    price/currency/interval ONLY from here; the browser can never name a
--    price. Stripe ids are stored per mode. The server additionally verifies
--    at checkout time that the Stripe Price's amount/currency/interval equal
--    this row (price-drift guard) and refuses otherwise.
--
--    RLS intent: no client access (server/service-role only).
-- ===========================================================================
create table public.billing_plans (
  id uuid primary key default gen_random_uuid(),
  plan_key text not null unique check (plan_key ~ '^[a-z0-9_]{3,64}$'),
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  active boolean not null default true,
  billing_interval text not null default 'month' check (billing_interval in ('month', 'year')),
  currency char(3) not null check (currency = upper(currency)),
  -- Per-Space recurring list price in minor units ($25.00 -> 2500).
  unit_amount_minor integer not null check (unit_amount_minor > 0),
  -- Space types this plan may be bought for (subset of tenants_product_type_check).
  space_types text[] not null default array['teach', 'retreat']::text[],
  -- Stripe objects, kept separate per mode (never mixed).
  stripe_test_product_id text,
  stripe_test_price_id text,
  stripe_live_product_id text,
  stripe_live_price_id text,
  -- Data-driven product entitlement bundle + its version (see
  -- src/lib/billing/entitlements). Never hard-coded in UI components.
  entitlements jsonb not null default '{}'::jsonb,
  entitlement_version integer not null default 1 check (entitlement_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.billing_plans enable row level security;
revoke all on public.billing_plans from public, anon, authenticated;

-- The single approved base plan: $25 USD / month / Space, with the approved
-- base audio entitlement per Space. The optional +$5 audio add-on is described
-- in the same bundle (infrastructure only; no add-on is sold in this task).
-- Stripe ids are intentionally NULL here: they are environment-specific and are
-- created/verified by the server-side "sync plan" admin action per mode.
insert into public.billing_plans (plan_key, display_name, billing_interval, currency, unit_amount_minor, space_types, entitlements)
values (
  'space_monthly_usd',
  'InnerDweS Space',
  'month',
  'USD',
  2500,
  array['teach', 'retreat']::text[],
  jsonb_build_object(
    'audio', jsonb_build_object(
      'libraryMinutes', 240,
      'maxRecordingMinutes', 60,
      'listeningMinutesPerMonth', 100000
    ),
    'addons', jsonb_build_object(
      'audio_pack', jsonb_build_object(
        'priceMinor', 500,
        'currency', 'USD',
        'libraryMinutes', 240,
        'listeningMinutesPerMonth', 70000
      )
    )
  )
)
on conflict (plan_key) do nothing;

-- ===========================================================================
-- 3. billing_customers - InnerDweS account <-> Stripe Customer. ONE current
--    Stripe customer per account per Stripe mode; one account may own many
--    Spaces (each with its own subscription). user_id is SET NULL on account
--    deletion (financial audit retention, same anonymise-not-delete approach
--    as access_code_redemptions in 0022); the account-deletion routine must
--    refuse while a non-ended paid subscription exists.
--
--    RLS intent: no client access. (A user never needs their Stripe id.)
-- ===========================================================================
create table public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  stripe_mode text not null check (stripe_mode in ('test', 'live')),
  stripe_customer_id text not null check (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stripe_mode, stripe_customer_id)
);
-- One current customer per account per mode (NULL user_id rows - anonymised
-- after account deletion - are exempt because NULLs are distinct).
create unique index billing_customers_one_per_user_mode
  on public.billing_customers (user_id, stripe_mode);
alter table public.billing_customers enable row level security;
revoke all on public.billing_customers from public, anon, authenticated;

-- ===========================================================================
-- 4. coupons - InnerDweS' own operational coupon definition. Stripe never
--    sees the code the customer typed: InnerDweS validates/reserves it, then
--    attaches the matching Stripe coupon (a financial-terms-immutable Stripe
--    object created by the server) to the Checkout Session. Per-redemption
--    terms are snapshotted into coupon_redemptions (0036 below) so editing or
--    disabling a coupon never changes what an existing customer was promised.
--
--    code vs normalized_code: `code` is the display spelling an Admin typed
--    (trimmed). `normalized_code` is the canonical lookup key - upper-cased,
--    trimmed - and is the ONLY unique column, so two codes that differ only in
--    case/whitespace can never coexist. User input is matched
--    case-insensitively by normalising the same way.
--
--    RLS intent: no client access at all (admin console + server only).
-- ===========================================================================
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null check (length(btrim(code)) between 3 and 32 and code = btrim(code)),
  normalized_code text not null unique
    check (normalized_code = upper(btrim(code)) and normalized_code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
  description text check (description is null or length(description) <= 500),
  active boolean not null default true,

  discount_type text not null check (discount_type in ('percent', 'fixed_amount')),
  percent_off numeric(5, 2) check (percent_off is null or (percent_off > 0 and percent_off <= 100)),
  amount_off_minor integer check (amount_off_minor is null or amount_off_minor > 0),
  currency char(3) check (currency is null or currency = upper(currency)),

  -- Per-coupon usage policy (NOT one global rule):
  --   once_per_user            - the same user may redeem it once across ALL Spaces
  --   once_per_space           - never twice for the same Space/subscription
  --   unlimited_during_validity - repeatable across Spaces while the window is open
  usage_rule text not null check (usage_rule in ('once_per_user', 'once_per_space', 'unlimited_during_validity')),
  -- Reserved for a future "at most N redemptions per user" policy; unused in
  -- v1 so the schema does not need a destructive redesign later.
  max_redemptions_per_user integer check (max_redemptions_per_user is null or max_redemptions_per_user > 0),

  -- HOW LONG a successful redemption continues (independent of the
  -- availability window below).
  duration_type text not null check (duration_type in ('once', 'repeating', 'forever')),
  duration_cycles integer check (duration_cycles is null or duration_cycles > 0),

  -- WHEN a NEW redemption may begin. An already-valid discount is never cut
  -- short because valid_until has passed.
  valid_from timestamptz,
  valid_until timestamptz,

  -- Optional cap on SUCCESSFUL redemptions (abandoned reservations do not
  -- consume it - see 0037).
  global_max_redemptions integer check (global_max_redemptions is null or global_max_redemptions > 0),

  -- Applicability. NULL = any.
  plan_keys text[],
  space_types text[],

  -- Stripe counterpart (separate per mode). Created and owned by the server;
  -- Stripe coupons are immutable in their financial terms, which matches the
  -- immutable-terms rule for redemptions.
  stripe_test_coupon_id text,
  stripe_live_coupon_id text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint coupons_discount_shape check (
    (discount_type = 'percent' and percent_off is not null and amount_off_minor is null and currency is null)
    or (discount_type = 'fixed_amount' and amount_off_minor is not null and currency is not null and percent_off is null)
  ),
  constraint coupons_duration_shape check (
    (duration_type = 'repeating' and duration_cycles is not null and duration_cycles >= 2)
    or (duration_type in ('once', 'forever') and duration_cycles is null)
  ),
  constraint coupons_window_order check (valid_from is null or valid_until is null or valid_from < valid_until)
);
alter table public.coupons enable row level security;
revoke all on public.coupons from public, anon, authenticated;
create index coupons_active_window_idx on public.coupons (active, valid_until);

-- ===========================================================================
-- 5. pending_space_checkouts - purchase INTENT recorded before any tenant
--    exists. A pending checkout never grants Studio access. Only a verified
--    payment (webhook or server-to-server reconciliation) provisions a Space,
--    through one idempotent function (0038).
--
--    Status transitions are explicit (enforced in 0038's functions):
--      created -> checkout_created -> awaiting_payment
--              -> payment_confirmed -> provisioning -> provisioned
--      created|checkout_created|awaiting_payment -> expired | canceled
--      payment_confirmed|provisioning -> failed (recoverable by reconcile)
--
--    RLS intent: the owning user may SELECT their own rows (the success page
--    reads provisioning state through the user's own session). No client
--    insert/update/delete.
-- ===========================================================================
create table public.pending_space_checkouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  space_type text not null check (space_type in ('teach', 'retreat')),
  plan_id uuid not null references public.billing_plans(id),
  status text not null default 'created' check (status in (
    'created', 'checkout_created', 'awaiting_payment', 'payment_confirmed',
    'provisioning', 'provisioned', 'expired', 'canceled', 'failed'
  )),
  stripe_mode text not null check (stripe_mode in ('test', 'live')),
  stripe_checkout_session_id text,
  stripe_customer_id text,
  stripe_subscription_id text,
  -- Server-calculated quote at creation time (amounts in minor units). The
  -- authoritative charged amount is whatever Stripe actually billed; this is
  -- for display and drift detection.
  quote jsonb not null default '{}'::jsonb,
  locale text,
  -- Idempotency/provisioning key: one pending checkout -> one Space, ever.
  provisioning_key uuid not null default gen_random_uuid() unique,
  tenant_id uuid references public.tenants(id) on delete set null,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  payment_confirmed_at timestamptz,
  provisioning_started_at timestamptz,
  provisioned_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz
);
create unique index pending_space_checkouts_session_uidx
  on public.pending_space_checkouts (stripe_mode, stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;
-- At most ONE open (unpaid) checkout per user per Space type: a second tab
-- reuses it instead of creating a competing one.
create unique index pending_space_checkouts_one_open_per_user_type
  on public.pending_space_checkouts (user_id, space_type)
  where status in ('created', 'checkout_created', 'awaiting_payment');
create index pending_space_checkouts_user_idx on public.pending_space_checkouts (user_id, created_at desc);
create index pending_space_checkouts_open_expiry_idx
  on public.pending_space_checkouts (expires_at)
  where status in ('created', 'checkout_created', 'awaiting_payment');
create index pending_space_checkouts_stuck_idx
  on public.pending_space_checkouts (status, updated_at)
  where status in ('payment_confirmed', 'provisioning', 'failed');
alter table public.pending_space_checkouts enable row level security;
revoke all on public.pending_space_checkouts from public, anon, authenticated;
grant select on public.pending_space_checkouts to authenticated;
create policy "pending_space_checkouts: users can select their own"
  on public.pending_space_checkouts for select
  using (user_id = auth.uid());

-- ===========================================================================
-- 6. space_subscriptions - the commercial state of ONE paid Space. One row
--    per tenant. Kept in sync from verified Stripe events only. `status`
--    mirrors the Stripe subscription status, plus 'exempt' for the explicit,
--    server/Admin-controlled internal/legacy exemption (Lena, Return to
--    Balance, QA Spaces) - exempt rows never count as paying customers.
--
--    next_action / next_action_at are written ONLY by the single shared
--    calculator (src/lib/billing/nextAction.ts) so Admin, My Spaces and the
--    Billing page can never disagree.
--
--    RLS intent: the Space's OWNER may SELECT (Billing/Plan surface). No
--    client write. A failed subscription on Space A never touches Space B.
-- ===========================================================================
create table public.space_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  billing_owner_user_id uuid references auth.users(id) on delete set null,
  billing_customer_id uuid references public.billing_customers(id),
  plan_id uuid references public.billing_plans(id),
  stripe_mode text check (stripe_mode in ('test', 'live')),
  stripe_subscription_id text,
  stripe_price_id text,
  status text not null check (status in (
    'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due',
    'unpaid', 'canceled', 'paused', 'exempt'
  )),
  currency char(3) check (currency is null or currency = upper(currency)),
  base_amount_minor integer check (base_amount_minor is null or base_amount_minor >= 0),
  -- Current effective (post-discount) recurring amount, when reliably known.
  current_effective_amount_minor integer check (current_effective_amount_minor is null or current_effective_amount_minor >= 0),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancel_at timestamptz,
  canceled_at timestamptz,
  ended_at timestamptz,
  -- Start of the CURRENT unresolved payment-failure episode (NULL = healthy).
  -- Every lifecycle deadline (24h Guest, 7d Studio, day 12 warning, day 14
  -- deletion eligibility) is derived from this single server timestamp.
  payment_failed_at timestamptz,
  guest_suspended_at timestamptz,
  studio_suspended_at timestamptz,
  deletion_warning_at timestamptz,
  eligible_for_deletion_at timestamptz,
  recovered_at timestamptz,
  latest_invoice_id text,
  last_paid_invoice_id text,
  -- Shared next-action model.
  next_action text not null default 'none' check (next_action in (
    'renewal', 'discount_cycle', 'discount_ends', 'cancel_at_period_end',
    'payment_retry', 'guest_suspension', 'studio_suspension',
    'deletion_warning', 'deletion_eligible', 'none'
  )),
  next_action_at timestamptz,
  next_expected_charge_minor integer check (next_expected_charge_minor is null or next_expected_charge_minor >= 0),
  -- Explicit exemption (status = 'exempt'). Narrow, auditable, optionally expiring.
  exempt_reason text,
  exempt_by uuid references auth.users(id) on delete set null,
  exempt_at timestamptz,
  exempt_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint space_subscriptions_exempt_shape check (
    (status = 'exempt' and exempt_reason is not null and exempt_at is not null)
    or (status <> 'exempt')
  ),
  constraint space_subscriptions_paid_shape check (
    status = 'exempt' or (stripe_mode is not null and stripe_subscription_id is not null)
  )
);
create unique index space_subscriptions_stripe_sub_uidx
  on public.space_subscriptions (stripe_mode, stripe_subscription_id)
  where stripe_subscription_id is not null;
create index space_subscriptions_status_idx on public.space_subscriptions (status);
create index space_subscriptions_next_action_idx
  on public.space_subscriptions (next_action_at)
  where next_action <> 'none' and next_action_at is not null;
create index space_subscriptions_payment_failed_idx
  on public.space_subscriptions (payment_failed_at)
  where payment_failed_at is not null;
create index space_subscriptions_owner_idx on public.space_subscriptions (billing_owner_user_id);
alter table public.space_subscriptions enable row level security;
revoke all on public.space_subscriptions from public, anon, authenticated;
grant select on public.space_subscriptions to authenticated;
create policy "space_subscriptions: owners can select"
  on public.space_subscriptions for select
  using (public.is_tenant_owner(tenant_id));

-- Add-on quantities (entitlement infrastructure; nothing sells an add-on yet).
create table public.space_subscription_addons (
  subscription_id uuid not null references public.space_subscriptions(id) on delete cascade,
  addon_key text not null check (addon_key ~ '^[a-z0-9_]{2,64}$'),
  quantity integer not null check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (subscription_id, addon_key)
);
alter table public.space_subscription_addons enable row level security;
revoke all on public.space_subscription_addons from public, anon, authenticated;

-- ===========================================================================
-- 7. coupon_redemptions - the reservation/redemption ledger. Typing a coupon
--    is NOT a redemption; opening Checkout is NOT a redemption. A row is
--    'reserved' while a checkout is open, becomes 'redeemed' only when the
--    purchase is verified and the Space provisioned, and is 'released'/
--    'expired' when abandoned (so abandoned reservations never consume a cap
--    or a once-per-user allowance).
--
--    The commercial TERMS are snapshotted here at reservation time
--    (usage_rule, discount, duration, the exact Stripe coupon applied) so a
--    later Admin edit/disable affects only NEW redemptions, never history.
--
--    Concurrency enforcement lives in 0037 (row lock on the coupon) with the
--    partial unique indexes below as the hard database backstop:
--      * once_per_user  -> unique (coupon_id, user_id)   among live/used rows
--      * once_per_space -> unique (coupon_id, tenant_id) among used rows
--      * every rule     -> unique (pending_checkout_id)  among live/used rows
--    A universal UNIQUE(user_id, coupon_id) would be WRONG (it would forbid
--    the unlimited-during-validity policy), which is why these are partial and
--    keyed on the snapshotted usage_rule.
--
--    RLS intent: no client access (server/Admin only).
-- ===========================================================================
create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id),
  user_id uuid references auth.users(id) on delete set null,
  pending_checkout_id uuid not null references public.pending_space_checkouts(id),
  tenant_id uuid references public.tenants(id) on delete set null,
  space_subscription_id uuid references public.space_subscriptions(id) on delete set null,
  status text not null default 'reserved' check (status in (
    'reserved', 'redeemed', 'completed', 'canceled', 'released', 'expired'
  )),
  -- Immutable snapshot of the promised terms.
  usage_rule text not null check (usage_rule in ('once_per_user', 'once_per_space', 'unlimited_during_validity')),
  discount_type text not null check (discount_type in ('percent', 'fixed_amount')),
  percent_off numeric(5, 2),
  amount_off_minor integer,
  currency char(3),
  duration_type text not null check (duration_type in ('once', 'repeating', 'forever')),
  duration_cycles integer,
  stripe_mode text not null check (stripe_mode in ('test', 'live')),
  stripe_coupon_id text,
  reserved_at timestamptz not null default now(),
  reservation_expires_at timestamptz not null,
  redeemed_at timestamptz,
  discount_starts_at timestamptz,
  -- NULL for a 'forever' discount, or until the end is known.
  discount_ends_at timestamptz,
  cycles_total integer check (cycles_total is null or cycles_total > 0),
  cycles_completed integer not null default 0 check (cycles_completed >= 0),
  -- Last invoice already counted toward cycles_completed (idempotent counting:
  -- two events about the same invoice can never count a cycle twice).
  last_cycle_invoice_id text,
  released_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index coupon_redemptions_once_per_user_uidx
  on public.coupon_redemptions (coupon_id, user_id)
  where usage_rule = 'once_per_user' and user_id is not null
    and status in ('reserved', 'redeemed', 'completed', 'canceled');
create unique index coupon_redemptions_once_per_space_uidx
  on public.coupon_redemptions (coupon_id, tenant_id)
  where usage_rule = 'once_per_space' and tenant_id is not null
    and status in ('redeemed', 'completed', 'canceled');
create unique index coupon_redemptions_one_per_checkout_uidx
  on public.coupon_redemptions (pending_checkout_id)
  where status in ('reserved', 'redeemed', 'completed', 'canceled');
create index coupon_redemptions_coupon_status_idx on public.coupon_redemptions (coupon_id, status);
create index coupon_redemptions_user_idx on public.coupon_redemptions (user_id);
create index coupon_redemptions_subscription_idx on public.coupon_redemptions (space_subscription_id);
create index coupon_redemptions_reserved_expiry_idx
  on public.coupon_redemptions (reservation_expires_at) where status = 'reserved';
alter table public.coupon_redemptions enable row level security;
revoke all on public.coupon_redemptions from public, anon, authenticated;

-- ===========================================================================
-- 8. billing_events - webhook idempotency + audit. The Stripe event id is
--    UNIQUE: a repeated delivery can never repeat a side effect. Only ids and
--    safe summaries are stored - never the raw event payload, never card data.
--    (A failed event can be re-fetched from Stripe by id for reprocessing.)
--
--    RLS intent: no client access.
-- ===========================================================================
create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null,
  stripe_mode text not null check (stripe_mode in ('test', 'live')),
  event_type text not null,
  status text not null default 'received' check (status in ('received', 'processing', 'processed', 'failed', 'ignored')),
  attempts integer not null default 0,
  received_at timestamptz not null default now(),
  processing_started_at timestamptz,
  processed_at timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  tenant_id uuid references public.tenants(id) on delete set null,
  pending_checkout_id uuid references public.pending_space_checkouts(id) on delete set null,
  error_code text,
  error_detail text check (error_detail is null or length(error_detail) <= 500),
  unique (stripe_mode, stripe_event_id)
);
create index billing_events_status_idx on public.billing_events (status, received_at);
create index billing_events_subscription_idx on public.billing_events (stripe_subscription_id);
alter table public.billing_events enable row level security;
revoke all on public.billing_events from public, anon, authenticated;

-- ===========================================================================
-- 9. billing_acceptances - evidence of what the buyer accepted at checkout.
--    Versions are identifiers of the legal texts shown (kept in code:
--    src/lib/billing/legal.ts). The immediate-service consent and the
--    statutory-withdrawal acknowledgement are SEPARATE booleans: this is not a
--    blanket "I waive all refunds everywhere".
--
--    RLS intent: no client access. (Inserted server-side with the checkout.)
-- ===========================================================================
create table public.billing_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  pending_checkout_id uuid references public.pending_space_checkouts(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  space_subscription_id uuid references public.space_subscriptions(id) on delete set null,
  stripe_checkout_session_id text,
  terms_version text not null,
  privacy_version text not null,
  billing_terms_version text not null,
  immediate_service_consent boolean not null,
  withdrawal_acknowledged boolean not null,
  consent_text_id text not null,
  locale text,
  accepted_at timestamptz not null default now(),
  constraint billing_acceptances_consent_required check (immediate_service_consent and withdrawal_acknowledged)
);
create index billing_acceptances_user_idx on public.billing_acceptances (user_id);
create unique index billing_acceptances_checkout_uidx
  on public.billing_acceptances (pending_checkout_id) where pending_checkout_id is not null;
alter table public.billing_acceptances enable row level security;
revoke all on public.billing_acceptances from public, anon, authenticated;

-- ===========================================================================
-- 10. billing_email_outbox - transactional outbox so a duplicate webhook or a
--     re-run job can never send the same billing email twice. dedupe_key is
--     UNIQUE. Provider: the existing email stack (Resend) - tracking stays OFF.
--
--     RLS intent: no client access.
-- ===========================================================================
create table public.billing_email_outbox (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  space_subscription_id uuid references public.space_subscriptions(id) on delete set null,
  template text not null check (template in (
    'subscription_started', 'payment_failed', 'guest_unavailable', 'studio_suspended',
    'final_warning', 'cancellation_scheduled', 'subscription_ended', 'payment_recovered'
  )),
  locale text not null default 'en',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  last_error text check (last_error is null or length(last_error) <= 300),
  provider_message_id text,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index billing_email_outbox_pending_idx
  on public.billing_email_outbox (scheduled_at) where status in ('pending', 'failed');
alter table public.billing_email_outbox enable row level security;
revoke all on public.billing_email_outbox from public, anon, authenticated;

-- ===========================================================================
-- 11. admin_users - server-controlled Admin authorization. NOT derived from
--     email, client metadata, profile data, a hidden URL or an env UI switch.
--     No policies exist: an ordinary user can never read or grant themselves
--     Admin; rows are created only by the service role / SQL by the owner (the
--     first Admin is a documented manual bootstrap), later by an Admin with
--     recent MFA step-up. Admin access ALSO requires an MFA (AAL2) session -
--     enforced in application code (src/lib/billing/admin/auth.ts).
-- ===========================================================================
create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'billing_admin' check (role in ('owner', 'billing_admin')),
  note text check (note is null or length(note) <= 300),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  disabled_at timestamptz
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from public, anon, authenticated;

-- ===========================================================================
-- 12. admin_audit_log - append-only trail of Admin mutations. UPDATE/DELETE
--     are blocked by trigger for every role (including service_role) so history
--     cannot be silently rewritten. Never store secrets, TOTP secrets, session
--     tokens or card data in before/after (the writer redacts; see
--     src/lib/billing/admin/audit.ts).
-- ===========================================================================
create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  -- Deliberately NOT a foreign key: the append-only trigger below forbids the
  -- UPDATE an ON DELETE SET NULL would perform, which would make deleting an
  -- Admin's account impossible. The id is kept verbatim as audit history.
  admin_user_id uuid,
  action text not null check (length(action) between 3 and 80),
  target_type text not null check (length(target_type) between 2 and 40),
  target_id text,
  before_state jsonb,
  after_state jsonb,
  reason text check (reason is null or length(reason) <= 500),
  request_id text,
  created_at timestamptz not null default now()
);
create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index admin_audit_log_target_idx on public.admin_audit_log (target_type, target_id);
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from public, anon, authenticated;

create function public.admin_audit_log_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'admin_audit_log is append-only' using errcode = '42501';
end;
$$;
revoke all on function public.admin_audit_log_immutable() from public, anon, authenticated;
create trigger admin_audit_log_no_update
  before update or delete on public.admin_audit_log
  for each row execute function public.admin_audit_log_immutable();
create trigger admin_audit_log_no_truncate
  before truncate on public.admin_audit_log
  for each statement execute function public.admin_audit_log_immutable();
