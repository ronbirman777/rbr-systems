-- TASK 027.5 PRE-APPLY preflight for 0028 + 0029. STRICTLY READ-ONLY.
--
-- One SELECT over the system catalogs and the migration ledger. It creates nothing and
-- writes nothing; safe on Production. Run BEFORE applying 0028/0029:
--   supabase db query --linked --project-ref <ref> -f this-file
-- Output: one PASS/FAIL row per assumption, then OVERALL (expected 'OVERALL PASS' on a
-- database that is at the pre-0028 lineage). Rows with result INFO are context only.
-- Any FAIL means an assumption of 0028/0029 differs: stop and investigate before applying.
--
-- Expected pre-state hash: public.publish_space body of 0025_focal_point_publish.sql,
-- md5 1867ffb2987432d109e0b99d8b857021 (text between the `$$` markers).
with
fn as (
  select p.oid, p.proname, p.prosecdef, p.proconfig, p.prorettype::regtype::text as ret, md5(p.prosrc) as h,
         has_function_privilege('anon', p.oid, 'execute') as anon_x,
         has_function_privilege('authenticated', p.oid, 'execute') as auth_x,
         exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0) as public_x
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'publish_space'
),
pol as (
  select polname, polpermissive, polcmd, pg_get_expr(polqual, polrelid) as q, pg_get_expr(polwithcheck, polrelid) as wc
  from pg_policy where polrelid = 'storage.objects'::regclass
),
ledger as (
  select version, name from supabase_migrations.schema_migrations
),
checks(n, name, ok) as (
  values
  (1, 'migration ledger has no 0028 / 0029 entry',
      not exists (select 1 from ledger where version in ('0028', '0029') or version ~ '^002[89]' or name ~ '^002[89]_|teach_foundation|versioned_media_update_deny')),
  (2, 'tenants_product_type_check allows exactly retreat, client_hub (no teach yet)',
      coalesce((select array_agg(m[1] order by m[1]) = array['client_hub', 'retreat']
                from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') m
                where c.conname = 'tenants_product_type_check' and c.conrelid = 'public.tenants'::regclass), false)),
  (3, 'exactly one publish_space overload, publish_space(uuid) returning timestamptz',
      (select count(*) = 1 and bool_and(oid = 'public.publish_space(uuid)'::regprocedure) and bool_and(ret = 'timestamp with time zone') from fn)),
  (4, 'publish_space body is exactly the 0025 lineage (md5 of prosrc)',
      coalesce((select h = '1867ffb2987432d109e0b99d8b857021' from fn), false)),
  (5, 'publish_space is SECURITY INVOKER with search_path=public; authenticated may execute; anon and PUBLIC may not',
      coalesce((select not prosecdef and proconfig = array['search_path=public'] and auth_x and not anon_x and not public_x from fn), false)),
  (6, 'build_teach_payload does not exist yet',
      to_regprocedure('public.build_teach_payload(uuid)') is null),
  (7, 'is_versioned_media_object does not exist yet',
      to_regprocedure('public.is_versioned_media_object(text)') is null),
  (8, 'storage.objects has the 4 permissive membership policies (one per command, via is_tenant_member)',
      (select count(*) = 4 and count(distinct polcmd) = 4 and bool_and(polpermissive) and bool_and(coalesce(q, wc) ~ 'is_tenant_member')
       from pol where polname like 'tenant members can %')),
  (9, 'storage.objects has no other policy (no restrictive policy, no drift): total = 4',
      (select count(*) = 4 from pol)),
  (10, 'no Teach tenants exist (tenants.product_type = teach)',
      (select count(*) = 0 from public.tenants where product_type = 'teach')),
  (11, 'no Teach module data exists (module_items / module_configs / module_settings with teach* keys)',
      (select count(*) = 0 from public.module_items where module_key like 'teach%')
      and (select count(*) = 0 from public.module_configs where module_key like 'teach%')
      and (select count(*) = 0 from public.module_settings where module_key like 'teach%' or module_key = 'dailyInspiration')),
  (12, 'no published Teach snapshot exists',
      (select count(*) = 0 from public.published_spaces where product_type = 'teach' or modules ? 'teach')),
  (13, 'tenant-media bucket exists and is private',
      coalesce((select not public from storage.buckets where id = 'tenant-media'), false))
)
select n, case when ok then 'PASS' else 'FAIL' end as result, name
from checks
union all
select 90, 'INFO', 'migration ledger head = ' || coalesce((select max(version) from ledger), '(empty)') || ' (' || (select count(*) from ledger) || ' entries)'
union all
select 91, 'INFO', 'tenants by product_type: ' || coalesce((select string_agg(product_type || '=' || c, ', ' order by product_type)
                                                           from (select product_type, count(*) c from public.tenants group by 1) t), 'none')
union all
select 92, 'INFO', 'storage.objects policies: ' || coalesce((select string_agg(polname || case when polpermissive then ' [permissive]' else ' [RESTRICTIVE]' end, '; ' order by polname) from pol), 'none')
union all
select 99, case when bool_and(ok) and count(*) = 13 then 'OVERALL PASS' else 'OVERALL FAIL' end,
       count(*) || ' checks, ' || count(*) filter (where not ok) || ' failed'
from checks
order by n;
