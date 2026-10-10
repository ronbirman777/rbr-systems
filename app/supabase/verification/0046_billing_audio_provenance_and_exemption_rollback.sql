-- Rollback for 0046_billing_audio_provenance_and_exemption.sql (TASK 032).
-- Do NOT run unless the migration needs to be reverted. Rollback is NEVER
-- automatic: nothing in CI, the Supabase CLI or the application runs files in
-- supabase/verification/. A human runs it deliberately, after the checks below.
--
-- Read docs/billing/MIGRATION-RECOVERY.md first. A forward fix (a new
-- migration that corrects the defect) is preferred over this rollback.
--
-- ORDER: TASK 032 rollbacks run in strict reverse order, one at a time:
--   0046 (this file) -> 0045 -> 0044 -> 0043 -> 0042 -> 0041 -> 0040 -> 0039 -> 0038 -> 0037 -> 0036.
-- This is the first one; nothing must be rolled back before it. The 0045
-- rollback refuses while public.billing_audio_verifications (0046) exists.
--
-- ===========================================================================
-- WHAT 0046 CHANGED, AND WHAT THIS FILE DOES
-- ===========================================================================
--   function billing_guard_module_item_audio() (restated) - restored to the
--            0043 definition, verbatim
--   function billing_audio_assert_publishable(uuid, jsonb) (restated) -
--            restored to the 0043 definition, verbatim
--   function replace_space(uuid, text) (restated) - restored to the 0042
--            definition, verbatim
--   function billing_audio_attach_verified(uuid, uuid, jsonb, bigint, text) - dropped
--   function billing_audio_backfill_record(text, uuid, uuid, text, integer, bigint, text, text) - dropped
--   trigger  billing_space_subscriptions_fresh_enforcement on space_subscriptions - dropped
--   function billing_guard_subscription_enforcement() - dropped (after its trigger)
--   table    billing_audio_backfill_findings - dropped (backfill audit rows)
--   table    billing_audio_verifications - dropped (server provenance rows,
--            including the published_size_bytes / published_sha256 /
--            published_etag / published_verified_at columns: a published copy's
--            recorded fingerprint goes with them; after re-applying 0046 the
--            next publish simply re-hashes)
--   The functions are restored BEFORE the table they read is dropped.
--
-- REVERSIBLE: the code fully. DATA: the two tables are dropped with their
--   rows. Provenance is re-derivable (re-attach, or re-run the backfill after
--   re-applying 0046); export billing_audio_backfill_findings first if its
--   audit rows must be kept:
--     \copy (select * from public.billing_audio_backfill_findings) to 'findings-0046.csv' csv header
--   No module_items row, duration, snapshot or Storage object is touched.
--
-- BEHAVIOUR AFTER: the 0043/0045 state. Paid-Space audio is judged by the
--   stored durationSeconds alone (browser-reported lengths on old rows are
--   accepted again), an exempt Space can be replaced again, and the
--   database no longer refuses a paid row on a Space that already holds
--   media (the application never does that; see 0046 section H). The
--   application release that calls billing_audio_attach_verified() must be
--   rolled back FIRST (its finalize write would fail once the function is
--   gone; attach refuses, fail closed), or this rollback must be followed by
--   a forward fix.
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
--     -c "set idw.rollback_confirm = '0046'" \
--     -f supabase/verification/0046_billing_audio_provenance_and_exemption_rollback.sql
--
-- STEP 2 - LEDGER (separate, explicit): supabase migration repair --status reverted <0046 version>
-- STEP 3 - VERIFY: the read-only queries at the end of this file.

begin;

do $$
begin
  if coalesce(current_setting('idw.rollback_confirm', true), '') <> '0046' then
    raise exception 'ROLLBACK 0046 REFUSED: set idw.rollback_confirm = ''0046'' to confirm';
  end if;
  if exists (select 1 from public.billing_settings where paid_checkout_enabled) then
    raise exception 'ROLLBACK 0046 REFUSED: paid checkout is ON (billing_settings.paid_checkout_enabled)';
  end if;
  if exists (select 1 from public.space_subscriptions where status not in ('exempt', 'canceled', 'incomplete_expired')) then
    raise exception 'ROLLBACK 0046 REFUSED: a live paid subscription exists';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. billing_guard_module_item_audio(): 0043's definition, verbatim.
