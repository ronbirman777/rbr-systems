-- Task 024 — Replace Space must also reset module cover image references.
--
-- Found while making Replace remove the old Space's Storage media (same
-- task): replace_space() (0017) disabled every module_configs row but left
-- its image_ref / image_position untouched. Module covers (0020, 0024) are
-- stored there, not in module_items, so they survived Replace. Until now
-- that was masked - the old cover files also survived - so the "new" empty
-- Space silently kept the previous Space's module cover images. Once the old
-- media is (correctly) removed, those refs would point at deleted objects
-- and publishing the new Space would fail with "Object not found".
--
-- Fix: the same UPDATE that disables the modules now also clears the cover
-- reference and its focal point, so "empty draft" really means empty.
--
-- Everything else in replace_space() is unchanged (in-place reset of the
-- same tenant id; membership, entitlement, slot and archived-state semantics
-- are untouched). CREATE OR REPLACE keeps the existing grants. Forward-only.
-- Never edit 0001-0026.

create or replace function public.replace_space(p_tenant_id uuid, p_new_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_tenant_owner(p_tenant_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  delete from public.published_spaces where tenant_id = p_tenant_id;
  delete from public.module_items where tenant_id = p_tenant_id;
  delete from public.module_settings where tenant_id = p_tenant_id;
  delete from public.schedule_items where tenant_id = p_tenant_id;
  update public.module_configs
    set enabled = false, image_ref = null, image_position = null
    where tenant_id = p_tenant_id;

  update public.space_guest_access
    set mode = 'public', code_hash = null, version = version + 1, updated_at = now()
    where tenant_id = p_tenant_id;

  update public.brand_configs
    set name = '',
        logo_ref = null,
        hero_image_ref = null,
        space_image_ref = null,
        palette = 'forest-sage',
        atmosphere = 'calm-organic',
        image_style = 'rounded',
        custom_primary = null,
        custom_secondary = null,
        custom_navigation = null,
        custom_text = null,
        updated_at = now()
    where tenant_id = p_tenant_id;

  update public.tenants
    set name = coalesce(nullif(trim(p_new_name), ''), 'Untitled Retreat'),
        status = 'draft',
        slug = null,
        archived_at = null,
        updated_at = now(),
        content_updated_at = now()
    where id = p_tenant_id;
end;
$$;
