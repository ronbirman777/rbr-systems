-- TASK 032 B4b - database-level audio entitlement enforcement for
-- billing-governed (paid, non-exempt) Spaces.
--
-- Before this migration the per-recording maximum (60 min) and the library
-- allowance (240 min + 240 per audio_pack add-on) were checked only by the
-- Studio server actions, which a tenant member could bypass by writing
-- module_items.metadata through PostgREST (RLS allows member writes, 0017)
-- or by calling publish_space() directly. This migration makes the database
-- the authority:
--
-- WHERE AUDIO LIVES (both products): one module_items row per track -
-- Teach module_key 'teachAudio', Flow module_key 'audio' - with the file in
-- metadata.audioRef (a versioned draft ref) and its length in
-- metadata.durationSeconds. publish_space() / build_teach_payload() publish
-- the raw metadata and the guest media route serves any string found under
-- an "audioRef" key in the published snapshot (collectMediaRefs), so the
-- rules below look at EVERY row's metadata.audioRef (not only the two audio
-- keys) and at every "audioRef" anywhere in the snapshot being published.
--
-- 1. billing_audio_policy(tenant)  SECURITY DEFINER, read-only. 'legacy'
--    (no billing row), 'exempt', 'enforced' (+ limits in seconds from
--    space_audio_entitlements, i.e. base bundle + add-ons) or 'unavailable'
--    (paid row without a readable entitlement -> fail closed). A signed-in
--    caller who is not a member of the tenant learns nothing ('unavailable').
--
-- 2. Trigger billing_guard_module_item_audio (BEFORE INSERT OR UPDATE on
--    module_items). Only when a row's metadata.audioRef / durationSeconds
--    actually change (or the row moves tenant) on an ENFORCED Space:
--      * an authenticated (member) session may not set or change them at all
--        (hint AUDIO_SERVER_ONLY). Clearing both (detach) stays allowed, and
--        an upsert that leaves them untouched is judged by the UPDATE path;
--      * any other role (the Studio's service-role finalize path, after it
--        has measured the stored bytes itself) must store a string ref and a
--        numeric duration within 0..max recording seconds, and the Space's
--        library total including this row must stay within the allowance
--        (hint AUDIO_LIMIT). Writes for one tenant are serialised with an
--        advisory transaction lock so two concurrent attaches cannot both
--        pass.
--    Legacy and exempt Spaces return immediately: behaviour unchanged.
--
-- 3. billing_audio_assert_publishable(tenant, modules)  SECURITY DEFINER.
--    For an enforced Space, re-checks every row that holds a file (known
--    whole-number length, each <= max recording, sum <= allowance) and
--    requires every "audioRef" value anywhere in the snapshot being
--    published to be one of those counted files (draft or published
--    sibling). Raises hint AUDIO_LIMIT. Legacy/exempt return immediately.
--
-- 4. publish_space(): the 0039 body, byte for byte, plus ONE marked block
--    calling (3) just before the snapshot is written. Signature, security
--    invoker, search_path and grants unchanged.
--
-- NOT covered here (docs/billing/ENTITLEMENTS.md): audio bytes stored under
-- an image reference (imageRef / image_ref) and served as an image; the
-- listening allowance (not metered at all).
--
-- Rollback: verification/0043_billing_audio_enforcement_rollback.sql
-- (restores the 0039 publish_space body, drops the trigger and functions).
-- Never edit 0001-0042. Forward-only.

-- ===========================================================================
-- 1. Policy helper
-- ===========================================================================
create function public.billing_audio_policy(p_tenant_id uuid)
returns table (mode text, library_seconds integer, max_recording_seconds integer)
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_status text;
  v_library integer;
  v_max integer;
