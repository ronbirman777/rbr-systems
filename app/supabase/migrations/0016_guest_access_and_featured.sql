-- Guest Access (optional 6-digit code protection) + Featured on InnerDweS
-- (organizer submission / review model).
--
-- NOT YET APPLIED TO PRODUCTION. Written and reviewed locally per the
-- Distribution phase's multi-round migration review (Guest Access
-- security redesign, per-IP HMAC rate limiting, Featured
-- snapshot-at-approval model). Requires two Production env vars before
-- the application layer that calls these functions can work:
-- GUEST_ACCESS_TOKEN_SECRET, GUEST_ACCESS_IP_HMAC_SECRET.
--
-- pgcrypto lives in the `extensions` schema on this Production project
-- (verified directly via `select extname, extnamespace::regnamespace
-- from pg_extension where extname = 'pgcrypto'` - NOT `public`) - every
-- crypt()/gen_salt() call below is explicitly schema-qualified
-- (extensions.crypt / extensions.gen_salt) rather than relying on
-- search_path, per that verification.
--
-- Accounts / Billing (accounts, account_members, tenants.account_id,
-- paid_space_allowance) is deliberately NOT part of this migration -
-- deferred to the Stripe integration phase, since nothing today would
-- call it and the one open design question (which account a Space
-- attaches to, for a user who could own more than one) only has a real
-- answer once that onboarding UI exists.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- GUEST ACCESS
-- ============================================================

CREATE TABLE public.space_guest_access (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'public' CHECK (mode IN ('public','code')),
  code_hash text,
  version integer NOT NULL DEFAULT 0,
  failed_attempts integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (mode = 'public' OR code_hash IS NOT NULL)
);
ALTER TABLE public.space_guest_access ENABLE ROW LEVEL SECURITY;
-- Belt-and-suspenders: zero RLS policies already deny every row to every
-- role, but Supabase's own project bootstrap grants anon/authenticated
-- broad table-level privileges by default (relying on RLS as the real
-- gate) - these explicit REVOKEs remove that ambiguity entirely rather
-- than relying on RLS alone.
REVOKE ALL ON TABLE public.space_guest_access FROM anon, authenticated;

CREATE TABLE public.guest_access_ip_attempts (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ip_hmac text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 1,
  PRIMARY KEY (tenant_id, ip_hmac)
);
ALTER TABLE public.guest_access_ip_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.guest_access_ip_attempts FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_guest_access_mode(p_tenant_id uuid)
RETURNS text
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT coalesce(a.mode, 'public')
  FROM (SELECT 1) AS _dummy
  LEFT JOIN public.space_guest_access a ON a.tenant_id = p_tenant_id;
