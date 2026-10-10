-- Rollback for 0044_billing_definer_rpc_guards.sql (TASK 032).
-- Do NOT run unless the migration needs to be reverted. Rollback is NEVER
-- automatic: nothing in CI, the Supabase CLI or the application runs files in
-- supabase/verification/. A human runs it deliberately, after the checks below.
--
-- Read docs/billing/MIGRATION-RECOVERY.md first. A forward fix (a new
-- migration that corrects the defect) is preferred over this rollback.
--
-- ORDER: TASK 032 rollbacks run in strict reverse order, one at a time:
--   0044 (this file) -> 0043 -> 0042 -> 0041 -> 0040 -> 0039 -> 0038 -> 0037 -> 0036.
-- This is the first one; nothing must be rolled back before it. It must run
-- BEFORE the 0038 rollback: the restated 0044 bodies call
-- space_studio_writable() (0038). The 0043 rollback refuses to run while
-- these guards are still in place.
--
-- ===========================================================================
-- WHAT 0044 CHANGED, AND WHAT THIS FILE DOES
-- ===========================================================================
--   functions (restored, never dropped):
--     set_guest_access_code(uuid, text)    - re-created from 0017_space_management_slots.sql
--     disable_guest_access_code(uuid)      - re-created from 0017_space_management_slots.sql
--     submit_featured_listing(uuid, text, text, text, text, jsonb)
--                                          - re-created from 0017_space_management_slots.sql
--   All three copied VERBATIM (body, language, security definer, search_path).
--   This is checked mechanically by src/lib/spaceTypes/billingRollback.test.ts
--   (restored body == previous body; reconstructed md5(pg_get_functiondef) ==
--   the values recorded on Staging before 0028:
--     set_guest_access_code     d5d835ac1a663482387a3d07a7006f59
--     disable_guest_access_code c5e6be2b4739200c2d6b4b29afe353b0
--     submit_featured_listing   4c81a4b7e8fd63e63305c50b50554599
--   - tasks/staging-pre0028/public-functions.txt).
--   0044 created no object and changed no grant, so nothing is dropped.
--
-- REVERSIBLE: fully. Nothing here stores or deletes data. Re-running 0044
--   (after `supabase migration repair --status reverted` for its ledger row)
--   re-applies it.
-- DATA-DESTRUCTIVE: nothing.
-- BEHAVIOUR AFTER: Guest Access set/disable and Featured submission no longer
--   consult billing at the database; the Studio actions (guestAccessActions.ts,
--   featuredActions.ts) still ask space_studio_writable() first - exactly the
--   pre-0044 behaviour.
--
-- ===========================================================================
-- PREREQUISITES (all must hold; the guard below re-checks what SQL can see)
-- ===========================================================================
--   1. billing_settings.paid_checkout_enabled = false (paid checkout OFF).
--   2. No live paid subscription: every space_subscriptions row is 'exempt',
--      'canceled' or 'incomplete_expired'.
--   3. A fresh backup / PITR point exists and its time is recorded.
--
-- ===========================================================================
-- STEP 1 - RUN (one transaction; refuses unless explicitly confirmed)
-- ===========================================================================
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -c "set idw.rollback_confirm = '0044'" \
--     -f supabase/verification/0044_billing_definer_rpc_guards_rollback.sql
--
-- STEP 2 - LEDGER (separate, explicit): supabase migration repair --status reverted <0044 version>
-- STEP 3 - VERIFY: the read-only query at the end of this file.

begin;

do $$
begin
  if coalesce(current_setting('idw.rollback_confirm', true), '') <> '0044' then
    raise exception 'ROLLBACK 0044 REFUSED: set idw.rollback_confirm = ''0044'' to confirm';
  end if;
  if exists (select 1 from public.billing_settings where paid_checkout_enabled) then
    raise exception 'ROLLBACK 0044 REFUSED: paid checkout is ON (billing_settings.paid_checkout_enabled)';
  end if;
  if exists (select 1 from public.space_subscriptions where status not in ('exempt', 'canceled', 'incomplete_expired')) then
    raise exception 'ROLLBACK 0044 REFUSED: a live paid subscription exists';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. set_guest_access_code(): 0017's definition, verbatim (no TASK 032 block).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2. disable_guest_access_code(): 0017's definition, verbatim.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3. submit_featured_listing(): 0017's definition, verbatim.
-- ---------------------------------------------------------------------------
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

-- Grants exactly as 0016 set them (CREATE OR REPLACE kept them; restated, idempotent).
REVOKE EXECUTE ON FUNCTION public.set_guest_access_code(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_guest_access_code(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.disable_guest_access_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disable_guest_access_code(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_featured_listing(uuid,text,text,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_featured_listing(uuid,text,text,text,text,jsonb) TO authenticated;

commit;

-- ===========================================================================
-- VERIFY (read-only). Expected: all three uses_billing_guard = false, and the
-- md5 values equal d5d835ac1a663482387a3d07a7006f59 (set_guest_access_code),
-- c5e6be2b4739200c2d6b4b29afe353b0 (disable_guest_access_code) and
-- 4c81a4b7e8fd63e63305c50b50554599 (submit_featured_listing).
-- ===========================================================================
select p.proname, md5(pg_get_functiondef(p.oid)) as functiondef_md5,
       position('BILLING_LOCKED' in pg_get_functiondef(p.oid)) > 0 as uses_billing_guard
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('set_guest_access_code', 'disable_guest_access_code', 'submit_featured_listing');