-- ---------------------------------------------------------------------------
create or replace function public.billing_guard_module_item_audio()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ref jsonb := nullif(new.metadata -> 'audioRef', 'null'::jsonb);
  v_dur jsonb := nullif(new.metadata -> 'durationSeconds', 'null'::jsonb);
  v_policy record;
  v_seconds numeric;
  v_others numeric;
begin
  if tg_op = 'UPDATE' then
    if new.tenant_id = old.tenant_id
       and v_ref is not distinct from nullif(old.metadata -> 'audioRef', 'null'::jsonb)
       and v_dur is not distinct from nullif(old.metadata -> 'durationSeconds', 'null'::jsonb) then
      return new; -- the file fields are untouched (every ordinary text save)
    end if;
  end if;

  if v_ref is null then
    return new; -- no file on the row after this write: nothing to limit (detach, plain items)
  end if;

  select p.mode, p.library_seconds, p.max_recording_seconds into v_policy
  from public.billing_audio_policy(new.tenant_id) p;
  if v_policy.mode in ('legacy', 'exempt') then
    return new; -- unchanged behaviour for Spaces billing does not govern
  end if;

  -- current_user is the effective role PostgREST switched to for this
  -- request; a member session is always 'authenticated'.
  if current_user in ('authenticated', 'anon') then
    -- An upsert hitting an existing row reaches the BEFORE UPDATE trigger
    -- next, which judges the actual change (a carried-over file passes).
    if tg_op = 'INSERT' and exists (select 1 from public.module_items i where i.id = new.id) then
      return new;
    end if;
    raise exception 'Audio files on this Space can only be attached through the Studio upload'
      using errcode = 'P0001', hint = 'AUDIO_SERVER_ONLY';
  end if;

  -- Trusted writer (the service-role finalize path): re-check the limits.
  if v_policy.mode is distinct from 'enforced' then
    raise exception 'This Space''s audio allowance could not be read' using errcode = 'P0001', hint = 'AUDIO_LIMIT';
  end if;
  if jsonb_typeof(v_ref) <> 'string' or v_dur is null or jsonb_typeof(v_dur) <> 'number' then
    raise exception 'An attached recording must have a known length' using errcode = 'P0001', hint = 'AUDIO_LIMIT';
  end if;
  v_seconds := (v_dur #>> '{}')::numeric;
  if v_seconds < 0 or v_seconds <> trunc(v_seconds) or v_seconds > v_policy.max_recording_seconds then
    raise exception 'A recording can be at most % seconds long', v_policy.max_recording_seconds
      using errcode = 'P0001', hint = 'AUDIO_LIMIT';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('idw.audio_library:' || new.tenant_id::text, 0));
  select coalesce(sum(case when jsonb_typeof(i.metadata -> 'durationSeconds') = 'number'
                           then (i.metadata ->> 'durationSeconds')::numeric else 0 end), 0)
  into v_others
  from public.module_items i
  where i.tenant_id = new.tenant_id
    and i.id <> new.id
    and jsonb_typeof(i.metadata -> 'audioRef') = 'string';
  if v_others + v_seconds > v_policy.library_seconds then
    raise exception 'This recording would take the Space''s audio library over its % second allowance', v_policy.library_seconds
      using errcode = 'P0001', hint = 'AUDIO_LIMIT';
  end if;
  return new;
end;
$$;
revoke all on function public.billing_guard_module_item_audio() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. billing_audio_assert_publishable(): 0043's definition, verbatim.
-- ---------------------------------------------------------------------------
create or replace function public.billing_audio_assert_publishable(p_tenant_id uuid, p_modules jsonb)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_policy record;
  v_row record;
  v_seconds numeric;
  v_total numeric := 0;
  v_allowed text[] := '{}';
  v_found jsonb;
