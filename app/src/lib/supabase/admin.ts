import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Trusted, server-only Supabase client using the SECRET key (sb_secret_...).
 * This BYPASSES Row-Level Security entirely - it acts with full database
 * privileges, not as any particular user.
 *
 * The `server-only` import above makes any accidental import of this file
 * from a Client Component fail the build, rather than silently bundling
 * the secret key into browser JS.
 *
 * Only use this for operations that genuinely need to bypass RLS (e.g. an
 * admin panel querying across all tenants, or a webhook handler). Every
 * ordinary request from a signed-in user should go through
 * lib/supabase/server.ts instead, which enforces RLS as that user.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
