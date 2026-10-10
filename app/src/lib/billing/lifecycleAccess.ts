import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveSpaceAccess, type AccessInput } from "./access";
import type { CreateMode } from "./funnelMode";
import { SUBSCRIPTION_SELECT, toSubscriptionRecord, type SubscriptionRecord, type SubscriptionRow } from "./types";

/**
 * TASK 032 (B2): who may Restore / Replace a Space on My Spaces.
 *
 * Flag OFF ("legacy" mode): nothing here decides anything. The 0017 RPCs keep
 * their per-user slot rules and the UI keeps its slot-based visibility - the
 * exact pre-032 behaviour.
 *
 * Flag ON ("paid" or "unavailable" - the flag is what the 0038 trigger reads,
 * Stripe configuration only affects whether checkout can open):
 *  - A billing-governed Space (paid subscription, or an unexpired exemption
 *    such as Lena / Return to Balance / QA) follows the SAME unified decision
 *    every other surface uses (deriveSpaceAccess): Restore/Replace are allowed
 *    exactly when Studio is writable. A paid Space is one subscription, so it
 *    never consumes or needs a legacy slot; a suspended/ended Space cannot be
 *    reset or brought back out of the archive until billing is resolved.
 *  - A legacy Space (no billing row, or an expired exemption) keeps the legacy
 *    slot rule, but counted over LEGACY Spaces only: Spaces bought one-by-one
 *    must not eat the free allowance that the legacy Space lives in.
 *  - Anything unreadable fails closed.
 *
 * Neither action can create a Space, so neither can be used to skip payment:
 * Replace keeps the tenant (and its subscription row, if any); Restore only
 * changes status.
 */
export type LifecycleAction = "restore" | "replace";
/** "exempt_replace" - TASK 032 (0046): an internally exempt Space cannot be replaced (an Admin clears the exemption first). */
export type LifecycleBlock = "billing_locked" | "billing_unreadable" | "slot_limit" | "exempt_replace";
export type LifecycleDecision =
  | { allowed: true; governedBy: "legacy" | "billing" }
  | { allowed: false; governedBy: "legacy" | "billing" | "unknown"; blockedBy: LifecycleBlock };

/** The flag, not Stripe availability, decides which rule set applies. */
export function isPaidLifecycleMode(mode: CreateMode): boolean {
  return mode !== "legacy";
}

export type LifecycleInput = {
  mode: CreateMode;
  action: LifecycleAction;
  subscription: AccessInput | null;
  /** The Space's billing row could not be read (error, not "no row"). */
  subscriptionUnreadable?: boolean;
  /** Restore of a legacy Space only. null = unknown (fails closed). */
  legacySlots?: { slotsAllowed: number; legacySpacesOwned: number } | null;
  now?: Date;
};

export function decideSpaceLifecycle(input: LifecycleInput): LifecycleDecision {
  // Legacy mode: the RPC is the authority, exactly as before TASK 032.
  if (!isPaidLifecycleMode(input.mode)) return { allowed: true, governedBy: "legacy" };

  if (input.subscriptionUnreadable) return { allowed: false, governedBy: "unknown", blockedBy: "billing_unreadable" };

  // TASK 032 (0046): an exemption was granted for this Space's content; Replace
  // would carry it to new content, so it is refused (expired or not), exactly
  // like replace_space() (hint EXEMPT_REPLACE_REQUIRES_ADMIN).
  if (input.action === "replace" && input.subscription?.status === "exempt") {
    return { allowed: false, governedBy: "billing", blockedBy: "exempt_replace" };
  }

  const decision = deriveSpaceAccess(input.subscription, input.now ?? new Date());
  if (decision.decided) {
    return decision.studioWritable
      ? { allowed: true, governedBy: "billing" }
      : { allowed: false, governedBy: "billing", blockedBy: "billing_locked" };
  }

  // Legacy Space under paid mode. Replace keeps the tenant and its slot, so it
  // never changes slot usage (same as 0017).
  if (input.action === "replace") return { allowed: true, governedBy: "legacy" };
  const slots = input.legacySlots;
  if (!slots) return { allowed: false, governedBy: "legacy", blockedBy: "billing_unreadable" };
  // The archived Space is already counted (archive keeps its slot), hence ">" like restore_space().
  if (slots.legacySpacesOwned > slots.slotsAllowed) return { allowed: false, governedBy: "legacy", blockedBy: "slot_limit" };
  return { allowed: true, governedBy: "legacy" };
}

