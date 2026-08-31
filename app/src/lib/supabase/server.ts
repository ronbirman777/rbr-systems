import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client (Server Components, Route Handlers, Server Actions).
 * Reads/writes the session via cookies so RLS policies see the real signed-in user.
 * Uses the publishable key, same as the browser client - this client acts AS the
 * signed-in user via their session, it does not bypass RLS. For trusted
 * server-only operations that must bypass RLS, use lib/supabase/admin.ts instead.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component with no request context to write to -
            // safe to ignore as long as middleware refreshes the session (see middleware.ts).
          }
        },
      },
    }
  );
}
