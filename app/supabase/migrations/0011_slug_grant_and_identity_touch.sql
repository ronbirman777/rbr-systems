-- Self Service Phase 1 hardening follow-up. Two independent, narrowly
-- scoped fixes confirmed during live verification of 0010 - nothing else
-- changes. Does not modify or re-run 0010.

-- ---------------------------------------------------------------------
-- 1. is_slug_available(text) was reachable by anonymous (unauthenticated)
--    callers, not authenticated-only as 0010 intended. Root cause:
--    `revoke all on function ... from public` (0010) revokes the PUBLIC
--    pseudo-role's own grant, but Supabase provisions every new project
--    with a default privilege rule that separately grants `anon` (and
--    `authenticated`/`service_role`) direct EXECUTE on every new function
--    created in the public schema - a grant `revoke ... from public`
--    never touches. This explicitly revokes it from `anon` by name.
--    `authenticated`'s grant (from 0010) is untouched; no other function's
--    permissions and no RLS policy are touched by this migration.
-- ---------------------------------------------------------------------
revoke execute on function public.is_slug_available(text) from anon;

-- ---------------------------------------------------------------------
-- 2. Guest-facing tenant identity fields (name, timezone, slug) written
--    directly on the tenants row - not through brand_configs/
--    schedule_items/module_items/module_settings/module_configs - never
--    advanced tenants.content_updated_at, because touch_tenant_content()
--    (0004/0005) is only attached to those other tables, never to tenants
--    itself. A Space whose organizer only renamed it (no other edit)
--    would silently keep reading as "Live" instead of "Live with
--    unpublished changes" after publishing, even though the guest-facing
--    name really is stale until Republish.
--
--    Fixed with a BEFORE UPDATE trigger on tenants that sets
--    NEW.content_updated_at := now() only when name/timezone/slug
--    actually changed (IS DISTINCT FROM - correctly handles nulls, and
--    means a same-value resave, e.g. saveDraft()'s unconditional
--    `.update({ name, timezone })` on every save, is never treated as a
--    content change). Scoped to exactly these three columns via
--    `before update of name, timezone, slug` - an update to any other
--    tenants column (status, created_by, product_type, ...) does not
--    fire this trigger at all, so publish_space()'s own
--    `update tenants set status = 'live'` cannot trigger it either.
--
--    Not recursive by construction: this is a BEFORE trigger that only
--    mutates NEW and returns it - it issues no nested UPDATE statement
--    against tenants (unlike touch_tenant_content(), which is an AFTER
--    trigger on OTHER tables that updates tenants from the outside).
--    Modifying NEW inside a BEFORE trigger changes what the single
--    in-flight UPDATE statement writes; it does not execute a further
--    UPDATE and therefore cannot re-fire this or any other trigger.
--    SECURITY INVOKER (the default, unlike the reserved-word trigger)
--    is sufficient here - the function never queries another table.
-- ---------------------------------------------------------------------
create or replace function public.touch_tenant_identity_content()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.name is distinct from old.name
     or new.timezone is distinct from old.timezone
     or new.slug is distinct from old.slug then
    new.content_updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists tenants_touch_identity_content on public.tenants;
create trigger tenants_touch_identity_content
  before update of name, timezone, slug on public.tenants
  for each row execute function public.touch_tenant_identity_content();
