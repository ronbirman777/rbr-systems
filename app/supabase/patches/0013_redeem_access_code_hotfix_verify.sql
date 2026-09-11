-- Read-only. Run this immediately after applying
-- 0013_redeem_access_code_hotfix.sql to confirm all four required
-- properties directly from the live function definition. Writes nothing.

with fn as (
  select
    oid,
    prosecdef,
    proconfig,
    pg_get_functiondef(oid) as src
  from pg_proc
  where oid = 'public.redeem_access_code(uuid, text)'::regprocedure
)
select
  position('perform 1 from public.tenants where id = p_tenant_id for update' in src) > 0
    as has_tenant_lock,
  position('perform 1 from public.tenants where id = p_tenant_id for update' in src)
    as lock_position,
  position('raise exception ''This Space already has valid access''' in src)
    as entitlement_check_position,
  (
    position('perform 1 from public.tenants where id = p_tenant_id for update' in src)
    < position('raise exception ''This Space already has valid access''' in src)
  ) as lock_before_entitlement_check,
  prosecdef as is_security_definer,
  proconfig as search_path_setting
from fn;
