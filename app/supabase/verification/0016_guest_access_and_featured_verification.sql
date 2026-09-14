-- Post-migration verification for 0016_guest_access_and_featured.sql.
-- Run this AFTER applying the migration to Production - never before,
-- never as a substitute for applying it. Every query is read-only
-- (information_schema / pg_catalog introspection) - nothing here writes
-- to any table. Run the whole file in the SQL Editor and read each
-- result set; expected values are noted in each query's comment.

-- ============================================================
-- 1. TABLES EXIST, WITH CORRECT COLUMNS / TYPES / DEFAULTS
-- ============================================================

-- Expect exactly these 3 rows for space_guest_access:
-- tenant_id uuid NOT NULL, mode text NOT NULL default 'public',
-- code_hash text NULL, version integer NOT NULL default 0,
-- failed_attempts integer NOT NULL default 0, updated_at timestamptz NOT NULL default now()
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'space_guest_access'
ORDER BY ordinal_position;

-- Expect: tenant_id uuid NOT NULL, ip_hmac text NOT NULL,
-- window_start timestamptz NOT NULL default now(), attempt_count integer NOT NULL default 1
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'guest_access_ip_attempts'
ORDER BY ordinal_position;

-- Expect 13 columns matching the migration's CREATE TABLE exactly
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'space_featured_submissions'
ORDER BY ordinal_position;

-- ============================================================
-- 2. PRIMARY KEYS + FOREIGN KEYS
-- ============================================================

-- Expect: space_guest_access.tenant_id PK -> tenants.id;
-- guest_access_ip_attempts (tenant_id, ip_hmac) composite PK -> tenants.id;
-- space_featured_submissions.tenant_id PK -> tenants.id;
-- space_featured_submissions.reviewed_by / approved_by -> auth.users.id
SELECT
  tc.table_name, tc.constraint_type, kcu.column_name,
  ccu.table_name AS references_table, ccu.column_name AS references_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('space_guest_access', 'guest_access_ip_attempts', 'space_featured_submissions')
  AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY')
ORDER BY tc.table_name, tc.constraint_type;

-- ============================================================
-- 3. CHECK CONSTRAINTS
-- ============================================================

-- Expect: space_guest_access mode IN ('public','code'); mode='public' OR
-- code_hash IS NOT NULL; space_featured_submissions status IN
-- ('not_submitted','submitted','approved','rejected'); description/
-- location/website/instagram length+shape checks; additional_links
-- calls is_valid_additional_links(additional_links)
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
  AND conrelid::regclass::text IN ('space_guest_access', 'guest_access_ip_attempts', 'space_featured_submissions')
  AND contype = 'c'
ORDER BY conrelid::regclass::text, conname;

-- ============================================================
-- 4. RLS ENABLED
-- ============================================================

-- Expect rowsecurity = true for all three tables
SELECT relname AS table_name, relrowsecurity AS rls_enabled, relforcerowsecurity AS rls_forced
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('space_guest_access', 'guest_access_ip_attempts', 'space_featured_submissions');

-- ============================================================
-- 5. RLS POLICIES
-- ============================================================

-- Expect: ZERO rows for space_guest_access and guest_access_ip_attempts
-- (no policy at all - deny by default). Expect exactly ONE row for
-- space_featured_submissions: a SELECT policy using is_tenant_member(tenant_id).
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('space_guest_access', 'guest_access_ip_attempts', 'space_featured_submissions')
ORDER BY tablename, policyname;

-- ============================================================
-- 6. TABLE PRIVILEGES (anon / authenticated / service_role)
-- ============================================================

-- Expect: space_guest_access and guest_access_ip_attempts have ZERO
-- rows for anon/authenticated (no grants at all). space_featured_submissions
-- has exactly ONE row: authenticated / SELECT. service_role rows (if
-- any appear) are expected - service_role bypasses grants/RLS entirely
-- via its role membership, not via these grants.
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('space_guest_access', 'guest_access_ip_attempts', 'space_featured_submissions')
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;
-- FAIL condition: any row here for space_guest_access or
-- guest_access_ip_attempts: REVOKE ALL did not take effect.
-- FAIL condition: any INSERT/UPDATE/DELETE row for
-- space_featured_submissions + authenticated, or any row at all for
-- anon: table-level grants are broader than intended.

-- ============================================================
-- 7. FUNCTION EXISTENCE + DEFINITIONS
-- ============================================================

-- Expect all 8 functions to exist with the exact bodies from the
-- migration file - read each definition and diff against the migration
-- source by eye (this is exactly the discipline the 0013
-- redeem_access_code hotfix incident established as necessary - never
-- assume a live function matches committed SQL).
SELECT p.proname AS function_name, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_guest_access_mode', 'get_guest_access_version',
    'check_and_record_guest_attempt', 'verify_guest_access_code',
    'get_guest_access_settings', 'set_guest_access_code',
    'disable_guest_access_code', 'is_valid_additional_links',
    'submit_featured_listing'
  )
ORDER BY p.proname;

-- ============================================================
-- 8. SECURITY DEFINER + search_path, per function
-- ============================================================

-- Expect: every function except is_valid_additional_links has
-- prosecdef = true (SECURITY DEFINER). Every function's proconfig
-- should show search_path=public - NOT including "extensions" (the
-- final version schema-qualifies crypt/gen_salt explicitly instead of
-- relying on search_path).
SELECT
  p.proname AS function_name,
  p.prosecdef AS is_security_definer,
  p.proconfig AS config_settings
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_guest_access_mode', 'get_guest_access_version',
    'check_and_record_guest_attempt', 'verify_guest_access_code',
    'get_guest_access_settings', 'set_guest_access_code',
    'disable_guest_access_code', 'is_valid_additional_links',
    'submit_featured_listing'
  )
