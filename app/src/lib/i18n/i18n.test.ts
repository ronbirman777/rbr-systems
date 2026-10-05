import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/teach/fonts", () => ({ TEACH_FONT_VARIABLES: "" }));

import {
  DEFAULT_LOCALE,
  LOCALE_LABEL,
  SUPPORTED_LOCALES,
  createTranslator,
  directionOf,
  isSupportedLocale,
  missingKeys,
  recommendedLocales,
  resolveLocale,
  translate,
  untranslatedKeys,
} from "./index";
import { DIRECTIONAL_ICONS, iconTransform, isDirectionalIcon } from "./direction";
import { formatLongDateLocalized, formatNumberLocalized, formatShortDateLocalized, formatTimeLocalized } from "./datetime";
import { formatShortDate } from "@/lib/teach/links";
import { parseSpaceSettings } from "@/lib/spaceSettings";
import { parsePublishedTeachSpace } from "@/lib/teach/guestData";
import { TeachGuestApp } from "@/components/teach/teach-guest-app";

describe("supported locales", () => {
  it("is exactly en/he/de, with English as the fallback", () => {
    expect(SUPPORTED_LOCALES).toEqual(["en", "he", "de"]);
    expect(DEFAULT_LOCALE).toBe("en");
  });

  it("knows which direction each language reads in", () => {
    expect(directionOf("en")).toBe("ltr");
    expect(directionOf("de")).toBe("ltr");
    expect(directionOf("he")).toBe("rtl");
  });

  it("labels each language in its own script", () => {
    expect(LOCALE_LABEL).toEqual({ en: "English", he: "עברית", de: "Deutsch" });
  });

  it("resolves anything unrecognised to English instead of throwing", () => {
    for (const bad of [null, undefined, "", "fr", "EN", 42, {}]) {
      expect(resolveLocale(bad), String(bad)).toBe("en");
    }
    expect(isSupportedLocale("he")).toBe(true);
    expect(isSupportedLocale("fr")).toBe(false);
  });
});

describe("translation and fallback", () => {
  it("translates through the Space locale", () => {
    expect(translate("en", "teach", "navHome")).toBe("Home");
    expect(translate("he", "teach", "navHome")).toBe("בית");
    expect(translate("de", "teach", "navHome")).toBe("Start");
  });

  it("interpolates values without touching anything else", () => {
    expect(translate("en", "teach", "fromTeacher", { name: "Lena" })).toBe("From Lena");
    expect(translate("de", "teach", "fromTeacher", { name: "Lena" })).toBe("Von Lena");
    expect(translate("he", "teach", "fromTeacher", { name: "Lena" })).toContain("Lena");
  });

  it("leaves an unknown placeholder visible rather than blanking it", () => {
    expect(translate("en", "teach", "fromTeacher", {})).toBe("From {name}");
  });

  it("falls back to English for an unknown locale, never to the key", () => {
    const t = createTranslator("fr");
    expect(t.locale).toBe("en");
    expect(t.t("common", "save")).toBe("Save");
  });

  it("has complete Hebrew and German dictionaries", () => {
    // A missing key would silently fall back to English, which is correct
    // behaviour but hides an untranslated surface - so it is asserted.
    expect(missingKeys("he")).toEqual([]);
    expect(missingKeys("de")).toEqual([]);
  });

  it("only repeats English where the word is genuinely the same", () => {
    // Proper nouns and borrowings legitimately match; anything else
    // matching English means it was never translated.
    // Identical by language, not by omission: "Optional", "WhatsApp" and
    // "Team" are the same word in German, and "Team" is a loanword in use.
    const allowed = new Set([
      "flow.whatsapp",
      "flow.navTeam",
      "common.optional",
    ]);
    for (const locale of ["he", "de"] as const) {
      const unexpected = untranslatedKeys(locale).filter((k) => !allowed.has(k));
      expect(unexpected, `${locale} untranslated`).toEqual([]);
    }
  });
});

