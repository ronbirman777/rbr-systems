-- TASK 027.5 Phase 4A verification for 0028_teach_foundation.sql.
-- Run against a LOCAL Postgres only (never hosted), after migrations 0001-0028:
--   docker exec -i supabase_db_app psql -U supabase_admin -d <local db> -v ON_ERROR_STOP=1 < this-file
-- Everything runs inside one transaction that is ROLLED BACK; no data persists.
-- Every check prints one row; the script fails (non-zero exit) if any check is false.
begin;

create temp table _r (n serial, name text, ok boolean);
grant all on _r to public;
grant usage, select on sequence _r_n_seq to public;

do $$
declare
  u1 uuid := gen_random_uuid();  -- owns the Retreat Space
  u2 uuid := gen_random_uuid();  -- owns the Teach Space
  u3 uuid := gen_random_uuid();  -- owns a client_hub Space; a non-member of the others
  r uuid; t uuid; h uuid; ghost uuid := gen_random_uuid();
  up_img text := gen_random_uuid()::text;
  up_aud text := gen_random_uuid()::text;
  up_set text := gen_random_uuid()::text;
  up_old text := gen_random_uuid()::text;
  p1 timestamptz; p2 timestamptz; p3 timestamptz;
  s record; mods jsonb; teach jsonb; cnt int; ok boolean; sqlstate_seen text;
