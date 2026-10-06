import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuestApp, type GuestAppProps } from "./guest-app";
import { EMPTY_ARRIVAL_INFO, type ArrivalInfo } from "@/lib/modules/arrival";
import { EMPTY_RETREAT_PROFILE, type RetreatProfile } from "@/lib/modules/retreatProfile";
import { brandConfigSchema } from "@/lib/theme/tokens";
import type { Locale } from "@/lib/i18n";
import { getDailyQuote } from "@/lib/content/dailyQuotes";

/**
 * TASK 029 decision A, proven where it is actually resolved.
 *
 * The precedence has unit tests of its own (retreatProfile.test.ts), but
 * those test the FUNCTION. This file renders the real Guest App and
 * reads what a guest would see - which is the only way to catch a screen
 * that was wired to the raw field instead of the resolved one, or a
 * resolution applied in one of two callers.
 */

const brand = brandConfigSchema.parse({
  name: "Return to Balance",
  logoRef: null,
  palette: "forest-sage",
  customPrimary: null,
  customSecondary: null,
  customNavigation: null,
  customText: null,
  atmosphere: "calm-organic",
});

function render(
  opts: { profile?: Partial<RetreatProfile>; arrival?: Partial<ArrivalInfo>; locale?: Locale } = {}
): string {
  const props = {
    tenantName: "Return to Balance",
    brand,
    todayIso: "2026-05-04",
    nowTime: "09:00",
    enabledModules: [],
    schedule: [],
    facilitators: [],
    meals: [],
    treatments: [],
    facilities: [],
    arrivalInfo: { ...EMPTY_ARRIVAL_INFO, ...opts.arrival },
    retreatProfile: { ...EMPTY_RETREAT_PROFILE, ...opts.profile },
    locale: opts.locale ?? "en",
  } as unknown as GuestAppProps;
  return renderToStaticMarkup(h(GuestApp, props));
}

describe("Home resolves What to Bring the way decision A requires", () => {
  it("1. shows the canonical list when there is one", () => {
    const out = render({
      profile: { whatToBring: ["Layers", "A journal"] },
      arrival: { whatToBring: "A towel\nWater bottle" },
    });
    expect(out).toContain("Layers");
    expect(out).toContain("A journal");
    // The legacy value must NOT also be on the page - two packing lists
    // is the failure mode this precedence exists to prevent.
    expect(out).not.toContain("A towel");
    expect(out).not.toContain("Water bottle");
  });

  it("2. shows the legacy string, split into one item per line, when there is no canonical list", () => {
    const out = render({ arrival: { whatToBring: "A towel\nWater bottle\nShoes you can walk in" } });
    expect(out).toContain("A towel");
    expect(out).toContain("Water bottle");
    expect(out).toContain("Shoes you can walk in");
    // Three bullets, not one blob: the <li> count is what proves the
    // newline split reached the screen.
    expect(out.split("<li").length - 1).toBe(3);
  });

  it("keeps a legacy prose line whole rather than splitting it on commas", () => {
    const out = render({ arrival: { whatToBring: "Loose clothing, a towel and a water bottle" } });
    expect(out).toContain("Loose clothing, a towel and a water bottle");
    expect(out.split("<li").length - 1).toBe(1);
  });

  it("3. shows no What to Bring section at all when neither exists", () => {
    const out = render();
    expect(out).not.toContain("What to Bring");
  });
});

describe("Home resolves Welcome the same way", () => {
  it("prefers the canonical welcome and never shows both", () => {
    const out = render({ profile: { welcome: "Canonical welcome." }, arrival: { welcomeMessage: "Legacy welcome." } });
    expect(out).toContain("Canonical welcome.");
    expect(out).not.toContain("Legacy welcome.");
  });

  it("falls back to the legacy welcome message", () => {
    expect(render({ arrival: { welcomeMessage: "Legacy welcome." } })).toContain("Legacy welcome.");
  });

  it("shows nothing when neither exists", () => {
    expect(render()).not.toContain("welcome");
  });
});

