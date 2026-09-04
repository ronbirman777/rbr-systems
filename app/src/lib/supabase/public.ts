import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * A stateless, session-free client for the public guest route. Deliberately
 * NOT the cookie-bound server client (no visitor session, no auth context
 * at all) and NOT the admin client (no elevated privileges) - just the
 * plain publishable key, so the only thing it can ever read is whatever
 * RLS's `using (true)` policy on published_spaces explicitly allows.
 */
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } }
  );
}
