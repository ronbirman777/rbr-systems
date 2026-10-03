-- TASK 027.5 QA correction: POST-APPLY catalog verification for 0030. STRICTLY READ-ONLY.
-- One SELECT over pg_policy; writes nothing; safe on Production once 0030 is applied:
--   supabase db query --linked --project-ref <ref> -f this-file
-- Expected last row: 'OVERALL PASS'.
with
pol as (
  select polname, polpermissive, polcmd, pg_get_expr(polqual, polrelid) as q, pg_get_expr(polwithcheck, polrelid) as wc
  from pg_policy where polrelid = 'storage.objects'::regclass
),
mem as (select * from pol where polname like 'tenant members can %'),
checks(n, name, ok) as (
  values
  (1, '4 permissive membership policies, one per command, still keyed on is_tenant_member',
      (select count(*) = 4 and count(distinct polcmd) = 4 and bool_and(polpermissive) and bool_and(coalesce(q, wc) ~ 'is_tenant_member') from mem)),
  (2, 'every membership predicate (USING and WITH CHECK) guards the uuid cast with CASE ... ELSE false',
      (select bool_and((q is null or (q ~ 'CASE\s+WHEN' and q ~* 'ELSE\s+false' and q ~ 'tenant-media'))
                   and (wc is null or (wc ~ 'CASE\s+WHEN' and wc ~* 'ELSE\s+false' and wc ~ 'tenant-media')))
       from mem)),
  (3, 'no storage.objects policy drift: exactly the 4 membership policies + the 0029 restrictive policy',
      (select count(*) = 5 from pol)),
  (4, '0029 restrictive UPDATE policy still present and restrictive',
      (select count(*) = 1 and bool_and(not polpermissive) and bool_and(polcmd = 'w') from pol where polname = 'versioned media is immutable (no overwrite)'))
)
select n, case when ok then 'PASS' else 'FAIL' end as result, name
from checks
union all
select 99, case when bool_and(ok) and count(*) = 4 then 'OVERALL PASS' else 'OVERALL FAIL' end,
       count(*) || ' checks, ' || count(*) filter (where not ok) || ' failed'
from checks
order by n;
