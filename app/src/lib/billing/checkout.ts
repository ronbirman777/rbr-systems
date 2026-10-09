import { BASE_PLAN_KEY, CHECKOUT_TTL_MINUTES, SELLABLE_SPACE_TYPES, type SellableSpaceType } from "./constants";
import type { BillingDeps } from "./deps";
import { BillingError } from "./errors";
import { couponMatchesStripe } from "./admin/policy";
import { LEGAL_VERSIONS } from "./legal";
import { buildQuote, type Quote } from "./quote";
import type { CouponRefusal, PendingCheckout, PlanRecord } from "./store";
import { checkoutCancelUrl, checkoutSuccessUrl } from "./urls";

export function isSellableSpaceType(v: unknown): v is SellableSpaceType {
  return typeof v === "string" && (SELLABLE_SPACE_TYPES as readonly string[]).includes(v);
}

export type ConsentInput = { immediateService: boolean; withdrawalAcknowledged: boolean };

/** Resolve the TRUSTED plan for a Space type. Never accepts a price from the client. */
export async function resolvePlan(deps: BillingDeps, spaceType: SellableSpaceType): Promise<PlanRecord> {
  const plan = await deps.store.getPlan(BASE_PLAN_KEY, deps.stripe.mode);
  if (!plan || !plan.active || !plan.spaceTypes.includes(spaceType)) throw new BillingError("plan_unavailable");
  if (!plan.stripePriceId) throw new BillingError("plan_not_synced");
  return plan;
}

/**
 * Price-drift guard: refuse to sell if the Stripe Price is not EXACTLY the
 * trusted plan (amount, currency, interval, active). Prevents the UI promising
 * one price while Stripe would charge another.
 */
async function assertPriceMatches(deps: BillingDeps, plan: PlanRecord) {
  const check = await deps.stripe.checkPrice({
    priceId: plan.stripePriceId!, expectedAmountMinor: plan.unitAmountMinor, currency: plan.currency, interval: plan.interval,
  });
  if (!check.ok) throw new BillingError("price_drift", check.reason);
}

export type CouponView =
  | { applied: false; error: CouponRefusal | null }
  | { applied: true; code: string; quote: Quote };

export type CheckoutPreview = { quote: Quote; coupon: CouponView; pendingCheckoutId: string };

async function ensureOpenCheckout(deps: BillingDeps, userId: string, spaceType: SellableSpaceType, plan: PlanRecord, locale: string | null): Promise<PendingCheckout> {
  if (!(await deps.store.paidCheckoutEnabled())) throw new BillingError("checkout_disabled");
  const existing = await deps.store.findOpenCheckout(userId, spaceType);
  if (existing && existing.expiresAt.getTime() > deps.now().getTime()) return existing;
  if (existing) await deps.store.transitionCheckout(existing.id, ["created", "checkout_created", "awaiting_payment"], "expired");
  return deps.store.createPendingCheckout({
    userId, spaceType, planId: plan.id, mode: deps.stripe.mode, locale,
    expiresAt: new Date(deps.now().getTime() + CHECKOUT_TTL_MINUTES * 60_000), quote: {},
  });
}

/**
 * "Apply" on the pre-checkout page. Typing a coupon is NOT a redemption: this
 * validates and holds a short-lived RESERVATION (expiring on its own) on the
 * open pending checkout and returns a server-computed quote. Calling it with an
 * empty code releases any reservation and returns the plain quote.
 */
export async function previewCheckout(
  deps: BillingDeps, a: { userId: string; spaceType: unknown; couponCode: string | null; locale: string | null }
): Promise<CheckoutPreview> {
  if (!isSellableSpaceType(a.spaceType)) throw new BillingError("invalid_space_type");
  const plan = await resolvePlan(deps, a.spaceType);
  const pending = await ensureOpenCheckout(deps, a.userId, a.spaceType, plan, a.locale);
  const base = buildQuote({ amountMinor: plan.unitAmountMinor, currency: plan.currency }, null);

  const code = (a.couponCode ?? "").trim();
  if (!code) {
    await deps.store.releaseCoupon(pending.id, "removed");
    await deps.store.setCheckoutQuote(pending.id, { ...base });
    return { quote: base, coupon: { applied: false, error: null }, pendingCheckoutId: pending.id };
  }
  const r = await deps.store.reserveCoupon({
    userId: a.userId, code, pendingCheckoutId: pending.id, spaceType: a.spaceType, planKey: plan.planKey, mode: deps.stripe.mode,
  });
  if (!r.ok) return { quote: base, coupon: { applied: false, error: r.reason }, pendingCheckoutId: pending.id };
  const quote = buildQuote({ amountMinor: plan.unitAmountMinor, currency: plan.currency }, r.terms);
  await deps.store.setCheckoutQuote(pending.id, { ...quote });
  return { quote, coupon: { applied: true, code: code.toUpperCase(), quote }, pendingCheckoutId: pending.id };
}

export type StartCheckoutResult = { url: string; pendingCheckoutId: string } | { error: CouponRefusal };

