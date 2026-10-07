import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The server action pulls in next/headers and Supabase; the editor only
// needs its type and a callable. Rendering never invokes it.
vi.mock("./actions", () => ({ saveDailyInspiration: vi.fn() }));
vi.mock("@/lib/modules/persistItem", () => ({
  persistNewItemStub: vi.fn(),
  persistItemRemoval: vi.fn(),
  enqueueItemsOp: vi.fn(),
}));

import { DailyInspirationStep } from "./daily-inspiration-step";
import type { EditableInspirationItem } from "@/lib/modules/dailyInspiration";
import type { Locale } from "@/lib/i18n";

const items: EditableInspirationItem[] = [
  { id: "a", label: "Day 1", text: "First reflection", enabled: true },
  { id: "b", label: "", text: "Second reflection", enabled: false },
  { id: "c", label: "", text: "", enabled: true },
];

function render(list: EditableInspirationItem[], locale: Locale = "en"): string {
  return renderToStaticMarkup(
    h(DailyInspirationStep, {
      tenantId: "t",
      items: list,
      setItems: () => {},
      onBack: () => {},
      onContinue: () => {},
      onDirty: () => {},
      onSaved: () => {},
      registerSave: () => {},
      locale,
    })
  );
}

describe("Studio Daily Inspiration editor (server-rendered)", () => {
  it("lists every reflection in order with an operable up/down pair and Edit/Remove", () => {
    const out = render(items);
    expect(out.split('data-testid="inspiration-row"').length - 1).toBe(3);
    expect(out.indexOf("First reflection")).toBeLessThan(out.indexOf("Second reflection"));
    // first row cannot move up, last row cannot move down
    const ups = out.match(/<button[^>]*aria-label="Move up"[^>]*>/g) ?? [];
    const downs = out.match(/<button[^>]*aria-label="Move down"[^>]*>/g) ?? [];
    expect(ups).toHaveLength(3);
    expect(downs).toHaveLength(3);
    expect(ups[0]).toContain('disabled=""');
    expect(ups[1]).not.toContain('disabled=""');
    expect(downs[2]).toContain('disabled=""');
    expect(out).toContain("Edit");
    expect(out).toContain("Remove");
  });

  it("marks a hidden reflection as disabled and an empty one as untitled", () => {
    const out = render(items);
    expect(out).toContain("Disabled");
    expect(out).toContain("Untitled reflection");
  });

  it("shows the empty state, and says the built-in quotes are used, when nothing is visible", () => {
    const empty = render([]);
    expect(empty).toContain("No reflections yet");
    expect(empty).toContain('data-testid="inspiration-fallback-note"');
    const allHidden = render([{ ...items[1] }]);
    expect(allHidden).toContain('data-testid="inspiration-fallback-note"');
    expect(render([items[0]])).not.toContain("inspiration-fallback-note");
  });

  it("renders in all five locales without unresolved placeholders, and keeps user text verbatim", () => {
    for (const locale of ["en", "de", "es", "fr", "he"] as Locale[]) {
      const out = render(items, locale);
      expect(out).not.toMatch(/\{\{|\}\}|\{[a-zA-Z]+\}/);
      expect(out).toContain("First reflection");
      expect(out).toContain('dir="auto"');
    }
  });
});
