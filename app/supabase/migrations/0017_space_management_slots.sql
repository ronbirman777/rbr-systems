-- Task 011 — Space Management, Navigation, Lifecycle and Slot Foundation
--
-- Confirmed product decisions (Ron, 2026-09-23):
--   A. Every NEW user starts with slots_allowed = 1. Preserves today's
--      working self-service signup flow before Billing exists. Billing/
--      Task 012 becomes the sole future authority for changing this.
--   B. Archive continues consuming its slot. Archive is retention, never a
--      capacity-release mechanism. Replace Space is the supported way to
--      discard an existing Space's content and reuse the same slot.
--   C. (Revised same day, after Ron reviewed the Preview state of an
--      account that already owned 2 pre-existing Spaces and saw it appear
--      over-limit under a flat default-1 backfill.) The MIGRATION-TIME
--      backfill for accounts that already exist when 0017 is applied is
--      NOT a flat 1 — it is `slots_allowed = GREATEST(1, current number
--      of Spaces that user already owns)`, so applying this migration
--      never itself pushes a legitimate pre-existing account into an
--      over-limit state. This is an explicit one-time migration-
--      compatibility rule, not a change to the ongoing product rule: a
--      brand new user created AFTER this migration still gets exactly 1
--      via the column default (see the bootstrap-on-first-attempt logic
--      in enforce_space_slot_capacity() below, unchanged from the
--      original design) — only the one-time backfill computation for
--      pre-existing accounts changed.
--
-- Never edit 0001-0016. Forward-only.

