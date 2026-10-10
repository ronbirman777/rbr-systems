import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "@/lib/i18n/locales";
import { makeAdminCtx } from "./ctx";
import { invoiceAmountLines, invoiceAmountNote, invoiceAmounts } from "./labels";

const c = makeAdminCtx("en");
const base = { total_minor: 2500, amount_due_minor: 2500, amount_paid_minor: 2500, amount_refunded_minor: 0, currency: "USD " };
const pairs = (i: Parameters<typeof invoiceAmountLines>[0]) => invoiceAmountLines(i, c).map((l) => [l.label, l.value, l.headline]);

describe("Admin invoice amounts: total vs due vs paid vs refunded", () => {
  it("paid in full: total and paid, paid is the headline, no refund lines", () => {
    expect(invoiceAmounts({ status: "paid", ...base })).toEqual({
      lines: [{ kind: "total", minor: 2500 }, { kind: "paid", minor: 2500 }], headline: "paid", note: null,
    });
    expect(pairs({ status: "paid", ...base })).toEqual([["Invoice total", "$25.00", false], ["Paid", "$25.00", true]]);
  });

  it("paid with account credit: paid is lower than the total and is not inflated to it", () => {
    const a = invoiceAmounts({ status: "paid", ...base, amount_due_minor: 1500, amount_paid_minor: 1500 });
    expect(a.lines).toEqual([{ kind: "total", minor: 2500 }, { kind: "paid", minor: 1500 }]);
  });

  it("partially refunded: refunded and net (paid - refunded) are shown, net is the headline", () => {
    expect(pairs({ status: "paid", ...base, amount_refunded_minor: 500 })).toEqual([
      ["Invoice total", "$25.00", false], ["Paid", "$25.00", false], ["Refunded", "$5.00", false], ["Net (paid - refunded)", "$20.00", true],
    ]);
  });

  it("fully refunded: net is zero", () => {
    const a = invoiceAmounts({ status: "paid", ...base, amount_refunded_minor: 2500 });
    expect(a.lines.slice(-2)).toEqual([{ kind: "refunded", minor: 2500 }, { kind: "net", minor: 0 }]);
    expect(a.headline).toBe("net");
  });

  it("open with an amount due: due is the headline and nothing is shown as paid", () => {
    expect(invoiceAmounts({ status: "open", ...base, amount_due_minor: 2000, amount_paid_minor: 0 })).toEqual({
      lines: [{ kind: "total", minor: 2500 }, { kind: "due", minor: 2000 }], headline: "due", note: null,
    });
    // amount_due missing -> falls back to the total
    expect(invoiceAmounts({ status: "open", ...base, amount_due_minor: null, amount_paid_minor: 0 }).lines[1]).toEqual({ kind: "due", minor: 2500 });
  });

  it("open and partially paid: due is the remainder, paid shown separately", () => {
    expect(invoiceAmounts({ status: "open", ...base, amount_paid_minor: 1000 }).lines).toEqual([
      { kind: "total", minor: 2500 }, { kind: "due", minor: 1500 }, { kind: "paid", minor: 1000 },
    ]);
  });

  it("100%-off invoice: total 0, paid 0, explained as no charge", () => {
    const i = { status: "paid", total_minor: 0, amount_due_minor: 0, amount_paid_minor: 0, amount_refunded_minor: 0, currency: "USD" };
    expect(invoiceAmounts(i)).toEqual({ lines: [{ kind: "total", minor: 0 }, { kind: "paid", minor: 0 }], headline: "paid", note: "no_charge" });
    expect(pairs(i)).toEqual([["Invoice total", "$0.00", false], ["Paid", "$0.00", true]]);
    expect(invoiceAmountNote(i, c)).toMatch(/No charge/);
  });

  it("uncollectible: the unpaid remainder is 'not collected', never 'paid'", () => {
    const a = invoiceAmounts({ status: "uncollectible", ...base, amount_paid_minor: 0 });
    expect(a).toEqual({ lines: [{ kind: "total", minor: 2500 }, { kind: "uncollected", minor: 2500 }], headline: "uncollected", note: null });
  });

  it("void: total only, with a 'nothing owed' note", () => {
    const i = { status: "void", ...base, amount_paid_minor: 0 };
    expect(invoiceAmounts(i)).toEqual({ lines: [{ kind: "total", minor: 2500 }], headline: "total", note: "void" });
    expect(invoiceAmountNote(i, c)).toMatch(/nothing is owed/);
  });

  it("never shows a negative net or a negative amount, and tolerates null totals", () => {
    expect(invoiceAmounts({ status: "paid", total_minor: null, amount_paid_minor: 100, amount_refunded_minor: 300 }).lines).toEqual([
      { kind: "paid", minor: 100 }, { kind: "refunded", minor: 300 }, { kind: "net", minor: 0 },
    ]);
  });

  it("formats with the Admin locale (grouping/decimal separator) and trims the char(3) currency", () => {
    const de = makeAdminCtx("de");
    const v = invoiceAmountLines({ status: "paid", ...base, total_minor: 123456, amount_paid_minor: 123456 }, de)[0].value;
    expect(v).toMatch(/1\.234,56/);
    expect(v).toContain("$");
  });

  it("every locale has a non-empty, distinct label for each amount kind", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const lc = makeAdminCtx(locale);
      const labels = invoiceAmountLines({ status: "uncollectible", ...base, amount_paid_minor: 500, amount_refunded_minor: 100 }, lc).map((l) => l.label);
      expect(new Set(labels).size, locale).toBe(labels.length);
      for (const l of labels) expect(l.trim().length, locale).toBeGreaterThan(0);
    }
  });
});
