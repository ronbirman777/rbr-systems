import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * TASK 032: the app-side twin of guard_tenant_delete_with_subscription()
 * (0038), checked BEFORE Space deletion touches Storage.
 *
 * Why it exists: deleteSpaceCompletely() removes Storage media first and only
 * then calls delete_space(). The 0038 trigger refuses to delete a Space whose
 * subscription is still live (ACTIVE_SUBSCRIPTION) - but only at the database
 * step, after the media is already gone. Without this pre-check, "Delete" on a
 * paying Space wiped all of its media and then failed, leaving a live, paid
 * Space with broken images and audio.
 *
 * Second problem it solves: an ENDED Space (canceled / incomplete_expired) may
 * be deleted per the trigger, but its Studio is not writable, so the 0039
 * restrictive storage.objects DELETE policy refuses the owner's own media
 * removal and the Space (and with it the owner's account deletion) could
 * never be deleted. For exactly that case the media is removed with the
 * service-role client, after the caller has verified ownership.
 */

/** Must equal the exclusion list in guard_tenant_delete_with_subscription(). */
export const DELETABLE_SUBSCRIPTION_STATUSES = ["exempt", "canceled", "incomplete_expired"] as const;
const ENDED_STATUSES = new Set(["canceled", "incomplete_expired"]);

export type SpaceDeletionGate =
  | { allowed: true; mediaVia: "owner" | "service" }
  | { allowed: false; reason: "active_subscription" | "billing_unreadable" };

/** status: the Space's space_subscriptions.status, or null when it has no billing row. */
export function decideSpaceDeletion(status: string | null): SpaceDeletionGate {
  if (status === null) return { allowed: true, mediaVia: "owner" };
  if (!(DELETABLE_SUBSCRIPTION_STATUSES as readonly string[]).includes(status)) return { allowed: false, reason: "active_subscription" };
  return { allowed: true, mediaVia: ENDED_STATUSES.has(status) ? "service" : "owner" };
}

/** PostgREST / Postgres "relation does not exist": a database without 0036 has no billing rows (and no trigger). */
function isMissingRelation(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

/**
 * Reads the billing row through the caller's own RLS-scoped session (owners can
 * select their Space's row). Any other read error fails closed.
 */
export async function loadSpaceDeletionGate(supabase: SupabaseClient, tenantId: string): Promise<SpaceDeletionGate> {
  const { data, error } = await supabase.from("space_subscriptions").select("status").eq("tenant_id", tenantId).maybeSingle();
  if (error) return isMissingRelation(error) ? decideSpaceDeletion(null) : { allowed: false, reason: "billing_unreadable" };
  return decideSpaceDeletion((data as { status?: string } | null)?.status ?? null);
}

/**
 * Same predicate the 0039 restrictive policies use, asked of the database
 * (space_studio_writable, executable by authenticated). For Studio writes that
 * go through SECURITY DEFINER RPCs, which those policies never see.
 * A database without 0038 (function missing) is legacy: writable.
 * Any other error fails closed.
 */
export async function isStudioWritableForWrite(supabase: SupabaseClient, tenantId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("space_studio_writable", { p_tenant_id: tenantId });
  if (error) {
    const missing = error.code === "PGRST202" || error.code === "42883" || !!error.message?.includes("Could not find the function");
    return missing;
  }
  return data === true;
}
