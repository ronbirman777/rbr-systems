-- Time to Flow launch hardening: tighten the tenants INSERT policy.
--
-- Before this migration, "tenants: authenticated users can create" only
-- checked auth.uid() is not null - it never validated that a client-
-- supplied created_by actually matched the inserting user. Not previously
-- exploitable in practice: created_by only ever grants the OR fallback in
-- the tenants SELECT policy (see 0003_tenant_created_by.sql) to whichever
-- id it names, and every other authorization check in the schema is based
-- on the trigger-created tenant_members owner row, which this column
-- can't influence either way. Tightened anyway for defense in depth, per
-- the launch audit.
--
-- Postgres fills column DEFAULTs before evaluating INSERT policies, so a
-- client that omits created_by entirely (the app's own saveDraft() insert
-- always does - see actions.ts) still passes: the DEFAULT auth.uid() from
-- 0003 satisfies created_by = auth.uid() automatically. Only an insert
-- that explicitly names a *different* user's id as created_by is now
-- rejected.
drop policy if exists "tenants: authenticated users can create" on public.tenants;
create policy "tenants: authenticated users can create"
  on public.tenants for insert
  with check (auth.uid() is not null and created_by = auth.uid());
