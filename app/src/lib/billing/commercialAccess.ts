import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveCommercialAvailability } from "@/lib/entitlements/availability";
import { getSpaceEntitlement } from "@/lib/entitlements/getSpaceEntitlement";
import type { CommercialAvailability, SpaceEntitlementRow } from "@/lib/entitlements/types";
import { deriveSpaceAccess } from "./access";
import { SUBSCRIPTION_SELECT, toSubscriptionRecord, type SubscriptionRecord, type SubscriptionRow } from "./types";

/**
 * Combine the billing decision with the legacy entitlement derivation into the
 * ONE CommercialAvailability every caller already understands.
 *
 *  - A Space WITH a billing row is governed entirely by deriveSpaceAccess().
 *  - A Space WITHOUT one (every Space that exists today) falls straight through
 *    to deriveCommercialAvailability(entitlement) - byte-for-byte the previous
 *    behaviour - so no existing Space is locked or unlocked by this change.
 *
 * Pure: no I/O. getSpaceCommercialAvailability() below does the reads.
 */
export function combineCommercialAvailability(
  entitlement: SpaceEntitlementRow | null,
  subscription: SubscriptionRecord | null,
  now: Date = new Date()
): CommercialAvailability {
  const decision = deriveSpaceAccess(subscription, now);
  if (!decision.decided) return deriveCommercialAvailability(entitlement, now);

  const paid = subscription?.status !== "exempt";
  const usable = decision.guestAvailable === true;
  return {
    accessType: paid ? "active" : "complimentary",
    effectiveStatus: usable ? (decision.reason === "payment_issue" ? "grace" : paid ? "active" : "complimentary") : "inactive",
    accessEndsAt: paid && subscription?.currentPeriodEnd ? subscription.currentPeriodEnd.toISOString() : null,
    graceEndsAt: null,
    daysRemaining: null,
    canManage: decision.studioWritable,
    canPublish: decision.canPublish === true,
    isPubliclyAvailable: usable,
    billing: { reason: decision.reason, studioWritable: decision.studioWritable },
  };
}

/** Read the subscription row (RLS-scoped for owners, or via the admin client for guest routes). */
export async function getSpaceSubscription(supabase: SupabaseClient, tenantId: string): Promise<SubscriptionRecord | null> {
  const { data } = await supabase.from("space_subscriptions").select(SUBSCRIPTION_SELECT).eq("tenant_id", tenantId).maybeSingle();
  return data ? toSubscriptionRecord(data as unknown as SubscriptionRow) : null;
}

/**
 * The single reader. Replaces every
 *   deriveCommercialAvailability(await getSpaceEntitlement(...))
 * call site. Fail-closed is the CALLER's job for guest routes (see
 * isSpacePubliclyAvailable); here a read error simply yields "no row", which
 * is the legacy path.
 */
export async function getSpaceCommercialAvailability(
  supabase: SupabaseClient,
  tenantId: string,
  now: Date = new Date()
): Promise<CommercialAvailability> {
  const [entitlement, subscription] = await Promise.all([
    getSpaceEntitlement(supabase, tenantId),
    getSpaceSubscription(supabase, tenantId),
  ]);
  return combineCommercialAvailability(entitlement, subscription, now);
}
