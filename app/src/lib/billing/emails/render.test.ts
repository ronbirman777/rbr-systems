import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "@/lib/i18n";
import { renderBillingEmail, safeHttpsUrl, type EmailTemplate } from "./render";

const base = {
  spaceName: "Lena's <b>Studio</b> & Co", spaceType: "teach", planName: "InnerDweS Space", amountPaidMinor: 2250, currency: "USD", discountMinor: 250, couponCode: "LAUNCH10",
  discountCycle: { completed: 2, total: 3, status: "redeemed" }, nextBillingDate: "2026-12-01T00:00:00.000Z", nextExpectedChargeMinor: 2250, subscriptionStatus: "active",
  cancelsAtPeriodEnd: false, invoiceNumber: "INV-0007", hostedInvoiceUrl: "https://invoice.stripe.com/i/test_123", invoicePdfUrl: "https://pay.stripe.com/invoice/x/pdf",
  billingUrl: "https://app.innerdwes.com/billing/abc", accessEndsAt: "2026-12-01T00:00:00.000Z", studioSuspensionAt: "2026-11-08T12:00:00.000Z", deletionEligibleAt: "2026-11-15T12:00:00.000Z",
};
const TEMPLATES: [EmailTemplate, Record<string, unknown>][] = [
  ["payment_confirmation", { ...base, variant: "first" }], ["payment_confirmation", { ...base, variant: "renewal" }],
  ["payment_confirmation", { ...base, variant: "recovered" }], ["payment_confirmation", { ...base, variant: "final", cancelsAtPeriodEnd: true }],
  ["payment_failed", base], ["guest_unavailable", base], ["studio_suspended", base], ["final_warning", base], ["cancellation_scheduled", base], ["subscription_ended", base],
];

