import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { BASE_PLAN_KEY } from "./constants";
import { isStripeConfigured } from "./deps.server";

export type CreateMode = "legacy" | "paid" | "unavailable";

/** Pure decision: the legacy free flow until paid checkout is switched on; then paid only if Stripe is configured. */
export function decideCreateMode(paidCheckoutEnabled: boolean, stripeConfigured: boolean): CreateMode {
  if (!paidCheckoutEnabled) return "legacy";
  return stripeConfigured ? "paid" : "unavailable";
}

/** Reads the singleton billing_settings row. Any read problem is treated as "off" so the legacy flow keeps working. */
export async function getCreateMode(): Promise<CreateMode> {
  let enabled = false;
  try {
    const { data } = await createAdminClient().from("billing_settings").select("paid_checkout_enabled").eq("singleton", true).maybeSingle();
    enabled = data?.paid_checkout_enabled === true;
  } catch {
    enabled = false;
  }
  return decideCreateMode(enabled, isStripeConfigured());
}

export type BasePlanPrice = { unitAmountMinor: number; currency: string };

/** The trusted base plan price, read server-side only. null when the plan row is missing/unreadable. */
export async function getBasePlanPrice(): Promise<BasePlanPrice | null> {
  try {
    const { data } = await createAdminClient().from("billing_plans").select("unit_amount_minor,currency").eq("plan_key", BASE_PLAN_KEY).maybeSingle();
    if (!data || !Number.isSafeInteger(data.unit_amount_minor)) return null;
    return { unitAmountMinor: data.unit_amount_minor as number, currency: String(data.currency).trim() };
  } catch {
    return null;
  }
}
