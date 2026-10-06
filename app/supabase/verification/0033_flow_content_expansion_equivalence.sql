-- TASK 029: published-snapshot equivalence, 0033 publish_space() vs 0032
-- publish_space(). The other half of
-- 0033_flow_content_expansion_verification.sql, which proves everything
-- that does not need two function versions in one transaction.
--
-- LOCAL / THROWAWAY POSTGRES ONLY - it needs 0032's function body swapped
-- in mid-transaction, so it reads a file by path and briefly replaces a
-- live function. Do not run it against Staging or Production. (Same shape
-- and same restriction as 0028_retreat_equivalence_verification.sql.)
--
-- Run from app/ against a database at migration head:
--   docker cp supabase/migrations/0032_brand_surface.sql <db>:/tmp/0032.sql
--   docker cp supabase/migrations/0033_flow_content_expansion.sql <db>:/tmp/0033.sql
--   docker exec -i <db> psql -U postgres -d <throwaway db> -v ON_ERROR_STOP=1 \
--     < supabase/verification/0033_flow_content_expansion_equivalence.sql
--
-- WHAT IT PROVES, and why it is worth a file of its own:
-- for a Flow Space, a Teach Space and an empty Space that have NONE of
-- 0033's content, `published_spaces.modules` is not merely compatible
-- with what 0032 wrote - it is EQUAL, by jsonb equality and by md5 of its
-- text. So shipping 0033 changes no existing Space's snapshot the next
-- time anyone publishes. Every new key in 0033 is conditional precisely
-- so that this holds; this is the test that would catch it if one stopped
-- being.
--
-- The whole thing rolls back, including the function swap.

begin;

create temp table _snap (label text, tenant uuid, modules jsonb, theme jsonb);
grant all on _snap to public;

-- ---------------------------------------------------------------------------
-- Three throwaway Spaces with PRE-0033 content, published under 0033.
-- ---------------------------------------------------------------------------
do $$
declare
  v_user uuid := gen_random_uuid();
  v_u2 uuid := gen_random_uuid();
  v_u3 uuid := gen_random_uuid();
  v_flow uuid; v_teach uuid; v_empty uuid;
  v_up text := gen_random_uuid()::text;
  k text;
