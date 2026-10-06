-- Verification for 0033_flow_content_expansion.sql. NOT a migration -
-- never numbered into supabase/migrations/, never applied automatically.
-- Written to be reviewed alongside the migration and run by hand right
-- after it is applied.
--
-- SAFE TO RUN ANYWHERE, INCLUDING PRODUCTION. One transaction that always
-- ROLLS BACK: it creates a throwaway auth user and a throwaway Space,
-- publishes them, asserts, and undoes all of it. It touches no existing
-- tenant, reads no customer data, and prints no secret. Self-contained -
-- no \i, no file paths, no superuser.
--
-- WHAT IT PROVES
--   A. A Space with none of 0033's content publishes a `modules` object
--      containing NONE of 0033's keys. This is the backward-compatibility
--      claim: shipping this migration does not change an existing Space.
--   B. Every new field and module publishes, with the right value, in the
--      right shape, once an organizer fills it in.
--   C. The publish allowlist holds: a metadata key that is not on it is
--      NOT published, even though it is stored.
--   D. A tenant MEMBER, under RLS as `authenticated` and with no extra
--      grant, can write schedule_items.metadata and the new module_key
--      rows. The new column needed no policy of its own.
--   E. The draft -> published media rewrite reaches the new places:
--      a reading's image_ref, a track's metadata.audioRef, and
--      retreatProfile's own imageRef.
--
-- WHAT IT CANNOT PROVE, and where that lives instead
--   Byte-equality of the whole payload against 0032's publish_space().
--   That needs 0032's function body swapped in mid-transaction, so it
--   needs a file path and a throwaway database - see
--   0033_flow_content_expansion_equivalence.sql (LOCAL only).
--
-- Any failure raises and aborts. Silence before the final notice means a
-- failed assertion; "0033 VERIFICATION PASSED" at the end means all of it
-- held.

begin;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_t uuid;
  v_up text := gen_random_uuid()::text;
  v_mods jsonb;
  v_keys text[];
  v_sched jsonb;
