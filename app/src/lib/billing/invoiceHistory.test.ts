import { describe, expect, it } from "vitest";
import { buildBillingPageModel, invoiceDisplayMinor } from "./billingPageModel";
import { toCustomerInvoices, type BillingViewModel, type CustomerInvoiceDbRow } from "./customerView";
import type { SubscriptionRecord } from "./types";

const row = (o: Partial<CustomerInvoiceDbRow> = {}): CustomerInvoiceDbRow => ({
  id: "i1", stripe_invoice_id: "in_1", status: "paid", issued_at: "2026-10-01T10:00:00Z", paid_at: "2026-10-01T10:01:00Z", failed_at: null, currency: "USD ",
  total_minor: 2500, amount_due_minor: 2500, amount_paid_minor: 2500, amount_refunded_minor: 0, discount_minor: 0, invoice_number: "INV-1",
  hosted_invoice_url: "https://invoice.stripe.com/i/abc", invoice_pdf_url: null, receipt_url: null, created_at: "2026-10-01T10:00:00Z", ...o,
});

const sub: SubscriptionRecord = {
  id: "s1", tenantId: "t1", billingOwnerUserId: "u1", planId: "p1", stripeMode: "test", stripeSubscriptionId: "sub_x", status: "active", currency: "USD",
  baseAmountMinor: 2500, currentEffectiveAmountMinor: 2500, currentPeriodStart: new Date("2026-10-01T00:00:00Z"), currentPeriodEnd: new Date("2026-11-01T00:00:00Z"),
  cancelAtPeriodEnd: false, cancelAt: null, canceledAt: null, endedAt: null, paymentFailedAt: null, guestSuspendedAt: null, studioSuspendedAt: null,
  deletionWarningAt: null, eligibleForDeletionAt: null, recoveredAt: null, nextAction: "renewal", nextActionAt: null, nextExpectedChargeMinor: 2500,
  nextPaymentAttemptAt: null, lastPaidInvoiceId: null, exemptReason: null, exemptExpiresAt: null,
};
const view = (rows: CustomerInvoiceDbRow[]): BillingViewModel => ({
  tenantId: "t1", spaceName: "S", spaceType: "teach", subscription: sub, state: "active", reason: "active" as BillingViewModel["reason"],
  access: { studioWritable: true, guestAvailable: true }, deadlines: null,
  nextAction: { action: "renewal", at: new Date("2026-11-01T00:00:00Z"), expectedChargeMinor: 2500, currency: "USD", discountProgress: null },
  redemption: null, planName: "Space", audio: null, invoices: toCustomerInvoices(rows),
});

describe("customer payment history rows", () => {
  it("drops drafts (not a document yet) and trims the char(3) currency", () => {
    const out = toCustomerInvoices([row({ id: "d", status: "draft" }), row()]);
    expect(out.map((i) => i.id)).toEqual(["i1"]);
    expect(out[0].currency).toBe("USD");
  });
  it("newest first; a row without an issue date falls back to paid/created time instead of jumping to the top", () => {
    const out = toCustomerInvoices([
      row({ id: "old", issued_at: "2026-08-01T00:00:00Z" }),
      row({ id: "noissue", issued_at: null, paid_at: "2026-09-01T00:00:00Z" }),
      row({ id: "new", issued_at: "2026-10-01T00:00:00Z" }),
    ]);
    expect(out.map((i) => i.id)).toEqual(["new", "noissue", "old"]);
  });
});

describe("amount shown per invoice", () => {
  it("paid: the amount actually paid (discounts and credit applied), 0 for a 100%-off invoice", () => {
    expect(invoiceDisplayMinor({ status: "paid", amountPaidMinor: 2250, totalMinor: 2250, amountDueMinor: 2250 })).toBe(2250);
    expect(invoiceDisplayMinor({ status: "paid", amountPaidMinor: 1500, totalMinor: 2500, amountDueMinor: 1500 })).toBe(1500); // 10.00 account credit
    expect(invoiceDisplayMinor({ status: "paid", amountPaidMinor: 0, totalMinor: 0, amountDueMinor: 0 })).toBe(0);
  });
  it("open / failed: what is still due; void and uncollectible: the invoice total", () => {
    expect(invoiceDisplayMinor({ status: "open", amountPaidMinor: 0, totalMinor: 2500, amountDueMinor: 2000 })).toBe(2000);
    expect(invoiceDisplayMinor({ status: "open", amountPaidMinor: 0, totalMinor: 2500, amountDueMinor: null })).toBe(2500);
    expect(invoiceDisplayMinor({ status: "void", amountPaidMinor: 0, totalMinor: 2500, amountDueMinor: 2500 })).toBe(2500);
    expect(invoiceDisplayMinor({ status: "uncollectible", amountPaidMinor: 0, totalMinor: 2500, amountDueMinor: 2500 })).toBe(2500);
  });
  it("Billing page: partial and full refunds are shown next to the paid amount, which stays what was paid", () => {
    const m = buildBillingPageModel(view([
      row({ id: "full", issued_at: "2026-10-01T00:00:00Z", amount_refunded_minor: 2500 }),
      row({ id: "part", issued_at: "2026-09-01T00:00:00Z", amount_paid_minor: 2250, total_minor: 2250, discount_minor: 250, amount_refunded_minor: 500 }),
      row({ id: "none", issued_at: "2026-08-01T00:00:00Z" }),
    ]), "en");
    expect(m.invoices.map((i) => [i.id, i.amount, i.refunded])).toEqual([
      ["full", "$25.00", expect.stringContaining("$25.00")],
      ["part", "$22.50", expect.stringContaining("$5.00")],
      ["none", "$25.00", null],
    ]);
  });
  it("Billing page: a failed renewal shows the amount due and the failed status", () => {
    const m = buildBillingPageModel(view([row({ status: "open", paid_at: null, failed_at: "2026-10-02T00:00:00Z", amount_paid_minor: 0, amount_due_minor: 2500 })]), "en");
    expect(m.invoices[0]).toMatchObject({ amount: "$25.00", kind: "failed" });
  });
});
