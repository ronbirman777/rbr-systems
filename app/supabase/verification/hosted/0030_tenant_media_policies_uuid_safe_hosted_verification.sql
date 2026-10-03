-- TASK 027.5 QA correction: HOSTED verification for 0030_tenant_media_policies_uuid_safe.sql.
--
-- Run AFTER 0030 is applied (or paste 0030 between `begin;` and the DO block to
-- prove it before applying; everything is rolled back either way):
--   supabase db query --linked --project-ref <ref> -f this-file
-- The script ends with a deliberate exception that prints the report and aborts
-- the transaction (output starts with "0030 VERIFICATION PASS"; nothing commits).
--
-- It inserts synthetic users, tenants and storage.objects rows (random UUIDs, plus a
-- non-UUID "stray" folder) inside that aborted transaction and exercises the policies
-- as a real `authenticated` session.
begin;

do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid();
  t1 uuid; t2 uuid;
  rep text := ''; fails int := 0; n int; err text; st text;
  stray text := '__verify_stray_' || substr(gen_random_uuid()::text, 1, 8);
begin
  insert into auth.users (id, email, instance_id, aud, role) values
    (u1, u1 || '@verify.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u2, u2 || '@verify.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.tenants (name, product_type, timezone) values ('v1', 'teach', 'UTC') returning id into t1;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.tenants (name, product_type, timezone) values ('v2', 'teach', 'UTC') returning id into t2;
  reset role;

  insert into storage.objects (bucket_id, name) values
    ('tenant-media', t1 || '/a/draft.webp'),
    ('tenant-media', t2 || '/b/draft.webp'),
    ('tenant-media', stray || '/.emptyFolderPlaceholder'),
    ('tenant-media', 'rootlevel-' || stray);

  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1. A non-UUID folder and a root-level object no longer break reads.
  begin
    select count(*) into n from storage.objects where bucket_id = 'tenant-media';
    rep := rep || case when n = 1 then 'PASS' else 'FAIL' end || ' 1 member select sees exactly its own tenant object (' || n || E')\n';
    if n <> 1 then fails := fails + 1; end if;
  exception when others then
    get stacked diagnostics err = message_text; fails := fails + 1;
    rep := rep || 'FAIL 1 select threw: ' || err || E'\n';
  end;

  -- 2. storage.search (what storage.list uses) works for the member's own prefix.
  begin
    select count(*) into n from storage.search(t1::text, 'tenant-media', 1000, 1, 0, '', '', 'name asc');
    rep := rep || case when n = 1 then 'PASS' else 'FAIL' end || ' 2 storage.search(own tenant prefix) returns its folder (' || n || E')\n';
    if n <> 1 then fails := fails + 1; end if;
  exception when others then
    get stacked diagnostics err = message_text; fails := fails + 1;
    rep := rep || 'FAIL 2 storage.search threw: ' || err || E'\n';
  end;

  -- 3. Cross-tenant: the other tenant's objects stay invisible.
  begin
    select count(*) into n from storage.objects where bucket_id = 'tenant-media' and name like t2 || '/%';
    rep := rep || case when n = 0 then 'PASS' else 'FAIL' end || ' 3 other tenant''s objects are invisible (' || n || E')\n';
    if n <> 0 then fails := fails + 1; end if;
  exception when others then
    get stacked diagnostics err = message_text; fails := fails + 1;
    rep := rep || 'FAIL 3 select threw: ' || err || E'\n';
  end;

  -- 4. Cross-tenant INSERT is denied with an RLS error (not a cast error).
  begin
    insert into storage.objects (bucket_id, name) values ('tenant-media', t2 || '/c/draft.webp');
    fails := fails + 1; rep := rep || E'FAIL 4 cross-tenant insert was ALLOWED\n';
  exception when others then
    get stacked diagnostics err = message_text, st = returned_sqlstate;
    rep := rep || case when st = '42501' then 'PASS' else 'FAIL' end || ' 4 cross-tenant insert denied (' || st || E')\n';
    if st <> '42501' then fails := fails + 1; end if;
  end;

  -- 5. INSERT under a non-UUID folder is denied with an RLS error, not 22P02.
  begin
    insert into storage.objects (bucket_id, name) values ('tenant-media', stray || '/x.webp');
    fails := fails + 1; rep := rep || E'FAIL 5 non-uuid folder insert was ALLOWED\n';
  exception when others then
    get stacked diagnostics err = message_text, st = returned_sqlstate;
    rep := rep || case when st = '42501' then 'PASS' else 'FAIL' end || ' 5 non-uuid folder insert denied by RLS (' || st || E')\n';
    if st <> '42501' then fails := fails + 1; end if;
  end;

  -- 6. Own-tenant INSERT still works.
  begin
    insert into storage.objects (bucket_id, name) values ('tenant-media', t1 || '/d/draft.webp');
    rep := rep || E'PASS 6 own-tenant insert allowed\n';
  exception when others then
    get stacked diagnostics err = message_text; fails := fails + 1;
    rep := rep || 'FAIL 6 own-tenant insert denied: ' || err || E'\n';
  end;

  reset role;
  raise exception E'% (%)\n%', case when fails = 0 then '0030 VERIFICATION PASS' else '0030 VERIFICATION FAIL' end, fails || ' failed', rep;
end $$;

rollback;
