import "server-only";
import Stripe from "stripe";
import { eventMatchesMode, stripeModeFromSecretKey } from "./mode";
import { eventToDto, mapCheckoutSession, mapInvoice, mapSubscription } from "./mappers";
import type { PriceCheck, StripeEventDTO, StripeGateway } from "./gateway";

/**
 * The production Stripe gateway. Server-only (the secret key must never reach a
 * browser bundle). The mode comes from the key's own prefix; a webhook for the
 * other mode is rejected, so Test and Live data can never mix.
 */
export function createStripeGateway(opts: { secretKey: string; webhookSecret: string | null }): StripeGateway {
  const mode = stripeModeFromSecretKey(opts.secretKey);
  const stripe = new Stripe(opts.secretKey, { maxNetworkRetries: 2, appInfo: { name: "InnerDweS" } });

  return {
    mode,

    async ensureCustomer({ userId, email, existingCustomerId }) {
      if (existingCustomerId) return { id: existingCustomerId };
      // The idempotency key makes two simultaneous first checkouts converge on ONE customer.
      const c = await stripe.customers.create(
        { email: email ?? undefined, metadata: { innerdwes_user_id: userId } },
        { idempotencyKey: `idw-customer-${mode}-${userId}` }
      );
      return { id: c.id };
    },

    async checkPrice({ priceId, expectedAmountMinor, currency, interval }): Promise<PriceCheck> {
      const p = await stripe.prices.retrieve(priceId);
      if (!p.active) return { ok: false, reason: "price_inactive" };
      if (p.unit_amount !== expectedAmountMinor) return { ok: false, reason: "amount_mismatch" };
      if (p.currency.toUpperCase() !== currency.toUpperCase()) return { ok: false, reason: "currency_mismatch" };
      if (p.type !== "recurring" || p.recurring?.interval !== interval || (p.recurring?.interval_count ?? 1) !== 1) {
        return { ok: false, reason: "interval_mismatch" };
      }
      return { ok: true };
    },

    async createCheckoutSession(a) {
      const s = await stripe.checkout.sessions.create(
        {
          mode: "subscription",
          customer: a.customerId,
          line_items: [{ price: a.priceId, quantity: 1 }],
          discounts: a.couponId ? [{ coupon: a.couponId }] : undefined,
          client_reference_id: a.pendingCheckoutId,
          metadata: a.metadata,
          subscription_data: { metadata: a.metadata },
          success_url: a.successUrl,
          cancel_url: a.cancelUrl,
          expires_at: Math.floor(a.expiresAt.getTime() / 1000),
          billing_address_collection: "auto",
          automatic_tax: { enabled: a.automaticTax },
          // Customers type no codes into Stripe: InnerDweS validates and reserves
          // the coupon itself and attaches the matching Stripe coupon above.
          allow_promotion_codes: false,
          ...(a.locale ? { locale: a.locale as Stripe.Checkout.SessionCreateParams.Locale } : {}),
        },
        { idempotencyKey: `idw-checkout-${a.pendingCheckoutId}-${a.attemptKey}` }
      );
      return mapCheckoutSession(s);
    },
    async expireCheckoutSession(id) {
      try { await stripe.checkout.sessions.expire(id); } catch { /* already expired/complete: nothing to do */ }
    },
    async retrieveCheckoutSession(id) {
      return mapCheckoutSession(await stripe.checkout.sessions.retrieve(id));
    },

    async retrieveSubscription(id) {
      const s = await stripe.subscriptions.retrieve(id, { expand: ["discounts"] });
      const dto = mapSubscription(s);
      if (dto.latestInvoiceId) {
        const inv = mapInvoice(await stripe.invoices.retrieve(dto.latestInvoiceId));
        dto.latestInvoice = inv;
        dto.effectiveAmountMinor = Math.max(0, inv.subtotalMinor - inv.discountMinor);
      }
      return dto;
    },
    async setCancelAtPeriodEnd(id, cancel) {
      const s = await stripe.subscriptions.update(id, { cancel_at_period_end: cancel });
      return mapSubscription(s);
    },
    async retrieveInvoice(id) {
      const raw = await stripe.invoices.retrieve(id);
      const dto = mapInvoice(raw);
      // Best effort: the payment receipt page, only for a paid invoice.
      if (dto.status === "paid") {
        try {
          const full = await stripe.invoices.retrieve(id, { expand: ["payments"] });
          const pi = (full as unknown as { payments?: { data?: { payment?: { payment_intent?: string | { id: string } | null } }[] } }).payments?.data?.[0]?.payment?.payment_intent;
          const piId = typeof pi === "string" ? pi : pi?.id;
          if (piId) {
            const intent = await stripe.paymentIntents.retrieve(piId, { expand: ["latest_charge"] });
            const charge = intent.latest_charge;
            if (charge && typeof charge !== "string") dto.receiptUrl = charge.receipt_url ?? null;
          }
        } catch { /* the hosted invoice URL remains the official document */ }
      }
      return dto;
    },
    async retrieveChargeRefund(chargeId) {
      let c: Stripe.Charge;
      try {
        c = await stripe.charges.retrieve(chargeId);
      } catch (e) {
        if ((e as { code?: string }).code === "resource_missing") return null;
        throw e; // transient: the webhook answers 500 and Stripe retries
      }
      const pi = c.payment_intent;
      return { paymentIntentId: typeof pi === "string" ? pi : (pi?.id ?? null), amountRefundedMinor: c.amount_refunded ?? 0 };
    },
    async findInvoiceIdForPaymentIntent(paymentIntentId) {
      try {
        const list = await stripe.invoicePayments.list({ payment: { type: "payment_intent", payment_intent: paymentIntentId }, limit: 1 });
        const inv = list.data[0]?.invoice;
        return typeof inv === "string" ? inv : (inv?.id ?? null);
      } catch { return null; }
    },

    async createBillingPortalSession({ customerId, returnUrl }) {
      const s = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
      return { url: s.url };
    },

    async createCoupon(a) {
      const c = await stripe.coupons.create(
        {
          name: a.name.slice(0, 40),
          duration: a.duration,
          ...(a.duration === "repeating" ? { duration_in_months: a.durationInMonths! } : {}),
          ...(a.percentOff != null ? { percent_off: a.percentOff } : { amount_off: a.amountOffMinor!, currency: a.currency!.toLowerCase() }),
          metadata: { innerdwes_coupon_id: a.internalCouponId },
        },
        { idempotencyKey: `idw-coupon-${mode}-${a.internalCouponId}-${[a.percentOff ?? "", a.amountOffMinor ?? "", a.currency ?? "", a.duration, a.durationInMonths ?? ""].join("_")}` }
      );
      return { id: c.id };
    },
    async retrieveCoupon(id) {
      try {
        const c = await stripe.coupons.retrieve(id);
        const duration = c.duration === "once" ? "once" : c.duration === "repeating" ? "repeating" : c.duration === "forever" ? "forever" : null;
        if (!duration) return null;
        return {
          id: c.id, valid: c.valid, percentOff: c.percent_off ?? null, amountOffMinor: c.amount_off ?? null,
          currency: c.currency ? c.currency.toUpperCase() : null, duration, durationInMonths: c.duration_in_months ?? null,
        };
      } catch { return null; }
    },

    async ensureProductAndPrice(a) {
      let productId = a.existingProductId;
      if (!productId) {
        productId = (await stripe.products.create({ name: a.displayName, metadata: { innerdwes_plan_key: a.planKey } }, { idempotencyKey: `idw-product-${mode}-${a.planKey}` })).id;
      }
      let priceId = a.existingPriceId;
      if (!priceId) {
        priceId = (await stripe.prices.create(
          { product: productId, unit_amount: a.amountMinor, currency: a.currency.toLowerCase(), recurring: { interval: a.interval }, metadata: { innerdwes_plan_key: a.planKey } },
          { idempotencyKey: `idw-price-${mode}-${a.planKey}-${a.amountMinor}-${a.currency}-${a.interval}` }
        )).id;
      }
      return { productId, priceId };
    },

    verifyWebhook(rawBody, signatureHeader): StripeEventDTO {
      if (!opts.webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
      if (!signatureHeader) throw new Error("missing Stripe-Signature header");
      // constructEvent verifies the HMAC signature AND the timestamp tolerance; it throws otherwise.
      const ev = stripe.webhooks.constructEvent(rawBody, signatureHeader, opts.webhookSecret);
      if (!eventMatchesMode(mode, ev.livemode)) throw new Error("event livemode does not match this deployment's Stripe mode");
      return eventToDto(ev);
    },
  };
}

