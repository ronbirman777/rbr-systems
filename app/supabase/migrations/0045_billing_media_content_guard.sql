-- TASK 032 - media content guard for billing-governed (paid, non-exempt)
-- Spaces: no audio (or any other non-image bytes) behind an image reference.
--
-- Gap closed (docs/billing/ENTITLEMENTS.md, "audio bytes under an image
-- reference"): Storage policies check the tenant FOLDER, never the content.
-- A member of a paid Space could upload any bytes to their own folder through
-- the Storage API (e.g. an hour of audio named draft.webp), point an
-- image_ref / imageRef at it (module_items, module_configs, brand_configs,
-- module_settings JSON - or published_spaces.modules itself, which the owner
-- may write directly: publish_space() is SECURITY INVOKER), and the guest
-- media route would serve it. Such a file is never counted against the audio
-- allowance (0043 counts audioRef only).
--
-- Design. The trusted pipeline is the primary control; the database makes it
-- the only way in on a paid Space:
--
--   * Image uploads already go through a Server Action that re-encodes the
--     upload with sharp; from this task on it also checks the upload's magic
--     bytes first (lib/media/imageSignature.ts - JPEG/PNG/WebP only, sane
--     header, for EVERY Space). On a paid Space the re-encoded WebP is then
--     written by the SERVICE ROLE (lib/media/trustedMedia.server.ts), and
--     Publish makes the published copies with the service role too,
--     validating each new published image from its stored bytes
--     (lib/media/publish.ts, isCanonicalStoredImage) - reject + delete.
--
--   1. billing_media_member_write_allowed(name, command)  SECURITY DEFINER.
--      For a tenant-media object in a uuid tenant folder whose Space is
--      ENFORCED (billing_audio_policy, 0043 - also 'unavailable', fail
--      closed): a member session may INSERT only a versioned draft AUDIO
--      object `{tenant}/{module}/{item}/{uploadId}/draft.{mp3|m4a|aac|wav|ogg}`
--      (the browser-direct audio upload; those bytes are measured by the
--      service role at attach, 0043) and may never UPDATE (overwrite / move)
--      an object. Legacy (no billing row) and exempt Spaces: always true -
--      behaviour unchanged.
--
--   2. Two RESTRICTIVE policies on storage.objects (INSERT, UPDATE) for
--      `authenticated`, ANDed with the existing permissive policies (0006 /
--      0030), 0029's immutability policy and 0039's billing-writable
--      policies. DELETE is not restricted (removing a file launders nothing).
--      service_role bypasses RLS, as everywhere. Consequence on a paid Space:
--      every object at an image path, and every published copy, was written
--      by the service-role pipeline after validation; nothing a member
--      uploads directly can sit at an image path, and a validated object can
--      never be overwritten or deleted-and-recreated by a member.
--
--   3. Trigger billing_guard_published_media (BEFORE INSERT OR UPDATE on
--      published_spaces; only when `modules` or the tenant changes) on an
--      ENFORCED Space:
--        * every "imageRef" anywhere in the snapshot must be null, empty, or
--          `{this tenant}/{2 or 3 segments}/{draft|published}.{webp|png|jpg|jpeg}`
--          (so an image field can never name an audio object, another
--          tenant's file, or an arbitrary path) - hint MEDIA_REF_INVALID;
--        * billing_audio_assert_publishable(tenant, modules) (0043) runs on
--          the row actually written, so the 0043 audio rules also hold for a
--          DIRECT owner write to published_spaces, not only inside
--          publish_space() - hint AUDIO_LIMIT.
--      Legacy / exempt Spaces return immediately.
--
-- Why not a module_items/brand/settings trigger that forbids member writes of
-- image refs (0043's shape for audio)? Image refs live in four tables and in
-- free-form settings JSON written by ordinary Save actions; moving every one
-- of those writes to the service role would be a large, risky refactor. It is
-- also unnecessary: a draft ref only matters once it is published, the guest
-- media route serves nothing but snapshot refs (collectMediaRefs), and with
-- (2) and (3) a snapshot image ref on a paid Space can only name an image path
-- whose bytes the trusted pipeline wrote. A member may still store any string
-- in a draft field; it is either refused at publish by (3) or names an object
-- that only the trusted pipeline could have created.
--
-- publish_space() is NOT restated (its head stays 0043). No data is changed.
-- Serve-time defense in depth (application only): /api/media refuses a path
-- that the snapshot names only under imageRef unless it has an image
-- extension (and only under audioRef unless it has an audio extension).
--
-- Rollback: verification/0045_billing_media_content_guard_rollback.sql (drops
-- the trigger, the two policies and the two functions). The 0044 rollback
-- refuses while this migration is applied.
--
-- Never edit 0001-0044. Forward-only.

-- ===========================================================================
-- 1. Storage write predicate for member sessions
-- ===========================================================================
create function public.billing_media_member_write_allowed(p_name text, p_command text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_folder text := (storage.foldername(p_name))[1];
  v_mode text;
begin
  -- Not a uuid tenant folder: the permissive policies (0030) already refuse
  -- it; nothing for billing to decide here.
  if v_folder is null or v_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return true;
  end if;

  select p.mode into v_mode from public.billing_audio_policy(v_folder::uuid) p;
  if v_mode in ('legacy', 'exempt') then
    return true; -- Spaces billing does not govern: unchanged
  end if;

  -- Enforced (or unavailable -> fail closed): only the browser-direct draft
  -- AUDIO upload, at a versioned path, may be created by a member.
  if p_command = 'insert' then
    return p_name ~ ('^' || v_folder || '/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+/draft\.(mp3|m4a|aac|wav|ogg)$');
  end if;
  return false; -- no member overwrite / move on a paid Space
end;
$$;
revoke all on function public.billing_media_member_write_allowed(text, text) from public, anon;
grant execute on function public.billing_media_member_write_allowed(text, text) to authenticated, service_role;

-- ===========================================================================
-- 2. Restrictive Storage policies (tenant-media only)
-- ===========================================================================
create policy "tenant media: paid spaces accept member uploads of draft audio only"
  on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'tenant-media' or public.billing_media_member_write_allowed(name, 'insert'));

create policy "tenant media: paid spaces refuse member overwrites"
  on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'tenant-media' or public.billing_media_member_write_allowed(name, 'update'))
  with check (bucket_id <> 'tenant-media' or public.billing_media_member_write_allowed(name, 'update'));

-- ===========================================================================
-- 3. published_spaces guard (trigger)
-- ===========================================================================
create function public.billing_guard_published_media()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_mode text;
  v_ref jsonb;
  v_pattern text;
begin
  if tg_op = 'UPDATE' and new.tenant_id = old.tenant_id and new.modules is not distinct from old.modules then
    return new; -- the snapshot itself is unchanged
  end if;

  select p.mode into v_mode from public.billing_audio_policy(new.tenant_id) p;
  if v_mode in ('legacy', 'exempt') then
    return new; -- unchanged behaviour for Spaces billing does not govern
  end if;
  if v_mode is distinct from 'enforced' then
    raise exception 'This Space''s media rules could not be checked' using errcode = 'P0001', hint = 'MEDIA_REF_INVALID';
  end if;

  -- An image field may only name one of this Space's own image objects.
  v_pattern := '^' || new.tenant_id::text || '/([A-Za-z0-9_-]+/){2,3}(draft|published)\.(webp|png|jpg|jpeg)$';
  for v_ref in select jsonb_path_query(coalesce(new.modules, '{}'::jsonb), '$.**.imageRef') loop
    continue when v_ref = 'null'::jsonb or v_ref = '""'::jsonb;
    if jsonb_typeof(v_ref) <> 'string' or (v_ref #>> '{}') !~* v_pattern then
      raise exception 'The published snapshot references an image that is not one of this Space''s own images'
        using errcode = 'P0001', hint = 'MEDIA_REF_INVALID';
    end if;
  end loop;

  -- The 0043 audio rules, on the row actually written (also covers a direct
  -- owner write to published_spaces that never went through publish_space()).
  perform public.billing_audio_assert_publishable(new.tenant_id, new.modules);
  return new;
end;
$$;
revoke all on function public.billing_guard_published_media() from public, anon, authenticated;

create trigger billing_guard_published_media
  before insert or update on public.published_spaces
  for each row execute function public.billing_guard_published_media();