-- =============================================================================
-- 1. Per-user Space slot allowance — a minimal, pre-Accounts abstraction.
--    `slots_allowed` is authoritative and never written by ordinary clients.
--    `slots_used`/`slots_available` are always derived (COUNT of owned
--    tenants / GREATEST(0, allowed - used)), never persisted redundantly.
-- =============================================================================
create table public.user_space_slots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  slots_allowed integer not null default 1 check (slots_allowed >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_space_slots enable row level security;

create policy "user_space_slots: users can select their own row"
  on public.user_space_slots for select
  using (user_id = auth.uid());

-- No insert/update/delete policy for authenticated/anon on this table by
-- design: the only authorized writers are the SECURITY DEFINER functions
-- below (bootstrap-on-first-attempt) and, in the future, a Billing/Task 012
-- authority. An ordinary client can never set its own allowance.

-- Migration-time backfill (Decision C, revised): slots_allowed for every
-- EXISTING user = GREATEST(1, the number of Spaces they already own as
-- 'owner' in tenant_members). A user with zero existing Spaces gets the
-- ordinary default of 1; a user who already legitimately owns N Spaces
-- gets N, so this migration never itself creates an over-limit account.
-- This computation runs exactly once, here, at migration time only - it
-- is deliberately NOT how a brand-new post-migration user is bootstrapped
-- (that remains the plain default-1 column value, applied lazily on
-- their first creation attempt by enforce_space_slot_capacity() below).
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

revoke all on public.user_space_slots from public, anon;
grant select on public.user_space_slots to authenticated;

-- =============================================================================
-- 2. Archive lifecycle: add 'archived' to the existing status domain.
-- =============================================================================
alter table public.tenants drop constraint tenants_status_check;
alter table public.tenants add constraint tenants_status_check
  check (status = any (array['draft'::text, 'ready_to_publish'::text, 'live'::text, 'archived'::text]));

alter table public.tenants add column archived_at timestamptz;

-- =============================================================================
-- 3. Slot capacity enforcement — atomic, serialized, on every tenant INSERT.
--    A count-then-insert Server Action alone is insufficient (two concurrent
--    requests could both observe capacity); this trigger is the single real
--    enforcement point regardless of which code path performs the INSERT
--    (Server Action, a future RPC, or a direct authenticated client insert —
--    the existing "tenants: authenticated users can create" RLS policy is
--    intentionally left in place, but this trigger fires for every row it
--    admits, so the RLS policy alone can never bypass capacity).
-- =============================================================================
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
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  -- Bind ownership identity to the authenticated server context only —
  -- never trust a client-submitted created_by for quota purposes.
  new.created_by := v_user;

  -- Bootstrap the approved default (Decision A) the first time this user
  -- ever attempts to create a Space. This is the actual approved default,
  -- not a fallback for a query failure — an unexpected error below still
  -- aborts the whole transaction (fails closed) rather than falling
  -- through to an implicit allow.
  insert into public.user_space_slots (user_id) values (v_user)
    on conflict (user_id) do nothing;

  -- Lock this user's row for the rest of this transaction so two
  -- concurrent creation attempts by the same user serialize: the second
  -- transaction blocks here until the first commits or rolls back, then
  -- re-reads/re-counts under its own fresh statement snapshot.
  select slots_allowed into v_allowed
    from public.user_space_slots
    where user_id = v_user
    for update;

  if not found then
    -- Unreachable after the insert above under normal operation; fail
    -- closed rather than silently allow if it somehow still doesn't exist.
    raise exception 'Space slot allowance could not be established' using errcode = 'P0001';
  end if;

  -- Every currently-owned tenant counts toward usage regardless of status
  -- — draft, ready_to_publish, live, or archived (Decision B: archive
  -- keeps consuming its slot). Draft + published snapshot of the SAME
  -- tenant is naturally one row here, never double-counted.
  select count(*) into v_used
    from public.tenant_members
    where user_id = v_user and role = 'owner';

  if v_used >= v_allowed then
    raise exception 'No available Space slots' using errcode = 'P0001', hint = 'SLOT_LIMIT_REACHED';
  end if;

  return new;
end;
$$;

create trigger enforce_space_slot_capacity_trigger
  before insert on public.tenants
  for each row
  execute function public.enforce_space_slot_capacity();

revoke all on function public.enforce_space_slot_capacity() from public, anon, authenticated;

-- =============================================================================
-- 4. Archive / Restore / Replace — owner-only SECURITY DEFINER RPCs.
-- =============================================================================

create or replace function public.archive_space(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_tenant_owner(p_tenant_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  update public.tenants
    set status = 'archived', archived_at = now(), updated_at = now()
    where id = p_tenant_id and status <> 'archived';
end;
$$;

-- Restore is included as the necessary counterpart to Archive (an archived
-- Space is meaningless if it can never return to normal use) but does not
-- change slot usage — an archived tenant already counts toward capacity
-- per Decision B, so restoring it adds no new usage. Capacity is
-- re-verified defensively (e.g. if slots_allowed was ever lowered while
-- archived) using the identical lock/count pattern as creation.
create or replace function public.restore_space(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user uuid;
  v_allowed integer;
  v_used integer;
begin
  v_user := auth.uid();
  if not public.is_tenant_owner(p_tenant_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

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

  -- v_used already includes this archived tenant (it was never removed
  -- from tenant_members), so the comparison is strictly greater-than, not
  -- greater-or-equal — restoring never adds a new owned tenant.
  if v_used > v_allowed then
    raise exception 'No available Space slots' using errcode = 'P0001', hint = 'SLOT_LIMIT_REACHED';
  end if;

  update public.tenants
    set status = 'draft', archived_at = null, updated_at = now()
    where id = p_tenant_id and status = 'archived';
end;
$$;

-- Replace: the supported way to discard an existing Space's content and
-- reuse the same slot, per Decision B. Same tenant identity is kept
-- (slot continuity, no new INSERT so the capacity trigger never fires) —
-- deliberately NOT touched: space_entitlements (no silent grant reset/
-- extension), access_code_redemptions (audit trail integrity),
-- tenant_members (ownership continuity). The old published snapshot is
-- deleted (closing all public/Guest reachability for the old content
-- immediately — the same guest routes/media route/published_spaces RLS
-- that gate a normal unpublished draft), Guest Access is reset to public/
-- no-code (a stale code must never silently protect new content or vice
-- versa), and content/brand tables are reset to an empty draft. The old
-- public slug is released (set to null) so it does not silently carry
-- over to unrelated new content without a fresh, deliberate choice.
create or replace function public.replace_space(p_tenant_id uuid, p_new_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_tenant_owner(p_tenant_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  delete from public.published_spaces where tenant_id = p_tenant_id;
  delete from public.module_items where tenant_id = p_tenant_id;
  delete from public.module_settings where tenant_id = p_tenant_id;
  delete from public.schedule_items where tenant_id = p_tenant_id;
  update public.module_configs set enabled = false where tenant_id = p_tenant_id;

  update public.space_guest_access
    set mode = 'public', code_hash = null, version = version + 1, updated_at = now()
    where tenant_id = p_tenant_id;

  update public.brand_configs
    set name = '',
        logo_ref = null,
        hero_image_ref = null,
        space_image_ref = null,
        palette = 'forest-sage',
        atmosphere = 'calm-organic',
        image_style = 'rounded',
        custom_primary = null,
        custom_secondary = null,
        custom_navigation = null,
        custom_text = null,
        updated_at = now()
    where tenant_id = p_tenant_id;

  update public.tenants
    set name = coalesce(nullif(trim(p_new_name), ''), 'Untitled Retreat'),
        status = 'draft',
        slug = null,
        archived_at = null,
        updated_at = now(),
        content_updated_at = now()
    where id = p_tenant_id;
end;
$$;

revoke all on function public.archive_space(uuid) from public, anon;
revoke all on function public.restore_space(uuid) from public, anon;
revoke all on function public.replace_space(uuid, text) from public, anon;
grant execute on function public.archive_space(uuid) to authenticated;
grant execute on function public.restore_space(uuid) to authenticated;
grant execute on function public.replace_space(uuid, text) to authenticated;

-- =============================================================================
-- 5. Block content/publish/Guest-Access/Featured writes on an archived
--    tenant at the database layer, not just by hiding controls in the UI
--    (Task 011: "apply DB protections against direct lifecycle/status/
--    ownership edits... block prohibited save/upload/publish/Featured/
--    code-setting paths, not just page navigation"). A single reusable
--    STABLE helper, mirroring is_tenant_owner()/is_tenant_member()'s own
--    shape, keeps every policy/function below in agreement with exactly
--    one definition of "archived". SECURITY DEFINER is not just style
--    here - it is required correctness: an anonymous or non-member caller
--    has no SELECT access to `tenants` at all, so a plain (non-DEFINER)
--    subquery against `tenants` from an anon-facing policy would always
--    evaluate as "no matching row" regardless of real archive status,
--    silently hiding everything instead of only archived rows. Verified
--    against exactly this failure mode in isolated local testing before
--    this fix (see 011/evidence/local-verification.md) - the first draft
--    of the published_spaces policy below used a raw subquery and, when
--    tested as the `anon` role, incorrectly returned zero rows for a
--    genuinely published, non-archived Space.
-- =============================================================================
create or replace function public.tenant_is_archived(check_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.tenants
    where id = check_tenant_id and status = 'archived'
  );
$$;

-- Unlike the other new functions in this migration, `anon` genuinely
-- needs EXECUTE here: it is called from the public "anyone can read
-- non-archived" published_spaces policy below, and even a SECURITY
-- DEFINER function still requires the CALLING role to hold EXECUTE on it
-- - SECURITY DEFINER only changes whose privileges the function BODY
-- runs with, not who may invoke it. Verified in isolated local testing:
-- omitting this grant produced "permission denied for function
-- tenant_is_archived" for every anonymous Guest request, which would
-- have broken every published Space, not just archived ones.
revoke all on function public.tenant_is_archived(uuid) from public;
grant execute on function public.tenant_is_archived(uuid) to authenticated, anon;

-- =============================================================================
-- 6. Close the direct-anonymous-read gap: an archived tenant's published
--    snapshot must not remain readable through the public/anon client even
--    though hiding it from the dashboard and 404-ing the Next.js route
--    already happen at the application layer. This is the actual
--    enforcement point for /g/[tenantId], /s/[slug], wildcard-host
--    rewrites, and /api/media/[...path] (all of which read published_spaces
--    through the plain public/anon client, never bypassing RLS) — no
--    application-code change to those routes is required for this gap.
--    Uses tenant_is_archived() (SECURITY DEFINER, above) rather than a
--    raw subquery against `tenants` for the exact reason documented on
--    that function.
-- =============================================================================
drop policy "published_spaces: anyone can read" on public.published_spaces;

create policy "published_spaces: anyone can read non-archived"
  on public.published_spaces for select
  using (not tenant_is_archived(tenant_id));

-- brand_configs
drop policy "brand_configs: members can update" on public.brand_configs;
create policy "brand_configs: members can update"
  on public.brand_configs for update
  using (is_tenant_member(tenant_id) and not tenant_is_archived(tenant_id));

drop policy "brand_configs: members can upsert" on public.brand_configs;
create policy "brand_configs: members can upsert"
  on public.brand_configs for insert
  with check (is_tenant_member(tenant_id) and not tenant_is_archived(tenant_id));

-- module_configs
drop policy "module_configs: members can update" on public.module_configs;
create policy "module_configs: members can update"
  on public.module_configs for update
  using (is_tenant_member(tenant_id) and not tenant_is_archived(tenant_id));

drop policy "module_configs: members can upsert" on public.module_configs;
create policy "module_configs: members can upsert"
  on public.module_configs for insert
  with check (is_tenant_member(tenant_id) and not tenant_is_archived(tenant_id));

-- module_items
drop policy "module_items: members can insert" on public.module_items;
create policy "module_items: members can insert"
  on public.module_items for insert
  with check (is_tenant_member(tenant_id) and not tenant_is_archived(tenant_id));

drop policy "module_items: members can update" on public.module_items;
create policy "module_items: members can update"
  on public.module_items for update
  using (is_tenant_member(tenant_id) and not tenant_is_archived(tenant_id));

drop policy "module_items: members can delete" on public.module_items;
create policy "module_items: members can delete"
  on public.module_items for delete
  using (is_tenant_member(tenant_id) and not tenant_is_archived(tenant_id));

-- module_settings
drop policy "module_settings: members can insert" on public.module_settings;
create policy "module_settings: members can insert"
  on public.module_settings for insert
  with check (is_tenant_member(tenant_id) and not tenant_is_archived(tenant_id));

drop policy "module_settings: members can update" on public.module_settings;
create policy "module_settings: members can update"
  on public.module_settings for update
  using (is_tenant_member(tenant_id) and not tenant_is_archived(tenant_id));

drop policy "module_settings: members can delete" on public.module_settings;
create policy "module_settings: members can delete"
  on public.module_settings for delete
  using (is_tenant_member(tenant_id) and not tenant_is_archived(tenant_id));

-- schedule_items
drop policy "schedule_items: members can insert" on public.schedule_items;
create policy "schedule_items: members can insert"
  on public.schedule_items for insert
  with check (is_tenant_member(tenant_id) and not tenant_is_archived(tenant_id));

drop policy "schedule_items: members can update" on public.schedule_items;
create policy "schedule_items: members can update"
  on public.schedule_items for update
  using (is_tenant_member(tenant_id) and not tenant_is_archived(tenant_id));

drop policy "schedule_items: members can delete" on public.schedule_items;
create policy "schedule_items: members can delete"
  on public.schedule_items for delete
  using (is_tenant_member(tenant_id) and not tenant_is_archived(tenant_id));

-- published_spaces: publish/republish must not resurrect an archived
-- Space's public reachability, and unpublish remains allowed (an owner
-- can still remove their own archived Space's stale snapshot row).
drop policy "published_spaces: owner can publish" on public.published_spaces;
create policy "published_spaces: owner can publish"
  on public.published_spaces for insert
  with check (is_tenant_owner(tenant_id) and not tenant_is_archived(tenant_id));

drop policy "published_spaces: owner can republish" on public.published_spaces;
create policy "published_spaces: owner can republish"
  on public.published_spaces for update
  using (is_tenant_owner(tenant_id) and not tenant_is_archived(tenant_id))
  with check (is_tenant_owner(tenant_id) and not tenant_is_archived(tenant_id));

-- Guest Access code-setting RPCs (0016) - re-defined with CREATE OR
-- REPLACE (preserves existing grants) to add the identical archived
-- check every other write path above now has.
create or replace function public.set_guest_access_code(p_tenant_id uuid, p_code text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_tenant_owner(p_tenant_id) then raise exception 'not authorized'; end if;
  if public.tenant_is_archived(p_tenant_id) then raise exception 'Space is archived'; end if;
  if p_code !~ '^[0-9]{6}$' then raise exception 'code must be exactly 6 digits'; end if;
  insert into public.space_guest_access (tenant_id, mode, code_hash, version, updated_at)
    values (p_tenant_id, 'code', extensions.crypt(p_code, extensions.gen_salt('bf', 10)), 1, now())
  on conflict (tenant_id) do update set
    mode = 'code', code_hash = extensions.crypt(p_code, extensions.gen_salt('bf', 10)),
    version = space_guest_access.version + 1, updated_at = now();
end;
$$;

create or replace function public.disable_guest_access_code(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_tenant_owner(p_tenant_id) then raise exception 'not authorized'; end if;
  -- Disabling a code (returning to public mode) is still allowed on an
  -- archived tenant - it is a strictly more restrictive/neutral action
  -- (and archived tenants are already unreachable regardless of mode via
  -- isSpacePubliclyAvailable() and the published_spaces RLS change
  -- above), so there is no reason to block it and every reason to allow
  -- an owner to clean up guest access state on their own archived Space.
  update public.space_guest_access
    set mode = 'public', code_hash = null, version = version + 1, updated_at = now()
    where tenant_id = p_tenant_id;
end;
$$;

-- Featured submission RPC (0016) - same treatment.
create or replace function public.submit_featured_listing(
  p_tenant_id uuid, p_description text, p_location text, p_website text,
  p_instagram text, p_additional_links jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_tenant_owner(p_tenant_id) then raise exception 'not authorized'; end if;
  if public.tenant_is_archived(p_tenant_id) then raise exception 'Space is archived'; end if;
  insert into public.space_featured_submissions
    (tenant_id, status, description, location, website, instagram, additional_links, submitted_at, reviewed_at, reviewed_by, updated_at)
  values (p_tenant_id, 'submitted', p_description, p_location, p_website, p_instagram,
    coalesce(p_additional_links, '[]'::jsonb), now(), null, null, now())
  on conflict (tenant_id) do update set
    status = 'submitted', description = excluded.description, location = excluded.location,
    website = excluded.website, instagram = excluded.instagram,
    additional_links = excluded.additional_links, submitted_at = now(),
    reviewed_at = null, reviewed_by = null, updated_at = now();
end;
$$;