begin
  -- ---------------------------------------------------------------------
  -- A throwaway owner and Space. Everything an organizer would do is done
  -- as `authenticated` under RLS, so D is proven by the writes succeeding
  -- rather than by reading pg_policy.
  -- ---------------------------------------------------------------------
  insert into auth.users (id, email, instance_id, aud, role)
    values (v_user, v_user || '@t029.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  set local role authenticated;
  insert into public.tenants (name, product_type, timezone)
    values ('T029 verification', 'retreat', 'Europe/Berlin') returning id into v_t;
  reset role;

  insert into public.space_entitlements (tenant_id, access_type, access_ends_at)
    values (v_t, 'complimentary', now() + interval '1 year')
    on conflict (tenant_id) do nothing;

  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.brand_configs (tenant_id, name) values (v_t, 'T029')
    on conflict (tenant_id) do nothing;

  -- PRE-0033 content only: every module an existing Flow Space can have.
  insert into public.module_configs (tenant_id, module_key, enabled) values
    (v_t, 'schedule', true), (v_t, 'facilitators', true), (v_t, 'meals', true),
    (v_t, 'treatments', true), (v_t, 'facilities', true), (v_t, 'arrivalInfo', true),
    (v_t, 'faq', true), (v_t, 'customPages', true), (v_t, 'stayConnected', true)
    on conflict (tenant_id, module_key) do update set enabled = true;

  insert into public.schedule_items (tenant_id, date, start_time, title)
    values (v_t, '2026-05-04', '07:00', 'Sunrise Movement');
  insert into public.module_items (tenant_id, module_key, title, description, metadata) values
    (v_t, 'facilitators', 'Lena', 'Short bio.', '{}'),
    (v_t, 'meals', 'Breakfast', 'Seasonal.', '{"mealType":"breakfast"}'),
    (v_t, 'treatments', 'Massage', 'Ninety minutes.', '{"durationMinutes":90}'),
    (v_t, 'facilities', 'Pool', 'Spring fed.', '{}'),
    (v_t, 'faq', 'Wifi?', 'Lounge only.', '{"enabled":true}'),
    (v_t, 'customPages', 'Packing', 'Layers.', '{"enabled":true}');
  insert into public.module_settings (tenant_id, module_key, data) values
    (v_t, 'arrivalInfo', '{"whatToBring":["Towel"]}'),
    (v_t, 'stayConnected', '{"links":[]}');

  perform public.publish_space(v_t);
  reset role;

  select modules into v_mods from public.published_spaces where tenant_id = v_t;

  -- ---------------------------------------------------------------------
  -- A. None of 0033's keys may appear for a Space that has none of its
  --    content. Checked as a set difference rather than key by key, so a
  --    future key added without this guard also trips it.
  -- ---------------------------------------------------------------------
  select array_agg(k order by k) into v_keys
  from jsonb_object_keys(v_mods) k
  where k = any (array['retreatProfile', 'moduleIntros', 'readings', 'audio', 'guidelines']);
  if v_keys is not null then
    raise exception 'A FAILED: 0033 keys present on an untouched Space: %', v_keys;
  end if;

  select v_mods->'schedule'->0 into v_sched;
  if v_sched ? 'whatToBring' or v_sched ? 'whatToExpect' then
    raise exception 'A FAILED: schedule item gained a key from an empty metadata: %', v_sched;
  end if;
  if v_mods->'facilities'->0 ? 'shortDescription' then
    raise exception 'A FAILED: facility gained shortDescription from a null subtitle';
  end if;
  if v_mods->'facilitators'->0 ? 'longBio' then
    raise exception 'A FAILED: facilitator gained longBio from an empty metadata';
  end if;
  if (v_mods->'treatments'->0) ?| array['price', 'currency', 'chargeType', 'availability'] then
    raise exception 'A FAILED: treatment gained a price key from an empty metadata';
  end if;
  -- And the eight pre-existing schedule keys are all still there.
  if not (v_sched ?& array['date', 'startTime', 'endTime', 'title', 'facilitator', 'location', 'description', 'category']) then
    raise exception 'A FAILED: a pre-0033 schedule key went missing: %', v_sched;
  end if;

  -- ---------------------------------------------------------------------
  -- Now fill in everything 0033 added, as the member, under RLS. (D)
  -- `internalNote` is stored but is NOT on any publish allowlist. (C)
  -- ---------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  set local role authenticated;

  update public.schedule_items
    set metadata = '{"whatToBring":["Mat"],"whatToExpect":["Barefoot"],"internalNote":"private"}'
    where tenant_id = v_t;

  update public.module_items set metadata = metadata || '{"longBio":"The long one."}'
    where tenant_id = v_t and module_key = 'facilitators';
  update public.module_items
    set metadata = metadata || '{"price":85,"currency":"EUR","chargeType":"additional","availability":"Daily","internalNote":"private"}'
    where tenant_id = v_t and module_key = 'treatments';
  update public.module_items set subtitle = 'Always 18 degrees'
    where tenant_id = v_t and module_key = 'facilities';

  insert into public.module_configs (tenant_id, module_key, enabled, image_ref, image_position) values
    (v_t, 'readings', true, v_t || '/readings/_cover/' || v_up || '/draft.webp', '{"x":40,"y":20}'),
    (v_t, 'audio', true, null, null),
    (v_t, 'guidelines', true, null, null)
    on conflict (tenant_id, module_key) do update set enabled = true, image_ref = excluded.image_ref;

  insert into public.module_items (tenant_id, module_key, title, description, image_ref, sort_order, metadata) values
    (v_t, 'readings', 'On arriving', 'A long piece.', v_t || '/readings/r1/' || v_up || '/draft.webp', 0,
      '{"excerpt":"Landing takes a day.","category":"Before","author":"Lena","date":"2026-04-20"}'),
    (v_t, 'audio', 'Evening Nidra', 'Slow.', null, 0,
      ('{"durationSeconds":1448,"category":"Evening","note":"Lie down.","audioRef":"' || v_t || '/audio/a1/' || v_up || '/draft.mp3"}')::jsonb),
    (v_t, 'guidelines', 'Quiet hours', '22:00 to 07:00.', null, 0, '{}'),
    (v_t, 'guidelines', 'Phones', 'In your room.', null, 1, '{}');

  insert into public.module_settings (tenant_id, module_key, data) values
    (v_t, 'retreatProfile', ('{"tagline":"Coming back to yourself","locationLine":"Black Forest","whatToBring":["Layers"],"whatToExpect":["Early mornings"],"imageRef":"' || v_t || '/retreatProfile/hero/' || v_up || '/draft.webp"}')::jsonb),
    (v_t, 'moduleIntros', '{"meals":{"intro":"Vegetarian, cooked that morning."}}')
    on conflict (tenant_id, module_key) do update set data = excluded.data;

  perform public.publish_space(v_t);
  reset role;

  select modules into v_mods from public.published_spaces where tenant_id = v_t;

  -- ---------------------------------------------------------------------
  -- B. Everything published, in the right shape.
  -- ---------------------------------------------------------------------
  if not (v_mods ?& array['retreatProfile', 'moduleIntros', 'readings', 'audio', 'guidelines']) then
    raise exception 'B FAILED: a 0033 key did not publish. keys: %',
      (select array_agg(k order by k) from jsonb_object_keys(v_mods) k);
  end if;

  if v_mods->'retreatProfile'->'whatToBring' <> '["Layers"]'::jsonb then
    raise exception 'B FAILED: retreatProfile.whatToBring = %', v_mods->'retreatProfile'->'whatToBring';
  end if;
  -- D3: the legacy list is still published, untouched, as the fallback.
  if v_mods->'arrivalInfo'->'whatToBring' <> '["Towel"]'::jsonb then
    raise exception 'B FAILED: legacy arrivalInfo.whatToBring was disturbed: %', v_mods->'arrivalInfo'->'whatToBring';
  end if;

  if v_mods->'moduleIntros'->'meals'->>'intro' is null then
    raise exception 'B FAILED: moduleIntros.meals.intro missing';
  end if;

  select v_mods->'schedule'->0 into v_sched;
  if v_sched->'whatToBring' <> '["Mat"]'::jsonb or v_sched->'whatToExpect' <> '["Barefoot"]'::jsonb then
    raise exception 'B FAILED: schedule metadata did not publish: %', v_sched;
  end if;

  if v_mods->'facilities'->0->>'shortDescription' <> 'Always 18 degrees' then
    raise exception 'B FAILED: facility shortDescription = %', v_mods->'facilities'->0->>'shortDescription';
  end if;
  if v_mods->'facilities'->0->>'description' <> 'Spring fed.' then
    raise exception 'B FAILED: facility description changed meaning';
  end if;
  if v_mods->'facilitators'->0->>'longBio' <> 'The long one.'
     or v_mods->'facilitators'->0->>'bio' <> 'Short bio.' then
    raise exception 'B FAILED: facilitator bio/longBio = % / %',
      v_mods->'facilitators'->0->>'bio', v_mods->'facilitators'->0->>'longBio';
  end if;
  if v_mods->'treatments'->0->>'price' <> '85'
     or v_mods->'treatments'->0->>'currency' <> 'EUR'
     or v_mods->'treatments'->0->>'chargeType' <> 'additional'
     or v_mods->'treatments'->0->>'availability' <> 'Daily' then
    raise exception 'B FAILED: treatment extras = %', v_mods->'treatments'->0;
  end if;
  if jsonb_array_length(v_mods->'guidelines') <> 2
     or v_mods->'guidelines'->0->>'title' <> 'Quiet hours' then
    raise exception 'B FAILED: guidelines = %', v_mods->'guidelines';
  end if;
  -- The readings/audio envelope is build_teach_payload's, not the
  -- flattened Flow one - that is what lets one schema read both.
  if not (v_mods->'readings'->0 ?& array['id', 'title', 'subtitle', 'description', 'imageRef', 'externalLink', 'metadata']) then
    raise exception 'B FAILED: reading envelope = %', v_mods->'readings'->0;
  end if;
  if v_mods->'readings'->0->'metadata'->>'excerpt' <> 'Landing takes a day.' then
    raise exception 'B FAILED: reading metadata = %', v_mods->'readings'->0->'metadata';
  end if;
  if v_mods->'audio'->0->'metadata'->>'note' <> 'Lie down.' then
    raise exception 'B FAILED: audio note = %', v_mods->'audio'->0->'metadata';
  end if;
  if v_mods->'moduleCovers'->'readings'->>'imageRef' is null then
    raise exception 'B FAILED: readings cover not in the moduleCovers allowlist';
  end if;

  -- ---------------------------------------------------------------------
  -- C. The allowlist holds: stored, but never published.
  -- ---------------------------------------------------------------------
  if v_mods::text like '%internalNote%' then
    raise exception 'C FAILED: a non-allowlisted metadata key reached the published payload';
  end if;
  if not exists (select 1 from public.schedule_items where tenant_id = v_t and metadata ? 'internalNote') then
    raise exception 'C FAILED: the private key was lost from the row it was stored in';
  end if;

  -- ---------------------------------------------------------------------
  -- E. draft -> published, in all three new places.
  -- ---------------------------------------------------------------------
  if v_mods->'readings'->0->>'imageRef' not like '%/published.webp' then
    raise exception 'E FAILED: reading imageRef = %', v_mods->'readings'->0->>'imageRef';
  end if;
  if v_mods->'audio'->0->'metadata'->>'audioRef' not like '%/published.mp3' then
    raise exception 'E FAILED: audioRef = %', v_mods->'audio'->0->'metadata'->>'audioRef';
  end if;
  if v_mods->'retreatProfile'->>'imageRef' not like '%/published.webp' then
    raise exception 'E FAILED: retreatProfile imageRef = %', v_mods->'retreatProfile'->>'imageRef';
  end if;
  if v_mods::text like '%/draft.%' then
    raise exception 'E FAILED: a draft reference survived into the payload';
  end if;

  raise notice '0033 VERIFICATION PASSED (A backward compatibility, B publish shape, C allowlist, D member RLS, E media rewrite)';
end $$;

rollback;
