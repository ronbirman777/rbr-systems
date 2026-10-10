import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import Stripe from "stripe";
import { createStripeGateway } from "./real";
import { couponIdOfDiscount, effectiveAmountFromInvoice, mapCheckoutSession, mapInvoice, mapSubscription } from "./mappers";
import { eventMatchesMode, stripeModeFromSecretKey } from "./mode";

describe("Stripe mode is derived from the key itself (Test and Live can never mix)", () => {
  it("recognises test and live keys, including restricted keys", () => {
    expect(stripeModeFromSecretKey("sk_test_abc")).toBe("test");
    expect(stripeModeFromSecretKey("rk_test_abc")).toBe("test");
    expect(stripeModeFromSecretKey("sk_live_abc")).toBe("live");
    expect(stripeModeFromSecretKey("rk_live_abc")).toBe("live");
  });
  it("refuses a missing or unrecognisable key", () => {
    for (const k of [undefined, null, "", "pk_test_x", "whsec_x", "sk_prod_x", "garbage"]) expect(() => stripeModeFromSecretKey(k as string)).toThrow();
  });
  it("an event only belongs to the deployment whose mode matches its livemode flag", () => {
    expect(eventMatchesMode("test", false)).toBe(true);
    expect(eventMatchesMode("test", true)).toBe(false);
    expect(eventMatchesMode("live", true)).toBe(true);
    expect(eventMatchesMode("live", false)).toBe(false);
  });
});

describe("webhook signature verification (real Stripe verification, signed here with the same algorithm)", () => {
  const secret = "whsec_test_secret_for_unit_tests";
  const gw = createStripeGateway({ secretKey: "sk_test_unit", webhookSecret: secret });
  const payload = (o: Record<string, unknown> = {}) => JSON.stringify({ id: "evt_1", object: "event", type: "invoice.paid", livemode: false, created: Math.floor(Date.now() / 1000), data: { object: { id: "in_1" } }, ...o });
  const sign = (body: string, ts = Math.floor(Date.now() / 1000), key = secret) => `t=${ts},v1=${createHmac("sha256", key).update(`${ts}.${body}`).digest("hex")}`;

  it("accepts a correctly signed event and reduces it to the routing fields", () => {
    const body = payload();
    expect(gw.verifyWebhook(body, sign(body))).toMatchObject({ id: "evt_1", type: "invoice.paid", livemode: false, objectId: "in_1" });
  });
  it("rejects a tampered body", () => {
    const body = payload();
    const sig = sign(body);
    expect(() => gw.verifyWebhook(body.replace("in_1", "in_2"), sig)).toThrow();
  });
  it("rejects a signature made with the wrong secret", () => {
    const body = payload();
    expect(() => gw.verifyWebhook(body, sign(body, undefined, "whsec_other"))).toThrow();
  });
  it("rejects a replayed old delivery (outside the timestamp tolerance)", () => {
    const body = payload();
    expect(() => gw.verifyWebhook(body, sign(body, Math.floor(Date.now() / 1000) - 3600))).toThrow();
  });
  it("rejects missing signature headers", () => {
    expect(() => gw.verifyWebhook(payload(), null)).toThrow();
    expect(() => gw.verifyWebhook(payload(), "")).toThrow();
    expect(() => gw.verifyWebhook(payload(), "v1=nothing")).toThrow();
  });
  it("rejects a LIVE-mode event delivered to a TEST-mode deployment", () => {
    const body = payload({ livemode: true });
    expect(() => gw.verifyWebhook(body, sign(body))).toThrow(/livemode/);
  });
  it("refuses to verify anything when no webhook secret is configured (fail closed)", () => {
    const open = createStripeGateway({ secretKey: "sk_test_unit", webhookSecret: null });
    const body = payload();
    expect(() => open.verifyWebhook(body, sign(body))).toThrow();
  });
  it("extracts refund facts only for charge.refunded", () => {
    const body = payload({ type: "charge.refunded", data: { object: { id: "ch_1", payment_intent: "pi_9", amount_refunded: 500 } } });
    expect(gw.verifyWebhook(body, sign(body)).refund).toEqual({ chargeId: "ch_1", paymentIntentId: "pi_9", amountRefundedMinor: 500 });
  });
  it("charge.refund.updated (a refund that failed) is reduced to its charge, so the handler re-reads the charge", () => {
    const body = payload({ type: "charge.refund.updated", data: { object: { id: "re_1", object: "refund", charge: "ch_7", payment_intent: "pi_7", amount: 1000, status: "failed" } } });
    expect(gw.verifyWebhook(body, sign(body)).refund).toEqual({ chargeId: "ch_7", paymentIntentId: "pi_7", amountRefundedMinor: 0 });
    const other = payload({ type: "invoice.paid", data: { object: { id: "in_1", charge: "ch_7" } } });
    expect(gw.verifyWebhook(other, sign(other)).refund).toBeNull();
  });
  it("the real gateway reports its mode from the key", () => {
    expect(gw.mode).toBe("test");
    expect(createStripeGateway({ secretKey: "sk_live_unit", webhookSecret: null }).mode).toBe("live");
  });
});

