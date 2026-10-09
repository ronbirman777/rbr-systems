import type { BillingDeps } from "../deps";
import type { InvoiceDTO } from "../stripe/gateway";
import { buildBillingUrl } from "../urls";
import { emailDedupeKey, isSendableTemplate, paymentConfirmationVariant, type EmailTemplate } from "./templates";

/**
 * Queue billing emails through the transactional outbox. EVERY email has a
 * deterministic dedupe key (per invoice / per subscription episode), so a
 * duplicate webhook or a re-run job can never queue - or send - one twice.
 *
 * What InnerDweS sends vs. what Stripe sends (one coherent experience):
 *   - InnerDweS sends ONE payment-confirmation email per paid invoice: the
 *     service confirmation (Space, plan, amount, discount, next billing) with a
 *     link to the OFFICIAL Stripe-hosted invoice/receipt.
 *   - Stripe's own invoice/receipt emails must stay OFF in the Stripe Dashboard
 *     (Settings > Billing > Emails), so the customer receives exactly one email
 *     per payment. The official document is Stripe's hosted invoice page and PDF.
 *   - There is NO separate welcome/activation email and NO separate recovery email:
 *     the first paid invoice's confirmation (variant 'first') IS the activation
 *     message, and a paid invoice ending a failure episode (variant 'recovered') IS
 *     the recovery message. `subscription_started` / `payment_recovered` are retired
 *     (see ./templates.ts).
 */

const LOCALE_FALLBACK = "en";

async function recipientLocale(deps: BillingDeps, userId: string): Promise<string> {
  const c = await deps.store.getUserContact(userId);
  return c?.locale ?? LOCALE_FALLBACK;
}

/** Defence in depth: a retired (or unknown) template can never reach the outbox. */
function assertSendable(template: string): asserts template is EmailTemplate {
  if (!isSendableTemplate(template)) throw new Error(`billing email template not enqueueable: ${template}`);
}

export async function enqueuePaymentConfirmation(
  deps: BillingDeps,
  a: { invoice: InvoiceDTO; subscriptionId: string; tenantId: string; userId: string; wasInFailure: boolean }
) {
  const [sub, redemption, space] = await Promise.all([
    deps.store.getSubscriptionById(a.subscriptionId),
    deps.store.getRedemptionState(a.subscriptionId),
    deps.store.getTenantSummary(a.tenantId),
  ]);
  if (!sub) return false;
  const plan = sub.planId ? await deps.store.getPlanById(sub.planId, deps.stripe.mode) : null;
  const inv = a.invoice;
  const finalPayment = sub.cancelAtPeriodEnd;
  const payload = {
    variant: paymentConfirmationVariant({ billingReason: inv.billingReason, wasInFailure: a.wasInFailure, cancelAtPeriodEnd: finalPayment }),
    spaceName: space?.name ?? "",
    spaceType: space?.productType ?? "",
    planName: plan?.displayName ?? "",
    amountPaidMinor: inv.amountPaidMinor,
    currency: inv.currency,
    discountMinor: inv.discountMinor,
    couponCode: redemption?.couponCode ?? null,
    discountCycle: redemption && redemption.cyclesTotal !== undefined
      ? { completed: redemption.cyclesCompleted, total: redemption.cyclesTotal, status: redemption.status }
      : null,
    nextBillingDate: sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
    nextExpectedChargeMinor: sub.nextExpectedChargeMinor,
    subscriptionStatus: sub.status,
    cancelsAtPeriodEnd: finalPayment,
    invoiceNumber: inv.number,
    hostedInvoiceUrl: inv.hostedInvoiceUrl,
    invoicePdfUrl: inv.invoicePdfUrl,
    receiptUrl: inv.receiptUrl,
    billingUrl: buildBillingUrl(deps.appUrl, a.tenantId),
  };
  return deps.store.enqueueEmail({
    dedupeKey: emailDedupeKey.paymentConfirmation(inv.id), template: "payment_confirmation", userId: a.userId, tenantId: a.tenantId,
    subscriptionId: a.subscriptionId, locale: await recipientLocale(deps, a.userId), payload,
  });
}

export type SimpleNoticeTemplate =
  | "payment_failed" | "guest_unavailable" | "studio_suspended" | "final_warning" | "cancellation_scheduled" | "subscription_ended";

export async function enqueueSimpleNotice(
  deps: BillingDeps,
  a: { template: SimpleNoticeTemplate; dedupeKey: string; subscriptionId: string; tenantId: string; userId: string; extra?: Record<string, unknown> }
) {
  assertSendable(a.template);
  const [sub, space] = await Promise.all([deps.store.getSubscriptionById(a.subscriptionId), deps.store.getTenantSummary(a.tenantId)]);
  const payload = {
    spaceName: space?.name ?? "",
    spaceType: space?.productType ?? "",
    billingUrl: buildBillingUrl(deps.appUrl, a.tenantId),
    accessEndsAt: sub?.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
    paymentFailedAt: sub?.paymentFailedAt ? sub.paymentFailedAt.toISOString() : null,
    studioSuspensionAt: sub?.paymentFailedAt ? new Date(sub.paymentFailedAt.getTime() + 168 * 3600_000).toISOString() : null,
    deletionEligibleAt: sub?.paymentFailedAt ? new Date(sub.paymentFailedAt.getTime() + 336 * 3600_000).toISOString() : null,
    ...a.extra,
  };
  return deps.store.enqueueEmail({
    dedupeKey: a.dedupeKey, template: a.template, userId: a.userId, tenantId: a.tenantId, subscriptionId: a.subscriptionId,
    locale: await recipientLocale(deps, a.userId), payload,
  });
}
