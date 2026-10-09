import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildStudioSuspendedLabels, isStudioGated } from "./studioGate";
import { StudioSuspended } from "@/components/billing/studio-suspended";

describe("isStudioGated", () => {
  it("only gates billing-governed, non-writable Spaces (legacy Spaces never)", () => {
    expect(isStudioGated({})).toBe(false);
    expect(isStudioGated({ billing: { reason: "active", studioWritable: true } })).toBe(false);
    expect(isStudioGated({ billing: { reason: "studio_suspended", studioWritable: false } })).toBe(true);
  });
});

describe("StudioSuspended", () => {
  const failedAt = new Date("2026-10-01T00:00:00Z");
  it("renders suspended copy, deadline, resolve link and My Spaces link", () => {
    const labels = buildStudioSuspendedLabels({ locale: "en", spaceName: "Sunrise", reason: "studio_suspended", subscription: { paymentFailedAt: failedAt } });
    const html = renderToStaticMarkup(createElement(StudioSuspended, { spaceName: "Sunrise", tenantId: "t-1", labels }));
    expect(html).toContain("Payment required");
    expect(html).toContain("Sunrise");
    expect(html).toContain("15 October 2026");
    expect(html).toContain('href="/billing/t-1"');
    expect(html).toContain('href="/space"');
    expect(html).toContain('dir="auto"');
  });
  it("ended subscriptions use the ended copy and offer no payment action", () => {
    const labels = buildStudioSuspendedLabels({ locale: "en", spaceName: "Sunrise", reason: "subscription_ended", subscription: null });
    const html = renderToStaticMarkup(createElement(StudioSuspended, { spaceName: "Sunrise", tenantId: "t-1", labels }));
    expect(html).toContain("This subscription has ended");
    expect(html).not.toContain("/billing/t-1");
    expect(html).not.toContain("Payment required");
  });
  it("is RTL when asked and localised in Hebrew", () => {
    const labels = buildStudioSuspendedLabels({ locale: "he", spaceName: "X", reason: "studio_suspended", subscription: null });
    const html = renderToStaticMarkup(createElement(StudioSuspended, { spaceName: "X", tenantId: "t-1", labels, dir: "rtl" }));
    expect(html).toContain('dir="rtl"');
    expect(html).not.toContain("Payment required");
  });
});
