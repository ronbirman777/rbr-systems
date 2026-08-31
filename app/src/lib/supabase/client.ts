import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client. Uses the publishable key only (Supabase's
 * current key format, sb_publishable_... - safe to expose to the browser) -
 * all real authorization happens via Postgres RLS policies, never by
 * trusting anything computed in this client.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
