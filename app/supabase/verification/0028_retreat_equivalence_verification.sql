-- TASK 027.5 Phase 4A: Retreat snapshot equivalence, 0028 publish_space vs 0025 publish_space.
-- LOCAL Postgres only. Run from app/ after migrations 0001-0028:
--   docker exec -i <db container> sh -c 'cat > /tmp/0025.sql' < supabase/migrations/0025_focal_point_publish.sql
--   docker exec -i <db container> psql -U supabase_admin -d <local db> -v ON_ERROR_STOP=1 < this-file
-- One rolled-back transaction: publish with 0028, re-create 0025's functions inside the
-- transaction, publish again, and compare the Retreat snapshots (published_at excluded).
begin;
create temp table _eq (label text, modules jsonb, brand jsonb, name text);
grant all on _eq to public;

do $$
declare
  u uuid := gen_random_uuid(); r uuid; up text := gen_random_uuid()::text; k text;
begin
  insert into auth.users (id, email, instance_id, aud, role)
    values (u, u || '@t028.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.tenants (name, product_type, timezone) values ('R-eq', 'retreat', 'Europe/Lisbon') returning id into r;
  reset role;
  insert into public.space_entitlements (tenant_id, access_type, access_ends_at)
    values (r, 'complimentary', now() + interval '1 year') on conflict (tenant_id) do nothing;
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.brand_configs (tenant_id, name, hero_image_ref)
    values (r, 'Brand', r || '/brand/hero/' || up || '/draft.webp')
    on conflict (tenant_id) do update set hero_image_ref = excluded.hero_image_ref;
  foreach k in array array['meals','schedule','facilities','facilitators','treatments','faq','arrivalInfo','stayConnected','customPages'] loop
    insert into public.module_configs (tenant_id, module_key, enabled, image_ref, image_position)
      values (r, k, true, r || '/' || k || '/_cover/' || up || '/draft.webp', '{"x":0.3,"y":0.6}')
      on conflict (tenant_id, module_key) do update set enabled = true, image_ref = excluded.image_ref, image_position = excluded.image_position;
    insert into public.module_items (tenant_id, module_key, title, description, image_ref, metadata)
      values (r, k, 'Item ' || k, 'desc', r || '/' || k || '/i1/' || up || '/draft.webp', '{"imagePosition":{"x":0.2,"y":0.8}}');
  end loop;
  perform public.publish_space(r);
  insert into _eq select 'new', modules, null, product_type from public.published_spaces where tenant_id = r;
  reset role;

  -- stash tenant for the second half
  perform set_config('t028.r', r::text, false);
  perform set_config('t028.u', u::text, false);
end $$;

\i /tmp/0025.sql

do $$
declare r uuid := current_setting('t028.r')::uuid; u uuid := current_setting('t028.u')::uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.publish_space(r);
  insert into _eq select '0025', modules, null, product_type from public.published_spaces where tenant_id = r;
  reset role;
end $$;

select (select modules from _eq where label = 'new') = (select modules from _eq where label = '0025') as retreat_snapshot_identical,
       (select string_agg(k, ',' order by k) from jsonb_object_keys((select modules from _eq where label = 'new')) k) as top_level_keys;
do $$ begin
  if (select modules from _eq where label = 'new') is distinct from (select modules from _eq where label = '0025') then
    raise exception 'EQUIVALENCE FAILED: Retreat snapshot differs between 0028 and 0025';
  end if;
end $$;
rollback;