begin
  -- A signed-in non-member learns nothing about another Space's billing.
  -- (Service-role and direct database sessions carry no auth.uid().)
  if auth.uid() is not null and not public.is_tenant_member(p_tenant_id) then
    return query select 'unavailable'::text, null::integer, null::integer;
    return;
  end if;

  select s.status into v_status from public.space_subscriptions s where s.tenant_id = p_tenant_id;
  if not found then
    return query select 'legacy'::text, null::integer, null::integer;
    return;
  end if;
  if v_status = 'exempt' then
    return query select 'exempt'::text, null::integer, null::integer;
    return;
  end if;

  select e.library_minutes, e.max_recording_minutes into v_library, v_max
  from public.space_audio_entitlements(p_tenant_id) e;
  if v_library is null or v_max is null or v_library <= 0 or v_max <= 0 then
    return query select 'unavailable'::text, null::integer, null::integer;
    return;
  end if;
  return query select 'enforced'::text, v_library * 60, v_max * 60;
end;
$$;
revoke all on function public.billing_audio_policy(uuid) from public, anon;
grant execute on function public.billing_audio_policy(uuid) to authenticated, service_role;

-- ===========================================================================
-- 2. module_items audio guard (trigger)
-- ===========================================================================
create function public.billing_guard_module_item_audio()
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

create trigger billing_guard_module_item_audio
  before insert or update on public.module_items
  for each row execute function public.billing_guard_module_item_audio();

-- ===========================================================================
-- 3. Publish-time audio guard
-- ===========================================================================
create function public.billing_audio_assert_publishable(p_tenant_id uuid, p_modules jsonb)
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

-- ===========================================================================
-- 4. publish_space(): the 0039 body with the TASK 032 (0043) audio guard (marked).
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
  v_access record; -- TASK 032
  -- 0033: the draft -> published rewrite, as a pair of locals rather than
  -- three copies of the same expression. Identical to the pattern 0028
  -- introduced for Teach: anchored on this tenant's own id so ordinary
  -- prose and external URLs are never touched.
  v_draft_pattern text := '("' || p_tenant_id::text || '/[^"]*)/draft\.([a-zA-Z0-9]+)"';
  v_draft_replace text := '\1/published.\2"';
