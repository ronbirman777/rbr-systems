import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/teach/fonts", () => ({ TEACH_FONT_VARIABLES: "" }));

import { parsePublishedTeachSpace, type TeachGuestData } from "@/lib/teach/guestData";
import { TeachGuestApp, visibleTabs } from "./teach-guest-app";

function guest(teachAbout?: Record<string, unknown>): TeachGuestData {
  return parsePublishedTeachSpace({
    name: "Maya",
    theme: null,
    timezone: "Asia/Jerusalem",
    enabled_modules: [],
    modules: { teach: { settings: teachAbout === undefined ? {} : { teachAbout }, items: {} } },
  });
}

const labels = (d: TeachGuestData) => visibleTabs(d).map((t) => t.label);

describe("Guest App navigation: About Me tab", () => {
  it("is visible by default, even for a brand-new space with no About content at all", () => {
    expect(labels(guest())).toEqual(["Home", "Schedule", "About Me", "Explore"]);
    expect(labels(guest({}))).toContain("About Me");
  });

  it("is visible for an old published snapshot that predates the flag", () => {
    expect(labels(guest({ about: "Hello", styles: ["Yin"] }))).toContain("About Me");
  });

  it("is hidden only when the teacher explicitly turned it off, even if About content exists", () => {
    expect(labels(guest({ showTab: false, about: "Hello" }))).toEqual(["Home", "Schedule", "Explore"]);
  });

  it("is never forced on: showTab:false stays hidden and an explicit true shows it", () => {
    expect(labels(guest({ showTab: false }))).not.toContain("About Me");
    expect(labels(guest({ showTab: true }))).toContain("About Me");
  });

  it("renders the About Me tab in the nav markup by default and omits it when hidden", () => {
    const shown = renderToStaticMarkup(createElement(TeachGuestApp, { data: guest() }));
    const hidden = renderToStaticMarkup(createElement(TeachGuestApp, { data: guest({ showTab: false }) }));
    expect(shown).toContain("About Me");
    expect(hidden).not.toContain("About Me");
  });

  it("the preview (live Studio state) and the published app use the same renderer and agree", () => {
    const published = guest({ showTab: false, about: "Hello" });
    const preview: TeachGuestData = { ...published };
    expect(renderToStaticMarkup(createElement(TeachGuestApp, { data: preview, embedded: true }))).toBe(
      renderToStaticMarkup(createElement(TeachGuestApp, { data: published, embedded: true }))
    );
  });

  it("falls back to Home when the preview is sitting on About Me and the teacher hides it", () => {
    const on = renderToStaticMarkup(createElement(TeachGuestApp, { data: guest({ about: "Visible story text" }), embedded: true, initialTab: "about" }));
    const off = renderToStaticMarkup(createElement(TeachGuestApp, { data: guest({ showTab: false, about: "Visible story text" }), embedded: true, initialTab: "about" }));
    expect(on).toContain("Visible story text");
    expect(off).not.toContain("Visible story text");
  });
});
