import type { BillingDeps } from "./deps";
import { refreshNextAction } from "./nextActionService";
import type { InvoiceDTO, SubscriptionDTO } from "./stripe/gateway";
import type { SubscriptionStateInput, SubscriptionStateResult } from "./store";
import { enqueuePaymentConfirmation, enqueueSimpleNotice } from "./emails/enqueue";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Subscription invoices that represent a billing cycle (create / renewal) - the ones that count toward discount cycles. */
export const isCycleInvoice = (inv: Pick<InvoiceDTO, "billingReason">) =>
  inv.billingReason === "subscription_create" || inv.billingReason === "subscription_cycle";

export function invoiceToRpc(inv: InvoiceDTO, mode: "test" | "live", failedAt: Date | null) {
  return {
    stripe_mode: mode, stripe_invoice_id: inv.id, stripe_subscription_id: inv.subscriptionId, stripe_customer_id: inv.customerId,
    status: inv.status, billing_reason: inv.billingReason, currency: inv.currency, subtotal_minor: inv.subtotalMinor,
    discount_minor: inv.discountMinor, tax_minor: inv.taxMinor, total_minor: inv.totalMinor, amount_due_minor: inv.amountDueMinor,
    amount_paid_minor: inv.amountPaidMinor, invoice_number: inv.number, hosted_invoice_url: inv.hostedInvoiceUrl,
    invoice_pdf_url: inv.invoicePdfUrl, receipt_url: inv.receiptUrl, period_start: iso(inv.periodStart), period_end: iso(inv.periodEnd),
    issued_at: iso(inv.createdAt), paid_at: iso(inv.paidAt), failed_at: iso(failedAt ?? inv.failedAt), attempt_count: inv.attemptCount,
    discount_applied: inv.discountApplied,
  };
}

export function subscriptionToState(dto: SubscriptionDTO, hints: { failureObservedAt?: Date | null; forceFailed?: boolean }): SubscriptionStateInput {
  const inv = dto.latestInvoice;
  const latestFailed =
    !!hints.forceFailed || (inv?.status === "open" && inv.attemptCount > 0 && dto.status !== "incomplete" && dto.status !== "incomplete_expired");
  return {
    status: dto.status,
    price_id: dto.priceId,
    currency: dto.currency,
    base_amount_minor: dto.baseAmountMinor,
    effective_amount_minor: dto.effectiveAmountMinor,
    period_start: iso(dto.currentPeriodStart),
    period_end: iso(dto.currentPeriodEnd),
    cancel_at_period_end: dto.cancelAtPeriodEnd,
    cancel_at: iso(dto.cancelAt),
    canceled_at: iso(dto.canceledAt),
    ended_at: iso(dto.endedAt),
    latest_invoice_id: dto.latestInvoiceId,
    latest_invoice_paid: inv?.status === "paid",
    latest_invoice_failed: latestFailed,
    failure_observed_at: iso(hints.failureObservedAt ?? null),
  };
}

export type SyncResult = { dto: SubscriptionDTO; applied: SubscriptionStateResult };

/**
 * Re-read a subscription from Stripe (the authority) and apply its CURRENT
 * truth. Because the truth is re-fetched rather than parsed from an event, a
 * duplicate, delayed or out-of-order webhook converges on the same state.
 */
export async function syncSubscription(
  deps: BillingDeps,
  stripeSubscriptionId: string,
  hints: { failureObservedAt?: Date | null; forceFailed?: boolean } = {}
): Promise<SyncResult> {
  const dto = await deps.stripe.retrieveSubscription(stripeSubscriptionId);
  const state = subscriptionToState(dto, hints);
  const applied = await deps.store.applySubscriptionState(deps.stripe.mode, dto.id, state);

  if (applied.result === "applied") {
    const inFailure = state.latest_invoice_failed === true;
    await deps.store.setNextPaymentAttempt(applied.subscriptionId, inFailure ? dto.latestInvoice?.nextPaymentAttemptAt ?? null : null);

    if (!applied.cancelAtPeriodEndBefore && applied.cancelAtPeriodEndAfter && applied.userId) {
      await enqueueSimpleNotice(deps, {
        template: "cancellation_scheduled", dedupeKey: `cancellation_scheduled:${dto.id}:${iso(dto.currentPeriodEnd)}`,
        subscriptionId: applied.subscriptionId, tenantId: applied.tenantId, userId: applied.userId,
      });
    }
    if (applied.ended && applied.userId) {
      await enqueueSimpleNotice(deps, {
        template: "subscription_ended", dedupeKey: `subscription_ended:${dto.id}`,
        subscriptionId: applied.subscriptionId, tenantId: applied.tenantId, userId: applied.userId,
      });
    }
    await refreshNextAction(deps, applied.subscriptionId);
  }
  return { dto, applied };
}

/**
 * Process a verified Stripe invoice. Order matters and is deliberate:
 *   1. remember whether the Space was in a payment-failure episode (=> this
 *      payment is a RECOVERY),
 *   2. record the invoice (idempotent upsert),
 *   3. count the discount cycle (idempotent per invoice),
 *   4. apply the subscription's current state (recovery / failure start),
 *   5. queue the customer email - ONLY from this verified invoice, never from a
 *      browser redirect, and with a per-invoice dedupe key so Stripe's webhook
 *      retries can never send it twice.
 *
 * An invoice can arrive BEFORE the Space is provisioned (checkout events race
 * invoice events). It is then recorded unmapped; provisioning calls this same
 * function again once the Space exists, which maps it, counts its cycle and
 * queues the (single) confirmation.
 */
export async function processInvoice(deps: BillingDeps, inv: InvoiceDTO, ctx: { failedAt?: Date | null } = {}) {
  const mode = deps.stripe.mode;
  const before = inv.subscriptionId ? await deps.store.getSubscriptionByStripeId(mode, inv.subscriptionId) : null;
  const wasInFailure = !!before?.paymentFailedAt;
  const failedAt = ctx.failedAt ?? null;

  const row = await deps.store.upsertInvoice(invoiceToRpc(inv, mode, failedAt));

  if (row.subscriptionId && inv.status === "paid" && isCycleInvoice(inv)) {
    await deps.store.recordDiscountCycle(row.subscriptionId, inv.id, inv.discountApplied, inv.paidAt ?? deps.now());
  }
  let applied: SubscriptionStateResult | null = null;
  if (row.subscriptionId && inv.subscriptionId) {
    applied = (await syncSubscription(deps, inv.subscriptionId, { failureObservedAt: failedAt, forceFailed: inv.status === "open" && failedAt != null })).applied;
  }

  if (inv.status === "paid" && row.subscriptionId && row.userId && row.tenantId) {
    await enqueuePaymentConfirmation(deps, {
      invoice: inv, subscriptionId: row.subscriptionId, tenantId: row.tenantId, userId: row.userId,
      variant: wasInFailure ? "recovered" : inv.billingReason === "subscription_create" ? "first" : "renewal",
    });
  }
  if (row.newlyFailed && row.subscriptionId && row.userId && row.tenantId && inv.billingReason !== "subscription_create") {
    await enqueueSimpleNotice(deps, {
      template: "payment_failed", dedupeKey: `payment_failed:${inv.id}`, subscriptionId: row.subscriptionId, tenantId: row.tenantId, userId: row.userId,
      extra: { amountMinor: inv.amountDueMinor, currency: inv.currency, hostedInvoiceUrl: inv.hostedInvoiceUrl },
    });
  }
  return { row, applied };
}
