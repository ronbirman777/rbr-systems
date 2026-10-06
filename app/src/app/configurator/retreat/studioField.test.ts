import { createElement, type ReactElement } from "react";

type Control = ReactElement<{ id?: string }>;
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StudioField, StudioLabel } from "./studio-ui";

/**
 * TASK 029 final hardening. a11y-names.mjs measured 54 unnamed controls
 * across the Flow Studio, from one cause: StudioLabel rendered a real
 * <label> but the control was its SIBLING, so nothing associated the two.
 *
 * These tests guard the primitive, not the screens. If StudioField stops
 * wiring htmlFor to the child's id, 39 fields silently lose their
 * accessible name again and only a browser pass would notice.
 *
 * (`children` is passed in the props object rather than as a third
 * createElement argument because StudioField's type requires it there;
 * the props are built in a variable so the no-children-prop rule can see
 * that this is deliberate.)
 */
const html = (el: ReactElement) => renderToStaticMarkup(el);
const field = (label: string, child: Control) => {
  const props = { label, children: child };
  return html(createElement(StudioField, props));
};

describe("StudioField associates a label with its control", () => {
  it("gives the control an id and points the label at it", () => {
    const out = field("Tagline", createElement("input", { value: "", readOnly: true }) as Control);
    const forId = /<label[^>]*\sfor="([^"]+)"/.exec(out)?.[1];
    const inputId = /<input[^>]*\sid="([^"]+)"/.exec(out)?.[1];
    expect(forId, "label has a for").toBeTruthy();
    expect(inputId, "control has an id").toBeTruthy();
    expect(forId).toBe(inputId);
    expect(out).toContain("Tagline");
  });

  it("works for a textarea and a select, not just an input", () => {
    for (const tag of ["textarea", "select"] as const) {
      const out = field("L", createElement(tag, {}) as Control);
      const forId = /<label[^>]*\sfor="([^"]+)"/.exec(out)?.[1];
      const id = new RegExp(`<${tag}[^>]*\\sid="([^"]+)"`).exec(out)?.[1];
      expect(id, tag).toBeTruthy();
      expect(forId, tag).toBe(id);
    }
  });

  it("gives each instance its own id, so a list of items cannot collide", () => {
    // The item editors render the same fields per item. A hand-written id
    // would repeat across items; useId must not.
    const a = { label: "A", children: createElement("input", { readOnly: true }) as Control };
    const b = { label: "B", children: createElement("input", { readOnly: true }) as Control };
    const out = html(
      createElement("div", null, createElement(StudioField, a), createElement(StudioField, b))
    );
    const ids = [...out.matchAll(/<input[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it("renders no wrapper of its own, so field layout is unchanged", () => {
    const out = field("L", createElement("input", { readOnly: true }) as Control);
    expect(out.startsWith("<label")).toBe(true);
    expect(out.trimEnd().endsWith("/>")).toBe(true);
  });

  it("StudioLabel still works without htmlFor, for things that are not one control", () => {
    // A swatch group or a photo block is labelled but has no single
    // control to point at; emitting for="" would be worse than omitting it.
    const props = { children: "Colours" };
    const out = html(createElement(StudioLabel, props));
    expect(out).toContain("Colours");
    expect(out).not.toContain("for=");
  });
});