begin
  select name, product_type, timezone, slug into v_tenant
  from public.tenants where id = p_tenant_id;

  if not found then
    raise exception 'Space not found, or you do not have access to it';
  end if;

  -- TASK 032: the unified billing decision comes first. A Space with a billing
  -- row (paid subscription, or an explicit internal/legacy exemption) is
  -- governed by space_access_state(); a Space WITHOUT one falls through to the
  -- unchanged legacy space_entitlements guard below, so no existing Space is
  -- locked unexpectedly. This is the authoritative, direct-RPC-proof
  -- enforcement; the application checks exist only for UX.
  select decided, can_publish into v_access from public.space_access_state(p_tenant_id);
  if v_access.decided then
    if not v_access.can_publish then
      raise exception 'This Space does not currently have active commercial access';
    end if;
  else
    select access_ends_at into v_entitlement
    from public.space_entitlements where tenant_id = p_tenant_id;

    if v_entitlement.access_ends_at is null
       or now() > v_entitlement.access_ends_at + interval '168 hours' then
      raise exception 'This Space does not currently have active commercial access';
    end if;
  end if;

  select palette, atmosphere, image_style, custom_primary, custom_secondary,
         custom_navigation, custom_text, custom_surface,
         hero_image_ref, space_image_ref, logo_ref
  into v_brand
  from public.brand_configs where tenant_id = p_tenant_id;

  select coalesce(array_agg(module_key order by module_key), '{}')
  into v_enabled_modules
  from public.module_configs
  where tenant_id = p_tenant_id and enabled = true;

  if v_enabled_modules is null then
    v_enabled_modules := '{}';
  end if;

  if 'schedule' = any(v_enabled_modules) then
    -- 0033: the schedule's eight fixed keys, plus whichever of the two
    -- new per-activity keys this row actually stores. An activity with an
    -- empty metadata object contributes nothing and publishes exactly the
    -- object 0032 published.
    select coalesce(jsonb_agg(jsonb_build_object(
      'date', date,
      'startTime', to_char(start_time, 'HH24:MI'),
      'endTime', case when end_time is null then null else to_char(end_time, 'HH24:MI') end,
      'title', title,
      'facilitator', facilitator,
      'location', location,
      'description', description,
      'category', category
    ) || public.jsonb_pick(metadata, array['whatToBring', 'whatToExpect'])
    order by date, start_time), '[]'::jsonb)
    into v_payload
    from public.schedule_items where tenant_id = p_tenant_id;
    v_modules := v_modules || jsonb_build_object('schedule', v_payload);
  end if;

  if 'facilitators' = any(v_enabled_modules) then
    -- 0033: `longBio` joins `bio`. `bio` keeps its meaning (the short one
    -- shown on the card); longBio is the full text on the detail screen,
    -- and is absent for every facilitator written before today.
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', title,
      'role', subtitle,
      'bio', description,
      'imageRef', case
        when image_ref is null then null
        else regexp_replace(image_ref, '/draft\.([a-zA-Z0-9]+)$', '/published.\1')
      end,
      'socialLinks', coalesce(metadata->'socialLinks', '[]'::jsonb),
      'specialties', coalesce(metadata->'specialties', '[]'::jsonb),
      'imagePosition', metadata->'imagePosition'
    ) || public.jsonb_pick(metadata, array['longBio'])
    order by sort_order, created_at), '[]'::jsonb)
    into v_payload
    from public.module_items where tenant_id = p_tenant_id and module_key = 'facilitators';
    v_modules := v_modules || jsonb_build_object('facilitators', v_payload);
  end if;

  if 'meals' = any(v_enabled_modules) then
    -- Unchanged by 0033. The module-level introduction the Meals screen
    -- now shows above these entries is NOT a property of any one meal, so
    -- it is not here - it lives in moduleIntros, further down, where every
    -- other list-backed module can have one too.
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
      'location', metadata->>'location',
      'imagePosition', metadata->'imagePosition'
    ) order by sort_order, created_at), '[]'::jsonb)
    into v_payload
    from public.module_items where tenant_id = p_tenant_id and module_key = 'meals';
    v_modules := v_modules || jsonb_build_object('meals', v_payload);
  end if;

  if 'treatments' = any(v_enabled_modules) then
    -- 0033: this module absorbs Wellness Extras rather than a second
    -- module being invented for them, so it gains what an extra needs and
    -- a treatment also wants: what it costs, in what currency, whether
    -- that is included in the retreat price or charged on top, and when it
    -- can be had. All four are absent on every existing row.
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
      'bookingInfo', metadata->>'bookingInfo',
      'imagePosition', metadata->'imagePosition'
    ) || public.jsonb_pick(metadata, array['price', 'currency', 'chargeType', 'availability'])
    order by sort_order, created_at), '[]'::jsonb)
    into v_payload
    from public.module_items where tenant_id = p_tenant_id and module_key = 'treatments';
    v_modules := v_modules || jsonb_build_object('treatments', v_payload);
  end if;

  if 'facilities' = any(v_enabled_modules) then
    -- 0033: facilities get the short line for their card, in the SAME
    -- column treatments has always used for exactly that - module_items
    -- .subtitle. No metadata key and no DDL, and the two modules stay
    -- consistent. Nothing has ever written a facility's subtitle (the
    -- Studio sends null), so this is absent on every existing row, and
    -- merged only when present rather than emitted as null.
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', title,
      'description', description,
      'imageRef', case
        when image_ref is null then null
        else regexp_replace(image_ref, '/draft\.([a-zA-Z0-9]+)$', '/published.\1')
      end,
      'openingHours', metadata->>'openingHours',
      'location', metadata->>'location',
      'importantInfo', metadata->>'importantInfo',
      'imagePosition', metadata->'imagePosition'
    ) || case when subtitle is null then '{}'::jsonb else jsonb_build_object('shortDescription', subtitle) end
    order by sort_order, created_at), '[]'::jsonb)
    into v_payload
    from public.module_items where tenant_id = p_tenant_id and module_key = 'facilities';
    v_modules := v_modules || jsonb_build_object('facilities', v_payload);
  end if;

  if 'arrivalInfo' = any(v_enabled_modules) then
    -- Unchanged. arrivalInfo.whatToBring stays exactly where it is: it is
    -- the LEGACY home of that list and remains authoritative for Spaces
    -- that filled it in, read second when retreatProfile.whatToBring is
    -- absent. Nothing is migrated out of it and nothing deletes it.
    select data into v_payload
    from public.module_settings where tenant_id = p_tenant_id and module_key = 'arrivalInfo';
    v_modules := v_modules || jsonb_build_object('arrivalInfo', coalesce(v_payload, '{}'::jsonb));
  end if;

  if 'faq' = any(v_enabled_modules) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'question', title,
      'answer', description
    ) order by sort_order, created_at), '[]'::jsonb)
    into v_payload
    from public.module_items
    where tenant_id = p_tenant_id and module_key = 'faq'
      and coalesce((metadata->>'enabled')::boolean, true) = true;
    v_modules := v_modules || jsonb_build_object('faq', v_payload);
  end if;

  -- 0034 NEW: dailyInspiration - the retreat's own reflections.
  --
  -- Until now Flow's Daily Inspiration was only an on/off switch over a
  -- fixed InnerDweS quote list; nothing was stored and nothing published.
  -- Custom reflections are module_items rows (module_key
  -- 'dailyInspiration'): description = the text, title = an optional
  -- label, metadata.enabled = visible to guests - the FAQ pattern.
  --
  -- CONDITIONAL, so no existing snapshot changes: the key is emitted only
  -- when the module is switched on, the Space is not a Teach Space (Teach
  -- keeps its own quotes in module_settings and publishes them through
  -- build_teach_payload), and at least one ENABLED item with text exists.
  -- A Space with none publishes exactly what 0033 published, and the
  -- guest then falls back to the built-in list.
  if 'dailyInspiration' = any(v_enabled_modules)
     and v_tenant.product_type is distinct from 'teach'
     and exists (
       select 1 from public.module_items
       where tenant_id = p_tenant_id and module_key = 'dailyInspiration'
         and coalesce((metadata->>'enabled')::boolean, true) = true
         and coalesce(btrim(description), '') <> ''
     ) then
    select jsonb_agg(jsonb_build_object(
      'label', nullif(btrim(title), ''),
      'text', btrim(description)
    ) order by sort_order, created_at)
    into v_payload
    from public.module_items
    where tenant_id = p_tenant_id and module_key = 'dailyInspiration'
      and coalesce((metadata->>'enabled')::boolean, true) = true
      and coalesce(btrim(description), '') <> '';
    v_modules := v_modules || jsonb_build_object('dailyInspiration', v_payload);
  end if;

  -- 0033 NEW: guidelines. The house rules, quiet hours, phone policy -
  -- the things a retreat tells every guest once. Shaped like faq
  -- (title + body, organizer-ordered) because that is what it is: a short
  -- ordered list of headed paragraphs.
  if 'guidelines' = any(v_enabled_modules) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'title', title,
      'description', description
    ) order by sort_order, created_at), '[]'::jsonb)
    into v_payload
    from public.module_items where tenant_id = p_tenant_id and module_key = 'guidelines';
    v_modules := v_modules || jsonb_build_object('guidelines', v_payload);
  end if;

  -- 0033 NEW: readings and audio, Flow's half of the shared library.
  --
  -- The raw module_items envelope, like build_teach_payload's, so one
  -- shared schema reads both products. The whole array is rewritten as
  -- text in one pass, which is what moves a draft reference to its
  -- published sibling wherever it sits - image_ref AND metadata.audioRef -
  -- without this block needing to know which metadata keys hold media.
  -- The Studio copies the bytes to those published paths before calling
  -- publish_space; this only rewrites strings.
  if 'readings' = any(v_enabled_modules) then
    select coalesce(regexp_replace(jsonb_agg(jsonb_build_object(
      'id', id,
      'title', title,
      'subtitle', subtitle,
      'description', description,
      'imageRef', image_ref,
      'externalLink', external_link,
      'metadata', metadata
    ) order by sort_order, created_at)::text, v_draft_pattern, v_draft_replace, 'g')::jsonb, '[]'::jsonb)
    into v_payload
    from public.module_items where tenant_id = p_tenant_id and module_key = 'readings';
    v_modules := v_modules || jsonb_build_object('readings', v_payload);
  end if;

  if 'audio' = any(v_enabled_modules) then
    select coalesce(regexp_replace(jsonb_agg(jsonb_build_object(
      'id', id,
      'title', title,
      'subtitle', subtitle,
      'description', description,
      'imageRef', image_ref,
      'externalLink', external_link,
      'metadata', metadata
    ) order by sort_order, created_at)::text, v_draft_pattern, v_draft_replace, 'g')::jsonb, '[]'::jsonb)
    into v_payload
    from public.module_items where tenant_id = p_tenant_id and module_key = 'audio';
    v_modules := v_modules || jsonb_build_object('audio', v_payload);
  end if;

  -- Teach publishes its custom pages under modules.teach.items.customPages
  -- (build_teach_payload); the Retreat-shaped top-level block is skipped for
  -- Teach so the same page is not emitted twice. Every other product type
  -- (retreat, client_hub) is unchanged.
  if 'customPages' = any(v_enabled_modules) and v_tenant.product_type is distinct from 'teach' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'title', title,
      'body', description,
      'imageRef', case
        when image_ref is null then null
        else regexp_replace(image_ref, '/draft\.([a-zA-Z0-9]+)$', '/published.\1')
      end,
      'imagePosition', metadata->'imagePosition'
    ) order by sort_order, created_at), '[]'::jsonb)
    into v_payload
    from public.module_items
    where tenant_id = p_tenant_id and module_key = 'customPages'
      and coalesce((metadata->>'enabled')::boolean, true) = true;
    v_modules := v_modules || jsonb_build_object('customPages', v_payload);
  end if;

  if 'stayConnected' = any(v_enabled_modules) then
    select data into v_payload
    from public.module_settings where tenant_id = p_tenant_id and module_key = 'stayConnected';
    v_modules := v_modules || jsonb_build_object('stayConnected', coalesce(v_payload, jsonb_build_object('links', '[]'::jsonb)));
  end if;

  -- moduleCovers: now also carries image_position (0024) alongside
  -- imageRef, so a module cover's own independently-chosen focus point
  -- (distinct from any item's - see this file's header comment) reaches
  -- the guest app too.
  --
  -- 0033: the allowlist gains the three new Explore modules. This cannot
  -- change an existing snapshot - a module_configs row for 'readings',
  -- 'audio' or 'guidelines' with a cover image could not exist before
  -- this migration, because nothing wrote those keys.
  select coalesce(jsonb_object_agg(module_key, jsonb_build_object(
    'imageRef', regexp_replace(image_ref, '/draft\.([a-zA-Z0-9]+)$', '/published.\1'),
    'imagePosition', image_position
  )), '{}'::jsonb)
  into v_payload
  from public.module_configs
  where tenant_id = p_tenant_id
    and enabled = true
    and image_ref is not null
    and module_key in (
      'meals', 'treatments', 'facilities', 'arrivalInfo', 'faq', 'stayConnected',
      -- 0033
      'readings', 'audio', 'guidelines'
    );
  v_modules := v_modules || jsonb_build_object('moduleCovers', v_payload);

  -- 0033 NEW: retreatProfile - who this retreat is, said once. The Home
  -- screen's identity lines, and the retreat-level "what to bring" and
  -- "what to expect" that D3 makes canonical.
  --
  -- Published whole, like arrivalInfo and stayConnected, because the field
  -- list is validated by zod on both write and read and SQL has no
  -- business duplicating it. Not gated on module_configs: this is not an
  -- Explore module an organizer switches off, it is the Space's own
  -- description - the same reasoning as spaceSettings (0031).
  --
  -- Emitted ONLY when the row exists and holds something, so a Space that
  -- has not been edited publishes no such key at all.
  select data into v_payload
  from public.module_settings where tenant_id = p_tenant_id and module_key = 'retreatProfile';
  if v_payload is not null and v_payload <> '{}'::jsonb then
    v_modules := v_modules || jsonb_build_object(
      'retreatProfile',
      regexp_replace(v_payload::text, v_draft_pattern, v_draft_replace, 'g')::jsonb
    );
  end if;

  -- 0033 NEW: moduleIntros - one optional paragraph above a module's list.
  --
  -- Generic by design, and the reason there is no `mealsIntro` key: the
  -- shape is { "<module key>": { "intro": "..." } }, so Meals getting an
  -- introduction today costs one settings row, and Facilities getting one
  -- tomorrow costs nothing further here. Same table, same pattern, no new
  -- column, no new table.
  --
  -- Conditional for the same reason as retreatProfile.
  select data into v_payload
  from public.module_settings where tenant_id = p_tenant_id and module_key = 'moduleIntros';
  if v_payload is not null and v_payload <> '{}'::jsonb then
    v_modules := v_modules || jsonb_build_object('moduleIntros', v_payload);
  end if;

  v_modules := v_modules || jsonb_build_object(
    'brand', jsonb_build_object(
      'hero', jsonb_build_object('imageRef', case
        when v_brand.hero_image_ref is null then null
        else regexp_replace(v_brand.hero_image_ref, '/draft\.([a-zA-Z0-9]+)$', '/published.\1')
      end),
      'space', jsonb_build_object('imageRef', case
        when v_brand.space_image_ref is null then null
        else regexp_replace(v_brand.space_image_ref, '/draft\.([a-zA-Z0-9]+)$', '/published.\1')
      end),
      'logo', jsonb_build_object('imageRef', case
        when v_brand.logo_ref is null then null
        else regexp_replace(v_brand.logo_ref, '/draft\.([a-zA-Z0-9]+)$', '/published.\1')
      end)
    )
  );

  -- NEW (0028, Time to Teach): additive and product-gated. For every
  -- product_type other than 'teach' this block never runs, so the
  -- snapshot written below is exactly what 0025 produced.
  if v_tenant.product_type = 'teach' then
    v_modules := v_modules || jsonb_build_object('teach', public.build_teach_payload(p_tenant_id));
  end if;

  -- NEW (0031): the product-neutral Space Settings object (country,
  -- and from CP3 locale). Unconditional, because the setting is not
  -- product specific - Flow, Teach and Heal all publish it the same way.
  -- A Space with no row publishes '{}', which every reader already
  -- parses as "nothing configured", so no backfill is required and an
  -- older application build simply ignores the extra key.
  v_modules := v_modules || jsonb_build_object(
    'spaceSettings',
    coalesce((
      select data from public.module_settings
      where tenant_id = p_tenant_id and module_key = 'spaceSettings'
    ), '{}'::jsonb)
  );

  -- >>> TASK 032 (0043): audio entitlement guard for billing-governed Spaces.
  -- Over the draft being published (every module_items file) and the snapshot
  -- about to be written (every "audioRef"); legacy and exempt Spaces return
  -- immediately. Raises hint AUDIO_LIMIT. Runs on a direct RPC call too.
  perform public.billing_audio_assert_publishable(p_tenant_id, v_modules);
  -- <<< TASK 032 (0043)

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
      'imageStyle', coalesce(v_brand.image_style, 'rounded'),
      'customPrimary', v_brand.custom_primary,
      'customSecondary', v_brand.custom_secondary,
      'customNavigation', v_brand.custom_navigation,
      'customText', v_brand.custom_text,
      -- NEW (0032): Surface/Tint, the fifth shared brand role. Null for
      -- every existing Space, which is exactly "no override" - readers
      -- fall back to the ground they already use.
      'customSurface', v_brand.custom_surface
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
revoke all on function public.publish_space(uuid) from public;
revoke execute on function public.publish_space(uuid) from anon;
grant execute on function public.publish_space(uuid) to authenticated;
