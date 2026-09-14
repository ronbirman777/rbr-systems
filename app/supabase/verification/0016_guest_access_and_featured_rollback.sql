-- Rollback for 0016_guest_access_and_featured.sql.
-- Do NOT run against Production unless the migration needs to be
-- reverted. Purely additive migration - nothing existing is altered
-- except this file's own new objects, so this rollback is safe and
-- complete: nothing outside these objects is touched.

BEGIN;

DROP FUNCTION IF EXISTS public.submit_featured_listing(uuid,text,text,text,text,jsonb);
DROP POLICY IF EXISTS "space_featured_submissions: members can select" ON public.space_featured_submissions;
DROP TABLE IF EXISTS public.space_featured_submissions;
DROP FUNCTION IF EXISTS public.is_valid_additional_links(jsonb);

DROP FUNCTION IF EXISTS public.disable_guest_access_code(uuid);
DROP FUNCTION IF EXISTS public.set_guest_access_code(uuid, text);
DROP FUNCTION IF EXISTS public.get_guest_access_settings(uuid);
DROP FUNCTION IF EXISTS public.verify_guest_access_code(uuid, text);
DROP FUNCTION IF EXISTS public.check_and_record_guest_attempt(uuid, text);
DROP FUNCTION IF EXISTS public.get_guest_access_version(uuid);
DROP FUNCTION IF EXISTS public.get_guest_access_mode(uuid);
DROP TABLE IF EXISTS public.guest_access_ip_attempts;
DROP TABLE IF EXISTS public.space_guest_access;

-- pgcrypto intentionally left installed - it's a shared extension other
-- features may depend on; dropping it is out of scope of this rollback.

COMMIT;
