import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./empty-state";
import { ReadinessChecklist } from "./readiness-checklist";
import { StatusPill } from "./status-pill";
import { PublicLinkCard } from "./public-link-card";
import { QrCodeCard } from "./qr-code-card";
import { SectionHeader } from "./section-header";
import { BrandPresetChips } from "./brand-preset-chips";
import { StudioTopBar } from "./studio-top-bar";
import { getBrandPresets } from "@/lib/brand/presets";
import { StudioEyebrowContext, StudioHeading } from "@/app/configurator/retreat/studio-ui";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const id = "3e6e4978-79a3-4912-98b5-c26d15d30155";

describe("shared Studio components", () => {
  it("EmptyState says what is missing and renders an optional action", () => {
    const out = html(createElement(EmptyState, { title: "No sessions yet", body: "Add one below.", action: createElement("button", null, "Add") }));
    expect(out).toContain("No sessions yet");
    expect(out).toContain("Add one below.");
    expect(out).toContain("<button>Add</button>");
  });

  it("ReadinessChecklist shows hints only for gaps", () => {
    const out = html(createElement(ReadinessChecklist, { items: [{ ok: true, label: "Name", hint: "SECRETHINT" }, { ok: false, label: "Cover", hint: "Add a cover" }] }));
    expect(out).toContain("Name");
    expect(out).not.toContain("SECRETHINT");
    expect(out).toContain("Add a cover");
  });

  it("StatusPill uses the shared wording", () => {
    expect(html(createElement(StatusPill, { state: "draft" }))).toContain("Draft");
    const pub = html(createElement(StatusPill, { state: "published" }));
    expect(pub).toContain("Published");
    expect(pub).toContain('data-state="published"');
  });

  it("PublicLinkCard offers Open Guest App only once published", () => {
    const draft = html(createElement(PublicLinkCard, { url: "https://x.test/s/a", openHref: "/s/a", published: false }));
    expect(draft).toContain("x.test/s/a");
    expect(draft).toContain("Copy link");
    expect(draft).not.toContain("Open Guest App");
    expect(draft).toContain("goes live when you publish");
    const live = html(createElement(PublicLinkCard, { url: "https://x.test/s/a", openHref: "/s/a", published: true }));
    expect(live).toContain("Open Guest App");
    expect(live).toContain('href="/s/a"');
  });

  it("QrCodeCard downloads only when published and never embeds tokens", () => {
    const draft = html(createElement(QrCodeCard, { tenantId: id, slug: "a", published: false }));
    expect(draft).toContain(`/api/qr/${id}`);
    expect(draft).not.toContain("download=");
    const live = html(createElement(QrCodeCard, { tenantId: id, slug: "a", published: true }));
    expect(live).toContain('download="a-qr.png"');
  });

  it("SectionHeader and StudioHeading share the eyebrow/title hierarchy", () => {
    expect(html(createElement(SectionHeader, { eyebrow: "Content", title: "Schedule", intro: "Intro" }))).toContain("Content");
    const flow = html(createElement(StudioEyebrowContext.Provider, { value: "My space" }, createElement(StudioHeading, null, "Brand")));
    expect(flow).toContain("My space");
    expect(flow).toContain("Brand");
    expect(html(createElement(StudioHeading, null, "Brand"))).not.toContain("uppercase tracking-[0.14em]");
  });

  it("BrandPresetChips marks the active preset", () => {
    const presets = getBrandPresets("retreat");
    const out = html(createElement(BrandPresetChips, { presets, activeKey: presets[1].key, onApply: () => {} }));
    for (const p of presets) expect(out).toContain(p.label);
    expect(out.match(/aria-pressed="true"/g)).toHaveLength(1);
  });

  it("StudioTopBar shows name, badge, save status and the Publish action", () => {
    const out = html(createElement(StudioTopBar, { name: "", fallbackName: "My Retreat", productBadge: "Time to Flow", saveStatus: "All changes saved", onPublish: () => {} }));
    expect(out).toContain("My Retreat");
    expect(out).toContain("Time to Flow");
    expect(out).toContain("All changes saved");
    expect(out).toContain("Publish");
  });

  it("ReadinessChecklist gives screen readers a text alternative for the tick/warning icons", () => {
    const out = html(createElement(ReadinessChecklist, { items: [{ ok: true, label: "Name" }, { ok: false, label: "Cover" }] }));
    expect(out).toContain("Done: ");
    expect(out).toContain("Needs attention: ");
  });

  it("StudioTopBar and PublicLinkCard take their route and wording from props (product-neutral defaults)", () => {
    const bar = html(createElement(StudioTopBar, { name: "", fallbackName: "My Space", productBadge: "Time to X", saveStatus: "ok", onPublish: () => {}, backHref: "/hub", backLabel: "My Hub" }));
    expect(bar).toContain('href="/hub"');
    expect(bar).toContain("My Hub");
    expect(bar).toContain("My Space");
    const link = html(createElement(PublicLinkCard, { url: "https://a.test/s/x", openHref: "/s/x", published: true, openLabel: "Open the app" }));
    expect(link).toContain("Open the app");
    expect(link).toContain("opens in a new tab");
  });

  it("generic components embed no product names beyond the shared 'Guest App' noun", () => {
    const out = [
      html(createElement(PublicLinkCard, { url: "https://a.test/s/x", openHref: "/s/x", published: false })),
      html(createElement(QrCodeCard, { tenantId: id, slug: "x", published: false })),
      html(createElement(EmptyState, { title: "T", body: "B" })),
      html(createElement(StatusPill, { state: "draft" })),
    ].join("");
    expect(out).not.toMatch(/retreat|teach|heal|flow\b/i);
  });
});