/**
 * Create the Stripe Checkout Session. Browser input is ONLY: Space type, coupon
 * code, the two consent flags, and the UI locale. Price, currency, discount,
 * customer, Stripe ids and return URLs are all resolved here.
 *
 * Order (each step is safe to repeat):
 *   consent -> trusted plan -> price-drift guard -> open pending checkout ->
 *   coupon reservation -> acceptance evidence -> Stripe customer -> Stripe session.
 * Any failure after a reservation releases it, so a broken attempt never
 * consumes a coupon allowance or cap.
 */
export async function startCheckout(
  deps: BillingDeps,
  a: { userId: string; email: string | null; spaceType: unknown; couponCode: string | null; consent: ConsentInput; locale: string | null }
): Promise<StartCheckoutResult> {
  if (!isSellableSpaceType(a.spaceType)) throw new BillingError("invalid_space_type");
  if (!a.consent.immediateService || !a.consent.withdrawalAcknowledged) throw new BillingError("consent_required");
  const plan = await resolvePlan(deps, a.spaceType);
  await assertPriceMatches(deps, plan);

  const pending = await ensureOpenCheckout(deps, a.userId, a.spaceType, plan, a.locale);

  // An open checkout that already has a live Stripe session for the SAME coupon state is reused (a second tab never creates a competing session).
  const code = (a.couponCode ?? "").trim();
  let couponId: string | null = null;
  if (code) {
    const r = await deps.store.reserveCoupon({
      userId: a.userId, code, pendingCheckoutId: pending.id, spaceType: a.spaceType, planKey: plan.planKey, mode: deps.stripe.mode,
    });
    if (!r.ok) return { error: r.reason };
    // Drift guard: Stripe must hold EXACTLY the terms InnerDweS promised (never "Admin says 10%, Stripe charges 20%").
    const stripeCoupon = await deps.stripe.retrieveCoupon(r.stripeCouponId);
    const match = couponMatchesStripe(r.terms, stripeCoupon && {
      valid: stripeCoupon.valid, percentOff: stripeCoupon.percentOff, amountOffMinor: stripeCoupon.amountOffMinor,
      currency: stripeCoupon.currency, duration: stripeCoupon.duration, durationInMonths: stripeCoupon.durationInMonths,
    });
    if (!match.ok) {
      await deps.store.releaseCoupon(pending.id, "stripe_coupon_drift");
      return { error: "unavailable" };
    }
    couponId = r.stripeCouponId;
  } else {
    await deps.store.releaseCoupon(pending.id, "removed");
  }

  try {
    if (pending.sessionId) {
      const existing = await deps.stripe.retrieveCheckoutSession(pending.sessionId);
      const sameCoupon = (existing.metadata.coupon ?? "") === (couponId ?? "");
      if (existing.status === "open" && existing.url && sameCoupon) return { url: existing.url, pendingCheckoutId: pending.id };
      if (existing.status === "open") await deps.stripe.expireCheckoutSession(existing.id);
      if (existing.status === "complete") throw new BillingError("checkout_closed");
    }

    await deps.store.saveAcceptance({
      userId: a.userId, pendingCheckoutId: pending.id, termsVersion: LEGAL_VERSIONS.terms, privacyVersion: LEGAL_VERSIONS.privacy,
      billingTermsVersion: LEGAL_VERSIONS.billingTerms, consentTextId: LEGAL_VERSIONS.consentText, locale: a.locale,
    });

    const existingCustomer = await deps.store.getCustomerId(a.userId, deps.stripe.mode);
    const customer = await deps.stripe.ensureCustomer({ userId: a.userId, email: a.email, existingCustomerId: existingCustomer });
    if (!existingCustomer) await deps.store.saveCustomer(a.userId, deps.stripe.mode, customer.id);

    const session = await deps.stripe.createCheckoutSession({
      pendingCheckoutId: pending.id,
      attemptKey: `${pending.sessionId ?? "first"}-${couponId ?? "none"}`,
      customerId: customer.id,
      priceId: plan.stripePriceId!,
      couponId,
      successUrl: checkoutSuccessUrl(deps.appUrl, pending.id),
      cancelUrl: checkoutCancelUrl(deps.appUrl, a.spaceType),
      expiresAt: pending.expiresAt,
      // Minimum identifiers needed to reconcile - no secrets, no personal data.
      metadata: {
        pending_checkout_id: pending.id, user_id: a.userId, space_type: a.spaceType, plan_key: plan.planKey, coupon: couponId ?? "",
      },
      locale: a.locale,
      automaticTax: deps.automaticTax,
    });
    if (!session.url) throw new Error("Stripe returned no checkout URL");
    await deps.store.transitionCheckout(pending.id, ["created", "checkout_created", "awaiting_payment"], "checkout_created", {
      sessionId: session.id, customerId: customer.id,
    });
    return { url: session.url, pendingCheckoutId: pending.id };
  } catch (e) {
    await deps.store.releaseCoupon(pending.id, "checkout_failed").catch(() => undefined);
    throw e;
  }
}

/** The customer returned from Stripe without paying (cancel_url): free the reservation; no Space exists to clean up. */
export async function cancelCheckoutByUser(deps: BillingDeps, userId: string, spaceType: SellableSpaceType): Promise<void> {
  const pending = await deps.store.findOpenCheckout(userId, spaceType);
  if (!pending) return;
  if (pending.sessionId) await deps.stripe.expireCheckoutSession(pending.sessionId);
  await deps.store.transitionCheckout(pending.id, ["created", "checkout_created", "awaiting_payment"], "canceled");
}
