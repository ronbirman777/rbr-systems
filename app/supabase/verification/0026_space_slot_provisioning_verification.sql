-- Task 021 verification: run against LOCAL Postgres only, as the postgres role.
--   docker exec -i supabase_db_app psql -U postgres -v ON_ERROR_STOP=1 < this-file
-- Everything runs inside one transaction that is ROLLED BACK; no data persists.
begin;

create temp table _r (n int, name text, ok boolean);
grant all on _r to public;

do $$
declare
  a uuid := gen_random_uuid();  -- brand-new signup
  z uuid := gen_random_uuid();  -- explicit zero-capacity row created BEFORE the repair
  v uuid := gen_random_uuid();  -- existing valid entitlement (5)
  l uuid := gen_random_uuid();  -- legacy account, no row, owns 0 Spaces
  l2 uuid := gen_random_uuid(); -- legacy account, no row, owns 3 Spaces
  t uuid;
  cnt int; v_allowed int; i int;
  ok boolean;
begin
  -- 1. new signup receives the default entitlement (trigger on auth.users)
  insert into auth.users (id, email, instance_id, aud, role) values (a, a||'@t021.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  select slots_allowed into v_allowed from public.user_space_slots where user_id = a;
  insert into _r values (1, 'new signup gets exactly 1 row with the schema default (1)', v_allowed = 1);

  -- 2. repeated provisioning is idempotent (and does not raise/alter an existing valid entitlement)
  update public.user_space_slots set slots_allowed = 5 where user_id = a;
  insert into public.user_space_slots (user_id) values (a) on conflict (user_id) do nothing;
  select count(*), max(slots_allowed) into cnt, v_allowed from public.user_space_slots where user_id = a;
  insert into _r values (2, 'repeat provisioning: still 1 row, valid entitlement (5) unchanged', cnt = 1 and v_allowed = 5);

  -- 3. explicit zero-capacity row survives the legacy repair statement
  --    (insert user WITHOUT trigger effect by removing its auto row, then set 0)
  insert into auth.users (id, email, instance_id, aud, role) values (z, z||'@t021.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  update public.user_space_slots set slots_allowed = 0 where user_id = z;

  -- 4. existing valid entitlement
  insert into auth.users (id, email, instance_id, aud, role) values (v, v||'@t021.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  update public.user_space_slots set slots_allowed = 5 where user_id = v;

  -- 5. legacy accounts: create then DELETE the auto row to simulate pre-trigger accounts
  insert into auth.users (id, email, instance_id, aud, role) values (l, l||'@t021.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  insert into auth.users (id, email, instance_id, aud, role) values (l2, l2||'@t021.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  -- l2 legitimately owns 3 Spaces (created while capacity enforcement is
  -- suspended for setup only; DDL is transactional and rolled back).
  alter table public.tenants disable trigger enforce_space_slot_capacity_trigger;
  perform set_config('request.jwt.claims', json_build_object('sub', l2, 'role', 'authenticated')::text, true);
  for i in 1..3 loop
    insert into public.tenants (name, product_type, created_by) values ('t021 legacy '||i, 'retreat', l2);
  end loop;
  perform set_config('request.jwt.claims', '', true);
  alter table public.tenants enable trigger enforce_space_slot_capacity_trigger;
  delete from public.user_space_slots where user_id in (l, l2);
end $$;

-- run the legacy repair (exact statement body from 0026) TWICE
\set ON_ERROR_STOP on
create temp table _repair_counts (run int, inserted int);
grant all on _repair_counts to public;

with ins as (
  insert into public.user_space_slots (user_id, slots_allowed)
  select u.id, greatest(1, coalesce(owned.owned_count, 0))
  from auth.users u
  left join (select user_id, count(*) owned_count from public.tenant_members where role='owner' group by user_id) owned on owned.user_id = u.id
  on conflict (user_id) do nothing
  returning 1)
insert into _repair_counts select 1, count(*) from ins;
with ins as (
  insert into public.user_space_slots (user_id, slots_allowed)
  select u.id, greatest(1, coalesce(owned.owned_count, 0))
  from auth.users u
  left join (select user_id, count(*) owned_count from public.tenant_members where role='owner' group by user_id) owned on owned.user_id = u.id
  on conflict (user_id) do nothing
  returning 1)
insert into _repair_counts select 2, count(*) from ins;

insert into _r select 3, 'legacy repair: second run inserts nothing (one-time / idempotent)', (select inserted from _repair_counts where run = 2) = 0;
insert into _r select 4, 'legacy repair: repaired 2 synthetic legacy accounts on first run', (select inserted from _repair_counts where run = 1) >= 2;
insert into _r select 5, 'legacy repair: 0-Space legacy account -> 1', (select slots_allowed from public.user_space_slots s join auth.users u on u.id = s.user_id where u.email like '%t021.test' and not exists (select 1 from public.tenant_members m where m.user_id = u.id and m.role='owner') and s.slots_allowed = 1 limit 1) = 1;
insert into _r select 6, 'legacy repair: 3-Space legacy account -> 3 (never over-limit)',
  exists (select 1 from public.user_space_slots s where s.slots_allowed = 3 and s.user_id in (select user_id from public.tenant_members where role='owner' group by user_id having count(*)=3 and bool_and(true)));
insert into _r select 7, 'zero-capacity row remains 0 after repair', exists (select 1 from public.user_space_slots s join auth.users u on u.id = s.user_id where u.email like '%t021.test' and s.slots_allowed = 0);
insert into _r select 8, 'existing valid entitlement (5) unchanged after repair', (select count(*) from public.user_space_slots s join auth.users u on u.id = s.user_id where u.email like '%t021.test' and s.slots_allowed = 5) = 2;
insert into _r select 9, 'no duplicate rows possible (PK on user_id)', (select count(*) from (select user_id from public.user_space_slots group by user_id having count(*) > 1) d) = 0;
insert into _r select 10, 'every auth user now has exactly one row', (select count(*) from auth.users u where not exists (select 1 from public.user_space_slots s where s.user_id = u.id)) = 0;
insert into _r select 11, 'trigger function not executable by anon/authenticated',
  not has_function_privilege('anon', 'public.provision_user_space_slot()', 'execute')
  and not has_function_privilege('authenticated', 'public.provision_user_space_slot()', 'execute');

-- 12/13. capacity enforcement is unchanged and shared: a fresh account creates one Space
--        (product_type is irrelevant), then is blocked with SLOT_LIMIT_REACHED.
do $$
declare
  u uuid := gen_random_uuid(); ok1 boolean := false; blocked boolean := false; t uuid; hint text;
begin
  insert into auth.users (id, email, instance_id, aud, role) values (u, u||'@t021.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.tenants (name, product_type) values ('t021 flow space', 'retreat') returning id into t;
  ok1 := true;
  begin
    insert into public.tenants (name, product_type) values ('t021 second flow', 'retreat');
  exception when others then
    get stacked diagnostics hint = pg_exception_hint;
    blocked := (hint = 'SLOT_LIMIT_REACHED');
  end;
  reset role;
  insert into _r values (12, 'new account creates its first Flow Space (consumes shared capacity)', ok1);
  insert into _r values (13, 'full-capacity account is blocked with SLOT_LIMIT_REACHED', blocked);
end $$;

select case when ok then 'PASS' else 'FAIL' end as result, n, name from _r order by n;
select case when count(*) filter (where not ok) = 0 then 'ALL PASS ('||count(*)||')' else 'FAILURES: '||count(*) filter (where not ok) end as summary from _r;
rollback;