describe("Home hides every empty retreat section", () => {
  it("renders none of the headings for a Space with no profile at all", () => {
    const out = render();
    for (const heading of ["About the Retreat", "What to Bring", "What to Expect"]) {
      expect(out, heading).not.toContain(heading);
    }
  });

  it("renders only the sections that have content", () => {
    const out = render({ profile: { longDescription: "Seven days.", whatToExpect: ["Early mornings"] } });
    expect(out).toContain("About the Retreat");
    expect(out).toContain("Seven days.");
    expect(out).toContain("What to Expect");
    expect(out).toContain("Early mornings");
    expect(out).not.toContain("What to Bring");
  });

  it("puts the tagline and the short description on the page when set", () => {
    const out = render({ profile: { tagline: "Coming back to yourself", shortDescription: "A small retreat." } });
    expect(out).toContain("Coming back to yourself");
    expect(out).toContain("A small retreat.");
  });
});

describe("the retreat sections speak the Space's language", () => {
  it("renders the headings in German and Hebrew, not English", () => {
    const de = render({ profile: { longDescription: "Sieben Tage." }, locale: "de" });
    expect(de).toContain("Über das Retreat");
    expect(de).not.toContain("About the Retreat");

    const he = render({ profile: { whatToExpect: ["בקרים מוקדמים"] }, locale: "he" });
    expect(he).toContain("למה לצפות");
    expect(he).not.toContain("What to Expect");
  });

  it("marks organizer text dir=auto so a Hebrew line reads correctly in an English Space", () => {
    const out = render({ profile: { longDescription: "שבעה ימים" } });
    expect(out).toMatch(/dir="auto"[^>]*>[^<]*שבעה ימים|שבעה ימים/);
    expect(out).toContain('dir="auto"');
  });
});

describe("Daily Inspiration is unaffected by the new Home sections (P5F)", () => {
  /**
   * TASK 029 restructured the bottom of Home - the retreat sections sit
   * between the schedule link and the quote - so this is a regression
   * check on the module that was NOT rebuilt, not a new feature's test.
   */
  const withQuote = (profile: Partial<RetreatProfile> = {}) => {
    const props = {
      tenantName: "Return to Balance",
      brand,
      todayIso: "2026-05-04",
      nowTime: "09:00",
      enabledModules: ["dailyInspiration"],
      schedule: [],
      facilitators: [],
      meals: [],
      treatments: [],
      facilities: [],
      arrivalInfo: EMPTY_ARRIVAL_INFO,
      retreatProfile: { ...EMPTY_RETREAT_PROFILE, ...profile },
      locale: "en",
    } as unknown as GuestAppProps;
    return renderToStaticMarkup(h(GuestApp, props));
  };

  // Asked of the real selector rather than hardcoded - my first attempt
  // hardcoded the wrong day's quote and the test failed for that reason
  // rather than for a defect.
  const quote = getDailyQuote("2026-05-04")!;

  it("still renders the day's quote and its source", () => {
    const out = withQuote();
    expect(out).toContain(quote.source);
    expect(out).toContain(quote.text.slice(0, 24));
  });

  it("still renders it when the new retreat sections are above it", () => {
    const out = withQuote({ longDescription: "Seven days.", whatToExpect: ["Early mornings"] });
    expect(out).toContain("About the Retreat");
    expect(out).toContain(quote.source);
  });

  it("renders no quote when the module is off", () => {
    const props = {
      tenantName: "x", brand, todayIso: "2026-05-04", nowTime: "09:00", enabledModules: [],
      schedule: [], facilitators: [], meals: [], treatments: [], facilities: [],
      arrivalInfo: EMPTY_ARRIVAL_INFO, retreatProfile: EMPTY_RETREAT_PROFILE, locale: "en",
    } as unknown as GuestAppProps;
    expect(renderToStaticMarkup(h(GuestApp, props))).not.toContain(quote.source);
  });
});