/** Is this Space counted against the legacy per-user slot allowance? */
export function usesLegacySlot(subscription: AccessInput | null, now: Date = new Date()): boolean {
  return !deriveSpaceAccess(subscription, now).decided;
}

export type LifecycleControlsView = {
  showRestore: boolean;
  showReplace: boolean;
  /** Billing must be resolved first (paid mode, billing-governed Space only). */
  billingLocked: boolean;
};

/**
 * What the My Spaces card offers. Legacy mode reproduces the pre-032 rule
 * byte-for-byte: archived -> Restore + Replace; otherwise Replace only when no
 * slot is free. Paid mode follows the per-Space decisions above.
 */
export function lifecycleControlsView(args: {
  mode: CreateMode;
  isArchived: boolean;
  slotsAvailable: number;
  restore: LifecycleDecision;
  replace: LifecycleDecision;
}): LifecycleControlsView {
  if (!isPaidLifecycleMode(args.mode)) {
    return { showRestore: args.isArchived, showReplace: args.isArchived || args.slotsAvailable <= 0, billingLocked: false };
  }
  const locked = (d: LifecycleDecision) => !d.allowed && d.blockedBy === "billing_locked";
  return {
    // A slot-limited legacy restore stays visible so the action can explain itself (as in legacy mode).
    showRestore: args.isArchived && (args.restore.allowed || args.restore.blockedBy === "slot_limit"),
    showReplace: args.replace.allowed,
    billingLocked: locked(args.replace) || (args.isArchived && locked(args.restore)),
  };
}

/**
 * Server-side read for the Restore/Replace actions (paid mode only), through
 * the caller's own RLS-scoped session. Every read error fails closed.
 */
export async function loadLifecycleDecision(
  supabase: SupabaseClient,
  args: { userId: string; tenantId: string; action: LifecycleAction; mode: CreateMode; now?: Date }
): Promise<LifecycleDecision> {
  const now = args.now ?? new Date();
  if (!isPaidLifecycleMode(args.mode)) return decideSpaceLifecycle({ mode: args.mode, action: args.action, subscription: null, now });

  const { data, error } = await supabase.from("space_subscriptions").select(SUBSCRIPTION_SELECT).eq("tenant_id", args.tenantId).maybeSingle();
  if (error) return decideSpaceLifecycle({ mode: args.mode, action: args.action, subscription: null, subscriptionUnreadable: true, now });
  const subscription = data ? toSubscriptionRecord(data as unknown as SubscriptionRow) : null;

  let legacySlots: LifecycleInput["legacySlots"] = null;
  if (args.action === "restore" && usesLegacySlot(subscription, now)) legacySlots = await readLegacySlots(supabase, args.userId, now);
  return decideSpaceLifecycle({ mode: args.mode, action: args.action, subscription, legacySlots, now });
}

async function readLegacySlots(
  supabase: SupabaseClient,
  userId: string,
  now: Date
): Promise<{ slotsAllowed: number; legacySpacesOwned: number } | null> {
  const [slotRes, ownedRes] = await Promise.all([
    supabase.from("user_space_slots").select("slots_allowed").eq("user_id", userId).maybeSingle(),
    supabase.from("tenant_members").select("tenant_id").eq("user_id", userId).eq("role", "owner"),
  ]);
  if (slotRes.error || ownedRes.error) return null;
  const ownedIds = ((ownedRes.data ?? []) as { tenant_id: string }[]).map((r) => r.tenant_id);
  let subsByTenant = new Map<string, SubscriptionRecord>();
  if (ownedIds.length > 0) {
    const subsRes = await supabase.from("space_subscriptions").select(SUBSCRIPTION_SELECT).in("tenant_id", ownedIds);
    if (subsRes.error) return null;
    subsByTenant = new Map(
      ((subsRes.data ?? []) as unknown as SubscriptionRow[]).map((r) => {
        const rec = toSubscriptionRecord(r);
        return [rec.tenantId, rec];
      })
    );
  }
  return {
    // Same fail-closed reading as getSpaceSlotSummary: a missing allowance row is 0.
    slotsAllowed: (slotRes.data as { slots_allowed?: number } | null)?.slots_allowed ?? 0,
    legacySpacesOwned: ownedIds.filter((id) => usesLegacySlot(subsByTenant.get(id) ?? null, now)).length,
  };
}