describe("country recommends a language but never locks it", () => {
  it("recommends Hebrew for Israel and German for the DACH countries", () => {
    expect(recommendedLocales("IL")).toEqual(["en", "he"]);
    expect(recommendedLocales("DE")).toEqual(["en", "de"]);
    expect(recommendedLocales("AT")).toEqual(["en", "de"]);
  });

  it("leads with English everywhere else", () => {
    expect(recommendedLocales("JP")).toEqual(["en"]);
    expect(recommendedLocales(null)).toEqual(["en"]);
    expect(recommendedLocales("XK")).toEqual(["en"]);
  });

  it("never removes a language from the supported set", () => {
    // The recommendation orders the picker; it must never be read as a
    // restriction, so every supported language stays available.
    for (const country of ["IL", "DE", "JP", null]) {
      const recommended = recommendedLocales(country);
      expect(recommended.every((l) => SUPPORTED_LOCALES.includes(l))).toBe(true);
      expect(SUPPORTED_LOCALES.length).toBe(3);
    }
  });
});

describe("locale persistence lives in the shared Space settings", () => {
  it("parses a supported locale and rejects anything else to null", () => {
    expect(parseSpaceSettings({ locale: "he" }).locale).toBe("he");
    expect(parseSpaceSettings({ locale: "de" }).locale).toBe("de");
    expect(parseSpaceSettings({ locale: "fr" }).locale).toBeNull();
    expect(parseSpaceSettings({}).locale).toBeNull();
  });

  it("keeps country and locale independent", () => {
    expect(parseSpaceSettings({ country: "IL", locale: "he" })).toEqual({ country: "IL", locale: "he" });
    // Choosing Hebrew must not require an Israeli country, and vice versa.
    expect(parseSpaceSettings({ country: "DE", locale: "he" })).toEqual({ country: "DE", locale: "he" });
  });
});

function guest(locale?: string) {
  return parsePublishedTeachSpace({
    name: "QA Teacher",
    theme: null,
    timezone: "Asia/Jerusalem",
    enabled_modules: [],
    modules: {
      ...(locale === undefined ? {} : { spaceSettings: { locale } }),
      teach: { settings: {}, items: {} },
    },
  });
}

describe("the Guest App reads locale from published data only", () => {
  it("takes the locale from the published spaceSettings object", () => {
    expect(guest("he").locale).toBe("he");
    expect(guest("de").locale).toBe("de");
  });

  it("defaults an existing Space with no locale to English", () => {
    // Backward compatibility: every Space published before CP3 has no
    // spaceSettings key at all.
    expect(guest().locale).toBe("en");
    expect(guest(undefined).locale).toBe("en");
  });

  it("ignores an unsupported stored locale rather than breaking", () => {
    expect(guest("fr").locale).toBe("en");
  });

  it("sets lang and dir on the rendered Guest App", () => {
    const html = (l?: string) => renderToStaticMarkup(createElement(TeachGuestApp, { data: guest(l) }));
    expect(html("he")).toContain('dir="rtl"');
    expect(html("he")).toContain('lang="he"');
    expect(html("de")).toContain('dir="ltr"');
    expect(html("de")).toContain('lang="de"');
    expect(html()).toContain('lang="en"');
  });

  it("renders navigation in the Space language", () => {
    const html = (l?: string) => renderToStaticMarkup(createElement(TeachGuestApp, { data: guest(l) }));
    expect(html("he")).toContain("בית");
    expect(html("de")).toContain("Start");
    expect(html()).toContain("Home");
  });
});

describe("directional icons mirror, meaningful ones do not", () => {
  it("treats only direction-carrying icons as directional", () => {
    for (const name of DIRECTIONAL_ICONS) expect(isDirectionalIcon(name), name).toBe(true);
    // Mirroring any of these would change what they mean.
    for (const name of ["play", "pause", "heart", "microphone", "calendar", "pin", "qr", "settings", "home", "user"]) {
      expect(isDirectionalIcon(name), name).toBe(false);
    }
  });

  it("flips a directional icon in RTL and nothing in LTR", () => {
    expect(iconTransform("chevronLeft", "rtl")).toBe("scaleX(-1)");
    expect(iconTransform("chevronLeft", "ltr")).toBeUndefined();
    expect(iconTransform("play", "rtl")).toBeUndefined();
  });
});