$$;
REVOKE EXECUTE ON FUNCTION public.get_guest_access_mode(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_guest_access_mode(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_guest_access_version(p_tenant_id uuid)
RETURNS integer
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT coalesce(a.version, 0)
  FROM (SELECT 1) AS _dummy
  LEFT JOIN public.space_guest_access a ON a.tenant_id = p_tenant_id;
$$;
REVOKE EXECUTE ON FUNCTION public.get_guest_access_version(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_guest_access_version(uuid) TO service_role;

-- Atomic, race-safe rate check + record - a single INSERT ... ON
-- CONFLICT DO UPDATE, not a separate SELECT-then-branch (an earlier
-- draft of this function had a real race on the "no row yet" case,
-- where SELECT ... FOR UPDATE cannot lock a row that doesn't exist).
CREATE OR REPLACE FUNCTION public.check_and_record_guest_attempt(p_tenant_id uuid, p_ip_hmac text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_attempt_count integer;
BEGIN
  INSERT INTO public.guest_access_ip_attempts AS g (tenant_id, ip_hmac, window_start, attempt_count)
  VALUES (p_tenant_id, p_ip_hmac, now(), 1)
  ON CONFLICT (tenant_id, ip_hmac) DO UPDATE SET
    window_start = CASE
      WHEN g.window_start < now() - interval '10 minutes' THEN now()
      ELSE g.window_start
    END,
    attempt_count = CASE
      WHEN g.window_start < now() - interval '10 minutes' THEN 1
      ELSE g.attempt_count + 1
    END
  RETURNING attempt_count INTO v_attempt_count;

  RETURN v_attempt_count <= 8;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_and_record_guest_attempt(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_record_guest_attempt(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.verify_guest_access_code(p_tenant_id uuid, p_code text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  row record;
BEGIN
  IF p_code !~ '^[0-9]{6}$' THEN RETURN NULL; END IF;
  SELECT * INTO row FROM public.space_guest_access WHERE tenant_id = p_tenant_id FOR UPDATE;
  IF row IS NULL OR row.code_hash IS NULL OR row.mode != 'code' THEN RETURN NULL; END IF;

  IF row.code_hash = extensions.crypt(p_code, row.code_hash) THEN
    RETURN row.version;
  ELSE
    UPDATE public.space_guest_access SET failed_attempts = failed_attempts + 1
      WHERE tenant_id = p_tenant_id;
    RETURN NULL;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.verify_guest_access_code(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_guest_access_code(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_guest_access_settings(p_tenant_id uuid)
RETURNS TABLE(mode text, has_code boolean, updated_at timestamptz)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT coalesce(a.mode, 'public'), (a.code_hash IS NOT NULL), a.updated_at
  FROM (SELECT 1) AS _dummy
  LEFT JOIN public.space_guest_access a ON a.tenant_id = p_tenant_id
  WHERE public.is_tenant_owner(p_tenant_id);
$$;
REVOKE EXECUTE ON FUNCTION public.get_guest_access_settings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_guest_access_settings(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_guest_access_code(p_tenant_id uuid, p_code text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_tenant_owner(p_tenant_id) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF p_code !~ '^[0-9]{6}$' THEN RAISE EXCEPTION 'code must be exactly 6 digits'; END IF;
  INSERT INTO public.space_guest_access (tenant_id, mode, code_hash, version, updated_at)
    VALUES (p_tenant_id, 'code', extensions.crypt(p_code, extensions.gen_salt('bf', 10)), 1, now())
  ON CONFLICT (tenant_id) DO UPDATE SET
    mode = 'code', code_hash = extensions.crypt(p_code, extensions.gen_salt('bf', 10)),
    version = space_guest_access.version + 1, updated_at = now();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_guest_access_code(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_guest_access_code(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.disable_guest_access_code(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_tenant_owner(p_tenant_id) THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE public.space_guest_access
    SET mode = 'public', code_hash = NULL, version = version + 1, updated_at = now()
    WHERE tenant_id = p_tenant_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.disable_guest_access_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disable_guest_access_code(uuid) TO authenticated;

-- ============================================================
-- FEATURED ON INNERDWES
-- ============================================================

-- Validates additional_links' exact accepted shape. Defensive: a
-- non-array input (or NULL) returns false via an early guarded RETURN,
-- before any array-only jsonb function is ever called - not a single
-- boolean expression relying on AND short-circuit order, which Postgres
-- does not guarantee for arbitrary expressions.
CREATE OR REPLACE FUNCTION public.is_valid_additional_links(links jsonb)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  IF links IS NULL OR jsonb_typeof(links) IS DISTINCT FROM 'array' THEN
    RETURN false;
  END IF;

  IF jsonb_array_length(links) > 6 THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(links) AS elem
    WHERE jsonb_typeof(elem.value) IS DISTINCT FROM 'object'
      OR (SELECT count(*) FROM jsonb_object_keys(elem.value)) > 2
      OR NOT (elem.value ? 'label')
      OR NOT (elem.value ? 'url')
      OR jsonb_typeof(elem.value->'label') IS DISTINCT FROM 'string'
      OR jsonb_typeof(elem.value->'url') IS DISTINCT FROM 'string'
      OR char_length(elem.value->>'label') = 0
      OR char_length(elem.value->>'label') > 60
      OR char_length(elem.value->>'url') = 0
      OR char_length(elem.value->>'url') > 500
      OR (elem.value->>'url') !~* '^https?://'
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

CREATE TABLE public.space_featured_submissions (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_submitted' CHECK (status IN ('not_submitted','submitted','approved','rejected')),
  description text CHECK (description IS NULL OR char_length(description) <= 1000),
  location text CHECK (location IS NULL OR char_length(location) <= 200),
  website text CHECK (website IS NULL OR (char_length(website) <= 500 AND website ~* '^https?://')),
  instagram text CHECK (
    instagram IS NULL OR (
      char_length(instagram) <= 200
      AND instagram ~* '^(https?://(www\.)?instagram\.com/[A-Za-z0-9._]{1,30}/?|@?[A-Za-z0-9._]{1,30})$'
    )
  ),
  additional_links jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (public.is_valid_additional_links(additional_links)),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  approved_snapshot jsonb,
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.space_featured_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "space_featured_submissions: members can select"
  ON public.space_featured_submissions FOR SELECT
  USING (public.is_tenant_member(tenant_id));

-- Table-level grants: SELECT only, gated further by the RLS policy
-- above. No INSERT/UPDATE/DELETE grant to any client role at all -
-- writes exist only through submit_featured_listing() below.
REVOKE ALL ON TABLE public.space_featured_submissions FROM anon, authenticated;
GRANT SELECT ON TABLE public.space_featured_submissions TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_featured_listing(
  p_tenant_id uuid, p_description text, p_location text,
  p_website text, p_instagram text, p_additional_links jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_tenant_owner(p_tenant_id) THEN RAISE EXCEPTION 'not authorized'; END IF;
  INSERT INTO public.space_featured_submissions
    (tenant_id, status, description, location, website, instagram, additional_links, submitted_at, reviewed_at, reviewed_by, updated_at)
  VALUES (p_tenant_id, 'submitted', p_description, p_location, p_website, p_instagram,
    coalesce(p_additional_links, '[]'::jsonb), now(), NULL, NULL, now())
  ON CONFLICT (tenant_id) DO UPDATE SET
    status = 'submitted', description = excluded.description, location = excluded.location,
    website = excluded.website, instagram = excluded.instagram,
    additional_links = excluded.additional_links, submitted_at = now(),
    reviewed_at = NULL, reviewed_by = NULL, updated_at = now();
    -- approved_snapshot/approved_at/approved_by deliberately untouched -
    -- the last-approved listing stays live while this resubmission awaits review.
END;
$$;
REVOKE EXECUTE ON FUNCTION public.submit_featured_listing(uuid,text,text,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_featured_listing(uuid,text,text,text,text,jsonb) TO authenticated;

COMMIT;
