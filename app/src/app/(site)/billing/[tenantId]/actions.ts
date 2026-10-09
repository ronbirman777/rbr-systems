"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getBillingDeps, isStripeConfigured } from "@/lib/billing/deps.server";
import { isStripeHostedUrl } from "@/lib/billing/safeRedirect";
import { syncSubscription } from "@/lib/billing/sync";
import { billingPath } from "@/lib/billing/urls";
import { createClient } from "@/lib/supabase/server";

export type BillingActionResult = { ok: true } | { ok: false; error: "unavailable" | "not_found" | "not_paid" };

/**
 * Ownership is proven with the OWNER'S OWN session: space_subscriptions' RLS policy only returns a row to the
 * Space's owner, so an account that is not the owner (or a made-up tenant id) gets nothing and nothing is sent to
 * Stripe. Exempt (internal) Spaces have no Stripe subscription and are refused here.
 */
async function ownedPaidSubscription(tenantId: string) {
  if (!z.string().uuid().safeParse(tenantId).success) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("space_subscriptions").select("stripe_subscription_id, status").eq("tenant_id", tenantId).maybeSingle();
  if (!data) return null;
  return { user, stripeSubscriptionId: data.stripe_subscription_id as string | null, status: data.status as string };
}

async function setCancel(tenantId: string, cancel: boolean): Promise<BillingActionResult> {
  if (!isStripeConfigured()) return { ok: false, error: "unavailable" };
  const owned = await ownedPaidSubscription(tenantId);
  if (!owned) return { ok: false, error: "not_found" };
  if (!owned.stripeSubscriptionId || owned.status === "exempt" || owned.status === "canceled") return { ok: false, error: "not_paid" };
  try {
    const deps = getBillingDeps();
    await deps.stripe.setCancelAtPeriodEnd(owned.stripeSubscriptionId, cancel);
    // Re-read Stripe's truth and apply it (also queues the single cancellation email).
    await syncSubscription(deps, owned.stripeSubscriptionId);
  } catch {
    return { ok: false, error: "unavailable" };
  }
  revalidatePath(billingPath(tenantId));
  return { ok: true };
}

/** Normal cancellation: at the end of the current paid period. No refund is issued automatically. */
export async function cancelSubscriptionAction(tenantId: string): Promise<BillingActionResult> {
  return setCancel(tenantId, true);
}

export async function resumeSubscriptionAction(tenantId: string): Promise<BillingActionResult> {
  return setCancel(tenantId, false);
}

/** Stripe-hosted page where the customer updates their payment method (also the recovery path). */
export async function openBillingPortalAction(tenantId: string): Promise<BillingActionResult> {
  if (!isStripeConfigured()) return { ok: false, error: "unavailable" };
  const owned = await ownedPaidSubscription(tenantId);
  if (!owned) return { ok: false, error: "not_found" };
  let url: string | null = null;
  try {
    const deps = getBillingDeps();
    const customerId = await deps.store.getCustomerId(owned.user.id, deps.stripe.mode);
    if (!customerId) return { ok: false, error: "not_paid" };
    const returnUrl = `${deps.appUrl.replace(/\/$/, "")}${billingPath(tenantId)}`;
    url = (await deps.stripe.createBillingPortalSession({ customerId, returnUrl })).url;
  } catch {
    return { ok: false, error: "unavailable" };
  }
  if (!isStripeHostedUrl(url)) return { ok: false, error: "unavailable" };
  redirect(url);
}
