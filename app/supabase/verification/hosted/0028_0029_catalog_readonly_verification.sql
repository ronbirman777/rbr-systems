-- TASK 027.5 POST-APPLY catalog verification for 0028 + 0029. STRICTLY READ-ONLY.
--
-- One SELECT over the system catalogs. It creates nothing, writes nothing, takes no
-- locks beyond a catalog read, and is safe to run on any hosted database at any time
-- (including Production) once 0028 and 0029 are applied:
--   supabase db query --linked --project-ref <ref> -f this-file
-- Output: one PASS/FAIL row per check, then a final OVERALL row (expected: 'OVERALL PASS').
--
-- Function-body checks compare md5(prosrc) with the body text between the `$$` markers
-- of the migration files at the commit that introduced them:
--   publish_space             0028_teach_foundation.sql   0548c857090b4f72a96b3f1ab9414217
--   build_teach_payload       0028_teach_foundation.sql   7b5ecf426f856fd6097eeeccb40fca14
--   is_versioned_media_object 0029_versioned_media_update_deny.sql   25c78a7a0210c23d16ba52d9a36f0796
-- If a later migration intentionally changes one of these bodies, update the hash here.
--
-- The behavioural twins (hosted/0028_teach_foundation_hosted_verification.sql and
-- hosted/0029_versioned_media_update_deny_hosted_verification.sql) prove runtime
-- behaviour inside an always-aborted transaction; this file proves the final STATE.
with
fn as (
  select p.oid, p.proname, p.prosecdef, p.provolatile, p.proconfig, p.prorettype::regtype::text as ret, md5(p.prosrc) as h,
         has_function_privilege('anon', p.oid, 'execute') as anon_x,
         has_function_privilege('authenticated', p.oid, 'execute') as auth_x,
         has_function_privilege('service_role', p.oid, 'execute') as svc_x,
         exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0) as public_x
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.oid in (
      to_regprocedure('public.publish_space(uuid)'),
      to_regprocedure('public.build_teach_payload(uuid)'),
      to_regprocedure('public.is_versioned_media_object(text)')
    )
),
pol as (
  select polname, polpermissive, polcmd, pg_get_expr(polqual, polrelid) as q, pg_get_expr(polwithcheck, polrelid) as wc,
         (select array_agg(r.rolname::text order by r.rolname) from pg_roles r where r.oid = any(polroles)) as roles
  from pg_policy where polrelid = 'storage.objects'::regclass
),
checks(n, name, ok) as (
  values
  (1, 'tenants_product_type_check allows exactly retreat, client_hub, teach',
      coalesce((select array_agg(m[1] order by m[1]) = array['client_hub', 'retreat', 'teach']
                from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') m
                where c.conname = 'tenants_product_type_check' and c.conrelid = 'public.tenants'::regclass), false)),
  (2, 'publish_space(uuid): body matches 0028, returns timestamptz, SECURITY INVOKER, search_path=public',
      coalesce((select h = '0548c857090b4f72a96b3f1ab9414217' and ret = 'timestamp with time zone' and not prosecdef
                       and proconfig = array['search_path=public'] from fn where proname = 'publish_space'), false)),
  (3, 'publish_space(uuid): authenticated may execute; anon and PUBLIC may not',
      coalesce((select auth_x and not anon_x and not public_x from fn where proname = 'publish_space'), false)),
  (4, 'build_teach_payload(uuid): body matches 0028, SECURITY INVOKER, search_path=public',
      coalesce((select h = '7b5ecf426f856fd6097eeeccb40fca14' and not prosecdef and proconfig = array['search_path=public']
                from fn where proname = 'build_teach_payload'), false)),
  (5, 'build_teach_payload(uuid): authenticated may execute; anon and PUBLIC may not',
      coalesce((select auth_x and not anon_x and not public_x from fn where proname = 'build_teach_payload'), false)),
  (6, 'is_versioned_media_object(text): body matches 0029, IMMUTABLE, SECURITY INVOKER, empty search_path',
      coalesce((select h = '25c78a7a0210c23d16ba52d9a36f0796' and provolatile = 'i' and not prosecdef
                       and proconfig = array['search_path=""'] from fn where proname = 'is_versioned_media_object'), false)),
  (7, 'is_versioned_media_object(text): authenticated + service_role may execute; anon and PUBLIC may not',
      coalesce((select auth_x and svc_x and not anon_x and not public_x from fn where proname = 'is_versioned_media_object'), false)),
  (8, 'restrictive UPDATE policy "versioned media is immutable (no overwrite)": one policy, authenticated only',
      (select count(*) = 1 and bool_and(not polpermissive) and bool_and(polcmd = 'w') and bool_and(roles = array['authenticated'])
       from pol where polname = 'versioned media is immutable (no overwrite)')),
  (9, 'that policy guards the old row (USING) and the new row (WITH CHECK), scoped to tenant-media',
      coalesce((select q ~ 'is_versioned_media_object' and q ~ 'tenant-media' and wc ~ 'is_versioned_media_object' and wc ~ 'tenant-media'
                from pol where polname = 'versioned media is immutable (no overwrite)'), false)),
  (10, '0006 membership policies untouched: 4 permissive policies, one per command, all via is_tenant_member',
      (select count(*) = 4 and count(distinct polcmd) = 4 and bool_and(polpermissive)
              and bool_and(coalesce(q, wc) ~ 'is_tenant_member')
       from pol where polname like 'tenant members can %')),
  (11, 'no storage.objects policy drift: exactly the 4 membership policies + 1 restrictive policy',
      (select count(*) = 5 from pol))
)
select n, case when ok then 'PASS' else 'FAIL' end as result, name
from checks
union all
select 99, case when bool_and(ok) and count(*) = 11 then 'OVERALL PASS' else 'OVERALL FAIL' end,
       count(*) || ' checks, ' || count(*) filter (where not ok) || ' failed'
from checks
order by n;
