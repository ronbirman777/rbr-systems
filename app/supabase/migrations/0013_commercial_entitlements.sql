-- Time to Flow Commercial Access Phase 1 - Entitlements & Complimentary
-- Access Architecture. Introduces the commercial-access model
-- (space_entitlements), a complimentary-code redemption system
-- (access_codes / access_code_redemptions / redeem_access_code()), and a
-- publish_space() guard so an inactive Space cannot Publish/Republish.
--
-- Does not touch Stripe (none of this exists yet - access_type='active'
-- and the stripe_* columns are reserved for a later phase). Does not
-- delete or hide any existing tenant data. Does not remove the Production
-- preview gate. Does not wire Guest-route enforcement (that is a
-- deliberate follow-up batch - see the migration-end note).
--
-- Effective commercial status (complimentary/active/grace/inactive) is
-- never stored as a column here - it is always derived fresh from
-- access_type + access_ends_at + now(), identically in SQL
-- (publish_space()'s and redeem_access_code()'s guards, below) and in
-- TypeScript (src/lib/entitlements/availability.ts's
-- deriveCommercialAvailability). Both use inclusive (<=) boundaries at
-- access_ends_at and at access_ends_at + the grace period.
--
-- access_ends_at is the ONLY persisted end-of-period timestamp - there is
-- no grace_ends_at column. A `generated ... stored` column computing
-- access_ends_at + interval '7 days' was the original design and was
-- rejected by Postgres at apply time: error 42P17, "generation expression
-- is not immutable" - timestamptz + a calendar-day interval is
-- timezone/DST-dependent (a "day" can be 23/24/25 hours across a DST
-- boundary), which disqualifies it from backing a STORED generated
-- column.
--
-- THE GRACE PERIOD IS DEFINED AS EXACTLY 168 HOURS (7 * 24h), A FIXED
-- ELAPSED DURATION - not "7 calendar days". SQL expresses this as
-- `interval '168 hours'`, deliberately NOT `interval '7 days'`: in
-- Postgres, an interval's hours/minutes/seconds components are always a
-- fixed elapsed duration, while its days/months components are
-- calendar-relative and can be stretched or compressed by a DST
-- transition in the evaluating session's timezone. `interval '168
-- hours'` added to a timestamptz is therefore deterministic and
-- timezone-independent - it adds exactly 168*3600 seconds, always,
-- regardless of session TimeZone or DST - which is the exact same fixed
-- quantity TypeScript's deriveCommercialAvailability() adds
-- (7 * 24 * 60 * 60 * 1000 ms). This is a deliberate, exact match, not
-- an approximation that happens to agree under UTC. Grace end is derived
-- at read time, inline, everywhere it's needed - never stored, never
-- trigger-maintained. If this rule ever changes, every inline occurrence
-- below and deriveCommercialAvailability() must change together.

-- ===========================================================================
-- 1. space_entitlements - one row per tenant, its current commercial grant.
--    No row for a tenant is a real, permanent, expected state (not a
--    loading/transitional one) - it means "never granted access", which
--    resolves to inactive: full Studio access, no Publish, not publicly
--    available. Nothing in this migration inserts a row for a brand-new
--    tenant automatically (no free trial) - see the grandfathering note
--    at the bottom of this file for the one, migration-time-only
--    exception for tenants that already exist today.
-- ===========================================================================
create table public.space_entitlements (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  access_type text not null check (access_type in ('complimentary', 'active')),
  starts_at timestamptz not null default now(),
  -- The sole persisted end-of-period timestamp. Grace end
  -- (access_ends_at + interval '168 hours', i.e. exactly +7*24h) is
  -- derived inline wherever it's needed (redeem_access_code()'s guard,
  -- publish_space()'s guard, and deriveCommercialAvailability() in
  -- TypeScript) rather than stored - see the file-header comment for why
  -- a stored generated column doesn't work for this expression, and why
  -- hours (not days) are used.
  access_ends_at timestamptz not null,
  -- Reserved for Stripe (Phase 2). Nothing in this migration ever sets
  -- these; kept nullable so the shape is ready without implementing
  -- billing now.
  stripe_customer_id text,
  stripe_subscription_id text,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.space_entitlements enable row level security;