begin
  select p.mode, p.library_seconds, p.max_recording_seconds into v_policy
  from public.billing_audio_policy(p_tenant_id) p;
  if v_policy.mode in ('legacy', 'exempt') then
    return;
  end if;
  if v_policy.mode is distinct from 'enforced' then
    raise exception 'This Space''s audio allowance could not be checked' using errcode = 'P0001', hint = 'AUDIO_LIMIT';
  end if;

  for v_row in
    select i.metadata -> 'audioRef' as ref, i.metadata -> 'durationSeconds' as dur
    from public.module_items i
    where i.tenant_id = p_tenant_id
      and nullif(i.metadata -> 'audioRef', 'null'::jsonb) is not null
  loop
    if jsonb_typeof(v_row.ref) <> 'string' then
      raise exception 'A recording reference is malformed; upload it again' using errcode = 'P0001', hint = 'AUDIO_LIMIT';
    end if;
    if v_row.dur is null or jsonb_typeof(v_row.dur) <> 'number' then
      raise exception 'Some recordings have no known length; upload them again before publishing' using errcode = 'P0001', hint = 'AUDIO_LIMIT';
    end if;
    v_seconds := (v_row.dur #>> '{}')::numeric;
    if v_seconds < 0 or v_seconds <> trunc(v_seconds) or v_seconds > v_policy.max_recording_seconds then
      raise exception 'A recording is longer than % seconds', v_policy.max_recording_seconds using errcode = 'P0001', hint = 'AUDIO_LIMIT';
    end if;
    v_total := v_total + v_seconds;
    v_allowed := v_allowed
      || (v_row.ref #>> '{}')
      || regexp_replace(v_row.ref #>> '{}', '/draft\.([a-zA-Z0-9]+)$', '/published.\1');
  end loop;
  if v_total > v_policy.library_seconds then
    raise exception 'The recordings add up to % seconds, over this Space''s % second audio allowance', v_total, v_policy.library_seconds
      using errcode = 'P0001', hint = 'AUDIO_LIMIT';
  end if;

  -- Every "audioRef" anywhere in the snapshot being published (module
  -- payloads, Teach payload, settings objects) must be one of the files
  -- counted above: an audio file cannot be published from anywhere else.
  for v_found in select jsonb_path_query(coalesce(p_modules, '{}'::jsonb), '$.**.audioRef') loop
    continue when v_found = 'null'::jsonb;
    if jsonb_typeof(v_found) <> 'string' or not ((v_found #>> '{}') = any (v_allowed)) then
      raise exception 'The published snapshot references an audio file outside the Space''s counted library'
        using errcode = 'P0001', hint = 'AUDIO_LIMIT';
    end if;
  end loop;
end;
$$;
revoke all on function public.billing_audio_assert_publishable(uuid, jsonb) from public, anon;
grant execute on function public.billing_audio_assert_publishable(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. replace_space(): 0042's definition, verbatim.
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

  -- >>> TASK 032 (0042): a Space whose Studio billing has suspended/ended
  -- cannot be reset. True for every Space billing does not decide (legacy).
  if not public.space_studio_writable(p_tenant_id) then
    raise exception 'Billing must be resolved before this Space can be replaced' using errcode = 'P0001', hint = 'BILLING_LOCKED';
  end if;
  -- <<< TASK 032 (0042)

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
revoke all on function public.replace_space(uuid, text) from public, anon;
grant execute on function public.replace_space(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Objects 0046 created. No CASCADE anywhere: an unexpected dependent makes
--    the transaction fail.
-- ---------------------------------------------------------------------------
drop trigger billing_space_subscriptions_fresh_enforcement on public.space_subscriptions;
drop function public.billing_guard_subscription_enforcement();
drop function public.billing_audio_backfill_record(text, uuid, uuid, text, integer, bigint, text, text);
drop function public.billing_audio_attach_verified(uuid, uuid, jsonb, bigint, text);
drop table public.billing_audio_backfill_findings;
drop table public.billing_audio_verifications;

commit;

-- ===========================================================================
-- VERIFY (read-only). Expected: no rows from the first query; the restated
-- functions no longer mention the 0046 objects (second query: three rows, all false).
-- ===========================================================================
select 'function' as kind, p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('billing_audio_attach_verified', 'billing_audio_backfill_record', 'billing_guard_subscription_enforcement')
union all
select 'trigger', t.tgname from pg_trigger t where t.tgname = 'billing_space_subscriptions_fresh_enforcement'
union all
select 'table', c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('billing_audio_verifications', 'billing_audio_backfill_findings');
select p.proname, position('0046' in pg_get_functiondef(p.oid)) > 0 as still_0046
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('billing_guard_module_item_audio', 'billing_audio_assert_publishable', 'replace_space');