begin
  insert into auth.users (id, email, instance_id, aud, role) values
    (u1, u1 || '@t028.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u2, u2 || '@t028.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u3, u3 || '@t028.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

  -- ---------------------------------------------------------------- CHECK
  insert into _r (name, ok) select 'product_type CHECK is exactly retreat/client_hub/teach',
    (select pg_get_constraintdef(oid) ~ 'retreat' and pg_get_constraintdef(oid) ~ 'client_hub' and pg_get_constraintdef(oid) ~ 'teach'
       from pg_constraint where conname = 'tenants_product_type_check' and conrelid = 'public.tenants'::regclass);
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  begin
    insert into public.tenants (name, product_type) values ('x', 'mystery');
    ok := false;
  exception when check_violation then ok := true; end;
  insert into _r (name, ok) values ('an unknown product_type is still rejected (23514)', ok);

  -- ------------------------------------------------------- create as owners
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.tenants (name, product_type, timezone) values ('R-retreat', 'retreat', 'UTC') returning id into r;
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  insert into public.tenants (name, product_type, timezone) values ('T-teach', 'teach', 'Asia/Bangkok') returning id into t;
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  insert into public.tenants (name, product_type, timezone) values ('H-hub', 'client_hub', 'UTC') returning id into h;
  reset role;
  insert into _r (name, ok) values ('retreat, teach and client_hub Spaces can all be created', r is not null and t is not null and h is not null);

  -- entitlements (insert only if the creation trigger did not provide one)
  insert into public.space_entitlements (tenant_id, access_type, access_ends_at)
    select x, 'complimentary', now() + interval '1 year' from unnest(array[r, t, h]) x
    on conflict (tenant_id) do nothing;

  -- ------------------------------------------------------------- RETREAT
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.brand_configs (tenant_id, name, hero_image_ref) values (r, 'R', r || '/brand/hero/' || up_img || '/draft.webp')
    on conflict (tenant_id) do update set hero_image_ref = excluded.hero_image_ref;
  insert into public.module_configs (tenant_id, module_key, enabled, image_ref, image_position)
    values (r, 'meals', true, r || '/meals/_cover/' || up_old || '/draft.webp', '{"x":0.25,"y":0.75}');
  insert into public.module_items (tenant_id, module_key, title, image_ref, metadata)
    values (r, 'meals', 'Dinner', r || '/meals/m1/' || up_img || '/draft.webp', '{"mealType":"dinner","imagePosition":{"x":0.1,"y":0.9}}');
  p1 := public.publish_space(r);
  select * into s from public.published_spaces where tenant_id = r;
  mods := s.modules;
  insert into _r (name, ok) values ('retreat publish: product_type retreat, status live',
    s.product_type = 'retreat' and (select status from public.tenants where id = r) = 'live');
  insert into _r (name, ok) values ('retreat snapshot has no teach key', not (mods ? 'teach'));
  insert into _r (name, ok) values ('retreat moduleCovers: published imageRef + imagePosition',
    mods->'moduleCovers'->'meals'->>'imageRef' = r || '/meals/_cover/' || up_old || '/published.webp'
    and mods->'moduleCovers'->'meals'->'imagePosition' = '{"x":0.25,"y":0.75}'::jsonb);
  insert into _r (name, ok) values ('retreat item imageRef + imagePosition preserved',
    mods->'meals'->0->>'imageRef' = r || '/meals/m1/' || up_img || '/published.webp'
    and mods->'meals'->0->'imagePosition' = '{"x":0.1,"y":0.9}'::jsonb);
  insert into _r (name, ok) values ('retreat brand hero published in the same uploadId folder',
    mods->'brand'->'hero'->>'imageRef' = r || '/brand/hero/' || up_img || '/published.webp');
  p2 := public.publish_space(r);
  insert into _r (name, ok) values ('retreat republish succeeds (now() is transaction time, so published_at is >=)', p2 >= p1);
  reset role;

  -- --------------------------------------------------------------- TEACH
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.brand_configs (tenant_id, name, hero_image_ref) values (t, 'T', t || '/brand/hero/' || up_img || '/draft.webp')
    on conflict (tenant_id) do update set hero_image_ref = excluded.hero_image_ref;
  insert into public.module_settings (tenant_id, module_key, data) values
    (t, 'teachProfile', '{"displayName":"Teacher"}'),
    (t, 'teachStyle', '{"preset":"calm"}'),
    (t, 'dailyInspiration', '{"enabled":true,"text":"Breathe"}'),
    (t, 'teachAbout', json_build_object('about', 'Hello', 'profile', json_build_object('imageRef', t || '/teachAbout/profile/' || up_set || '/draft.webp'))::jsonb),
    (t, 'teachContact', '{"whatsapp":"+66000000000"}'),
    (t, 'teachExplore', json_build_object('cards', json_build_object('teachReadings', json_build_object('imageRef', t || '/teachExplore/teachReadings/' || up_set || '/draft.webp')))::jsonb);
  insert into public.module_configs (tenant_id, module_key, enabled) values
    (t, 'teachReadings', true), (t, 'teachAudio', true), (t, 'teachContact', true), (t, 'customPages', false);
  insert into public.module_items (tenant_id, module_key, title, description, image_ref, metadata, sort_order) values
    (t, 'teachClasses', 'Morning flow', 'see other/draft.webp and https://example.test/a/draft.webp', null,
       '{"startDate":"2026-10-05","startTime":"09:00","endTime":"10:00","timezone":"Asia/Bangkok","recurrence":{"freq":"weekly","interval":1,"byWeekday":[1]}}', 0),
    (t, 'teachAvailability', 'Mon private', null, null, '{"repeat":"weekly","weekday":1,"from":"10:00","to":"12:00","enabled":true}', 0),
    (t, 'teachAvailability', 'Hidden private', null, null, '{"repeat":"weekly","weekday":2,"from":"10:00","to":"12:00","enabled":false}', 1),
    (t, 'teachGallery', 'Gallery', null, t || '/teachGallery/g1/' || up_img || '/draft.webp', '{}', 0),
    (t, 'teachCertificates', 'Cert', null, null, '{}', 0),
    (t, 'teachReadings', 'A reading', null, null, '{"date":"2026-10-01"}', 0),
    (t, 'teachAudio', 'A practice', null, null, json_build_object('audioRef', t || '/teachAudioFile/a1/' || up_aud || '/draft.mp3', 'durationSeconds', 60)::jsonb, 0),
    (t, 'customPages', 'Page on', 'body', null, '{"enabled":true}', 0),
    (t, 'customPages', 'Page off', 'body', null, '{"enabled":false}', 1);
  p1 := public.publish_space(t);
  select * into s from public.published_spaces where tenant_id = t;
  mods := s.modules; teach := mods->'teach';
  insert into _r (name, ok) values ('teach publish: product_type teach, tenant live, teach payload present and non-empty',
    s.product_type = 'teach' and (select status from public.tenants where id = t) = 'live'
    and jsonb_typeof(teach) = 'object' and teach <> '{}'::jsonb);
  insert into _r (name, ok) values ('teach settings: all six keys published',
    (select count(*) from jsonb_object_keys(teach->'settings')) = 6);
  insert into _r (name, ok) values ('teach items: classes/availability/gallery/certificates/readings/audio present; custom pages absent while the module is off',
    teach->'items' ?& array['teachClasses','teachAvailability','teachGallery','teachCertificates','teachReadings','teachAudio']
    and not (teach->'items' ? 'customPages'));
  insert into _r (name, ok) values ('teach availability: a window with metadata.enabled=false is not published',
    jsonb_array_length(teach->'items'->'teachAvailability') = 1);
  insert into _r (name, ok) values ('teach recurring class + timezone metadata passes through untouched',
    teach->'items'->'teachClasses'->0->'metadata'->>'timezone' = 'Asia/Bangkok'
    and teach->'items'->'teachClasses'->0->'metadata'->'recurrence'->>'freq' = 'weekly');
  insert into _r (name, ok) values ('teach audioRef rewritten to published.* in the SAME uploadId folder',
    teach->'items'->'teachAudio'->0->'metadata'->>'audioRef' = t || '/teachAudioFile/a1/' || up_aud || '/published.mp3');
  insert into _r (name, ok) values ('teach gallery + settings images rewritten in their own uploadId folders',
    teach->'items'->'teachGallery'->0->>'imageRef' = t || '/teachGallery/g1/' || up_img || '/published.webp'
    and teach->'settings'->'teachAbout'->'profile'->>'imageRef' = t || '/teachAbout/profile/' || up_set || '/published.webp'
    and teach->'settings'->'teachExplore'->'cards'->'teachReadings'->>'imageRef' = t || '/teachExplore/teachReadings/' || up_set || '/published.webp');
  insert into _r (name, ok) values ('teach brand hero published',
    mods->'brand'->'hero'->>'imageRef' = t || '/brand/hero/' || up_img || '/published.webp');
  insert into _r (name, ok) values ('no tenant draft ref survives anywhere in the published teach snapshot', (mods::text) !~ ('"' || t::text || '/[^"]*/draft\.[a-zA-Z0-9]+"'));
  insert into _r (name, ok) values ('free text that merely mentions /draft. is never rewritten',
    teach->'items'->'teachClasses'->0->>'description' = 'see other/draft.webp and https://example.test/a/draft.webp');

  -- Explore module toggled on later: custom pages publish (only the enabled one)
  update public.module_configs set enabled = true where tenant_id = t and module_key = 'customPages';
  update public.module_items set metadata = '{"enabled":true}' where tenant_id = t and module_key = 'teachAudio' and false;
  p2 := public.publish_space(t);
  select modules into mods from public.published_spaces where tenant_id = t;
  insert into _r (name, ok) values ('teach republish succeeds and now includes only the enabled custom page',
    p2 >= p1 and jsonb_array_length(mods->'teach'->'items'->'customPages') = 1
    and mods->'teach'->'items'->'customPages'->0->>'title' = 'Page on');

  -- Explore module switched off: its content stops being published
  update public.module_configs set enabled = false where tenant_id = t and module_key = 'teachReadings';
  p3 := public.publish_space(t);
  select modules into mods from public.published_spaces where tenant_id = t;
  insert into _r (name, ok) values ('a switched-off Explore module (readings) publishes nothing', p3 >= p2 and not (mods->'teach'->'items' ? 'teachReadings'));

  -- Audio replacement: a new uploadId republishes at its own folder
  update public.module_items set metadata = json_build_object('audioRef', t || '/teachAudioFile/a1/' || up_old || '/draft.mp3')::jsonb
    where tenant_id = t and module_key = 'teachAudio';
  perform public.publish_space(t);
  select modules into mods from public.published_spaces where tenant_id = t;
  insert into _r (name, ok) values ('replaced audio republishes at the new uploadId folder (old folder is no longer referenced)',
    mods->'teach'->'items'->'teachAudio'->0->'metadata'->>'audioRef' = t || '/teachAudioFile/a1/' || up_old || '/published.mp3');
  reset role;

  -- ------------------------------------------------------------ CLIENT HUB
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.publish_space(h);
  select modules into mods from public.published_spaces where tenant_id = h;
  insert into _r (name, ok) values ('client_hub publish never gets a teach payload', not (mods ? 'teach'));

  -- --------------------------------------------------------- failure cases
  begin perform public.publish_space(t); ok := false;
  exception when others then ok := true; end;
  insert into _r (name, ok) values ('no membership: publishing someone else''s Teach Space fails', ok);
  begin perform public.publish_space(ghost); ok := false;
  exception when others then ok := sqlerrm like 'Space not found%'; end;
  insert into _r (name, ok) values ('missing tenant: "Space not found" error', ok);
  reset role;
  set local role anon;
  begin perform public.publish_space(t); ok := false; exception when insufficient_privilege then ok := true; end;
  insert into _r (name, ok) values ('anon cannot execute publish_space', ok);
  begin perform public.build_teach_payload(t); ok := false; exception when insufficient_privilege then ok := true; end;
  insert into _r (name, ok) values ('anon cannot execute build_teach_payload', ok);
  reset role;

  -- a non-member calling build_teach_payload directly sees nothing (RLS, security invoker)
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into _r (name, ok) values ('build_teach_payload for a non-member returns an empty payload (RLS)',
    public.build_teach_payload(t) = '{"items": {}, "settings": {}}'::jsonb);
  reset role;
end $$;

select n, name, ok from _r order by n;
do $$ begin
  if exists (select 1 from _r where not ok) then raise exception 'VERIFICATION FAILED: %', (select string_agg(name, '; ') from _r where not ok); end if;
end $$;
rollback;