begin
  -- Three owners, not one: a self-service account gets a single Space
  -- slot (0026), so three Spaces need three accounts. All throwaway.
  insert into auth.users (id, email, instance_id, aud, role)
    select u, u || '@t029eq.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
    from unnest(array[v_user, v_u2, v_u3]) u;

  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.tenants (name, product_type, timezone) values ('EQ flow', 'retreat', 'Europe/Berlin') returning id into v_flow;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_u2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.tenants (name, product_type, timezone) values ('EQ teach', 'teach', 'Europe/Berlin') returning id into v_teach;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_u3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.tenants (name, product_type, timezone) values ('EQ empty', 'retreat', 'UTC') returning id into v_empty;
  reset role;

  insert into public.space_entitlements (tenant_id, access_type, access_ends_at)
    select id, 'complimentary', now() + interval '1 year' from public.tenants
    where id in (v_flow, v_teach, v_empty) on conflict (tenant_id) do nothing;

  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.brand_configs (tenant_id, name, hero_image_ref, custom_surface)
    values (v_flow, 'EQ', v_flow || '/brand/hero/' || v_up || '/draft.webp', '#F7F3EC')
    on conflict (tenant_id) do nothing;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_u2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.brand_configs (tenant_id, name, hero_image_ref, custom_surface)
    values (v_teach, 'EQ', v_teach || '/brand/hero/' || v_up || '/draft.webp', '#F7F3EC')
    on conflict (tenant_id) do nothing;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_u3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.brand_configs (tenant_id, name, hero_image_ref, custom_surface)
    values (v_empty, 'EQ', v_empty || '/brand/hero/' || v_up || '/draft.webp', '#F7F3EC')
    on conflict (tenant_id) do nothing;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- Every pre-0033 Flow module, each with a cover and an item, so the
  -- comparison covers the module_cover allowlist and every item shape -
  -- not just the ones 0033 touched.
  foreach k in array array['schedule','facilitators','meals','treatments','facilities','arrivalInfo','faq','customPages','stayConnected'] loop
    insert into public.module_configs (tenant_id, module_key, enabled, image_ref, image_position)
      values (v_flow, k, true, v_flow || '/' || k || '/_cover/' || v_up || '/draft.webp', '{"x":30,"y":70}')
      on conflict (tenant_id, module_key) do update set enabled = true, image_ref = excluded.image_ref;
  end loop;

  insert into public.schedule_items (tenant_id, date, start_time, end_time, title, facilitator, location, description, category) values
    (v_flow, '2026-05-04', '07:00', '08:15', 'Sunrise Movement', 'Lena', 'Shala', 'Gentle flow.', 'yoga'),
    (v_flow, '2026-05-04', '19:30', null, 'Sound Bath', null, 'Garden', null, 'sound');

  insert into public.module_items (tenant_id, module_key, title, subtitle, description, image_ref, external_link, sort_order, metadata) values
    (v_flow, 'facilitators', 'Lena', 'Lead', 'Short bio.', v_flow || '/facilitators/f1/' || v_up || '/draft.webp', null, 0, '{"socialLinks":[{"platform":"instagram","url":"https://x.test/l"}],"specialties":["Hatha"],"imagePosition":{"x":50,"y":0}}'),
    (v_flow, 'meals', 'Breakfast', null, 'Seasonal.', null, null, 0, '{"mealType":"breakfast","startTime":"08:30","endTime":"09:30","dietaryTags":["vegan"],"location":"Terrace"}'),
    (v_flow, 'treatments', 'Massage', 'Deep and slow', 'Ninety minutes.', null, null, 0, '{"durationMinutes":90,"provider":"Noi","location":"Spa","bookingInfo":"Ask at reception"}'),
    (v_flow, 'facilities', 'Pool', null, 'Spring fed.', null, null, 0, '{"openingHours":"07:00-20:00","location":"Lower terrace","importantInfo":"No diving"}'),
    (v_flow, 'faq', 'Wifi?', null, 'Lounge only.', null, null, 0, '{"enabled":true}'),
    (v_flow, 'faq', 'Hidden', null, 'x', null, null, 1, '{"enabled":false}'),
    (v_flow, 'customPages', 'Packing', null, 'Layers.', null, null, 0, '{"enabled":true}');

  insert into public.module_settings (tenant_id, module_key, data) values
    (v_flow, 'arrivalInfo', '{"addressLine":"Hofweg 3","whatToBring":["Towel"],"checkInFrom":"15:00"}'),
    (v_flow, 'stayConnected', '{"links":[{"label":"Instagram","url":"https://x.test/rtb"}]}'),
    (v_flow, 'spaceSettings', '{"country":"DE","language":"de"}')
    on conflict (tenant_id, module_key) do nothing;

  -- A Teach Space, to prove build_teach_payload's output is untouched too.
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_u2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.module_configs (tenant_id, module_key, enabled) values
    (v_teach, 'teachReadings', true), (v_teach, 'teachAudio', true)
    on conflict (tenant_id, module_key) do update set enabled = true;
  insert into public.module_items (tenant_id, module_key, title, description, sort_order, metadata) values
    (v_teach, 'teachReadings', 'On breath', 'A long piece.', 0, '{"excerpt":"short","category":"Morning","author":"Lena","date":"2026-03-02"}'),
    (v_teach, 'teachAudio', 'Yoga Nidra', null, 0, ('{"durationSeconds":1448,"category":"Evening","teacherNote":"Lie down.","audioRef":"' || v_teach || '/teachAudio/a1/' || v_up || '/draft.mp3"}')::jsonb);

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.publish_space(v_flow);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_u2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.publish_space(v_teach);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_u3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.publish_space(v_empty);
  reset role;

  insert into _snap select '0033', tenant_id, modules, theme from public.published_spaces
    where tenant_id in (v_flow, v_teach, v_empty);

end $$;

-- ---------------------------------------------------------------------------
-- Swap 0032's publish_space() back in and publish the same rows again.
-- ---------------------------------------------------------------------------
\i /tmp/0032.sql

do $$
declare t uuid; o uuid;
begin
  for t, o in
    select s.tenant, (select m.user_id from public.tenant_members m where m.tenant_id = s.tenant limit 1)
    from _snap s where s.label = '0033'
  loop
    perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.publish_space(t);
    reset role;
  end loop;
  insert into _snap select '0032', tenant_id, modules, theme from public.published_spaces
    where tenant_id in (select tenant from _snap where label = '0033');
end $$;

-- Put 0033 back, so a half-run leaves nothing odd behind even before the
-- rollback (and so the comparison below is the last thing that happens).
\i /tmp/0033.sql

-- ---------------------------------------------------------------------------
-- The comparison. Expect three rows, all t.
-- ---------------------------------------------------------------------------
select t.product_type,
       (a.modules = b.modules) as jsonb_equal,
       (md5(a.modules::text) = md5(b.modules::text)) as md5_equal,
       (a.theme = b.theme) as theme_equal
from _snap a
join _snap b on a.tenant = b.tenant and a.label = '0033' and b.label = '0032'
join public.tenants t on t.id = a.tenant
order by t.product_type, t.name;

do $$
declare v_bad int;
begin
  select count(*) into v_bad
  from _snap a join _snap b on a.tenant = b.tenant and a.label = '0033' and b.label = '0032'
  where a.modules <> b.modules or a.theme <> b.theme;
  if v_bad > 0 then
    raise exception 'EQUIVALENCE FAILED for % Space(s): 0033 changed a snapshot that has none of its content', v_bad;
  end if;
  raise notice '0033 EQUIVALENCE PASSED: Flow, Teach and empty snapshots are byte-identical to 0032''s';
end $$;

rollback;