ORDER BY p.proname;

-- ============================================================
-- 9. pgcrypto schema qualification (live check)
-- ============================================================

-- Expect: pgcrypto's extnamespace resolves to 'extensions' (already
-- verified once directly - re-confirm here as part of the same script
-- so this file is self-contained).
SELECT e.extname, n.nspname AS schema_name
FROM pg_extension e
JOIN pg_namespace n ON n.oid = e.extnamespace
WHERE e.extname = 'pgcrypto';

-- Expect: both function bodies contain "extensions.crypt" and/or
-- "extensions.gen_salt" - a text search over the function source as a
-- cheap confirmation that the schema-qualified calls actually made it
-- into the live definition (not just the local migration file).
SELECT p.proname, pg_get_functiondef(p.oid) LIKE '%extensions.crypt%' AS uses_qualified_crypt
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'verify_guest_access_code';

SELECT p.proname,
  pg_get_functiondef(p.oid) LIKE '%extensions.crypt%' AS uses_qualified_crypt,
  pg_get_functiondef(p.oid) LIKE '%extensions.gen_salt%' AS uses_qualified_gen_salt
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'set_guest_access_code';

-- Stronger check: confirm NO stale/unqualified crypt(/gen_salt( call
-- sites remain in either function - strips every already-qualified
-- "extensions.crypt("/"extensions.gen_salt(" occurrence out of the
-- function body first, then verifies nothing matching a bare
-- "crypt("/"gen_salt(" is left over. Expect no_unqualified_calls = true
-- for both rows - if either reads false, a stale search_path-dependent
-- version is still live and this migration was not applied cleanly.
SELECT p.proname,
  (regexp_replace(pg_get_functiondef(p.oid), 'extensions\.(crypt|gen_salt)\(', '', 'g') !~ '(crypt|gen_salt)\(') AS no_unqualified_calls
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('verify_guest_access_code', 'set_guest_access_code')
ORDER BY p.proname;

-- ============================================================
-- 10. EXECUTE privileges, per function (anon / authenticated / service_role)
-- ============================================================

-- Expect exactly:
-- get_guest_access_mode           -> anon, authenticated
-- get_guest_access_version        -> service_role only
-- check_and_record_guest_attempt  -> service_role only
-- verify_guest_access_code        -> service_role only
-- get_guest_access_settings       -> authenticated only
-- set_guest_access_code           -> authenticated only
-- disable_guest_access_code       -> authenticated only
-- submit_featured_listing         -> authenticated only
-- is_valid_additional_links       -> left at default (PUBLIC-executable
--                                    is acceptable - pure validation
--                                    helper, no sensitive data, called
--                                    only from inside a CHECK constraint)
SELECT
  p.proname AS function_name,
  r.rolname AS grantee,
  has_function_privilege(r.rolname, p.oid, 'EXECUTE') AS can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(rolname)
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_guest_access_mode', 'get_guest_access_version',
    'check_and_record_guest_attempt', 'verify_guest_access_code',
    'get_guest_access_settings', 'set_guest_access_code',
    'disable_guest_access_code', 'is_valid_additional_links',
    'submit_featured_listing'
  )
ORDER BY p.proname, r.rolname;

-- ============================================================
-- 11. SUMMARY SANITY CHECKS (single boolean per row - should all read true)
-- ============================================================

SELECT 'space_guest_access has zero anon/authenticated table grants' AS check_name,
  NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'space_guest_access'
      AND grantee IN ('anon', 'authenticated')
  ) AS passes
UNION ALL
SELECT 'guest_access_ip_attempts has zero anon/authenticated table grants',
  NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'guest_access_ip_attempts'
      AND grantee IN ('anon', 'authenticated')
  )
UNION ALL
SELECT 'space_featured_submissions: authenticated has SELECT only (no write grants)',
  EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'space_featured_submissions'
      AND grantee = 'authenticated' AND privilege_type = 'SELECT'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'space_featured_submissions'
      AND grantee IN ('anon', 'authenticated') AND privilege_type IN ('INSERT','UPDATE','DELETE')
  )
UNION ALL
SELECT 'space_featured_submissions: anon has zero grants',
  NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'space_featured_submissions'
      AND grantee = 'anon'
  )
UNION ALL
SELECT 'verify_guest_access_code: anon/authenticated cannot execute',
  NOT has_function_privilege('anon', 'public.verify_guest_access_code(uuid,text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.verify_guest_access_code(uuid,text)', 'EXECUTE')
UNION ALL
SELECT 'check_and_record_guest_attempt: anon/authenticated cannot execute',
  NOT has_function_privilege('anon', 'public.check_and_record_guest_attempt(uuid,text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.check_and_record_guest_attempt(uuid,text)', 'EXECUTE')
UNION ALL
SELECT 'get_guest_access_mode: anon CAN execute (intentional, non-secret)',
  has_function_privilege('anon', 'public.get_guest_access_mode(uuid)', 'EXECUTE')
UNION ALL
SELECT 'pgcrypto is installed in the extensions schema',
  EXISTS (
    SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pgcrypto' AND n.nspname = 'extensions'
  );
