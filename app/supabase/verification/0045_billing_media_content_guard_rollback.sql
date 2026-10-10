-- Rollback for 0045_billing_media_content_guard.sql (TASK 032).
-- Do NOT run unless the migration needs to be reverted. Rollback is NEVER
-- automatic: nothing in CI, the Supabase CLI or the application runs files in
-- supabase/verification/. A human runs it deliberately, after the checks below.
--
-- Read docs/billing/MIGRATION-RECOVERY.md first. A forward fix (a new
-- migration that corrects the defect) is preferred over this rollback.
--
-- ORDER: TASK 032 rollbacks run in strict reverse order, one at a time:
--   0045 (this file) -> 0044 -> 0043 -> 0042 -> 0041 -> 0040 -> 0039 -> 0038 -> 0037 -> 0036.
-- This is the first one; nothing must be rolled back before it. It must run
-- BEFORE the 0043 rollback (the 0045 trigger and Storage predicate call
-- billing_audio_policy() / billing_audio_assert_publishable()). The 0044
-- rollback refuses to run while billing_media_member_write_allowed() exists.
--
-- ===========================================================================
-- WHAT 0045 CHANGED, AND WHAT THIS FILE DOES
-- ===========================================================================
--   trigger  billing_guard_published_media on public.published_spaces - dropped
--   function billing_guard_published_media() - dropped
--   policy   "tenant media: paid spaces accept member uploads of draft audio only"
--            on storage.objects - dropped
--   policy   "tenant media: paid spaces refuse member overwrites"
--            on storage.objects - dropped
--   function billing_media_member_write_allowed(text, text) - dropped (after
--            the two policies that use it)
--   0045 restated no function and changed no grant, so nothing is restored.
--
-- REVERSIBLE: fully. Nothing here stores or deletes data; Storage objects,
--   published snapshots and every image/audio reference are untouched.
--   Re-running 0045 (after `supabase migration repair --status reverted` for
--   its ledger row) re-applies it.
-- DATA-DESTRUCTIVE: nothing.
-- BEHAVIOUR AFTER: on paid Spaces a member session can again create any
--   object in its tenant folder (and point an image reference at it), and a
--   direct owner write to published_spaces is again unchecked by the
--   database (the pre-0045 state). The application keeps working unchanged:
--   its service-role image writes and published copies simply no longer meet
--   a Storage policy, and the magic-byte checks in the Studio actions remain.
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
--     -c "set idw.rollback_confirm = '0045'" \
--     -f supabase/verification/0045_billing_media_content_guard_rollback.sql
--
-- STEP 2 - LEDGER (separate, explicit): supabase migration repair --status reverted <0045 version>
-- STEP 3 - VERIFY: the read-only query at the end of this file.

begin;

do $$
begin
  if coalesce(current_setting('idw.rollback_confirm', true), '') <> '0045' then
    raise exception 'ROLLBACK 0045 REFUSED: set idw.rollback_confirm = ''0045'' to confirm';
  end if;
  if exists (select 1 from public.billing_settings where paid_checkout_enabled) then
    raise exception 'ROLLBACK 0045 REFUSED: paid checkout is ON (billing_settings.paid_checkout_enabled)';
  end if;
  if exists (select 1 from public.space_subscriptions where status not in ('exempt', 'canceled', 'incomplete_expired')) then
    raise exception 'ROLLBACK 0045 REFUSED: a live paid subscription exists';
  end if;
end;
$$;

-- No CASCADE anywhere: an unexpected dependent makes the transaction fail.
drop trigger billing_guard_published_media on public.published_spaces;
drop function public.billing_guard_published_media();
drop policy "tenant media: paid spaces accept member uploads of draft audio only" on storage.objects;
drop policy "tenant media: paid spaces refuse member overwrites" on storage.objects;
drop function public.billing_media_member_write_allowed(text, text);

commit;

-- ===========================================================================
-- VERIFY (read-only). Expected: no rows (trigger, policies and helpers gone).
-- ===========================================================================
select 'function' as kind, p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('billing_media_member_write_allowed', 'billing_guard_published_media')
union all
select 'trigger', t.tgname from pg_trigger t where t.tgname = 'billing_guard_published_media'
union all
select 'policy', policyname from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname in ('tenant media: paid spaces accept member uploads of draft audio only', 'tenant media: paid spaces refuse member overwrites');
