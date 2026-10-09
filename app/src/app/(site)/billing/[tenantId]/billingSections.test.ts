import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildBillingPageModel, chipLabel, invoiceLink, invoiceStatusKind } from "@/lib/billing/billingPageModel";
import type { BillingViewModel, InvoiceRow } from "@/lib/billing/customerView";
import type { SubscriptionRecord } from "@/lib/billing/types";
import { BillingSections } from "./billing-sections";

const sub = (over: Partial<SubscriptionRecord> = {}): SubscriptionRecord => ({
  id: "s1", tenantId: "t1", billingOwnerUserId: "u1", planId: "p1", stripeMode: "test", stripeSubscriptionId: "sub_x", status: "active", currency: "USD",
  baseAmountMinor: 2500, currentEffectiveAmountMinor: 2500, currentPeriodStart: new Date("2026-10-01T00:00:00Z"), currentPeriodEnd: new Date("2026-11-01T00:00:00Z"),
  cancelAtPeriodEnd: false, cancelAt: null, canceledAt: null, endedAt: null, paymentFailedAt: null, guestSuspendedAt: null, studioSuspendedAt: null,
  deletionWarningAt: null, eligibleForDeletionAt: null, recoveredAt: null, nextAction: "renewal", nextActionAt: null, nextExpectedChargeMinor: 2500,
  nextPaymentAttemptAt: null, lastPaidInvoiceId: null, exemptReason: null, exemptExpiresAt: null, ...over,
});
const inv = (over: Partial<InvoiceRow> = {}): InvoiceRow => ({
  id: "i1", stripeInvoiceId: "in_1", status: "paid", issuedAt: "2026-10-01T10:00:00Z", paidAt: "2026-10-01T10:01:00Z", failedAt: null, currency: "USD", totalMinor: 2500,
  amountPaidMinor: 2500, amountRefundedMinor: 0, discountMinor: 0, number: "INV-1", hostedInvoiceUrl: "https://invoice.stripe.com/i/abc", invoicePdfUrl: null, receiptUrl: null, ...over,
});
const view = (over: Partial<BillingViewModel> = {}): BillingViewModel => ({
  tenantId: "t1", spaceName: "Sunrise", spaceType: "teach", subscription: sub(), state: "active", reason: "active" as BillingViewModel["reason"],
  access: { studioWritable: true, guestAvailable: true },
  deadlines: null,
  nextAction: { action: "renewal", at: new Date("2026-11-01T00:00:00Z"), expectedChargeMinor: 2500, currency: "USD", discountProgress: null },
  redemption: null, planName: "Space Monthly", audio: { libraryMinutes: 120, maxRecordingMinutes: 30, listeningMinutesPerMonth: 600 }, invoices: [inv()], ...over,
});
const html = (v: BillingViewModel, locale: "en" | "he" = "en") => renderToStaticMarkup(createElement(BillingSections, { model: buildBillingPageModel(v, locale), locale }));

describe("Billing page presentation", () => {
  it("shows plan, price, status, period, next date/charge, audio and a safe invoice link", () => {
    const out = html(view());
    expect(out).toContain("Space Monthly");
    expect(out).toContain("$25.00 per month");
    expect(out).toContain("Active");
    expect(out).toContain("Renews on 1 November 2026");
    expect(out).toContain("120 minutes of audio library");
    expect(out).toContain('href="https://invoice.stripe.com/i/abc"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain("<table");
  });
  it("never links non-https documents", () => {
    expect(invoiceLink(inv({ hostedInvoiceUrl: "javascript:alert(1)", receiptUrl: "http://x.test/r" }))).toBeNull();
    expect(invoiceLink(inv({ hostedInvoiceUrl: null, receiptUrl: "https://pay.stripe.com/receipts/x" }))).toBe("https://pay.stripe.com/receipts/x");
  });
  it("coupon progress and remaining payments", () => {
    const v = view({
      redemption: { status: "redeemed", cyclesCompleted: 1, cyclesTotal: 3, discountEndsAt: null, couponCode: "WELCOME", terms: { discountType: "percent", percentOff: 50, amountOffMinor: null, currency: null, durationType: "repeating", durationCycles: 3 } },
    });
    const out = html(v);
    expect(out).toContain("WELCOME");
    expect(out).toContain("1 of 3 discounted payments used");
    expect(out).toContain("2 discounted payments remaining");
  });
  it("refunded amounts and invoice status labels", () => {
    const m = buildBillingPageModel(view({ invoices: [inv({ amountRefundedMinor: 500 }), inv({ id: "i2", status: "open", paidAt: null, failedAt: "2026-10-02T00:00:00Z" })] }), "en");
    expect(m.invoices[0].refunded).toBe("Refunded $5.00");
    expect(m.invoices[1].kind).toBe("failed");
    expect(invoiceStatusKind({ status: "open", failedAt: null })).toBe("pending");
  });
  it("exempt Spaces: 'Included', no history, no payment actions", () => {
    const m = buildBillingPageModel(view({ subscription: sub({ status: "exempt", stripeSubscriptionId: null }), state: "exempt", nextAction: { action: "none", at: null, expectedChargeMinor: null, currency: null, discountProgress: null }, audio: null }), "en");
    expect(m.canCancel || m.canResume || m.canUpdatePayment).toBe(false);
    expect(m.invoices).toEqual([]);
    const out = html(view({ subscription: sub({ status: "exempt", stripeSubscriptionId: null }), state: "exempt", audio: null }));
    expect(out).toContain("Included");
    expect(out).not.toContain("Payment history");
  });
  it("cancellation scheduled: resume offered instead of cancel; no next charge", () => {
    const s = sub({ cancelAtPeriodEnd: true, cancelAt: new Date("2026-11-01T00:00:00Z") });
    const m = buildBillingPageModel(view({ subscription: s, state: "canceling" }), "en");
    expect(m.canResume).toBe(true);
    expect(m.canCancel).toBe(false);
    expect(m.cancelScheduled).toContain("1 November 2026");
    expect(m.statusText).toBe("Cancels on 1 November 2026");
    expect(m.nextCharge).toBeNull();
  });
  it("payment issue banner quotes the deadline", () => {
    const d = { guestSuspendedAt: new Date("2026-10-10T00:00:00Z"), studioSuspendedAt: new Date("2026-10-16T00:00:00Z"), deletionEligibleAt: new Date("2026-10-24T00:00:00Z") };
    expect(html(view({ state: "payment_issue", deadlines: d }))).toContain("10 October 2026");
    expect(html(view({ state: "guest_suspended", deadlines: d }))).toContain("16 October 2026");
  });
  it("renders Hebrew copy", () => {
    expect(html(view(), "he")).not.toContain("Payment history");
  });
});

describe("My Spaces chip", () => {
  it("is empty for healthy and exempt Spaces", () => {
    expect(chipLabel("active", "en", null)).toBeNull();
    expect(chipLabel("exempt", "en", null)).toBeNull();
    expect(chipLabel("payment_issue", "en", null)).toBe("Payment issue");
    expect(chipLabel("canceling", "en", new Date("2026-11-01T00:00:00Z"))).toBe("Ends 1 November 2026");
  });
});
