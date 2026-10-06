import { describe, expect, it } from "vitest";
import { COUNTRIES, findCountry, foldForSearch, isSupportedCountry, normalizeCountryCode, searchCountries } from "./index";
import { parseSpaceSettings, spaceSettingsSchema, defaultSpaceSettings } from "@/lib/spaceSettings";

describe("the shared country dataset", () => {
  it("is 249 officially assigned ISO entries plus one documented exception", () => {
    // Deliberately asserted as two numbers, never as "250 ISO countries":
    // Kosovo is a supported exception, not an ISO assignment.
    const iso = COUNTRIES.filter((c) => c.isoAssigned);
    const exceptions = COUNTRIES.filter((c) => !c.isoAssigned);
    expect(iso).toHaveLength(249);
    expect(exceptions.map((c) => c.code)).toEqual(["XK"]);
    expect(COUNTRIES).toHaveLength(250);
  });

  it("carries Kosovo as a supported, explicitly non-ISO exception", () => {
    // XK is user-assigned (EU/IMF/SWIFT use it); ISO 3166-1 has never
    // assigned it. It is selectable and dialable, but flagged.
    const xk = findCountry("XK")!;
    expect(xk).toMatchObject({ code: "XK", name: "Kosovo", dialCode: "+383", isoAssigned: false });
    expect(isSupportedCountry("XK")).toBe(true);
  });

  it("flags every other entry as ISO assigned", () => {
    expect(COUNTRIES.filter((c) => !c.isoAssigned && c.code !== "XK")).toEqual([]);
  });

  it("has no synthetic or placeholder entries", () => {
    // "XX / Other / Not Listed" shipped in the old signup-only list. It is
    // not an ISO country and must never be offered or stored.
    expect(COUNTRIES.some((c) => c.code === "XX")).toBe(false);
    expect(isSupportedCountry("XX")).toBe(false);
    expect(COUNTRIES.some((c) => /other|not listed|unknown/i.test(c.name))).toBe(false);
    // Kosovo is the ONLY non-ISO entry; no other synthetic value may creep in.
    expect(COUNTRIES.filter((c) => !c.isoAssigned)).toHaveLength(1);
  });

  it("is well formed and unique by code", () => {
    const codes = new Set<string>();
    for (const c of COUNTRIES) {
      expect(c.code, c.name).toMatch(/^[A-Z]{2}$/);
      expect(c.dialCode, c.name).toMatch(/^\+\d{1,4}$/);
      expect(c.name.trim(), c.code).not.toBe("");
      expect(codes.has(c.code)).toBe(false);
      codes.add(c.code);
    }
  });

  it("is sorted alphabetically by display name", () => {
    const names = COUNTRIES.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
  });

  it("stores calling codes as country codes, not area codes", () => {
    // Jamaica shipped as "+1876" before, which is +1 with a NANP area
    // code - inconsistent with US/CA in the same dataset.
    expect(findCountry("JM")?.dialCode).toBe("+1");
    expect(findCountry("US")?.dialCode).toBe("+1");
    expect(findCountry("CA")?.dialCode).toBe("+1");
  });

  it("keeps the values the previous dataset already shipped", () => {
    expect(findCountry("IL")).toMatchObject({ name: "Israel", dialCode: "+972" });
    expect(findCountry("DE")).toMatchObject({ name: "Germany", dialCode: "+49" });
    expect(findCountry("GB")).toMatchObject({ dialCode: "+44" });
  });
});

describe("valid-only country selection", () => {
  it("accepts a real code in any casing and trims it", () => {
    expect(isSupportedCountry("il")).toBe(true);
    expect(normalizeCountryCode(" il ")).toBe("IL");
  });

  it("rejects free text, partial codes and non-strings", () => {
    for (const value of ["", "Israel", "I", "ZZZ", "XX", null, undefined, 42, {}, []]) {
      expect(isSupportedCountry(value), String(value)).toBe(false);
      expect(normalizeCountryCode(value), String(value)).toBeNull();
    }
  });
});