-- Members may read their own Space's entitlement (Studio status display,
-- the TS helper). Deliberately NO insert/update/delete policy for any
-- client role - the only writer is redeem_access_code() (SECURITY
-- DEFINER, below) and, later, a Stripe webhook handler running on the
-- service-role/admin client. An organizer cannot grant, extend, or alter
-- their own access by any direct table write.
create policy "space_entitlements: members can select"
  on public.space_entitlements for select
  using (public.is_tenant_member(tenant_id));

create index space_entitlements_access_ends_at_idx on public.space_entitlements (access_ends_at);

-- ===========================================================================
-- 2. access_codes - the complimentary-code catalog. RLS enabled with
--    ZERO policies for any role (hard default-deny) - no client, including
--    an authenticated organizer, may select/insert/update/delete this
--    table directly. The only access path is redeem_access_code() below,
--    which validates and claims a code atomically without ever exposing
--    the table's contents to the caller. Codes are created/managed only
--    via the service-role/admin client (operator tooling), outside the
--    scope of this migration.
-- ===========================================================================
create table public.access_codes (
  id uuid primary key default gen_random_uuid(),
  -- Canonical form (trimmed, uppercase) is enforced at the DATABASE
  -- level, not left to admin tooling discipline: this CHECK makes it
  -- structurally impossible to insert "ron60", " RON60 ", etc. - only
  -- the one canonical spelling of any code can ever exist as a row, so
  -- UNIQUE below is a real logical-code guarantee, not just a guarantee
  -- against one exact byte-for-byte string repeating. redeem_access_code()
  -- normalizes the same way (upper(btrim(...))) when looking a code up,
  -- so a redemption of "ron60" or "  ron60  " still resolves this row.
  code text not null unique check (code = upper(btrim(code))),
  duration_days integer not null check (duration_days > 0),
  max_redemptions integer not null check (max_redemptions > 0),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  -- Reserved for a future "this code may stack on top of existing valid
  -- access" capability. Not implemented or read by redeem_access_code()
  -- in this migration - stacking is explicitly rejected regardless of
  -- this column's value (see the function body). Present now so adding
  -- real stacking later doesn't require a schema change.
  allow_stacking boolean not null default false,
  enabled boolean not null default true,
  -- null = no expiry.
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.access_codes enable row level security;
-- No policies created - every operation is denied by default for every
-- role, including authenticated. This is intentional, not an oversight.

-- ===========================================================================
-- 3. access_code_redemptions - the audit trail, and the actual database-
--    level guarantee against redeeming the same code for the same Space
--    twice (the unique constraint below, not application logic).
-- ===========================================================================
create table public.access_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.access_codes(id),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  redeemed_by uuid not null references auth.users(id),
  redeemed_at timestamptz not null default now(),
  access_ends_at_granted timestamptz not null,
  -- The actual enforcement: a given code can never be redeemed twice for
  -- the same Space. redeem_access_code() relies on this constraint
  -- raising (and does not catch it) to abort the whole transaction.
  unique (code_id, tenant_id)
);

alter table public.access_code_redemptions enable row level security;

create policy "access_code_redemptions: members can select"
  on public.access_code_redemptions for select
  using (public.is_tenant_member(tenant_id));
-- No insert/update/delete policy for any client role - redemptions are
-- only ever written by redeem_access_code() (SECURITY DEFINER, below).

create index access_code_redemptions_tenant_id_idx on public.access_code_redemptions (tenant_id);

