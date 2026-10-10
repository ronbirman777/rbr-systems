-- TASK 032 - audio duration provenance, audio swap after measurement, and
-- exemption transfer through Replace (billing-governed Spaces).
--
-- THREE GAPS CLOSED
--
-- (1) A browser-reported duration could stand as authoritative on a paid
--     Space. 0043 made the database the authority over the per-recording and
--     library limits, but it trusted whatever durationSeconds a module_items
--     row already carried: rows attached before 0043/B4b (browser-reported
--     length), and any row attached while the Space was legacy or exempt and
--     later became paid, were accepted at publish as if the server had
--     measured them.
--
-- (2) Audio swap after measurement (residual risk recorded by 0045). The
--     finalize path measures the stored draft once; a member may still DELETE
--     its own objects (0045 restricts INSERT/UPDATE only, so detach/replace
--     keep working) and then INSERT different bytes at the same versioned
--     draft path. Publish then copied whatever bytes were there.
--
-- (3) An internal exemption transferred through Replace. replace_space()
--     resets a Space's content but keeps its space_subscriptions row, so an
--     exempt Space (granted for specific content: Lena, Return to Balance, QA)
--     could be reset and refilled with unrelated content that would inherit
--     the exemption automatically.
--
-- DESIGN
--
--   A. public.billing_audio_verifications - SERVER PROVENANCE. One row per
--      module_items row: the exact file ref, the server-measured whole-second
--      length, and a content fingerprint of the stored bytes (object size +
--      sha256), with its source ('server' = the Studio finalize path,
--      'backfill' = scripts/audio-duration-backfill.mjs) and time. A separate
--      table, not keys inside module_items.metadata, because members may
--      write module_items (RLS, 0017) and Save actions rebuild metadata: a
--      provenance key there could be forged, dropped or carried over by a
--      member write (or written on a legacy Space and kept when it becomes
--      paid). This table has RLS on, no policies, and no grant to anon or
--      authenticated: only the service role and the SECURITY DEFINER
--      functions below can write it. Rows go with their item (FK cascade), so
--      replace_space() / delete_space() / item deletion clear them.
--
--   B. billing_audio_attach_verified(...)  SECURITY DEFINER, service_role only.
--      The Studio finalize write (audioFinalize.server.ts) in ONE transaction:
--      records the provenance row, then writes module_items.metadata. If the
--      0043 trigger refuses the write (AUDIO_LIMIT) the provenance row is
--      rolled back with it. It takes the per-tenant audio lock first (same
--      order as F), requires a draft-shaped ref in the item's own folder, and
--      refuses (hint AUDIO_REUPLOAD) when a published object already exists in
--      that upload folder - also for a re-attach of the same ref - because
--      publish would adopt bytes this attach never measured.
--      The published_* columns record the PUBLISHED copy's size/sha256/ETag once
--      lib/media/publish.ts has hashed it and found it equal; a later publish
--      skips the re-hash only while Storage reports the same ETag and size.
--
--   C. billing_guard_module_item_audio() (trigger, 0043) RESTATED: the 0043
--      body byte for byte plus ONE marked block. A trusted (non-member) write
--      that sets/changes a file on an ENFORCED Space must have a matching
--      provenance row (same item, tenant, ref and whole-second length) -
--      otherwise hint AUDIO_UNVERIFIED. Member, legacy and exempt behaviour is
--      unchanged.
--
--   D. billing_audio_assert_publishable() (0043) RESTATED: the 0043 body byte
--      for byte plus ONE marked block. On an ENFORCED Space every attached
--      file must have a matching provenance row (tenant, ref, length) -
--      otherwise hint AUDIO_UNVERIFIED (publish refused; re-upload, or run the
--      backfill). The match is bound to the item (v.item_id; a second marked
--      block adds i.id to the loop's select list), so another item's provenance
--      for the same ref, or a row left behind for a detached ref, never counts. It still runs inside publish_space() (0043) and on every
--      published_spaces write (0045 trigger), so publish_space() is NOT
--      restated (its head stays 0043). Legacy / exempt return immediately, as
--      before.
--
--   E. Audio swap (application, documented here): on an enforced Space the
--      publish copy is made by the service role (0045), and from this task on
--      lib/media/publish.ts re-hashes the PUBLISHED copy it made (or found)
--      and compares size + sha256 with the provenance row. A mismatch removes
--      a copy it just created and refuses the publish ("upload it again"). A
--      member cannot create or overwrite a published object on a paid Space
--      (0045), so every published audio object a paid snapshot can name was
--      fingerprint-checked by that step (or by the backfill, which also checks
--      an existing published sibling). The database cannot hash Storage bytes;
--      draft DELETE stays member-allowed (detach/replace need it).
--
--   F. Backfill (service_role only; nothing here runs it):
--      billing_audio_backfill_record(...) stamps provenance ONLY when the
--      row's current ref and stored length equal what the script re-measured
--      from the stored bytes, and always records an audit row in
--      public.billing_audio_backfill_findings carrying the run id. It never
--      writes module_items, never changes a duration and never touches
--      Storage. A mismatch is recorded (old value kept as found) and the item
--      stays unverified until it is uploaded again. A ref outside the item's own
--      folder ({tenant}/{module}/{item}/...) is flagged, never stamped.
--
--   G. replace_space() (0042) RESTATED: the 0042 body byte for byte plus ONE
--      marked block. An exempt Space (any space_subscriptions row with status
--      'exempt', expired or not) is refused with hint
--      'EXEMPT_REPLACE_REQUIRES_ADMIN' before anything is deleted: an Admin
--      clears the exemption first (billing_clear_internal_exempt) or
--      re-approves it for the new content afterwards. Paid and legacy Spaces:
--      unchanged.
--
--   H. Invariant trigger on space_subscriptions (new function + trigger): a row
--      may only become non-exempt on a tenant with no attached audio, no
--      published snapshot and no tenant-media object (hint
--      BILLING_SPACE_HAS_MEDIA). So a Space is never enforced while holding
--      media or a snapshot that were not checked under enforcement.
--
-- No existing data is changed. Existing paid-Space audio WITHOUT provenance
-- becomes unpublishable until re-uploaded or backfilled
-- (docs/billing/AUDIO-DURATION-BACKFILL.md). Today Production has no paid
-- Spaces, so this is a no-op there pre-launch.
--
-- DEPLOY ORDER: the application release that calls billing_audio_attach_verified
-- and fingerprint-checks published audio must be deployed BEFORE this migration
-- is applied (the previous finalize write is refused by C once this is applied).
--
-- Rollback: verification/0046_billing_audio_provenance_and_exemption_rollback.sql
-- (restores the 0043 trigger/assert bodies and the 0042 replace_space body,
-- drops what this migration created). The 0045 rollback refuses while this
-- migration is applied.
--
-- Never edit 0001-0045. Forward-only.

-- ===========================================================================
-- A. Provenance table (service role / definer functions only)
-- ===========================================================================
create table public.billing_audio_verifications (
  item_id uuid primary key references public.module_items(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  audio_ref text not null check (length(audio_ref) between 1 and 512),
  duration_seconds integer not null check (duration_seconds >= 0),
  size_bytes bigint not null check (size_bytes > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  source text not null check (source in ('server', 'backfill')),
  backfill_run text check (backfill_run is null or backfill_run ~ '^[a-z0-9-]{6,64}$'),
  verified_at timestamptz not null default now(),
  -- The PUBLISHED copy (lib/media/publish.ts) once it was hashed and found equal
  -- to size_bytes/sha256: its Storage ETag lets a later publish skip re-hashing
  -- an unchanged copy (any other ETag/size -> re-hashed). Cleared whenever the
  -- row is re-measured (new ref/bytes).
  published_size_bytes bigint check (published_size_bytes is null or published_size_bytes > 0),
  published_sha256 text check (published_sha256 is null or published_sha256 ~ '^[0-9a-f]{64}$'),
  published_etag text check (published_etag is null or length(published_etag) between 1 and 256),
  published_verified_at timestamptz,
  check ((source = 'backfill') = (backfill_run is not null)),
  check ((published_sha256 is null) = (published_size_bytes is null)
         and (published_sha256 is null) = (published_etag is null)
         and (published_sha256 is null) = (published_verified_at is null)),
  check (published_sha256 is null or (published_sha256 = sha256 and published_size_bytes = size_bytes))
);
create index billing_audio_verifications_tenant_ref_idx
  on public.billing_audio_verifications (tenant_id, audio_ref);
alter table public.billing_audio_verifications enable row level security;
revoke all on public.billing_audio_verifications from public, anon, authenticated;
grant select, insert, update, delete on public.billing_audio_verifications to service_role;

-- Backfill audit trail: one row per item a backfill --apply run looked at.
create table public.billing_audio_backfill_findings (
  id uuid primary key default gen_random_uuid(),
  run_id text not null check (run_id ~ '^[a-z0-9-]{6,64}$'),
  tenant_id uuid references public.tenants(id) on delete set null,
  item_id uuid not null,
  audio_ref text check (audio_ref is null or length(audio_ref) <= 512),
  stored_duration jsonb,
  measured_seconds integer check (measured_seconds is null or measured_seconds >= 0),
  size_bytes bigint,
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  verdict text not null check (verdict in ('ok', 'mismatch', 'unmeasurable', 'missing_object', 'published_mismatch')),
  outcome text not null check (outcome in ('stamped', 'already_verified', 'flagged', 'skipped_changed')),
  created_at timestamptz not null default now()
);
create index billing_audio_backfill_findings_run_idx on public.billing_audio_backfill_findings (run_id);
alter table public.billing_audio_backfill_findings enable row level security;
revoke all on public.billing_audio_backfill_findings from public, anon, authenticated;
-- delete only so a Staging QA run can remove the rows it wrote (by its own run id); nothing updates a finding.
grant select, insert, delete on public.billing_audio_backfill_findings to service_role;

-- ===========================================================================
-- B. The trusted finalize write: provenance + file fields, one transaction
-- ===========================================================================
create function public.billing_audio_attach_verified(
  p_tenant_id uuid,
  p_item_id uuid,
  p_metadata jsonb,
  p_size_bytes bigint,
  p_sha256 text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_ref text;
  v_seconds numeric;
  v_n integer;
begin
  if jsonb_typeof(p_metadata -> 'audioRef') is distinct from 'string'
     or jsonb_typeof(p_metadata -> 'durationSeconds') is distinct from 'number' then
    raise exception 'An attached recording must have a file and a measured length' using errcode = 'P0001', hint = 'AUDIO_UNVERIFIED';
  end if;
  v_ref := p_metadata ->> 'audioRef';
  v_seconds := (p_metadata ->> 'durationSeconds')::numeric;
  if v_seconds < 0 or v_seconds <> trunc(v_seconds) or v_seconds > 2147483647 then
    raise exception 'A measured length must be a whole number of seconds' using errcode = 'P0001', hint = 'AUDIO_UNVERIFIED';
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'The stored file''s fingerprint is missing or malformed' using errcode = 'P0001', hint = 'AUDIO_UNVERIFIED';
  end if;
  -- The file must live in this item's own folder: {tenant}/{module}/{item}/...
  if split_part(v_ref, '/', 1) <> p_tenant_id::text or split_part(v_ref, '/', 3) <> p_item_id::text
     or v_ref !~ '/draft\.[a-zA-Z0-9]+$' then
    raise exception 'The recording does not belong to this item' using errcode = 'P0001', hint = 'AUDIO_UNVERIFIED';
  end if;
  -- The same per-tenant lock the 0043 trigger and billing_audio_backfill_record()
  -- take, taken FIRST (before the provenance row is locked), so all three
  -- serialise in one order (advisory lock -> provenance row -> module_items row).
  perform pg_advisory_xact_lock(hashtextextended('idw.audio_library:' || p_tenant_id::text, 0));
  -- A published object already in this upload's folder was never measured by
  -- THIS attach (its bytes may differ from the draft just measured), and publish
  -- would adopt it. Refused - also for a re-attach of the same ref; nothing is
  -- deleted, the organizer uploads again (a fresh folder).
  if exists (
    select 1 from storage.objects o
    where o.bucket_id = 'tenant-media'
      and o.name = regexp_replace(v_ref, '/draft\.([a-zA-Z0-9]+)$', '/published.\1')
  ) then
    raise exception 'A published copy already exists for this upload; upload the file again'
      using errcode = 'P0001', hint = 'AUDIO_REUPLOAD';
  end if;
  if not exists (select 1 from public.module_items i where i.id = p_item_id and i.tenant_id = p_tenant_id) then
    raise exception 'The item was not found in this Space' using errcode = 'P0001';
  end if;

  insert into public.billing_audio_verifications
    (item_id, tenant_id, audio_ref, duration_seconds, size_bytes, sha256, source, backfill_run, verified_at)
  values (p_item_id, p_tenant_id, v_ref, v_seconds::integer, p_size_bytes, p_sha256, 'server', null, now())
  on conflict (item_id) do update set
    tenant_id = excluded.tenant_id, audio_ref = excluded.audio_ref,
    duration_seconds = excluded.duration_seconds, size_bytes = excluded.size_bytes,
    sha256 = excluded.sha256, source = 'server', backfill_run = null, verified_at = excluded.verified_at,
    published_size_bytes = null, published_sha256 = null, published_etag = null, published_verified_at = null;

  -- The 0043 trigger re-checks the limits (and, from 0046, this provenance).
  update public.module_items set metadata = p_metadata
  where id = p_item_id and tenant_id = p_tenant_id;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'The item was not found in this Space' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.billing_audio_attach_verified(uuid, uuid, jsonb, bigint, text) from public, anon, authenticated;
grant execute on function public.billing_audio_attach_verified(uuid, uuid, jsonb, bigint, text) to service_role;

-- ===========================================================================
-- C. module_items audio guard: the 0043 body with the TASK 032 (0046) block (marked).
-- ===========================================================================
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
  -- >>> TASK 032 (0046): the trusted writer must also have recorded the server's
  -- own measurement of exactly this file (billing_audio_verifications: same item,
  -- tenant, ref and whole-second length). Written in the same transaction by
  -- billing_audio_attach_verified(); a bare service-role write is refused.
  if not exists (
    select 1 from public.billing_audio_verifications v
    where v.item_id = new.id and v.tenant_id = new.tenant_id
      and v.audio_ref = (v_ref #>> '{}') and v.duration_seconds = v_seconds
  ) then
    raise exception 'This recording has not been measured by the server; upload it again'
      using errcode = 'P0001', hint = 'AUDIO_UNVERIFIED';
  end if;
  -- <<< TASK 032 (0046)

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

-- ===========================================================================
-- D. Publish-time audio guard: the 0043 body with the TASK 032 (0046) block (marked).
-- ===========================================================================
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
    -- >>> TASK 032 (0046): the row's own id, so provenance is bound to THIS item.
         , i.id as item_id
    -- <<< TASK 032 (0046)
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
    -- >>> TASK 032 (0046): a length is only authoritative when the server measured
    -- this exact file (billing_audio_verifications). A browser-reported length -
    -- rows attached before B4b, or while the Space was legacy/exempt - is refused.
    -- Bound to the item: another item's provenance for the same ref never counts,
    -- and a row left behind for a detached ref is ignored (its ref is not current).
    if not exists (
      select 1 from public.billing_audio_verifications v
      where v.item_id = v_row.item_id
        and v.tenant_id = p_tenant_id
        and v.audio_ref = (v_row.ref #>> '{}')
        and v.duration_seconds = v_seconds
    ) then
      raise exception 'Some recordings have not been verified by the server; upload them again before publishing'
        using errcode = 'P0001', hint = 'AUDIO_UNVERIFIED';
    end if;
    -- <<< TASK 032 (0046)
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

-- ===========================================================================
-- F. Backfill recorder (service role only)
-- ===========================================================================
create function public.billing_audio_backfill_record(
  p_run_id text,
  p_tenant_id uuid,
  p_item_id uuid,
  p_audio_ref text,
  p_measured_seconds integer,
  p_size_bytes bigint,
  p_sha256 text,
  p_verdict text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_meta jsonb;
  v_stored jsonb;
  v_outcome text;
begin
  if p_run_id is null or p_run_id !~ '^[a-z0-9-]{6,64}$' then
    raise exception 'a backfill run id is required' using errcode = 'P0001';
  end if;
  if p_verdict is null or p_verdict not in ('ok', 'mismatch', 'unmeasurable', 'missing_object', 'published_mismatch') then
    raise exception 'unknown verdict' using errcode = 'P0001';
  end if;

  -- Same lock as the 0043 trigger: no attach can interleave with this check.
  perform pg_advisory_xact_lock(hashtextextended('idw.audio_library:' || p_tenant_id::text, 0));
  select i.metadata into v_meta from public.module_items i where i.id = p_item_id and i.tenant_id = p_tenant_id;
  v_stored := nullif(v_meta -> 'durationSeconds', 'null'::jsonb);

  if v_meta is null or (v_meta ->> 'audioRef') is distinct from p_audio_ref then
    v_outcome := 'skipped_changed'; -- the item changed since the script read it: nothing stamped
  elsif split_part(p_audio_ref, '/', 1) <> p_tenant_id::text or split_part(p_audio_ref, '/', 3) <> p_item_id::text then
    v_outcome := 'flagged'; -- not in this item's own folder {tenant}/{module}/{item}/... (same rule as attach)
  elsif p_verdict <> 'ok' then
    v_outcome := 'flagged';
  elsif jsonb_typeof(v_stored) is distinct from 'number'
        or (v_stored #>> '{}')::numeric <> p_measured_seconds
        or p_size_bytes is null or p_size_bytes <= 0
        or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    v_outcome := 'flagged'; -- "ok" claimed but the stored length does not equal the measurement
  elsif exists (
    select 1 from public.billing_audio_verifications v
    where v.item_id = p_item_id and v.tenant_id = p_tenant_id and v.audio_ref = p_audio_ref
      and v.duration_seconds = p_measured_seconds and v.sha256 = p_sha256 and v.size_bytes = p_size_bytes
  ) then
    v_outcome := 'already_verified';
  else
    insert into public.billing_audio_verifications
      (item_id, tenant_id, audio_ref, duration_seconds, size_bytes, sha256, source, backfill_run, verified_at)
    values (p_item_id, p_tenant_id, p_audio_ref, p_measured_seconds, p_size_bytes, p_sha256, 'backfill', p_run_id, now())
    on conflict (item_id) do update set
      tenant_id = excluded.tenant_id, audio_ref = excluded.audio_ref,
      duration_seconds = excluded.duration_seconds, size_bytes = excluded.size_bytes,
      sha256 = excluded.sha256, source = 'backfill', backfill_run = excluded.backfill_run,
      verified_at = excluded.verified_at,
      published_size_bytes = null, published_sha256 = null, published_etag = null, published_verified_at = null;
    v_outcome := 'stamped';
  end if;

  insert into public.billing_audio_backfill_findings
    (run_id, tenant_id, item_id, audio_ref, stored_duration, measured_seconds, size_bytes, sha256, verdict, outcome)
  values (p_run_id, p_tenant_id, p_item_id, left(p_audio_ref, 512), v_stored, p_measured_seconds,
          p_size_bytes, case when p_sha256 ~ '^[0-9a-f]{64}$' then p_sha256 end, p_verdict, v_outcome);
  return v_outcome;
end;
$$;
revoke all on function public.billing_audio_backfill_record(text, uuid, uuid, text, integer, bigint, text, text) from public, anon, authenticated;
grant execute on function public.billing_audio_backfill_record(text, uuid, uuid, text, integer, bigint, text, text) to service_role;

-- ===========================================================================
-- G. replace_space(): the 0042 body with the TASK 032 (0046) block (marked).
-- ===========================================================================
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

  -- >>> TASK 032 (0046): an internal exemption was granted for this Space's
  -- content; it must not carry over to replacement content automatically. An
  -- Admin clears it first (or re-approves it afterwards). Runs before any delete.
  if exists (select 1 from public.space_subscriptions s where s.tenant_id = p_tenant_id and s.status = 'exempt') then
    raise exception 'This Space is internally exempt; an Admin must clear the exemption before it can be replaced'
      using errcode = 'P0001', hint = 'EXEMPT_REPLACE_REQUIRES_ADMIN';
  end if;
  -- <<< TASK 032 (0046)
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

-- Grants exactly as 0017 set them (unchanged; restated for clarity).
revoke all on function public.replace_space(uuid, text) from public, anon;
grant execute on function public.replace_space(uuid, text) to authenticated;

-- ===========================================================================
-- H. Invariant: billing never starts governing a Space that already holds media.
-- ===========================================================================
-- Everything above (provenance at attach, the published-copy fingerprint check,
-- the 0045 content checks) runs from the moment a Space is enforced. A Space
-- that held audio, Storage objects or a published snapshot while billing did
-- NOT govern it (legacy, exempt) would carry unmeasured files and an unchecked
-- snapshot into enforcement. In the code no path does that: paid provisioning
-- (billing_provision_paid_space) creates a NEW tenant, billing_set_internal_exempt
-- refuses a Space with a paid row, billing_clear_internal_exempt makes the
-- Space LEGACY (no row), and billing_apply_subscription_state only updates rows
-- found by their Stripe subscription id (an exempt row has none). This trigger
-- makes the invariant fail closed for any other writer (a script, a manual
-- service-role insert, a future function): a space_subscriptions row may only
-- become non-exempt - inserted, re-pointed at another tenant, or flipped from
-- 'exempt' - on a tenant with no attached audio, no published snapshot and no
-- object in its tenant-media folder. Status changes between paid statuses are
-- not affected.
create function public.billing_guard_subscription_enforcement()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.status = 'exempt' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status <> 'exempt' and old.tenant_id = new.tenant_id then
    return new; -- already governed: a change between paid statuses
  end if;
  if exists (select 1 from public.module_items i
             where i.tenant_id = new.tenant_id and jsonb_typeof(i.metadata -> 'audioRef') = 'string')
     or exists (select 1 from public.published_spaces p where p.tenant_id = new.tenant_id)
     or exists (select 1 from storage.objects o
                where o.bucket_id = 'tenant-media' and o.name like new.tenant_id::text || '/%') then
    raise exception 'Billing can only start governing a Space that holds no media yet; provision a new Space instead'
      using errcode = 'P0001', hint = 'BILLING_SPACE_HAS_MEDIA';
  end if;
  return new;
end;
$$;
revoke all on function public.billing_guard_subscription_enforcement() from public, anon, authenticated;

create trigger billing_space_subscriptions_fresh_enforcement
  before insert or update of status, tenant_id on public.space_subscriptions
  for each row execute function public.billing_guard_subscription_enforcement();
