import type { BillingDeps } from "./deps";
import { BillingError } from "./errors";
import { provisionFromVerifiedSession } from "./provisioning";
import { processInvoice, syncSubscription } from "./sync";
import type { StripeEventDTO } from "./stripe/gateway";

export type WebhookResponse = { status: number; body: string };

/** Event types that carry a verified paid checkout. */
const CHECKOUT_PAID = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded"]);
const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
  "customer.subscription.paused", "customer.subscription.resumed", "customer.subscription.pending_update_applied",
]);
const INVOICE_RECORD = new Set(["invoice.finalized", "invoice.updated", "invoice.voided", "invoice.marked_uncollectible", "invoice.created"]);

/** Refund events: a full or partial refund (charge.refunded) and a refund whose state changed, e.g. failed (charge.refund.updated). */
const REFUND_EVENTS = new Set(["charge.refunded", "charge.refund.updated"]);

type Outcome = { kind: "processed" | "ignored"; tenantId?: string | null; pendingCheckoutId?: string | null };

async function route(deps: BillingDeps, ev: StripeEventDTO): Promise<Outcome> {
  const id = ev.objectId;
  if (!id) return { kind: "ignored" };

  if (CHECKOUT_PAID.has(ev.type)) {
    const session = await deps.stripe.retrieveCheckoutSession(id);
    const res = await provisionFromVerifiedSession(deps, session);
    return { kind: "processed", tenantId: res.tenantId, pendingCheckoutId: session.clientReferenceId };
  }
  if (ev.type === "checkout.session.expired") {
    const pending = await deps.store.getPendingBySession(deps.stripe.mode, id);
    if (pending) await deps.store.transitionCheckout(pending.id, ["created", "checkout_created", "awaiting_payment"], "expired");
    return { kind: "processed", pendingCheckoutId: pending?.id ?? null };
  }
  if (SUBSCRIPTION_EVENTS.has(ev.type)) {
    const { applied } = await syncSubscription(deps, id);
    return { kind: "processed", tenantId: applied.result === "applied" ? applied.tenantId : null };
  }
  if (ev.type === "invoice.paid" || ev.type === "invoice.payment_succeeded") {
    const inv = await deps.stripe.retrieveInvoice(id);
    const { row } = await processInvoice(deps, inv);
    return { kind: "processed", tenantId: row.tenantId };
  }
  if (ev.type === "invoice.payment_failed") {
    const inv = await deps.stripe.retrieveInvoice(id);
    const { row } = await processInvoice(deps, inv, { failedAt: ev.createdAt });
    return { kind: "processed", tenantId: row.tenantId };
  }
  if (INVOICE_RECORD.has(ev.type)) {
    const inv = await deps.stripe.retrieveInvoice(id);
    // Recording only: a paid/failed transition is handled by its own event, so no email can come from here.
    const { row } = await processInvoice(deps, inv);
    return { kind: "processed", tenantId: row.tenantId };
  }
  if (REFUND_EVENTS.has(ev.type) && ev.refund?.chargeId) {
    // Fetch-on-event: the charge's CURRENT cumulative refund total, never the event body's number. Two partial refunds
    // delivered out of order, a redelivered old event, or a refund that later fails (charge.refund.updated) all converge
    // on Stripe's truth instead of overwriting it with a stale amount.
    const charge = await deps.stripe.retrieveChargeRefund(ev.refund.chargeId);
    if (!charge) return { kind: "ignored" };
    const pi = charge.paymentIntentId ?? ev.refund.paymentIntentId;
    const invoiceId = pi ? await deps.stripe.findInvoiceIdForPaymentIntent(pi) : null;
    if (invoiceId) await deps.store.setInvoiceRefund(deps.stripe.mode, invoiceId, charge.amountRefundedMinor);
    return { kind: invoiceId ? "processed" : "ignored" };
  }
  return { kind: "ignored" };
}

/**
 * The Stripe webhook entry point (called by the route handler with the RAW body).
 *
 *   1. Verify the signature (+ timestamp tolerance + livemode == this deployment's mode).
 *      Anything invalid -> 400, nothing is touched.
 *   2. Claim the event atomically in billing_events. A redelivery of an already
 *      processed event is answered 200 and does NOTHING (no duplicate Space, email or
 *      cycle); a concurrent delivery gets 409 so Stripe retries later.
 *   3. Route to the handler, which re-reads Stripe's current state (event ordering and
 *      duplicates cannot corrupt anything).
 *   4. Record the outcome. A failure returns 500 so Stripe retries; the event row is
 *      marked failed and is re-claimable.
 */
export async function handleStripeWebhook(deps: BillingDeps, rawBody: string, signature: string | null): Promise<WebhookResponse> {
  let ev: StripeEventDTO;
  try {
    ev = deps.stripe.verifyWebhook(rawBody, signature);
  } catch {
    return { status: 400, body: "invalid signature" };
  }

  const claim = await deps.store.claimEvent({ mode: deps.stripe.mode, eventId: ev.id, type: ev.type });
  if (claim === "duplicate") return { status: 200, body: "duplicate" };
  if (claim === "in_progress") return { status: 409, body: "in progress" };

  try {
    const out = await route(deps, ev);
    await deps.store.finishEvent({
      mode: deps.stripe.mode, eventId: ev.id, status: out.kind, tenantId: out.tenantId ?? null, pendingCheckoutId: out.pendingCheckoutId ?? null,
    });
    return { status: 200, body: out.kind };
  } catch (e) {
    const code = e instanceof BillingError ? e.code : "unexpected";
    await deps.store
      .finishEvent({ mode: deps.stripe.mode, eventId: ev.id, status: "failed", errorCode: code, errorDetail: e instanceof Error ? e.message.slice(0, 300) : "error" })
      .catch(() => undefined);
    // A mismatch between a session and our records is a permanent condition retries cannot fix: acknowledge it
    // (it stays recorded as failed for Admin) rather than making Stripe retry for days.
    if (e instanceof BillingError && (e.code === "metadata_mismatch" || e.code === "wrong_mode" || e.code === "checkout_not_found")) {
      return { status: 200, body: `rejected:${code}` };
    }
    return { status: 500, body: "error" };
  }
}