describe("object mappers (Stripe SDK shapes -> plain DTOs)", () => {
  const sub = {
    id: "sub_1", object: "subscription", customer: "cus_1", status: "active", cancel_at_period_end: false, cancel_at: null, canceled_at: null, ended_at: null, livemode: false, metadata: { pending_checkout_id: "pc" },
    latest_invoice: "in_1", discounts: [{ coupon: { id: "co_1" } }],
    items: { data: [{ quantity: 1, current_period_start: 1_700_000_000, current_period_end: 1_702_592_000, price: { id: "price_1", currency: "usd", unit_amount: 2500 } }] },
  } as unknown as Stripe.Subscription;
  it("maps a subscription: money in minor units, periods from the item, coupon id, customer id", () => {
    expect(mapSubscription(sub)).toMatchObject({
      id: "sub_1", customerId: "cus_1", status: "active", priceId: "price_1", currency: "USD", baseAmountMinor: 2500, currentPeriodStart: new Date(1_700_000_000_000),
      currentPeriodEnd: new Date(1_702_592_000_000), cancelAtPeriodEnd: false, latestInvoiceId: "in_1", discountCouponId: "co_1",
    });
  });
  it("multiplies the unit price by quantity and reads an expanded customer object", () => {
    const s = { ...sub, customer: { id: "cus_2" }, items: { data: [{ quantity: 3, price: { id: "p", currency: "usd", unit_amount: 100 } }] } } as unknown as Stripe.Subscription;
    expect(mapSubscription(s)).toMatchObject({ customerId: "cus_2", baseAmountMinor: 300 });
  });
  it("rejects statuses and prices it cannot represent instead of guessing", () => {
    expect(() => mapSubscription({ ...sub, status: "weird" } as unknown as Stripe.Subscription)).toThrow();
    expect(() => mapSubscription({ ...sub, items: { data: [] } } as unknown as Stripe.Subscription)).toThrow();
    expect(() => mapSubscription({ ...sub, items: { data: [{ price: { id: "p", currency: "usd", unit_amount: null } }] } } as unknown as Stripe.Subscription)).toThrow();
  });
  it("reads a coupon from either discount shape Stripe has used", () => {
    expect(couponIdOfDiscount({ coupon: { id: "a" } })).toBe("a");
    expect(couponIdOfDiscount({ source: { coupon: "b" } })).toBe("b");
    expect(couponIdOfDiscount("di_1")).toBeNull();
    expect(couponIdOfDiscount(null)).toBeNull();
  });
  it("maps an invoice, including hosted document links, discount and subscription link", () => {
    const inv = {
      id: "in_1", status: "paid", billing_reason: "subscription_create", currency: "usd", subtotal: 2500, total: 2250, amount_due: 0, amount_paid: 2250, number: "ABC-0001",
      hosted_invoice_url: "https://invoice.stripe.com/i/x", invoice_pdf: "https://pay.stripe.com/invoice/x/pdf", period_start: 1_700_000_000, period_end: 1_702_592_000, created: 1_700_000_000,
      attempt_count: 1, next_payment_attempt: null, livemode: false, customer: "cus_1", total_discount_amounts: [{ amount: 250 }], total_taxes: [{ amount: 0 }],
      status_transitions: { paid_at: 1_700_000_100 }, parent: { subscription_details: { subscription: "sub_1" } },
    } as unknown as Stripe.Invoice;
    expect(mapInvoice(inv)).toMatchObject({
      id: "in_1", subscriptionId: "sub_1", customerId: "cus_1", status: "paid", billingReason: "subscription_create", currency: "USD", subtotalMinor: 2500, discountMinor: 250,
      totalMinor: 2250, amountPaidMinor: 2250, number: "ABC-0001", hostedInvoiceUrl: "https://invoice.stripe.com/i/x", invoicePdfUrl: "https://pay.stripe.com/invoice/x/pdf",
      paidAt: new Date(1_700_000_100_000), discountApplied: true,
    });
    expect(effectiveAmountFromInvoice({ subtotalMinor: 2500, discountMinor: 250 })).toBe(2250);
    expect(effectiveAmountFromInvoice({ subtotalMinor: 100, discountMinor: 500 })).toBe(0);
  });
  it("an invoice's service period comes from its subscription line, not Stripe's invoice-level (previous-period) dates", () => {
    const base = {
      id: "in_2", status: "paid", billing_reason: "subscription_cycle", currency: "usd", subtotal: 2500, total: 2500, amount_due: 2500, amount_paid: 2500, number: null,
      hosted_invoice_url: null, invoice_pdf: null, created: 1_702_592_000, attempt_count: 1, next_payment_attempt: null, livemode: false, customer: "cus_1",
      // Stripe: the invoice-level period of a renewal is the month that just ENDED.
      period_start: 1_700_000_000, period_end: 1_702_592_000,
    };
    const withLines = { ...base, lines: { data: [
      { period: { start: 1, end: 2 }, parent: { type: "invoice_item_details" } },
      { period: { start: 1_702_592_000, end: 1_705_270_400 }, parent: { type: "subscription_item_details" } },
    ] } } as unknown as Stripe.Invoice;
    expect(mapInvoice(withLines)).toMatchObject({ periodStart: new Date(1_702_592_000_000), periodEnd: new Date(1_705_270_400_000) });
    // No line data: fall back to the invoice-level fields rather than inventing dates.
    expect(mapInvoice(base as unknown as Stripe.Invoice)).toMatchObject({ periodStart: new Date(1_700_000_000_000), periodEnd: new Date(1_702_592_000_000) });
  });
  it("maps a checkout session", () => {
    const s = { id: "cs_1", status: "complete", payment_status: "paid", customer: "cus_1", subscription: "sub_1", client_reference_id: "pc_1", metadata: { a: "b" }, url: null, expires_at: 1_700_000_000, livemode: false } as unknown as Stripe.Checkout.Session;
    expect(mapCheckoutSession(s)).toMatchObject({ id: "cs_1", status: "complete", paymentStatus: "paid", customerId: "cus_1", subscriptionId: "sub_1", clientReferenceId: "pc_1" });
  });
});
