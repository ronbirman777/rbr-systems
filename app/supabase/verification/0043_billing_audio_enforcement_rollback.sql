-- Rollback for 0043_billing_audio_enforcement.sql (TASK 032 B4b).
-- Do NOT run unless the migration needs to be reverted. Rollback is NEVER
-- automatic: nothing in CI, the Supabase CLI or the application runs files in
-- supabase/verification/. A human runs it deliberately, after the checks below.
--
-- Read docs/billing/MIGRATION-RECOVERY.md first. A forward fix (a new
-- migration that corrects the defect) is preferred over this rollback.
--
-- ORDER: TASK 032 rollbacks run in strict reverse order, one at a time:
--   0044 -> 0043 (this file) -> 0042 -> 0041 -> 0040 -> 0039 -> 0038 -> 0037 -> 0036.
-- The 0044 rollback (definer-RPC billing guards) must run first; this file
-- refuses while the 0044 bodies of set_guest_access_code(),
-- disable_guest_access_code() or submit_featured_listing() (hint
-- BILLING_LOCKED) are still in place. It must run
-- BEFORE the 0038 rollback (billing_audio_policy() reads 0036-0038 objects)
-- and before the 0039 rollback (both restate publish_space()). The 0042
-- rollback refuses to run while billing_audio_policy() still exists.
--
-- ===========================================================================
-- WHAT 0043 CHANGED, AND WHAT THIS FILE DOES
-- ===========================================================================
--   function publish_space(uuid) - restored VERBATIM from
--     0039_billing_access_enforcement.sql (body, language, security invoker,
--     search_path, grants). Checked mechanically by
--     src/lib/spaceTypes/billingRollback.test.ts (restored body == 0039 body).
--   trigger  billing_guard_module_item_audio on public.module_items - dropped
--   function billing_guard_module_item_audio() - dropped
--   function billing_audio_assert_publishable(uuid, jsonb) - dropped
--   function billing_audio_policy(uuid) - dropped
--   publish_space() is restored FIRST, because the 0043 body calls
--   billing_audio_assert_publishable().
--
-- REVERSIBLE: fully. Nothing here stores or deletes data; module_items rows
--   (including every metadata.audioRef / durationSeconds) are untouched.
--   Re-running 0043 (after `supabase migration repair --status reverted` for
--   its ledger row) re-applies it.
-- DATA-DESTRUCTIVE: nothing.
-- BEHAVIOUR AFTER: audio limits on paid Spaces are enforced by the Studio
--   server actions only (pre-0043): a tenant member could again write the
--   file fields through PostgREST or publish through a direct RPC call. The
--   application's finalize path still works (the service-role write simply
--   no longer meets a trigger).
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
--     -c "set idw.rollback_confirm = '0043'" \
--     -f supabase/verification/0043_billing_audio_enforcement_rollback.sql
--
-- STEP 2 - LEDGER (separate, explicit): supabase migration repair --status reverted <0043 version>
-- STEP 3 - VERIFY: the read-only queries at the end of this file.

begin;

do $$
begin
  if coalesce(current_setting('idw.rollback_confirm', true), '') <> '0043' then
    raise exception 'ROLLBACK 0043 REFUSED: set idw.rollback_confirm = ''0043'' to confirm';
  end if;
  if position('BILLING_LOCKED' in pg_get_functiondef('public.set_guest_access_code(uuid, text)'::regprocedure)) > 0
     or position('BILLING_LOCKED' in pg_get_functiondef('public.disable_guest_access_code(uuid)'::regprocedure)) > 0
     or position('BILLING_LOCKED' in pg_get_functiondef('public.submit_featured_listing(uuid, text, text, text, text, jsonb)'::regprocedure)) > 0 then
    raise exception 'ROLLBACK 0043 REFUSED: 0044 is still applied; run the 0044 rollback first';
  end if;
  if exists (select 1 from public.billing_settings where paid_checkout_enabled) then
    raise exception 'ROLLBACK 0043 REFUSED: paid checkout is ON (billing_settings.paid_checkout_enabled)';
  end if;
  if exists (select 1 from public.space_subscriptions where status not in ('exempt', 'canceled', 'incomplete_expired')) then
    raise exception 'ROLLBACK 0043 REFUSED: a live paid subscription exists';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. publish_space(): 0039's definition, verbatim (no audio guard).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2. The module_items trigger, then the functions. No CASCADE anywhere: an
--    unexpected dependent makes the transaction fail.
-- ---------------------------------------------------------------------------
drop trigger billing_guard_module_item_audio on public.module_items;
drop function public.billing_guard_module_item_audio();
drop function public.billing_audio_assert_publishable(uuid, jsonb);
drop function public.billing_audio_policy(uuid);

commit;

-- ===========================================================================
-- VERIFY (read-only). Expected: publish_space uses_audio_guard = false, and no
-- row from the second query (trigger and helpers gone).
-- ===========================================================================
select p.proname, md5(pg_get_functiondef(p.oid)) as functiondef_md5,
       position('billing_audio_assert_publishable' in pg_get_functiondef(p.oid)) > 0 as uses_audio_guard
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'publish_space';

select 'function' as kind, p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('billing_audio_policy', 'billing_audio_assert_publishable', 'billing_guard_module_item_audio')
union all
select 'trigger', t.tgname from pg_trigger t where t.tgname = 'billing_guard_module_item_audio';