describe("date and time localization is presentation only", () => {
  it("leaves English output byte-identical to the existing formatter", () => {
    // formatShortDate's exact output is relied on elsewhere; English must
    // not shift when localization is introduced.
    for (const iso of ["2026-10-05", "2026-01-01", "2026-12-31"]) {
      expect(formatShortDateLocalized(iso, "en")).toBe(formatShortDate(iso));
    }
  });

  it("formats the same day differently per locale without changing the day", () => {
    const iso = "2026-10-14";
    const en = formatShortDateLocalized(iso, "en");
    const he = formatShortDateLocalized(iso, "he");
    const de = formatShortDateLocalized(iso, "de");
    expect(en).toBe("Wed 14 Oct");
    expect(he).not.toBe(en);
    expect(de).not.toBe(en);
    // The calendar day survives in every rendering.
    for (const out of [en, he, de]) expect(out).toContain("14");
  });

  it("returns a malformed date unchanged instead of inventing one", () => {
    expect(formatShortDateLocalized("not-a-date", "he")).toBe("not-a-date");
    expect(formatLongDateLocalized("", "de")).toBe("");
  });

  it("keeps stored wall-clock times exactly as stored", () => {
    // A class at 09:00 is at 09:00 in every language - only the writing
    // changes, never the instant, the timezone or the recurrence.
    for (const locale of SUPPORTED_LOCALES) {
      expect(formatTimeLocalized("09:00", locale)).toContain("09");
      expect(formatTimeLocalized("17:30", locale)).toContain("17");
    }
    expect(formatTimeLocalized("09:00", "en")).toBe("09:00");
    expect(formatTimeLocalized("09:00", "de")).toBe("09:00");
  });

  it("rejects a malformed time rather than guessing", () => {
    expect(formatTimeLocalized("99:99", "en")).toBe("99:99");
    expect(formatTimeLocalized("abc", "he")).toBe("abc");
  });

  it("formats numbers for the locale", () => {
    expect(formatNumberLocalized(1234, "en")).toBe("1,234");
    expect(formatNumberLocalized(1234, "de")).toBe("1.234");
  });
});

describe("user-authored content keeps its own direction", () => {
  it("marks organizer rich text dir=auto so it never inherits the app", () => {
    const hebrewBio = parsePublishedTeachSpace({
      name: "QA",
      theme: null,
      timezone: "UTC",
      enabled_modules: [],
      modules: {
        spaceSettings: { locale: "en" },
        teach: { settings: { teachAbout: { about: "שלום, אני מורה ליוגה." } }, items: {} },
      },
    });
    const html = renderToStaticMarkup(createElement(TeachGuestApp, { data: hebrewBio, initialTab: "about" }));
    // A Hebrew biography inside an English Space must still read RTL.
    expect(html).toContain('dir="auto"');
    expect(html).toContain("שלום");
    // ...while the app itself stays English/LTR.
    expect(html).toContain('lang="en"');
  });

  it("does not translate or alter anything the organizer typed", () => {
    const text = "Morning Vinyasa Flow — bring a mat";
    const data = parsePublishedTeachSpace({
      name: "QA",
      theme: null,
      timezone: "UTC",
      enabled_modules: ["teachReadings"],
      modules: {
        spaceSettings: { locale: "he" },
        teach: { settings: {}, items: { teachReadings: [{ id: "r1", title: text, imageRef: null, metadata: {} }] } },
      },
    });
    // Switching the Space to Hebrew leaves the English title untouched.
    expect(data.readings[0].title).toBe(text);
  });
});
