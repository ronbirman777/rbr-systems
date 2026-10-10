-- Rollback for 0042_billing_space_lifecycle_guards.sql (TASK 032).
-- Do NOT run unless the migration needs to be reverted. Rollback is NEVER
-- automatic: nothing in CI, the Supabase CLI or the application runs files in
-- supabase/verification/. A human runs it deliberately, after the checks below.
--
-- Read docs/billing/MIGRATION-RECOVERY.md first. A forward fix (a new
-- migration that corrects the defect) is preferred over this rollback.
--
-- ORDER: TASK 032 rollbacks run in strict reverse order, one at a time:
--   0044 -> 0043 -> 0042 (this file) -> 0041 -> 0040 -> 0039 -> 0038 -> 0037 -> 0036.
-- The 0043 rollback (audio enforcement) must run first; this file refuses
-- while billing_audio_policy() (0043) still exists. It must run
-- BEFORE the 0038 rollback: the restated bodies call space_access_state(),
-- space_studio_writable() and billing_is_paid_checkout_required() (all 0038).
-- The 0041 rollback refuses to run while these guards are still in place.
--
-- ===========================================================================
-- WHAT 0042 CHANGED, AND WHAT THIS FILE DOES
-- ===========================================================================
--   functions (restored, never dropped):
--     restore_space(uuid)        - re-created from 0017_space_management_slots.sql
--     replace_space(uuid, text)  - re-created from 0027_replace_space_reset_module_covers.sql
--   Both copied VERBATIM (body, language, security definer, search_path). This is
--   checked mechanically by src/lib/spaceTypes/billingRollback.test.ts (restored
--   body == previous body; reconstructed md5(pg_get_functiondef) == the values
--   recorded on Staging before 0028: restore_space 9a31bcf90162a2ce7001078d1fdbcfa0,
--   replace_space 3a2af65a96d60ac2dfc90ee6f73d5236 - tasks/staging-pre0028/public-functions.txt).
--   0042 created no object and changed no grant, so nothing is dropped.
--
-- REVERSIBLE: fully. Nothing here stores or deletes data. Re-running 0042
--   (after `supabase migration repair --status reverted` for its ledger row)
--   re-applies it.
-- DATA-DESTRUCTIVE: nothing.
-- BEHAVIOUR AFTER: Restore / Replace no longer consult billing at the database
--   (the application pre-check in lifecycleActions.ts still does in paid mode),
--   and restore_space() again counts every owned Space against the legacy slot
--   allowance - exactly the pre-0042 behaviour.
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
--     -c "set idw.rollback_confirm = '0042'" \
--     -f supabase/verification/0042_billing_space_lifecycle_guards_rollback.sql
--
-- STEP 2 - LEDGER (separate, explicit): supabase migration repair --status reverted <0042 version>
-- STEP 3 - VERIFY: the read-only queries at the end of this file.

begin;

do $$
begin
  if coalesce(current_setting('idw.rollback_confirm', true), '') <> '0042' then
    raise exception 'ROLLBACK 0042 REFUSED: set idw.rollback_confirm = ''0042'' to confirm';
  end if;
  if to_regprocedure('public.billing_audio_policy(uuid)') is not null then
    raise exception 'ROLLBACK 0042 REFUSED: 0043 is still applied; run the 0043 rollback first';
  end if;
  if exists (select 1 from public.billing_settings where paid_checkout_enabled) then
    raise exception 'ROLLBACK 0042 REFUSED: paid checkout is ON (billing_settings.paid_checkout_enabled)';
  end if;
  if exists (select 1 from public.space_subscriptions where status not in ('exempt', 'canceled', 'incomplete_expired')) then
    raise exception 'ROLLBACK 0042 REFUSED: a live paid subscription exists';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. restore_space(): 0017's definition, verbatim (no TASK 032 blocks).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2. replace_space(): 0027's definition, verbatim (no TASK 032 block).
-- ---------------------------------------------------------------------------
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
  update public.module_configs
    set enabled = false, image_ref = null, image_position = null
    where tenant_id = p_tenant_id;

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

-- Grants exactly as 0017 set them (CREATE OR REPLACE kept them; restated, idempotent).
revoke all on function public.restore_space(uuid) from public, anon;
revoke all on function public.replace_space(uuid, text) from public, anon;
grant execute on function public.restore_space(uuid) to authenticated;
grant execute on function public.replace_space(uuid, text) to authenticated;

commit;

-- ===========================================================================
-- VERIFY (read-only). Expected: both uses_billing_guard = false, and the md5
-- values equal 9a31bcf90162a2ce7001078d1fdbcfa0 (restore_space) and
-- 3a2af65a96d60ac2dfc90ee6f73d5236 (replace_space).
-- ===========================================================================
select p.proname, md5(pg_get_functiondef(p.oid)) as functiondef_md5,
       position('BILLING_LOCKED' in pg_get_functiondef(p.oid)) > 0 as uses_billing_guard
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('restore_space', 'replace_space');
