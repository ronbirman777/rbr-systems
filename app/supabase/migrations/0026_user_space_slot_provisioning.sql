-- Task 021 — Provision the shared Space slot entitlement at account creation.
--
-- Root cause: public.user_space_slots (0017) had exactly two writers - the
-- one-time 0017 backfill (existing accounts only) and a lazy bootstrap inside
-- enforce_space_slot_capacity(), which only runs on a tenants INSERT. But every
-- read-side capacity check (getSpaceSlotSummary -> /create, /space, Studio)
-- deliberately fails closed on a MISSING row (0 allowed). A brand-new account
-- therefore had no row, saw "0 of 0 Space slots" on /create, and could never
-- reach the tenants INSERT that would have created it. Deadlock.
--
-- Fix: create the row when the account is created, using the same
-- authoritative default the schema already defines (slots_allowed DEFAULT 1,
-- 0017 Decision A). No default is restated or invented here - the column
-- default is the single source of truth.
--
-- Semantics (deliberately narrow):
--   * Provision ONLY when the row is missing (ON CONFLICT DO NOTHING). An
--     existing row - including an explicit slots_allowed = 0 - is never
--     touched, so this can neither raise nor reset a valid entitlement.
--   * Atomic with user creation (same transaction as the auth.users insert),
--     idempotent, and safe under concurrency (primary key on user_id).
--   * Product-agnostic: keyed on the account, not on any product (Flow, Teach,
--     ...). Billing remains the sole future authority for changing
--     slots_allowed; this migration never changes an allowance.
--
-- Forward-only. Never edit 0001-0025.

create or replace function public.provision_user_space_slot()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.user_space_slots (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- Trigger-only function: nobody should be able to call it directly.
revoke all on function public.provision_user_space_slot() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_space_slot on auth.users;
create trigger on_auth_user_created_space_slot
  after insert on auth.users
  for each row execute function public.provision_user_space_slot();

-- One-time, idempotent repair for legacy accounts that have no row (created
-- after the 0017 backfill and before this trigger existed). Same formula as
-- the 0017 backfill: GREATEST(1, owned Spaces), so a repaired account is never
-- created over-limit. Rows that already exist - including zero-capacity rows -
-- are left exactly as they are. Safe to re-run: a second run inserts nothing.
insert into public.user_space_slots (user_id, slots_allowed)
select
  u.id,
  greatest(1, coalesce(owned.owned_count, 0))
from auth.users u
left join (
  select user_id, count(*) as owned_count
  from public.tenant_members
  where role = 'owner'
  group by user_id
) owned on owned.user_id = u.id
on conflict (user_id) do nothing;
