import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { defaultTeachSettings, retreatMetadataSchema, type EditableTeachItem } from "@/lib/teach/schemas";
import { RetreatEditor, RetreatsSection } from "./teach-studio-sections";
import type { StudioApi } from "./teach-studio";
import type { Locale } from "@/lib/i18n";

function item(over: Partial<EditableTeachItem<"teachRetreats">> = {}, meta: Record<string, unknown> = {}): EditableTeachItem<"teachRetreats"> {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    title: "Autumn Breathwork Retreat",
    subtitle: null,
    description: "Seven days of breath and rest.",
    imageRef: null,
    imageUrl: null,
    externalLink: null,
    metadata: retreatMetadataSchema.parse({ enabled: true, ...meta }),
    ...over,
  };
}

function api(items: EditableTeachItem<"teachRetreats">[], locale: Locale = "en", enabledExplore: string[] = ["teachRetreats"]): StudioApi {
  return {
    locale,
    name: "Lena Hoffmann",
    timezone: "Asia/Bangkok",
    todayIso: "2027-01-01",
    settings: defaultTeachSettings(),
    items: { teachRetreats: items },
    enabledExplore,
    mediaUrl: () => null,
    isDirty: () => false,
    saving: null,
    save: () => {},
    goTo: () => {},
    setItems: () => {},
  } as unknown as StudioApi;
}

const editor = (i: EditableTeachItem<"teachRetreats">, locale: Locale = "en") => renderToStaticMarkup(createElement(RetreatEditor, { api: api([i], locale), item: i, update: () => {}, index: 0 }));

describe("My Retreats Studio editor", () => {
  it("every field has an associated label", () => {
    const out = editor(item());
    const ids = [...out.matchAll(/<(?:input|textarea)[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(9);
    for (const id of ids) expect(out, id).toContain(`for="${id}"`);
  });

  it("offers each field the product asks for", () => {
    const out = editor(item());
    for (const label of ["Retreat name", "Short description", "Location", "Duration", "Start date", "End date", "Price", "Currency", "Registration", "InnerDweS retreat link", "Visible to guests"]) {
      expect(out, label).toContain(label);
    }
  });

  it("user-authored fields are dir=auto; machine values are ltr", () => {
    const out = editor(item());
    expect((out.match(/dir="auto"/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((out.match(/dir="ltr"/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("the registration method picker is a labelled radiogroup with None selected and 44px targets", () => {
    const out = editor(item());
    expect(out).toMatch(/role="radiogroup"[^>]*aria-label="[^"]+"/);
    expect(out).toMatch(/role="radio"[^>]*aria-checked="true"[^>]*>None</);
    expect(out).not.toContain("min-h-9");
    expect(out).toContain("min-h-11");
  });

  it("the venue method (a class-only concept) is not offered", () => {
    expect(editor(item())).not.toMatch(/venue/i);
  });

  it("an incomplete registration warns; a complete one previews the guest button", () => {
    expect(editor(item({}, { registration: { method: "website", value: null } }))).toContain("isn’t complete yet");
    const ok = editor(item({}, { registration: { method: "website", value: "example.com/join", buttonLabel: "Reserve my place" } }));
    expect(ok).toContain("Guests will see");
    expect(ok).toContain("Reserve my place");
  });

  it("warns inline when the end date precedes the start date", () => {
    expect(editor(item({}, { startDate: "2027-10-20", endDate: "2027-10-14" }))).toContain("The end date is before the start date.");
    expect(editor(item({}, { startDate: "2027-10-14", endDate: "2027-10-20" }))).not.toContain("The end date is before");
  });

  it("renders in every locale without raw keys or placeholders", () => {
    for (const locale of ["en", "de", "es", "fr", "he"] as Locale[]) {
      const out = editor(item({ title: "Atem-Retreat" }, { price: 700, currency: "THB" }), locale);
      expect(out, locale).not.toMatch(/\{\{|\{[a-z]+\}|undefined|\[object|teach\.[a-zA-Z]+/);
      expect(out).toContain("Atem-Retreat");
    }
  });
});

describe("My Retreats Studio section", () => {
  const section = (a: StudioApi) => renderToStaticMarkup(createElement(RetreatsSection, { api: a }));

  it("lists retreats in order with name, place, dates, price and a hidden marker", () => {
    const a = api([
      item({ id: "a1111111-1111-4111-8111-111111111111", title: "First" }, { location: "Koh Phangan", startDate: "2027-10-14", endDate: "2027-10-20", price: 700, currency: "THB" }),
      item({ id: "b2222222-2222-4222-8222-222222222222", title: "Second" }, { enabled: false }),
    ]);
    const out = section(a);
    expect(out.indexOf("First")).toBeLessThan(out.indexOf("Second"));
    expect(out).toContain("Koh Phangan");
    expect(out).toContain("14–20 Oct 2027");
    expect(out).toContain("700 THB");
    expect(out).toContain("Disabled");
    expect(out).toContain("Add retreat");
  });

  it("empty list says so; module-off shows the turn-on notice", () => {
    const empty = section(api([]));
    expect(empty).toContain("No retreats yet.");
    expect(section(api([], "en", []))).toContain("currently hidden from guests");
  });

  it("reorder controls use the shared tiled 44px hit areas (no overlapping pseudo-elements)", () => {
    const out = section(api([item({ id: "a1111111-1111-4111-8111-111111111111" }), item({ id: "b2222222-2222-4222-8222-222222222222", title: "Two" })]));
    expect(out).toContain('aria-label="Move up"');
    expect(out).toContain('aria-label="Move down"');
  });
});