describe("country search", () => {
  it("returns the whole list for an empty query, so the picker browses", () => {
    expect(searchCountries("")).toHaveLength(COUNTRIES.length);
  });

  it("ranks a name that starts with the query above one that contains it", () => {
    const [first] = searchCountries("ind");
    expect(first.code).toBe("IN"); // India, not British Indian Ocean Territory
  });

  it("finds by ISO code and by calling code, with or without +", () => {
    expect(searchCountries("IL")[0].code).toBe("IL");
    expect(searchCountries("972")[0].code).toBe("IL");
    expect(searchCountries("+972")[0].code).toBe("IL");
  });

  it("finds Kosovo by name and by its +383 calling code", () => {
    expect(searchCountries("kosovo")[0].code).toBe("XK");
    expect(searchCountries("383")[0].code).toBe("XK");
    expect(searchCountries("+383")[0].code).toBe("XK");
  });

  it("sorts Kosovo alphabetically among the ISO entries", () => {
    const names = COUNTRIES.map((c) => c.name);
    const i = names.indexOf("Kosovo");
    expect(i).toBeGreaterThan(0);
    expect(names[i - 1].localeCompare("Kosovo", "en")).toBeLessThan(0);
    expect(names[i + 1].localeCompare("Kosovo", "en")).toBeGreaterThan(0);
  });

  it("is diacritic-insensitive, because keyboards usually are", () => {
    expect(searchCountries("turkiye")[0].code).toBe("TR");
    expect(searchCountries("curacao")[0].code).toBe("CW");
    expect(searchCountries("reunion")[0].code).toBe("RE");
    expect(foldForSearch("Türkiye")).toBe("turkiye");
  });

  it("still finds countries by the name people remember", () => {
    expect(searchCountries("turkey")[0].code).toBe("TR");
    expect(searchCountries("czech republic")[0].code).toBe("CZ");
    expect(searchCountries("swaziland")[0].code).toBe("SZ");
    expect(searchCountries("holland")[0].code).toBe("NL");
    expect(searchCountries("ivory coast")[0].code).toBe("CI");
  });

  it("does not match a dial code from alphabetic input", () => {
    // "one" must not find every +1 territory.
    expect(searchCountries("one").every((c) => c.dialCode !== "+1" || /one/i.test(c.name))).toBe(true);
  });

  it("reports no results rather than guessing", () => {
    expect(searchCountries("qqqqqq")).toHaveLength(0);
  });

  it("honours the limit the picker passes", () => {
    expect(searchCountries("", 10)).toHaveLength(10);
  });
});

describe("shared Space settings", () => {
  it("defaults to nothing configured, so an existing Space needs no backfill", () => {
    expect(parseSpaceSettings(undefined)).toEqual({ country: null, locale: null });
    expect(parseSpaceSettings({})).toEqual(defaultSpaceSettings());
  });

  it("accepts a valid country and normalises its casing", () => {
    expect(spaceSettingsSchema.parse({ country: "il" }).country).toBe("IL");
  });

  it("falls back to null for an unknown country instead of throwing", () => {
    // A corrupt or future value must never make a Space unopenable.
    expect(parseSpaceSettings({ country: "XX" }).country).toBeNull();
    expect(parseSpaceSettings({ country: 42 }).country).toBeNull();
    expect(parseSpaceSettings("not an object")).toEqual(defaultSpaceSettings());
  });

  it("accepts a supported locale and rejects anything else", () => {
    // TASK 029 added Spanish and French to the supported set, so the
    // schema validates against SUPPORTED_LOCALES rather than its own copy
    // of the list - "fr" is a real locale now, "it" is not.
    expect(parseSpaceSettings({ locale: "he" }).locale).toBe("he");
    expect(parseSpaceSettings({ locale: "fr" }).locale).toBe("fr");
    expect(parseSpaceSettings({ locale: "it" }).locale).toBeNull();
  });

  it("keeps country and locale independent, so one never clears the other", () => {
    const parsed = parseSpaceSettings({ country: "DE", locale: "de" });
    expect(parsed).toEqual({ country: "DE", locale: "de" });
  });
});
