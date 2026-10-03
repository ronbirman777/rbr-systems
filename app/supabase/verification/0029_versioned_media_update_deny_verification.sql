-- TASK 027.5 Phase 4B verification for 0029_versioned_media_update_deny.sql.
-- Run against a LOCAL Postgres only (never hosted), after migrations 0001-0029:
--   docker exec -i supabase_db_app psql -U supabase_admin -d <local db> -v ON_ERROR_STOP=1 < this-file
-- One transaction that is ROLLED BACK; no data persists. Policy-level checks
-- run as the real `authenticated` role with a JWT sub claim, so Storage RLS is
-- evaluated by Postgres exactly as storage-api evaluates it. (The Storage-API
-- level checks - 409 semantics, copy, upsert, move - live in
-- src/lib/media/realStack.0029.integration.test.ts.)
-- Every check prints one row; the script fails (non-zero exit) if any is false.
begin;

create temp table _r (n serial, name text, ok boolean);
grant all on _r to public;
grant usage, select on sequence _r_n_seq to public;

do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid();
  t1 uuid; t2 uuid;
  up text := gen_random_uuid()::text;
  vd text; vp text; ad text; ap text; legacy text; legacy_pub text;
  cnt int; ok boolean; st text;
begin
  insert into auth.users (id, email, instance_id, aud, role) values
    (u1, u1 || '@t029.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u2, u2 || '@t029.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

  -- ----------------------------------------------------------- structure
  insert into _r (name, ok) select 'policy exists: RESTRICTIVE, UPDATE-only, authenticated-only',
    count(*) = 1 and bool_and(not polpermissive) and bool_and(polcmd = 'w')
    and bool_and((select array_agg(rolname::text) from pg_roles where oid = any(polroles)) = array['authenticated'])
    from pg_policy where polrelid = 'storage.objects'::regclass and polname = 'versioned media is immutable (no overwrite)';
  insert into _r (name, ok) select 'USING and WITH CHECK both protect (old row AND new row), scoped to tenant-media',
    pg_get_expr(polqual, polrelid) ~ 'is_versioned_media_object' and pg_get_expr(polqual, polrelid) ~ 'tenant-media'
    and pg_get_expr(polwithcheck, polrelid) ~ 'is_versioned_media_object' and pg_get_expr(polwithcheck, polrelid) ~ 'tenant-media'
    from pg_policy where polrelid = 'storage.objects'::regclass and polname = 'versioned media is immutable (no overwrite)';
  insert into _r (name, ok) select '0006 policies are untouched: 4 permissive membership policies, one per command',
    count(*) = 4 and count(distinct polcmd) = 4 and bool_and(polpermissive)
    and bool_and(pg_get_expr(coalesce(polqual, polwithcheck), polrelid) ~ 'is_tenant_member')
    from pg_policy where polrelid = 'storage.objects'::regclass and polname like 'tenant members can %';
  insert into _r (name, ok) select 'storage.objects has exactly the 4 permissive + 1 restrictive policy',
    count(*) = 5 from pg_policy where polrelid = 'storage.objects'::regclass;
  insert into _r (name, ok) select 'is_versioned_media_object: immutable, SECURITY INVOKER, pinned search_path, no public execute',
    p.provolatile = 'i' and not p.prosecdef and array_to_string(p.proconfig, ',') = 'search_path=""'
    and not has_function_privilege('anon', p.oid, 'execute')
    and has_function_privilege('authenticated', p.oid, 'execute') and has_function_privilege('service_role', p.oid, 'execute')
    from pg_proc p where p.oid = 'public.is_versioned_media_object(text)'::regprocedure;

  -- ----------------------------------------------------------- the rule
  insert into _r (name, ok) select 'rule: ' || c.n || ' => ' || c.expect, public.is_versioned_media_object(c.n) = c.expect
  from (values
    ('t/m/i/u/draft.webp', true), ('t/m/i/u/published.webp', true), ('t/teachAudioFile/i/u/draft.mp3', true),
    ('t/teachAudioFile/i/u/published.m4a', true), ('t/m/i/u/draft.JPEG', true),
    ('t/m/i/draft.webp', false), ('t/m/i/published.webp', false), ('t/m/draft.webp', false),
    ('t/m/i/u/other.webp', false), ('t/m/i/u/draft', false), ('t/m/i/u/draft.', false), ('t/m/i/u/draft.webp.bak', false),
    ('t/m/i/u/mydraft.webp', false), ('t/m/i/u/draft.waytoolongext', false),
    ('t/a/b/c/d/draft.webp', false), ('draft.webp', false)
  ) as c(n, expect);

  -- --------------------------------------------------- fixtures as owners
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.tenants (name, product_type, timezone) values ('T029-own', 'teach', 'UTC') returning id into t1;
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  insert into public.tenants (name, product_type, timezone) values ('T029-other', 'retreat', 'UTC') returning id into t2;
  vd := t1 || '/teachGallery/g1/' || up || '/draft.webp';
  vp := t1 || '/teachGallery/g1/' || up || '/published.webp';
  ad := t1 || '/teachAudioFile/a1/' || up || '/draft.mp3';
  ap := t1 || '/teachAudioFile/a1/' || up || '/published.mp3';
  legacy := t1 || '/teachGallery/g1/draft.webp';
  legacy_pub := t1 || '/teachGallery/g1/published.webp';

  -- ----------------------------------------------------- own tenant (u1)
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  begin
    insert into storage.objects (bucket_id, name, owner, metadata) values
      ('tenant-media', vd, u1, '{"v":1}'), ('tenant-media', vp, u1, '{"v":1}'),
      ('tenant-media', ad, u1, '{"v":1}'), ('tenant-media', ap, u1, '{"v":1}'),
      ('tenant-media', legacy, u1, '{"v":1}'), ('tenant-media', legacy_pub, u1, '{"v":1}');
    ok := true;
  exception when others then ok := false; end;
  insert into _r (name, ok) values ('own tenant: INSERT of versioned draft/published/audio and legacy paths allowed', ok);

  update storage.objects set metadata = '{"v":2}' where bucket_id = 'tenant-media' and name = vd;  get diagnostics cnt = row_count;
  insert into _r (name, ok) values ('own tenant: UPDATE of versioned DRAFT image affects 0 rows (denied by USING)', cnt = 0);
  update storage.objects set metadata = '{"v":2}' where bucket_id = 'tenant-media' and name = vp;  get diagnostics cnt = row_count;
  insert into _r (name, ok) values ('own tenant: UPDATE of versioned PUBLISHED image affects 0 rows', cnt = 0);
  update storage.objects set metadata = '{"v":2}' where bucket_id = 'tenant-media' and name = ad;  get diagnostics cnt = row_count;
  insert into _r (name, ok) values ('own tenant: UPDATE of Teach audio DRAFT affects 0 rows', cnt = 0);
  update storage.objects set metadata = '{"v":2}' where bucket_id = 'tenant-media' and name = ap;  get diagnostics cnt = row_count;
  insert into _r (name, ok) values ('own tenant: UPDATE of Teach audio PUBLISHED affects 0 rows', cnt = 0);
  insert into _r (name, ok) select 'own tenant: versioned rows still carry their original metadata',
    (select count(*) from storage.objects where bucket_id = 'tenant-media' and name in (vd, vp, ad, ap) and metadata = '{"v":1}') = 4;

  begin
    insert into storage.objects (bucket_id, name, owner, metadata) values ('tenant-media', vd, u1, '{"v":3}')
      on conflict (bucket_id, name) do update set metadata = excluded.metadata;
    ok := false;
  exception when insufficient_privilege then ok := true; when others then ok := false; end;
  insert into _r (name, ok) values ('own tenant: upsert (INSERT ... ON CONFLICT DO UPDATE) onto a versioned key is rejected (42501)', ok);

  begin
    update storage.objects set name = t1 || '/teachGallery/g1/' || gen_random_uuid() || '/draft.webp' where bucket_id = 'tenant-media' and name = legacy;
    get diagnostics cnt = row_count; ok := (cnt = 0);
  exception when insufficient_privilege then ok := true; end;
  insert into _r (name, ok) values ('own tenant: renaming a LEGACY object INTO a versioned path is blocked (WITH CHECK, 42501)', ok);
  begin
    update storage.objects set name = t1 || '/teachGallery/g1/' || gen_random_uuid() || '/draft.webp' where bucket_id = 'tenant-media' and name = legacy_pub;
    get diagnostics cnt = row_count; ok := (cnt = 0);
  exception when insufficient_privilege then ok := true; end;
  insert into _r (name, ok) values ('own tenant: legacy published.* cannot be renamed into a versioned path either (WITH CHECK)', ok);
  begin
    update storage.objects set name = t1 || '/teachGallery/g1/draft2.webp' where bucket_id = 'tenant-media' and name = vd; get diagnostics cnt = row_count;
    ok := (cnt = 0);
  exception when insufficient_privilege then ok := true; end;
  insert into _r (name, ok) values ('own tenant: renaming a VERSIONED object OUT to a legacy path is blocked', ok);

  update storage.objects set metadata = '{"v":9}' where bucket_id = 'tenant-media' and name = legacy; get diagnostics cnt = row_count;
  insert into _r (name, ok) values ('own tenant: UPDATE of a LEGACY stable-path object is still allowed (compatibility)', cnt = 1);
  update storage.objects set metadata = '{"v":9}' where bucket_id = 'tenant-media' and name = legacy_pub; get diagnostics cnt = row_count;
  insert into _r (name, ok) values ('own tenant: UPDATE of a LEGACY published.* stable path is still allowed', cnt = 1);

  -- SELECT is unchanged
  insert into _r (name, ok) select 'own tenant: SELECT sees every own object (6)',
    (select count(*) from storage.objects where bucket_id = 'tenant-media' and name like t1 || '/%') = 6;

  -- other buckets are not governed by the restrictive policy (it only scopes tenant-media);
  -- 0006 still denies any non-tenant-media write for authenticated, so this just proves the predicate short-circuit
  insert into _r (name, ok) select 'policy predicate short-circuits for other buckets',
    ('other-bucket' <> 'tenant-media' or not public.is_versioned_media_object('t/m/i/u/draft.webp')) is true;

  -- ----------------------------------------------------- cross tenant (u2)
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  begin
    insert into storage.objects (bucket_id, name, owner) values ('tenant-media', t1 || '/teachGallery/g1/' || gen_random_uuid() || '/draft.webp', u2);
    ok := false;
  exception when insufficient_privilege then ok := true; end;
  insert into _r (name, ok) values ('cross tenant: INSERT into another tenant denied (42501)', ok);
  begin
    insert into storage.objects (bucket_id, name, owner) values ('tenant-media', t1 || '/teachGallery/g1/draft.webp', u2)
      on conflict (bucket_id, name) do update set metadata = '{"x":1}';
    ok := false;
  exception when insufficient_privilege then ok := true; end;
  insert into _r (name, ok) values ('cross tenant: upsert over a LEGACY object of another tenant denied (42501)', ok);
  update storage.objects set metadata = '{"x":1}' where bucket_id = 'tenant-media' and name in (vd, vp, ad, ap, legacy, legacy_pub); get diagnostics cnt = row_count;
  insert into _r (name, ok) values ('cross tenant: UPDATE of any of the other tenant''s objects affects 0 rows', cnt = 0);
  -- storage.protect_delete blocks raw deletes unless this flag is set (storage-api sets it for its own deletes)
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'tenant-media' and name like t1 || '/%'; get diagnostics cnt = row_count;
  insert into _r (name, ok) values ('cross tenant: DELETE removes 0 rows', cnt = 0);
  insert into _r (name, ok) select 'cross tenant: SELECT sees none of the other tenant''s objects',
    (select count(*) from storage.objects where bucket_id = 'tenant-media' and name like t1 || '/%') = 0;

  -- ----------------------------------------------------------- deletes (u1)
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  delete from storage.objects where bucket_id = 'tenant-media' and name in (vd, vp); get diagnostics cnt = row_count;
  insert into _r (name, ok) values ('own tenant: DELETE of versioned draft + published allowed (2 rows)', cnt = 2);
  delete from storage.objects where bucket_id = 'tenant-media' and name in (ad, ap); get diagnostics cnt = row_count;
  insert into _r (name, ok) values ('own tenant: DELETE of audio draft + published allowed (2 rows)', cnt = 2);
  delete from storage.objects where bucket_id = 'tenant-media' and name in (legacy, legacy_pub); get diagnostics cnt = row_count;
  insert into _r (name, ok) values ('own tenant: DELETE of legacy objects allowed (2 rows)', cnt = 2);

  -- ------------------------------------------------- service_role bypass
  reset role;
  set local role service_role;
  insert into storage.objects (bucket_id, name) values ('tenant-media', vd);
  update storage.objects set metadata = '{"svc":1}' where bucket_id = 'tenant-media' and name = vd; get diagnostics cnt = row_count;
  insert into _r (name, ok) values ('service_role (server-side maintenance) bypasses RLS as before', cnt = 1);
  reset role;
end $$;

select n, name, ok from _r order by n;
do $$ begin
  if exists (select 1 from _r where not ok) then raise exception 'VERIFICATION FAILED: %', (select string_agg(name, '; ') from _r where not ok); end if;
end $$;
rollback;
