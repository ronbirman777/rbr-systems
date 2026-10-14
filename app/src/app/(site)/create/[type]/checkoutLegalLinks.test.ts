import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../billingActions", () => ({ applyCouponAction: vi.fn(), cancelCheckoutAction: vi.fn(), startCheckoutAction: vi.fn() }));

import { CheckoutForm, type CheckoutFormLabels } from "./checkout-form";

const labels = new Proxy({ errors: {} } as unknown as CheckoutFormLabels, {
  get: (t, k) => (k in t ? (t as Record<string, unknown>)[k as string] : `L:${String(k)}`),
});

describe("checkout consent block", () => {
  it("links the Terms, Privacy and Billing documents under the terms line, keeping both consent checkboxes", () => {
    const html = renderToStaticMarkup(
      createElement(CheckoutForm, {
        spaceType: "teach",
        locale: "de",
        initialQuote: { currency: "usd", baseMinor: 2500, todayMinor: 2500, discount: null },
        canceled: false,
        labels,
      }),
    );
    expect(html).toContain("L:termsLine");
    const hrefs = [...html.matchAll(/href="(\/legal\/[^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(["/legal/terms", "/legal/privacy", "/legal/billing"]);
    expect(html).toContain("Billing, Cancellation &amp; Refund Policy");
    expect(html).toContain('name="consentImmediate"');
    expect(html).toContain('name="consentWithdrawal"');
  });
});