-- ===========================================================================
-- 4. redeem_access_code(uuid, text) - the single atomic entry point for
--    complimentary-code redemption. SECURITY DEFINER because it must
--    write to access_codes/access_code_redemptions/space_entitlements,
--    none of which grant client roles any direct write access.
--
--    Eligibility rule (reconciles "do not stack" with "never downgrade a
--    future paid active grant" using one rule instead of two): redemption
--    is only permitted when the tenant has NO existing entitlement row,
--    or its existing row's derived effective status is exactly
--    "inactive" (now() is already past access_ends_at + 168 hours,
--    computed inline - there is no stored grace_ends_at column, see the
--    file header). Any currently-valid state - complimentary, active, OR
--    grace - blocks a new complimentary redemption. This means a code
--    can never extend or stack on top of a still-valid period, and can
--    never replace a still-valid paid (active) grant, by construction -
--    there is no special-case branch for access_type = 'active' because
--    a still-valid active row is already blocked by the same date check.
--
--    Concurrency: the eligibility check above reads space_entitlements,
--    but nothing in a plain SELECT stops two concurrent redemptions of
--    TWO DIFFERENT codes for the SAME tenant from both reading "no
--    existing entitlement" (or "existing entitlement already expired")
--    before either has written one - they'd both then pass the
--    no-stacking guard, both claim capacity on their own (different)
--    access_codes row, and race each other on the final
--    space_entitlements UPSERT, silently stacking. A row lock on
--    access_codes cannot prevent this because two different codes are
--    two different rows with no shared lock. The fix is a row lock taken
--    on tenants (see "Serialize..." below, right after the ownership
--    check) - every redemption for a given tenant, regardless of which
--    code, contends for that ONE row, so the second concurrent caller
--    blocks until the first commits (or rolls back), then re-reads
--    space_entitlements and correctly sees the first one's grant.
--
--    Atomicity: the whole operation - capacity check/claim, duplicate-
--    redemption check, redemption record, entitlement grant - happens in
--    one PL/pgSQL function body, i.e. one transaction. The final
--    INSERT ... ON CONFLICT into access_code_redemptions is NOT wrapped
--    in an exception handler: if it violates the (code_id, tenant_id)
--    unique constraint, PL/pgSQL raises an uncaught exception, which
--    aborts the entire function/transaction - including rolling back the
--    redemption_count claim already made on access_codes. A friendly
--    application-level error is produced by the caller
--    (src/app/space/actions.ts), not by catching anything here.
-- ===========================================================================
create function public.redeem_access_code(p_tenant_id uuid, p_code text)
returns public.space_entitlements
language plpgsql
security definer
-- Deliberately excludes `public` from the search path. Every object this
-- function touches that lives in public is already schema-qualified
-- (public.is_tenant_owner, public.space_entitlements, public.access_codes,
-- public.access_code_redemptions) - the only *unqualified* names resolved
-- here are built-ins (upper, btrim, now, interval, uuid, operators), which
-- all live in pg_catalog. Since nothing depends on public being searched,
-- excluding it removes any search-path-shadowing risk from an object
-- later created in public with a colliding name - independent of whatever
-- CREATE privilege anon/authenticated do or don't have on that schema.
-- pg_temp stays included per the standard Postgres SECURITY DEFINER
-- guidance (temp-object resolution), even though this function creates
-- none.
set search_path = pg_catalog, pg_temp
as $$
declare
  v_existing public.space_entitlements;
  v_code_id uuid;
  v_duration_days integer;
  v_new_ends_at timestamptz;
  v_result public.space_entitlements;
begin
  -- Never trust caller-supplied tenant membership - re-validate inside
  -- the function even though this can only be called by an authenticated
  -- user. Only an owner may redeem a code for their Space (organizers
  -- with a non-owner role, if that ever exists, cannot self-grant access
  -- either).
  if not public.is_tenant_owner(p_tenant_id) then
    raise exception 'You do not have access to manage this Space';
  end if;

  -- Serialize every redemption attempt for this tenant, regardless of
  -- which code - see the function-level "Concurrency" comment above.
  -- tenants always has a row for p_tenant_id (is_tenant_owner() above
  -- already required one to exist), unlike space_entitlements, which may
  -- not exist yet for a Space that has never redeemed anything - so this
  -- is a stable lock target even in that case. PERFORM (not SELECT
  -- ... INTO) because the row's contents are irrelevant here; only the
  -- lock matters. This blocks a second concurrent caller for the same
  -- tenant until this transaction commits or rolls back, at which point
  -- it re-reads space_entitlements below and sees this transaction's
  -- result.
  perform 1 from public.tenants where id = p_tenant_id for update;

  select * into v_existing
  from public.space_entitlements
  where tenant_id = p_tenant_id;

  -- No-stacking / never-downgrade-active guard. Grace end is derived
  -- inline (access_ends_at + interval '168 hours' - there is no stored
  -- grace_ends_at column; hours, not days, so this is a fixed elapsed
  -- duration regardless of timezone/DST - see the file header). Checking
  -- only the grace-end bound is sufficient and equivalent to checking
  -- access_ends_at OR grace end separately: grace end is always >=
  -- access_ends_at, so "now() <= access_ends_at + 168 hours" already
  -- covers the complimentary/active window too. Inclusive, matching
  -- deriveCommercialAvailability() exactly: a period whose grace ends at
  -- exactly now() is still considered valid, so redemption is still
  -- blocked at that instant.
  if v_existing.tenant_id is not null
     and now() <= v_existing.access_ends_at + interval '168 hours' then
    raise exception 'This Space already has valid access';
  end if;

  -- Atomic capacity claim: one UPDATE, row-locked by Postgres, so
  -- concurrent redemptions of the same code can never together exceed
  -- max_redemptions - the WHERE clause re-checks redemption_count against
  -- max_redemptions on every attempt, and only one concurrent writer can
  -- win the row lock at a time.
  update public.access_codes
  set redemption_count = redemption_count + 1,
      updated_at = now()
  where code = upper(btrim(p_code))
    and enabled
    and (expires_at is null or now() <= expires_at)
    and redemption_count < max_redemptions
  returning id, duration_days into v_code_id, v_duration_days;

  if v_code_id is null then
    raise exception 'That code is not valid';
  end if;

  v_new_ends_at := now() + (v_duration_days || ' days')::interval;

  -- Deliberately no exception handler here - see the function-level
  -- comment above. A duplicate (code_id, tenant_id) must abort the whole
  -- transaction, rolling back the redemption_count claim above too.
  insert into public.access_code_redemptions (code_id, tenant_id, redeemed_by, access_ends_at_granted)
  values (v_code_id, p_tenant_id, auth.uid(), v_new_ends_at);

  insert into public.space_entitlements (tenant_id, access_type, starts_at, access_ends_at)
  values (p_tenant_id, 'complimentary', now(), v_new_ends_at)
  on conflict (tenant_id) do update set
    access_type = 'complimentary',
    starts_at = now(),
    access_ends_at = v_new_ends_at,
    updated_at = now()
  returning * into v_result;

  return v_result;
end;
$$;

-- Hardened per Phase 1 adjustment #4: no PUBLIC or anon execution, ever.
-- Supabase grants `anon`/`authenticated` direct EXECUTE on every new
-- function by default (a separate default-privilege rule PUBLIC-revoke
-- does not touch - the exact bug fixed for is_slug_available() in
-- 0011) - so anon must be revoked explicitly, not just PUBLIC.
revoke all on function public.redeem_access_code(uuid, text) from public;
revoke execute on function public.redeem_access_code(uuid, text) from anon;
grant execute on function public.redeem_access_code(uuid, text) to authenticated;

-- ===========================================================================
-- 5. publish_space() - add the commercial-access guard. Every other line
--    is byte-identical to the version in 0010 (which itself changed only
--    the slug copy from 0008's version). SECURITY INVOKER is unchanged -
--    the guard only needs to SELECT space_entitlements, which the
--    caller's own membership already grants via the policy above; no
--    elevated privilege is needed for a read.
-- ===========================================================================
create or replace function public.publish_space(p_tenant_id uuid)
returns timestamptz
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant record;
  v_brand record;
  v_enabled_modules text[];
  v_modules jsonb := '{}'::jsonb;
  v_payload jsonb;
  v_published_at timestamptz := now();
  v_entitlement record;
begin
  select name, product_type, timezone, slug into v_tenant
  from public.tenants where id = p_tenant_id;

  if not found then
    raise exception 'Space not found, or you do not have access to it';
  end if;

  -- Commercial-access guard. This is the authoritative enforcement - the
  -- application-side check (publish-space-button.tsx / publishSpace() in
  -- src/app/configurator/retreat/actions.ts) exists only for UX and
  -- cannot be relied on alone, since this RPC can be called directly.
  -- Grace end is derived inline (access_ends_at + interval '168 hours' -
  -- a fixed elapsed duration, not a calendar-day interval; there is no
  -- stored grace_ends_at column - see the migration's file header).
  -- Inclusive, matching deriveCommercialAvailability() exactly: a Space
  -- is still publishable through the exact instant grace ends, and only
  -- becomes unpublishable strictly after it.
  select access_ends_at into v_entitlement
  from public.space_entitlements where tenant_id = p_tenant_id;

  if v_entitlement.access_ends_at is null
     or now() > v_entitlement.access_ends_at + interval '168 hours' then
    raise exception 'This Space does not currently have active commercial access';
  end if;

  select palette, atmosphere, image_style into v_brand
  from public.brand_configs where tenant_id = p_tenant_id;

  select coalesce(array_agg(module_key order by module_key), '{}')
  into v_enabled_modules
  from public.module_configs
  where tenant_id = p_tenant_id and enabled = true;

  if v_enabled_modules is null then
    v_enabled_modules := '{}';
  end if;

  if 'schedule' = any(v_enabled_modules) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'date', date,
      'startTime', to_char(start_time, 'HH24:MI'),
      'endTime', case when end_time is null then null else to_char(end_time, 'HH24:MI') end,
      'title', title,
      'facilitator', facilitator,
      'location', location,
      'description', description,
      'category', category
    ) order by date, start_time), '[]'::jsonb)
    into v_payload
    from public.schedule_items where tenant_id = p_tenant_id;
    v_modules := v_modules || jsonb_build_object('schedule', v_payload);
  end if;

  if 'facilitators' = any(v_enabled_modules) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', title,
      'role', subtitle,
      'bio', description,
      'imageRef', case
        when image_ref is null then null
        else regexp_replace(image_ref, '/draft\.([a-zA-Z0-9]+)$', '/published.\1')
      end
    ) order by sort_order, created_at), '[]'::jsonb)
    into v_payload
    from public.module_items where tenant_id = p_tenant_id and module_key = 'facilitators';
    v_modules := v_modules || jsonb_build_object('facilitators', v_payload);
  end if;

  if 'meals' = any(v_enabled_modules) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', title,
      'mealType', metadata->>'mealType',
      'startTime', metadata->>'startTime',
      'endTime', metadata->>'endTime',
      'description', description,
      'imageRef', case
        when image_ref is null then null
        else regexp_replace(image_ref, '/draft\.([a-zA-Z0-9]+)$', '/published.\1')
      end,
      'dietaryTags', coalesce(metadata->'dietaryTags', '[]'::jsonb),
      'location', metadata->>'location'
    ) order by sort_order, created_at), '[]'::jsonb)
    into v_payload
    from public.module_items where tenant_id = p_tenant_id and module_key = 'meals';
    v_modules := v_modules || jsonb_build_object('meals', v_payload);
  end if;

  if 'treatments' = any(v_enabled_modules) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', title,
      'shortDescription', subtitle,
      'description', description,
      'durationMinutes', case when metadata->>'durationMinutes' is null then null else (metadata->>'durationMinutes')::int end,
      'imageRef', case
        when image_ref is null then null
        else regexp_replace(image_ref, '/draft\.([a-zA-Z0-9]+)$', '/published.\1')
      end,
      'provider', metadata->>'provider',
      'location', metadata->>'location',
      'bookingInfo', metadata->>'bookingInfo'
    ) order by sort_order, created_at), '[]'::jsonb)
    into v_payload
    from public.module_items where tenant_id = p_tenant_id and module_key = 'treatments';
    v_modules := v_modules || jsonb_build_object('treatments', v_payload);
  end if;

  if 'facilities' = any(v_enabled_modules) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', title,
      'description', description,
      'imageRef', case
        when image_ref is null then null
        else regexp_replace(image_ref, '/draft\.([a-zA-Z0-9]+)$', '/published.\1')
      end,
      'openingHours', metadata->>'openingHours',
      'location', metadata->>'location',
      'importantInfo', metadata->>'importantInfo'
    ) order by sort_order, created_at), '[]'::jsonb)
    into v_payload
    from public.module_items where tenant_id = p_tenant_id and module_key = 'facilities';
    v_modules := v_modules || jsonb_build_object('facilities', v_payload);
  end if;

  if 'arrivalInfo' = any(v_enabled_modules) then
    select data into v_payload
    from public.module_settings where tenant_id = p_tenant_id and module_key = 'arrivalInfo';
    v_modules := v_modules || jsonb_build_object('arrivalInfo', coalesce(v_payload, '{}'::jsonb));
  end if;

  insert into public.published_spaces (
    tenant_id, product_type, name, slug, theme, timezone, enabled_modules, modules, published_at
  ) values (
    p_tenant_id,
    v_tenant.product_type,
    v_tenant.name,
    v_tenant.slug,
    jsonb_build_object(
      'palette', coalesce(v_brand.palette, 'forest-sage'),
      'atmosphere', coalesce(v_brand.atmosphere, 'calm-organic'),
      'imageStyle', coalesce(v_brand.image_style, 'rounded')
    ),
    coalesce(v_tenant.timezone, 'UTC'),
    v_enabled_modules,
    v_modules,
    v_published_at
  )
  on conflict (tenant_id) do update set
    product_type = excluded.product_type,
    name = excluded.name,
    slug = excluded.slug,
    theme = excluded.theme,
    timezone = excluded.timezone,
    enabled_modules = excluded.enabled_modules,
    modules = excluded.modules,
    published_at = excluded.published_at;

  update public.tenants set status = 'live' where id = p_tenant_id;

  return v_published_at;
