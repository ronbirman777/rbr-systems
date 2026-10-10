select line from (
  select 'fn|' || p.oid::regprocedure::text || '|' || md5(pg_get_functiondef(p.oid))
         || '|acl=' || coalesce(array_to_string(p.proacl, ','), '') as line
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind <> 'a'
  union all
  select 'tbl|' || c.relname || '|' || c.relkind::text || '|rls=' || c.relrowsecurity
         || '|acl=' || coalesce(array_to_string(c.relacl, ','), '')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'S')
  union all
  select 'col|' || c.relname || '.' || a.attname || '|' || format_type(a.atttypid, a.atttypmod)
         || '|nn=' || a.attnotnull || '|def=' || coalesce(md5(pg_get_expr(d.adbin, d.adrelid)), '')
    from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v') and a.attnum > 0 and not a.attisdropped
  union all
  select 'con|' || c.conrelid::regclass::text || '|' || c.conname || '|' || md5(pg_get_constraintdef(c.oid))
    from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname = 'public'
  union all
  select 'idx|' || schemaname || '.' || indexname || '|' || md5(indexdef)
    from pg_indexes where schemaname in ('public', 'storage')
  union all
  select 'pol|' || schemaname || '.' || tablename || '|' || policyname || '|' || permissive || '|' || cmd
         || '|' || array_to_string(roles, ',') || '|' || md5(coalesce(qual, '')) || '|' || md5(coalesce(with_check, ''))
    from pg_policies where schemaname in ('public', 'storage')
  union all
  select 'trg|' || t.tgrelid::regclass::text || '|' || t.tgname || '|' || md5(pg_get_triggerdef(t.oid))
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
   where not t.tgisinternal and n.nspname in ('public', 'storage', 'auth')
) s order by 1;