describe.each(SUPPORTED_LOCALES)("billing emails in %s", (locale) => {
  it.each(TEMPLATES.map(([t, p]) => [`${t}${p.variant ? `:${p.variant}` : ""}`, t, p] as const))("%s renders fully (no raw keys, no leftover placeholders, no 'undefined')", (_n, template, payload) => {
    const m = renderBillingEmail(template, locale, payload);
    for (const part of [m.subject, m.text, m.html]) {
      expect(part).not.toMatch(/\{\w+\}/);
      expect(part).not.toMatch(/undefined|NaN|\[object|billing\.\w+|email[A-Z]\w+/);
    }
    expect(m.subject.length).toBeGreaterThan(5);
    expect(m.dir).toBe(locale === "he" ? "rtl" : "ltr");
    expect(m.html).toContain(`dir="${m.dir}"`);
    expect(m.html).toContain(`lang="${locale}"`);
  });

  it("escapes user-authored text (Space name) and never lets markup through", () => {
    const m = renderBillingEmail("payment_failed", locale, base);
    expect(m.html).not.toContain("<b>Studio</b>");
    expect(m.html).toContain("&lt;b&gt;Studio&lt;/b&gt; &amp; Co");
    expect(m.text).toContain("Lena's <b>Studio</b> & Co"); // plain text is literal
  });

  it("has no tracking: no images/pixels, only plain https links, and the official document link is present", () => {
    const m = renderBillingEmail("payment_confirmation", locale, { ...base, variant: "first" });
    expect(m.html).not.toMatch(/<img|<script|<iframe|onerror|onclick/i);
    const hrefs = [...m.html.matchAll(/href="([^"]+)"/g)].map((x) => x[1]);
    expect(hrefs).toEqual(["https://invoice.stripe.com/i/test_123", "https://app.innerdwes.com/billing/abc"]);
    expect(hrefs.every((h) => h.startsWith("https://") && !/[?&](utm_|track|redirect)/i.test(h))).toBe(true);
  });

  it("never translates the coupon code, the Space name or the invoice number", () => {
    const m = renderBillingEmail("payment_confirmation", locale, { ...base, variant: "first" });
    expect(m.text).toContain("LAUNCH10");
    expect(m.text).toContain("INV-0007");
  });
});

describe("billing email content", () => {
  it("first payment lists Space, plan, amount, discount, discount progress, next billing, next charge, status", () => {
    const t = renderBillingEmail("payment_confirmation", "en", { ...base, variant: "first" }).text;
    expect(t).toContain("Payment confirmed");
    for (const s of ["InnerDweS Space", "$22.50", "LAUNCH10", "$2.50", "Payment 2 of 3", "Next billing date", "Next expected charge", "Active", "Time to Teach"]) expect(t).toContain(s);
  });
  it("a forever discount says it applies to every payment", () => {
    const t = renderBillingEmail("payment_confirmation", "en", { ...base, variant: "renewal", discountCycle: { completed: 9, total: null, status: "redeemed" } }).text;
    expect(t).toContain("Applies to every payment");
  });
  it("a payment with no coupon shows no discount rows", () => {
    const t = renderBillingEmail("payment_confirmation", "en", { ...base, variant: "renewal", couponCode: null, discountMinor: 0, discountCycle: null, amountPaidMinor: 2500 }).text;
    expect(t).not.toMatch(/Discount/);
    expect(t).toContain("$25.00");
  });
  it("the final payment states the end date and omits the next-charge rows", () => {
    const t = renderBillingEmail("payment_confirmation", "en", { ...base, variant: "final", cancelsAtPeriodEnd: true }).text;
    expect(t).toContain("final payment");
    expect(t).toContain("1 December");
    expect(t).not.toContain("Next expected charge");
  });
  it("the first-payment email is also the activation email: payment confirmed AND subscription started", () => {
    const m = renderBillingEmail("payment_confirmation", "en", { ...base, variant: "first" });
    expect(m.subject).toBe("Payment confirmed - Lena's <b>Studio</b> & Co is active");
    expect(m.text).toContain("your subscription has started");
  });
  it("a first payment with cancellation already scheduled shows no next-charge rows", () => {
    const t = renderBillingEmail("payment_confirmation", "en", { ...base, variant: "first", cancelsAtPeriodEnd: true }).text;
    expect(t).not.toContain("Next expected charge");
    expect(t).not.toContain("Next billing date");
  });
  it("the recovery variant says the Space is active again", () => {
    expect(renderBillingEmail("payment_confirmation", "en", { ...base, variant: "recovered" }).subject).toContain("active again");
  });
  it("tells the customer the official document is the linked page and that there is no second provider receipt", () => {
    expect(renderBillingEmail("payment_confirmation", "en", { ...base, variant: "first" }).text).toContain("won't receive a separate receipt email");
  });
  it("without an official document link it does not claim one exists", () => {
    const t = renderBillingEmail("payment_confirmation", "en", { ...base, variant: "first", hostedInvoiceUrl: null, receiptUrl: null }).text;
    expect(t).not.toContain("View invoice");
    expect(t).not.toContain("separate receipt");
  });
  it("Hebrew money/date formatting stays locale-correct and RTL-flagged", () => {
    const m = renderBillingEmail("payment_confirmation", "he", { ...base, variant: "first" });
    expect(m.dir).toBe("rtl");
    expect(m.text).toMatch(/22\.50/);
  });
  it("refuses non-https links", () => {
    expect(safeHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpsUrl("http://invoice.stripe.com/x")).toBeNull();
    expect(safeHttpsUrl("data:text/html,x")).toBeNull();
    expect(safeHttpsUrl("https://invoice.stripe.com/x")).toBe("https://invoice.stripe.com/x");
    const m = renderBillingEmail("payment_confirmation", "en", { ...base, variant: "first", hostedInvoiceUrl: "javascript:alert(1)", receiptUrl: null, billingUrl: "http://evil.example" });
    expect(m.html).not.toMatch(/javascript:|evil\.example/);
  });
  it("lifecycle notices quote the right deadline", () => {
    expect(renderBillingEmail("guest_unavailable", "en", base).text).toContain("8 November");
    expect(renderBillingEmail("studio_suspended", "en", base).text).toContain("15 November");
    expect(renderBillingEmail("final_warning", "en", base).text).toContain("15 November");
    expect(renderBillingEmail("cancellation_scheduled", "en", base).text).toContain("1 December");
  });
});
