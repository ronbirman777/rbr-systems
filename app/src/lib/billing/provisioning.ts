import type { BillingDeps } from "./deps";
import { BillingError } from "./errors";
import { processInvoice } from "./sync";
import { refreshNextAction } from "./nextActionService";
import type { CheckoutSessionDTO, SubscriptionDTO } from "./stripe/gateway";
import type { ProvisionResult, ProvisionSubscriptionInput } from "./store";

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toProvisionInput(sub: SubscriptionDTO, customerId: string): ProvisionSubscriptionInput {
  return {
    stripe_subscription_id: sub.id,
    stripe_customer_id: customerId,
    stripe_price_id: sub.priceId,
    status: sub.status,
    currency: sub.currency,
    base_amount_minor: sub.baseAmountMinor,
    effective_amount_minor: sub.effectiveAmountMinor,
    period_start: iso(sub.currentPeriodStart),
    period_end: iso(sub.currentPeriodEnd),
    cancel_at_period_end: sub.cancelAtPeriodEnd,
    latest_invoice_id: sub.latestInvoiceId,
  };
}

/**
 * THE one provisioning entry point for application code: webhook handlers and
 * reconciliation both call this and nothing else, so there is exactly one way a
 * Space comes into being.
 *
 * Trust model - the input is a Checkout Session that THIS code has just
 * retrieved from Stripe server-to-server (or that a signature-verified webhook
 * pointed at and was then re-retrieved). Nothing from the browser is trusted:
 * not a query parameter, not a success redirect, not client-supplied payment
 * state. The session must match our own pending checkout record (user, mode,
 * customer) before anything is provisioned.
 *
 * Idempotency - billing_provision_paid_space() locks the pending checkout and
 * returns the SAME tenant on every repeat call (duplicate webhook, reconcile,
 * two tabs). Seeding and invoice processing are idempotent too, so the whole
 * function is safe to run any number of times.
 */
export async function provisionFromVerifiedSession(deps: BillingDeps, session: CheckoutSessionDTO): Promise<ProvisionResult> {
  const pendingId = session.clientReferenceId ?? session.metadata.pending_checkout_id ?? null;
  if (!pendingId) throw new BillingError("checkout_not_found", "session has no pending checkout reference");

  const pending = await deps.store.getPendingCheckout(pendingId);
  if (!pending) throw new BillingError("checkout_not_found");
  if (pending.stripeMode !== deps.stripe.mode) throw new BillingError("wrong_mode");
  if (session.metadata.user_id && session.metadata.user_id !== pending.userId) throw new BillingError("metadata_mismatch", "user");
  if (session.metadata.pending_checkout_id && session.metadata.pending_checkout_id !== pending.id) throw new BillingError("metadata_mismatch", "checkout");
  if (pending.customerId && session.customerId && pending.customerId !== session.customerId) throw new BillingError("metadata_mismatch", "customer");
  if (pending.sessionId && pending.sessionId !== session.id) throw new BillingError("metadata_mismatch", "session");

  if (session.status !== "complete" || (session.paymentStatus !== "paid" && session.paymentStatus !== "no_payment_required")) {
    throw new BillingError("not_paid");
  }
  if (!session.subscriptionId) throw new BillingError("not_paid", "no subscription on a complete session");

  await deps.store.confirmPayment({
    pendingCheckoutId: pending.id, sessionId: session.id, customerId: session.customerId, subscriptionId: session.subscriptionId,
  });

  // Re-read the subscription from Stripe: it - not the session - is the authority on its status.
  const sub = await deps.stripe.retrieveSubscription(session.subscriptionId);
  if (sub.status !== "active" && sub.status !== "trialing") throw new BillingError("subscription_not_active", sub.status);
  if (sub.customerId !== (session.customerId ?? sub.customerId)) throw new BillingError("metadata_mismatch", "subscription customer");

  let result: ProvisionResult;
  try {
    result = await deps.store.provision({
      pendingCheckoutId: pending.id,
      sub: toProvisionInput(sub, sub.customerId),
      spaceName: deps.untitledName(pending.spaceType),
      timezone: deps.defaultTimezone,
    });
  } catch (e) {
    // The transaction rolled back: nothing partial exists. Record why (recoverable) and let the caller retry.
    await deps.store.failCheckout(pending.id, "provision_error").catch(() => undefined);
    throw e;
  }

  // Idempotent follow-ups: starting Studio defaults, the first invoice (maps it, counts its cycle, queues the single
  // payment confirmation), and the shared next-action state.
  await deps.seedSpace(result.tenantId, pending.spaceType, deps.untitledName(pending.spaceType));
  if (sub.latestInvoice && sub.latestInvoice.status === "paid") {
    await processInvoice(deps, sub.latestInvoice);
  } else if (sub.latestInvoiceId) {
    const inv = await deps.stripe.retrieveInvoice(sub.latestInvoiceId);
    if (inv.status === "paid") await processInvoice(deps, inv);
  }
  if (result.subscriptionId) await refreshNextAction(deps, result.subscriptionId);
  return result;
}
