import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GUEST_SCROLL_REGION_CLASS, guestScrollRegion } from "./guest-scroll-region";
import { GuidelinesScreen } from "./guidelines-screen";
import { FacilitiesScreen } from "@/components/facilities-screen";
import { facilitySchema, type DisplayFacility } from "@/lib/modules/facility";
import { brandFromPublishedTheme } from "@/lib/teach/guestData";
import { DEFAULT_PUBLISHED_THEME } from "@/lib/modules/publishedTheme";

/**
 * QA finding O10 - axe `scrollable-region-focusable`.
 *
 * Every Guest screen that scrolls inside its own `overflow-y-auto` box must
 * be reachable by keyboard: tabIndex 0, an accessible name, and the
 * `guest-scroll-region` class that draws its (inset, keyboard-only) focus
 * ring. Asserted on the source so a new Guest screen cannot reintroduce
 * the finding, and on rendered markup for the two screens QA flagged.
 */

const COMPONENTS = fileURLToPath(new URL("..", import.meta.url));
const GLOBALS = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

/** Guest surfaces: the Flow screens at the components root, plus guest/ and teach/. */
function guestSourceFiles(): string[] {
  const files: string[] = [];
  for (const name of readdirSync(COMPONENTS)) {
    const p = join(COMPONENTS, name);
    if (name.endsWith(".tsx") && statSync(p).isFile()) files.push(p);
  }
  for (const dir of ["guest", "teach"]) {
    for (const name of readdirSync(join(COMPONENTS, dir))) {
      if (name.endsWith(".tsx")) files.push(join(COMPONENTS, dir, name));
    }
  }
  return files;
}

/**
 * Teach's only overflow-y-auto box is conditional on `embedded` (the
 * Studio's preview frame); the live Teach Guest app scrolls the document,
 * which the browser already makes keyboard-scrollable, and the embedded
 * box always holds focusable tabs and cards.
 */
const EXEMPT = new Set(["teach/teach-guest-app.tsx"]);

/** Every JSX opening tag whose className includes overflow-y-auto. */
function scrollTags(src: string): string[] {
  return [...src.matchAll(/<[a-z]+\b[^>]*overflow-y-auto[^>]*>/g)].map((m) => m[0]);
}

describe("Guest scroll regions are keyboard-focusable (QA O10)", () => {
  const tags = guestSourceFiles().flatMap((file) => {
    const rel = file.slice(COMPONENTS.length).replace(/\\/g, "/");
    return EXEMPT.has(rel) ? [] : scrollTags(readFileSync(file, "utf8")).map((tag) => ({ rel, tag }));
  });

  it("finds the Flow Guest scroll containers", () => {
    // Today, Schedule, Team, Explore, its eight detail screens, custom
    // pages and the Audio/Readings detail views - a drop means the scan broke.
    expect(tags.length).toBeGreaterThanOrEqual(16);
  });

  it.each(tags.map((t) => [t.rel, t.tag] as const))("%s: %s", (_rel, tag) => {
    expect(tag).toContain("{...guestScrollRegion(");
    expect(tag).toContain(GUEST_SCROLL_REGION_CLASS);
  });

  it("the exemption is still conditional on the Studio's embedded preview", () => {
    const src = readFileSync(join(COMPONENTS, "teach/teach-guest-app.tsx"), "utf8");
    const teachTags = scrollTags(src);
    expect(teachTags).toHaveLength(1);
    expect(teachTags[0]).toContain('embedded ? "overflow-y-auto" : ""');
  });

  it("guestScrollRegion gives tabIndex 0, a name, and a region role unless the element has its own", () => {
    expect(guestScrollRegion("Guidelines")).toEqual({ tabIndex: 0, "aria-label": "Guidelines", role: "region" });
    expect(guestScrollRegion("A reading", { landmark: false })).toEqual({ tabIndex: 0, "aria-label": "A reading" });
  });

  it("the focus ring is inset (the shell clips outside the box) and only on :focus-visible", () => {
    const rule = GLOBALS.match(/\.guest-scroll-region:focus-visible\s*\{([^}]*)\}/);
    expect(rule, "the focus rule exists").not.toBeNull();
    expect(rule![1]).toMatch(/outline-offset:\s*-2px/);
    expect(rule![1]).toMatch(/outline-color:\s*var\(--rbr-primary/);
    // No unfocused styling: the class appears in globals.css only with :focus-visible.
    expect(GLOBALS.match(/\.guest-scroll-region(?!:focus-visible)/g)).toBeNull();
  });
});

describe("the screens QA flagged render a named, focusable region", () => {
  const brand = brandFromPublishedTheme("QA", DEFAULT_PUBLISHED_THEME);

  it("Guidelines (en, it)", () => {
    const en = renderToStaticMarkup(
      createElement(GuidelinesScreen, { brand, guidelines: [{ title: "Quiet hours", description: "After 22:00." }], locale: "en" })
    );
    expect(en).toMatch(/^<div[^>]*tabindex="0"[^>]*aria-label="Guidelines"[^>]*role="region"/);
    const it_ = renderToStaticMarkup(createElement(GuidelinesScreen, { brand, guidelines: [], locale: "it" }));
    expect(it_).toMatch(/^<div[^>]*tabindex="0"[^>]*aria-label="Regole"[^>]*role="region"/);
  });

  it("Facilities", () => {
    const facility: DisplayFacility = {
      ...facilitySchema.parse({
        name: "Shala",
        description: "Wooden floor.",
        imageRef: null,
        openingHours: null,
        location: null,
        importantInfo: null,
      }),
      imageUrl: null,
    };
    const html = renderToStaticMarkup(createElement(FacilitiesScreen, { brand, facilities: [facility], locale: "en" }));
    expect(html).toMatch(/^<div[^>]*tabindex="0"[^>]*aria-label="Facilities"[^>]*role="region"/);
    expect(html).toContain("guest-scroll-region");
  });
});