end;
$$;

-- publish_space()'s own grant/revoke pair is unchanged from 0005 (still
-- authenticated-only) - create or replace does not reset function
-- privileges, but re-asserting here costs nothing and keeps this
-- migration self-contained.
revoke all on function public.publish_space(uuid) from public;
revoke execute on function public.publish_space(uuid) from anon;
grant execute on function public.publish_space(uuid) to authenticated;

-- ===========================================================================
-- 6. Grandfathering backfill - MIGRATION-TIME ONLY. Runs exactly once,
--    right now, against tenants that already exist at the moment this
--    migration is applied. It is not a trigger, does not re-run, and does
--    NOT apply to any tenant created after this point - a brand-new
--    tenant created the moment after this migration finishes gets no
--    entitlement row at all (inactive), per Phase 1 adjustment #1.
--
--    365 days is a one-time transition allowance so this migration cannot
--    suddenly block Spaces already in active development/review (Review
--    Retreat, Browser Verify Retreat, and any other existing tenant) -
--    it is NOT a product default and must never be used as the duration
--    for a real complimentary-code redemption or any future default
--    grant.
-- ===========================================================================
insert into public.space_entitlements (tenant_id, access_type, starts_at, access_ends_at)
select id, 'complimentary', now(), now() + interval '365 days'
from public.tenants
where not exists (
  select 1 from public.space_entitlements se where se.tenant_id = tenants.id
)
on conflict (tenant_id) do nothing;

-- ---------------------------------------------------------------------
-- Deliberately NOT part of this migration (Phase 1 scope, confirmed):
--  - No Stripe integration, no billing, no checkout.
--  - No change to Guest-route rendering - the Production preview gate
--    still covers public availability. Wiring
--    src/lib/entitlements/availability.ts's deriveCommercialAvailability()
--    into the Guest route is a mandatory follow-up batch, required before
--    the Production preview gate can ever be removed (Phase 1 adjustment
--    #7) - it must never be re-implemented separately there.
--  - No deletion of any tenant data, ever, on expiration.
-- ---------------------------------------------------------------------
