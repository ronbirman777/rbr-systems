import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/teach/fonts", () => ({ TEACH_FONT_VARIABLES: "" }));

import { parsePublishedTeachSpace } from "@/lib/teach/guestData";
import { TeachGuestApp, shortMonthLabel } from "./teach-guest-app";
import { BrandImage } from "@/components/shared/brand-image";

/**
 * TASK 033 (D): Teach's schedule no longer hardcodes English month names,
 * and no longer uppercases with String#toUpperCase() (locale-blind: it
 * turns Turkish "i" into "I", not "İ"). Casing is CSS `uppercase` under the
 * root's `lang`, so the browser applies the Space language's rules.
 */

describe("shortMonthLabel", () => {
  it("names the month in the Space's language, never an English array", () => {
    expect(shortMonthLabel("2026-10-14", "en")).toBe("Oct");
    expect(shortMonthLabel("2026-10-14", "de")).toMatch(/^Okt/);
    expect(shortMonthLabel("2026-10-14", "fr")).toMatch(/^oct/);
    expect(shortMonthLabel("2026-03-02", "es")).toMatch(/^mar/);
    expect(shortMonthLabel("2026-10-14", "he")).not.toMatch(/[A-Za-z]/);
  });

  it("is a calendar label - the same month whatever the server's timezone", () => {
    expect(shortMonthLabel("2026-01-01", "en")).toBe("Jan");
    expect(shortMonthLabel("2026-12-31", "en")).toBe("Dec");
  });
});

describe("the schedule day strip", () => {
  it("uppercases weekdays with CSS under the Space's lang, not in JavaScript", () => {
    const data = parsePublishedTeachSpace({
      name: "Lena",
      theme: null,
      timezone: "Europe/Berlin",
      enabled_modules: [],
      modules: { spaceSettings: { locale: "de" }, teach: { settings: {}, items: {} } },
    } as never);
    const out = renderToStaticMarkup(createElement(TeachGuestApp, { data, initialTab: "schedule" }));
    expect(out).toMatch(/<div[^>]*lang="de"/);
    // German short weekdays ("Mo.", "Di.", ...) arrive in their own casing
    // inside an `uppercase` span; none is pre-uppercased in the markup.
    const weekdaySpans = [...out.matchAll(/<span class="text-\[10px\] font-semibold tracking-wider uppercase"[^>]*>([^<]+)<\/span>/g)].map((m) => m[1]);
    expect(weekdaySpans.length).toBeGreaterThan(0);
    for (const label of weekdaySpans) expect(label, label).not.toBe(label.toUpperCase());
  });
});

describe("BrandImage TASK 033 hooks", () => {
  const SRC = "/api/media/11111111-1111-4111-8111-111111111111/hero/a/up-A/published.webp";

  it("marks only the priority (LCP) image as the hero the loading overlay waits for", () => {
    expect(renderToStaticMarkup(createElement(BrandImage, { src: SRC, alt: "", priority: true }))).toContain('data-guest-hero=""');
    expect(renderToStaticMarkup(createElement(BrandImage, { src: SRC, alt: "" }))).not.toContain("data-guest-hero");
  });

  it("never server-renders an image hidden - the load-triggered fade is applied only by JavaScript", () => {
    const out = renderToStaticMarkup(createElement(BrandImage, { src: SRC, alt: "", priority: true }));
    expect(out).toContain("tt-fade-in");
    expect(out).not.toContain("data-fade");
  });
});
