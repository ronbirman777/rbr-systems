import "server-only";
import { createPublicClient } from "@/lib/supabase/public";

export type GuestAccessMode = "public" | "code";

/**
 * Whether Postgres rejected the call because get_guest_access_mode
 * doesn't exist yet - i.e. migration 0016 hasn't been applied to this
 * database. Distinguishing this from every other RPC failure matters:
 * "function does not exist" pre-migration must fall back to "public"
 * (the literal, correct pre-migration behavior for every tenant - there
 * is no protection feature yet to bypass), but any OTHER failure
 * (network blip, transient DB issue) after the migration HAS shipped
 * must fail closed instead of silently unlocking a protected Space.
 * PostgREST surfaces a missing function as code "PGRST202"; the
 * underlying Postgres error code for undefined_function is "42883" -
 * checking both covers a direct RPC call either way.
 */
function isFunctionMissingError(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST202" || error.code === "42883" || !!error.message?.includes("Could not find the function");
}

/**
 * The one thing a guest (anon) ever needs to know before the commercial
 * gate has already passed - never `version`, never the hash (see the
 * migration review's "state minimization" requirement). Public/anon
 * client is correct and sufficient: get_guest_access_mode is
 * anon-executable by design (non-secret), matching the same posture as
 * reading `published_spaces` itself.
 */
export async function getGuestAccessMode(tenantId: string): Promise<GuestAccessMode> {
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("get_guest_access_mode", { p_tenant_id: tenantId });

  if (error) {
    if (isFunctionMissingError(error)) return "public";
    throw error;
  }
  return data === "code" ? "code" : "public";
}
