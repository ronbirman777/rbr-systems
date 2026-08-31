-- Fixes a real bug: PostgREST's combined INSERT ... RETURNING (what
-- .insert().select() does in one round trip) evaluates the RLS SELECT-policy
-- check for the RETURNING row in a way that isn't guaranteed to see the
-- AFTER INSERT trigger's own effect (the trigger that creates the owner's
-- tenant_members row) within that same statement. Confirmed directly: a
-- plain INSERT followed by a separate SELECT both work fine; the combined
-- INSERT+RETURNING is what fails. The app's real saveDraft() server action
-- chains .select() after .insert(), so this was a genuine production bug,
-- not just a test artifact.
--
-- Fix: track who created each tenant directly, and let the SELECT policy
-- recognize the creator immediately, independent of trigger timing. Ongoing
-- membership-based access (for other members added later) is unaffected.

alter table public.tenants
  add column if not exists created_by uuid references auth.users (id) default auth.uid();

update public.tenants set created_by = (
  select user_id from public.tenant_members
  where tenant_members.tenant_id = tenants.id and role = 'owner'
  limit 1
) where created_by is null;

drop policy if exists "tenants: members can select" on public.tenants;
create policy "tenants: members can select"
  on public.tenants for select
  using (public.is_tenant_member(id) or created_by = auth.uid());
