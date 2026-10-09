import type { BillingDeps } from "./deps";
import { BillingError } from "./errors";
import { provisionFromVerifiedSession } from "./provisioning";

export type CheckoutUiState =
  | { state: "awaiting_payment" }
  | { state: "processing"; delayed: boolean }
  | { state: "ready"; tenantId: string; spaceType: "teach" | "retreat" }
  | { state: "canceled" }
  | { state: "expired" };

const RECONCILE_MIN_INTERVAL_MS = 8_000;
/** After this long without a provisioned Space we tell the customer we ARE working on it (never that payment failed). */
const DELAYED_AFTER_MS = 25_000;

/**
 * Server-to-server recovery from a delayed or missed webhook. Queries Stripe
 * directly, then calls the SAME idempotent provisioning service the webhook
 * uses - so it can never provision twice and never trusts client state.
 * Returns the resulting checkout status.
 */
export async function reconcileCheckout(deps: BillingDeps, pendingCheckoutId: string): Promise<void> {
  const pending = await deps.store.getPendingCheckout(pendingCheckoutId);
  if (!pending || pending.status === "provisioned" || !pending.sessionId) return;
  if (pending.stripeMode !== deps.stripe.mode) return;

  const session = await deps.stripe.retrieveCheckoutSession(pending.sessionId);
  if (session.status === "complete") {
    await provisionFromVerifiedSession(deps, session);
  } else if (session.status === "expired") {
    await deps.store.transitionCheckout(pending.id, ["created", "checkout_created", "awaiting_payment"], "expired");
  }
}

/**
 * What the post-Stripe page shows. Reads ONLY server state (our database,
 * plus - rate-limited - Stripe itself). The browser's redirect carries no
 * authority: opening the success URL by hand without paying yields
 * "awaiting_payment", never a Space.
 */
export async function getCheckoutUiState(deps: BillingDeps, userId: string, pendingCheckoutId: string): Promise<CheckoutUiState> {
  const pending = await deps.store.getPendingCheckout(pendingCheckoutId);
  if (!pending || pending.userId !== userId) throw new BillingError("forbidden");

  if (pending.status === "provisioned" && pending.tenantId) {
    return { state: "ready", tenantId: pending.tenantId, spaceType: pending.spaceType };
  }
  if (pending.status === "canceled") return { state: "canceled" };
  if (pending.status === "expired") return { state: "expired" };

  const now = deps.now().getTime();
  if (now - pending.updatedAt.getTime() >= RECONCILE_MIN_INTERVAL_MS && pending.sessionId) {
    await deps.store.touchCheckout(pending.id);
    try {
      await reconcileCheckout(deps, pending.id);
    } catch {
      /* not paid yet / transient: keep showing the honest state below */
    }
    const again = await deps.store.getPendingCheckout(pending.id);
    if (again?.status === "provisioned" && again.tenantId) return { state: "ready", tenantId: again.tenantId, spaceType: again.spaceType };
    if (again?.status === "expired") return { state: "expired" };
    if (again?.status === "canceled") return { state: "canceled" };
    if (again) return statusToUi(again.status, again.createdAt, now);
  }
  return statusToUi(pending.status, pending.createdAt, now);
}

function statusToUi(status: string, createdAt: Date, now: number): CheckoutUiState {
  if (status === "payment_confirmed" || status === "provisioning" || status === "failed") {
    return { state: "processing", delayed: now - createdAt.getTime() >= DELAYED_AFTER_MS };
  }
  return { state: "awaiting_payment" };
}
