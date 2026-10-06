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
  localeFromFormData,
  studioMessages,
  untranslatedKeys,
} from "./index";
import { en } from "./dictionaries/en";
import { de } from "./dictionaries/de";
import { es } from "./dictionaries/es";
import { fr } from "./dictionaries/fr";
import { he } from "./dictionaries/he";
import { validateAdditionalLinks } from "@/app/configurator/retreat/featuredValidation";
import { DIRECTIONAL_ICONS, iconTransform, isDirectionalIcon } from "./direction";
import { formatLongDateLocalized, formatNumberLocalized, formatShortDateLocalized, formatTimeLocalized, shortWeekdayName } from "./datetime";
import { recurrenceSummary } from "@/lib/teach/recurrenceText";
import { formatShortDate } from "@/lib/teach/links";
import { localeFromPublishedModules, parseSpaceSettings } from "@/lib/spaceSettings";
import { guestAccessCopy } from "@/lib/spaceTypes/guestAccessCopy";
import { SPACE_TYPES } from "@/lib/spaceTypes/registry";
import { parsePublishedTeachSpace } from "@/lib/teach/guestData";
import { TeachGuestApp } from "@/components/teach/teach-guest-app";

/** The dictionaries by locale, for the checks that iterate all five. */
const DICTIONARY_FOR_TEST = { en, de, es, fr, he } as const;

describe("supported locales", () => {
  it("is exactly en/de/es/fr/he, in selector order, with English as the fallback", () => {
    // The order is the selector's display order and is deliberately
    // fixed: Hebrew last because it is the only RTL language here.
    expect(SUPPORTED_LOCALES).toEqual(["en", "de", "es", "fr", "he"]);
    expect(DEFAULT_LOCALE).toBe("en");
  });

  it("knows which direction each language reads in", () => {
    expect(directionOf("en")).toBe("ltr");
    expect(directionOf("de")).toBe("ltr");
    expect(directionOf("es")).toBe("ltr");
    expect(directionOf("fr")).toBe("ltr");
    expect(directionOf("he")).toBe("rtl");
  });

  it("labels each language in its own script", () => {
    expect(LOCALE_LABEL).toEqual({
      en: "English",
      de: "Deutsch",
      es: "Español",
      fr: "Français",
      he: "עברית",
    });
  });

  it("resolves anything unrecognised to English instead of throwing", () => {
    for (const bad of [null, undefined, "", "it", "EN", "es-MX", 42, {}]) {
      expect(resolveLocale(bad), String(bad)).toBe("en");
    }
    expect(isSupportedLocale("he")).toBe(true);
    expect(isSupportedLocale("es")).toBe(true);
    expect(isSupportedLocale("fr")).toBe(true);
    expect(isSupportedLocale("it")).toBe(false);
  });
});

describe("translation and fallback", () => {
  it("translates through the Space locale", () => {
    expect(translate("en", "teach", "navHome")).toBe("Home");
    expect(translate("he", "teach", "navHome")).toBe("בית");
    expect(translate("de", "teach", "navHome")).toBe("Start");
    expect(translate("es", "teach", "navHome")).toBe("Inicio");
    expect(translate("fr", "teach", "navHome")).toBe("Accueil");
  });

  it("interpolates values without touching anything else", () => {
    expect(translate("en", "teach", "fromTeacher", { name: "Lena" })).toBe("From Lena");
    expect(translate("de", "teach", "fromTeacher", { name: "Lena" })).toBe("Von Lena");
    expect(translate("he", "teach", "fromTeacher", { name: "Lena" })).toContain("Lena");
    expect(translate("es", "teach", "fromTeacher", { name: "Lena" })).toBe("De Lena");
    expect(translate("fr", "teach", "fromTeacher", { name: "Lena" })).toBe("De Lena");
  });

  it("leaves an unknown placeholder visible rather than blanking it", () => {
    expect(translate("en", "teach", "fromTeacher", {})).toBe("From {name}");
  });

  it("falls back to English for an unknown locale, never to the key", () => {
    const t = createTranslator("it");
    expect(t.locale).toBe("en");
    expect(t.t("common", "save")).toBe("Save");
  });

  it("has complete dictionaries for every non-English locale", () => {
    // A missing key would silently fall back to English, which is correct
    // behaviour but hides an untranslated surface - so it is asserted.
    for (const locale of SUPPORTED_LOCALES) {
      expect(missingKeys(locale), locale).toEqual([]);
    }
  });

  it("carries every placeholder through, in every locale", () => {
    // A bulk rewrite is the thing that breaks these: TASK 029 rewrote 208
    // French strings in one pass, and a dropped {index} or a mangled
    // {{teacher_name}} would reach a guest as a literal brace rather than
    // failing anywhere. Asserted per key against English, so a translator
    // cannot quietly lose one either.
    const placeholders = (s: string) => (s.match(/\{\{?\w+\}?\}/g) ?? []).slice().sort();
    const mismatches: string[] = [];
    for (const [namespace, strings] of Object.entries(en)) {
      for (const [key, value] of Object.entries(strings)) {
        const expected = placeholders(value as string);
        for (const locale of SUPPORTED_LOCALES) {
          if (locale === "en") continue;
          const got = placeholders(
            (DICTIONARY_FOR_TEST[locale] as Record<string, Record<string, string>>)[namespace][key]
          );
          if (expected.join("|") !== got.join("|")) {
            mismatches.push(`${locale} ${namespace}.${key}: expected ${expected.join(",")} got ${got.join(",")}`);
          }
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("only repeats English where the word is genuinely the same", () => {
    // Proper nouns and borrowings legitimately match; anything else
    // matching English means it was never translated.
    // Identical by language, not by omission. "Optional", "Website",
    // "Pause" and "Team" are the same word in German; "Team" and
    // "WhatsApp" are in everyday use in Hebrew-language interfaces too.
    const allowed = new Set([
      "flow.whatsapp",
      "flow.navTeam",
      "common.optional",
      "common.website",
      "common.pause",
      "common.live",
      // German uses these English words as-is; translating them would be
      // less natural, not more: "Retreat", "Live", "Brunch" and the
      // hotel terms "Check-in"/"Check-out" are the everyday German forms.
      "flow.exploreHeadingEm",
      "flow.live",
      "flow.checkIn",
      "flow.checkOut",
      "flow.mealBrunch",
      // TASK 029: "Audio" is the German word, and German retreat and
      // wellness pages write "Treatments & Extras" exactly like this -
      // "Behandlungen & Zusatzleistungen" would be a translation nobody
      // in the market actually uses.
      "flow.audioStepTitle",
      "flow.treatmentsAndExtras",
      // File format names, not words - the same in every language.
      "studio.imageFormats",
      // The canvas Share Card deliberately falls back to English for
      // Hebrew - see shareCardLocale() in shareCard.ts, and the test
      // below that pins this as intentional rather than forgotten.
      "flow.cardKicker",
      "flow.cardScanLabel",
      // A sample postal address, shown as a placeholder. It is an
      // address, not prose, so it reads the same in every locale.
      "flow.addressPlaceholder",
      // "Yoga Alliance RYT-500" is a certifying body's own name.
      "teach.issuerPlaceholder",
      // German uses these as-is: the design vocabulary "Editorial",
      // "Modern" and "Minimal", the practice names "Meditation",
      // "Yoga Nidra" and "Mantra", and "Details (optional)", which is
      // written identically.
      "teach.typoEditorial",
      "teach.typoModern",
      "teach.cornersMinimal",
      "teach.catMeditationR",
      "teach.catYogaNidra",
      "teach.catMantra",
      "teach.detailsOptional",
      // Example values that are proper nouns, so they do not translate:
      // a person's name, a studio's name, and a class name German
      // studios themselves write in English.
      "teach.myNamePlaceholder",
      "teach.maya",
      "teach.locationNamePlaceholder",
      "teach.classLocationPlaceholder",
      "teach.classTitlePlaceholder",
      // A type specimen: German reads Latin script, so "Aa" is correct
      // there. Hebrew gets "אא" because the swatch exists to show what
      // the chosen text colour looks like in the reader's own script.
      "flow.readabilitySample",
      // "Yoga", "Meditation" and "Audio" are the German words too.
      "flow.catYoga",
      "flow.catMeditation",
      "flow.moduleAudio",
      // TASK 029, Spanish and French. A unit abbreviation, and words
      // these two languages spell exactly as English does.
      "teach.minutes",
      "teach.catMindfulness",
      "teach.spacingCompact",
      "teach.pages",
      "teach.sectionModules",
      "teach.contactCardTitle",
      "common.contact",
      "common.description",
      "common.date",
      "common.photo",
      "common.question",
      "flow.contact",
      "flow.faq",
      "flow.date",
      "flow.pageLabel",
      "studio.navModules",
    ]);
    for (const locale of ["he", "de", "es", "fr"] as const) {
      const unexpected = untranslatedKeys(locale).filter((k) => !allowed.has(k));
      expect(unexpected, `${locale} untranslated`).toEqual([]);
    }
  });
});

describe("the French dictionary speaks informally, like the German one", () => {
  // Owner decision (TASK 029 final hardening): French moved from "vous"
  // to "tu", aligning it with German's "du". InnerDweS is a personal
  // wellness product, and a formal address puts corporate distance
  // between a teacher and their students.
  //
  // This is asserted rather than remembered because a single reverted
  // string reads as a different product. It checks the three ways French
  // leaks formality: the pronouns, the possessives, and - the one a
  // find-and-replace always misses - second-person-PLURAL verb forms,
  // which look like ordinary words.
  const values = Object.entries(fr).flatMap(([ns, strings]) =>
    Object.entries(strings).map(([key, value]) => [`${ns}.${key}`, value] as const)
  );

  it("never addresses anyone as vous / votre / vos / veuillez", () => {
    const formal = /\b(vous|votre|vos|veuillez)\b/i;
    const found = values.filter(([, v]) => formal.test(v)).map(([k]) => k);
    expect(found, "formal address").toEqual([]);
  });

  it("uses no second-person-plural verb form", () => {
    // "chez", "assez" and "nez" end in -ez without being verbs; nothing
    // else in this dictionary should.
    const NOT_A_VERB = new Set(["chez", "assez", "nez"]);
    const offenders: string[] = [];
    for (const [key, value] of values) {
      for (const word of value.match(/\b[A-Za-zÀ-ÿ’'-]+ez\b/g) ?? []) {
        if (!NOT_A_VERB.has(word.toLowerCase())) offenders.push(`${key}: ${word}`);
      }
      for (const word of value.match(/\b(êtes|avez|pouvez|voulez|devez|soyez|ayez|voyez|savez|faites|dites)\b/g) ?? []) {
        offenders.push(`${key}: ${word}`);
      }
    }
    expect(offenders, "plural verb forms").toEqual([]);
  });

  it("still reads as French, not as a find-and-replace", () => {
    // Spot checks on the shapes a bulk conversion gets wrong: elision
    // before a vowel, and gender agreement on the possessive.
    expect(fr.teach.aboutMeBody).toContain("Ton histoire");
    expect(fr.flow.identityTitle).toContain("ta retraite");
    expect(fr.studio.shareYourSpace).toBe("Partage ton Espace");
    expect(fr.flow.addFacilitatorsBody).toContain("Ton équipe");
    // And the organizer's gender is still never guessed.
    expect(fr.flow.previewPublishBody).toContain("quand tout est prêt");
  });

  it("is informal for guests too, including the message a guest sends", () => {
    // German does the same here ("Kannst du mir bestätigen"), so the two
    // languages do not disagree about who the product is talking to.
    expect(fr.teach.classWhatsappTemplate).toContain("Peux-tu");
    expect(fr.flow.enterAccessCode).toContain("ton code");
    // The template's variables must survive any rewording.
    for (const v of ["{{teacher_name}}", "{{class_name}}", "{{date}}", "{{start_time}}", "{{space_url}}"]) {
      expect(fr.teach.classWhatsappTemplate, v).toContain(v);
    }
  });
});

describe("country recommends a language but never locks it", () => {
  it("recommends Hebrew for Israel and German for the DACH countries", () => {
    expect(recommendedLocales("IL")).toEqual(["en", "he"]);
    expect(recommendedLocales("DE")).toEqual(["en", "de"]);
    expect(recommendedLocales("AT")).toEqual(["en", "de"]);
  });

  it("recommends Spanish across Spain and Latin America, French across la Francophonie", () => {
    for (const country of ["ES", "MX", "AR", "CO", "CR", "PR"]) {
      expect(recommendedLocales(country), country).toEqual(["en", "es"]);
    }
    for (const country of ["FR", "BE", "LU", "CA", "MA", "SN"]) {
      expect(recommendedLocales(country), country).toEqual(["en", "fr"]);
    }
    // Brazil speaks Portuguese, which this release does not support, so
    // it must not be swept into the Spanish list.
    expect(recommendedLocales("BR")).toEqual(["en"]);
  });

  it("leads with English everywhere else", () => {
    expect(recommendedLocales("JP")).toEqual(["en"]);
    expect(recommendedLocales(null)).toEqual(["en"]);
    expect(recommendedLocales("XK")).toEqual(["en"]);
  });

  it("never removes a language from the supported set", () => {
    // The recommendation orders the picker; it must never be read as a
    // restriction, so every supported language stays available.
    for (const country of ["IL", "DE", "ES", "MX", "FR", "CA", "JP", null]) {
      const recommended = recommendedLocales(country);
      expect(recommended.every((l) => SUPPORTED_LOCALES.includes(l))).toBe(true);
      expect(SUPPORTED_LOCALES.length).toBe(5);
    }
  });
});

describe("locale persistence lives in the shared Space settings", () => {
  it("parses a supported locale and rejects anything else to null", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(parseSpaceSettings({ locale }).locale, locale).toBe(locale);
    }
    expect(parseSpaceSettings({ locale: "it" }).locale).toBeNull();
    expect(parseSpaceSettings({ locale: "es-MX" }).locale).toBeNull();
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
    for (const locale of SUPPORTED_LOCALES) {
      expect(guest(locale).locale, locale).toBe(locale);
    }
  });

  it("defaults an existing Space with no locale to English", () => {
    // Backward compatibility: every Space published before CP3 has no
    // spaceSettings key at all.
    expect(guest().locale).toBe("en");
    expect(guest(undefined).locale).toBe("en");
  });

  it("ignores an unsupported stored locale rather than breaking", () => {
    expect(guest("it").locale).toBe("en");
    expect(guest("es-MX").locale).toBe("en");
  });

  it("sets lang and dir on the rendered Guest App", () => {
    const html = (l?: string) => renderToStaticMarkup(createElement(TeachGuestApp, { data: guest(l) }));
    expect(html("he")).toContain('dir="rtl"');
    expect(html("he")).toContain('lang="he"');
    expect(html("de")).toContain('dir="ltr"');
    expect(html("de")).toContain('lang="de"');
    expect(html("es")).toContain('dir="ltr"');
    expect(html("es")).toContain('lang="es"');
    expect(html("fr")).toContain('dir="ltr"');
    expect(html("fr")).toContain('lang="fr"');
    expect(html()).toContain('lang="en"');
  });

  it("renders navigation in the Space language", () => {
    const html = (l?: string) => renderToStaticMarkup(createElement(TeachGuestApp, { data: guest(l) }));
    expect(html("he")).toContain("בית");
    expect(html("de")).toContain("Start");
    expect(html("es")).toContain("Inicio");
    expect(html("fr")).toContain("Accueil");
    expect(html()).toContain("Home");
  });
});

describe("the canvas Share Card's Hebrew fallback is deliberate", () => {
  it("draws German, and English for Hebrew", () => {
    // The card is drawn with DM Serif Display / DM Sans, which have no
    // Hebrew coverage, and its letter-spacing routine advances
    // left-to-right one glyph at a time. Hebrew would render as tofu or
    // reversed, so the two labels drawn INTO the card fall back to
    // English. If someone adds a Hebrew-capable face and a
    // direction-aware text routine, this test is what tells them to
    // translate these two keys.
    expect(translate("de", "flow", "cardKicker")).toBe("DEIN RETREAT-BEGLEITER");
    expect(translate("es", "flow", "cardKicker")).toBe("TU COMPAÑERO DE RETIRO");
    expect(translate("fr", "flow", "cardKicker")).toBe("TON COMPAGNON DE RETRAITE");
    expect(translate("he", "flow", "cardKicker")).toBe(translate("en", "flow", "cardKicker"));
    expect(translate("he", "flow", "cardScanLabel")).toBe(translate("en", "flow", "cardScanLabel"));
  });

  it("still translates the Share Card's surrounding Studio UI into Hebrew", () => {
    // The limitation is the canvas only. Everything around it is Hebrew.
    for (const key of ["shareYourSpace", "shareCardPreview", "shareCardBody"] as const) {
      expect(translate("he", "studio", key)).not.toBe(translate("en", "studio", key));
    }
  });
});

describe("the Guest Access gate speaks the Space language", () => {
  it("keeps the English copy identical to the Space Type Registry", () => {
    // The gate's wording now comes from the dictionary, while the
    // registry still declares it as the product's own copy. Pinning them
    // together means either one moving fails here instead of silently
    // giving guests two different wordings.
    expect(guestAccessCopy("retreat", "en")).toEqual(SPACE_TYPES.retreat.copy.guestAccess);
  });

  it("still reveals only retreat-or-neutral, in every language", () => {
    // The gate is shown before a visitor may see the Space, so it must
    // not distinguish Teach from an unsupported type. Translating must
    // not quietly add a third variant.
    for (const locale of SUPPORTED_LOCALES) {
      const teach = guestAccessCopy("teach", locale);
      expect(guestAccessCopy("client_hub", locale)).toEqual(teach);
      expect(guestAccessCopy("sanctuary", locale)).toEqual(teach);
      expect(guestAccessCopy(null, locale)).toEqual(teach);
      expect(guestAccessCopy("something-unknown", locale)).toEqual(teach);
      expect(guestAccessCopy("retreat", locale)).not.toEqual(teach);
    }
  });

  it("translates the gate rather than falling back to English", () => {
    expect(guestAccessCopy("retreat", "he").title).toBe("ריטריט פרטי");
    expect(guestAccessCopy("teach", "de").title).toBe("Privater Space");
    expect(guestAccessCopy("retreat", "es").title).toBe("Retiro privado");
    expect(guestAccessCopy("teach", "fr").title).toBe("Espace privé");
  });
});

describe("published locale is read from the snapshot only", () => {
  it("takes the locale from modules.spaceSettings", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(localeFromPublishedModules({ spaceSettings: { locale } }), locale).toBe(locale);
    }
  });

  it("defaults to English for anything else, never throwing", () => {
    for (const bad of [null, undefined, {}, { spaceSettings: null }, { spaceSettings: { locale: "it" } }, "nonsense"]) {
      expect(localeFromPublishedModules(bad), String(bad)).toBe("en");
    }
  });
});

describe("Server Actions answer in the Space language", () => {
  it("reads the locale a Studio form posted", () => {
    const fd = new FormData();
    fd.set("locale", "he");
    expect(localeFromFormData(fd)).toBe("he");
  });

  it("falls back to English for a missing, stale or hand-edited value", () => {
    // The posted locale only selects message text - it carries no
    // authority - so anything unrecognised must resolve, never throw.
    for (const bad of [undefined, "", "it", "EN", "../../etc", "he;de"]) {
      const fd = new FormData();
      if (bad !== undefined) fd.set("locale", bad);
      expect(localeFromFormData(fd), String(bad)).toBe("en");
    }
  });

  it("returns a translated action message, not an English one", () => {
    const he = studioMessages("he");
    const de = studioMessages("de");
    expect(he("notLoggedInToSave")).toBe("צריך להתחבר כדי לשמור.");
    expect(de("notLoggedInToSave")).toBe("Du musst angemeldet sein, um zu speichern.");
    expect(studioMessages("es")("notLoggedInToSave")).toBe("Tienes que haber iniciado sesión para guardar.");
    expect(studioMessages("fr")("notLoggedInToSave")).toBe("Tu dois te connecter pour enregistrer.");
    // English stays exactly as the action previously returned it.
    expect(studioMessages("en")("notLoggedInToSave")).toBe("You need to be logged in to save.");
  });

  it("interpolates a limit into a quota message in every language", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(studioMessages(locale)("pageLimitReached", { limit: 8 }), locale).toContain("8");
    }
  });

  it("validates Featured links in the Space language", () => {
    const tooMany = Array.from({ length: 7 }, () => ({ label: "x", url: "https://a.test" }));
    expect(validateAdditionalLinks(tooMany, "en")).toBe("You can add up to 6 additional links.");
    expect(validateAdditionalLinks(tooMany, "he")).toBe("אפשר להוסיף עד 6 קישורים נוספים.");
    expect(validateAdditionalLinks(tooMany, "es")).toBe("Puedes añadir hasta 6 enlaces adicionales.");
    expect(validateAdditionalLinks(tooMany, "fr")).toBe("Tu peux ajouter jusqu’à 6 liens supplémentaires.");
    expect(validateAdditionalLinks([], "de")).toBeNull();
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
    const es = formatShortDateLocalized(iso, "es");
    const fr = formatShortDateLocalized(iso, "fr");
    expect(en).toBe("Wed 14 Oct");
    for (const out of [he, de, es, fr]) expect(out).not.toBe(en);
    // The calendar day survives in every rendering.
    for (const out of [en, he, de, es, fr]) expect(out).toContain("14");
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
    expect(formatTimeLocalized("09:00", "fr")).toBe("09:00");
  });

  it("rejects a malformed time rather than guessing", () => {
    expect(formatTimeLocalized("99:99", "en")).toBe("99:99");
    expect(formatTimeLocalized("abc", "he")).toBe("abc");
  });

  it("writes Hebrew weekdays the way Hebrew writes them", () => {
    // ICU returns "יום א׳" for the short weekday - the word "day" is
    // already inside it - so a carrier phrase meaning "on days ..." would
    // otherwise say "day" twice.
    expect(shortWeekdayName(0, "he")).toBe("א׳");
    expect(shortWeekdayName(6, "he")).toBe("שבת");
    expect(shortWeekdayName(0, "en")).toBe("Sun");
    expect(shortWeekdayName(3, "de")).toBe("Mi");
    expect(shortWeekdayName(0, "es")).not.toBe(shortWeekdayName(0, "en"));
    expect(shortWeekdayName(0, "fr")).not.toBe(shortWeekdayName(0, "en"));
  });

  it("assembles a recurrence that reads naturally in each language", () => {
    const rule = { freq: "weekly", interval: 2, byWeekday: [0, 3], end: { type: "until", until: "2027-12-31" } } as never;
    // English is byte-identical to what the Studio showed before CP3.
    expect(recurrenceSummary(rule, "2026-10-05")).toBe("Every 2 weeks on Sun, Wed · Until 31 Dec 2027");
    // Hebrew uses its DUAL ("שבועיים", not "2 שבועות") and does not
    // repeat the word "day".
    expect(recurrenceSummary(rule, "2026-10-05", { locale: "he" })).toBe("כל שבועיים בימים א׳, ד׳ · עד 31 בדצמ׳ 2027");
    expect(recurrenceSummary(rule, "2026-10-05", { locale: "de" })).toBe("Alle 2 Wochen am So, Mi · Bis 31. Dez. 2027");
    // Spanish and French assemble from their own phrases; what matters
    // is that neither leaks an English word into the summary.
    for (const locale of ["es", "fr"] as const) {
      const summary = recurrenceSummary(rule, "2026-10-05", { locale });
      expect(summary, locale).not.toContain("Every");
      expect(summary, locale).not.toContain("Until");
      expect(summary, locale).toContain("2027");
    }
  });

  it("formats numbers for the locale", () => {
    expect(formatNumberLocalized(1234, "en")).toBe("1,234");
    expect(formatNumberLocalized(1234, "de")).toBe("1.234");
    expect(formatNumberLocalized(1234, "es")).not.toBe("1234");
    expect(formatNumberLocalized(1234, "fr")).not.toBe("1234");
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

  it("marks the hero, the quote and item titles dir=auto, not just the biography", () => {
    // Browser QA caught this: a German greeting inside a Hebrew Space
    // rendered as ".Willkommen — schön, dass du da bist" because the
    // paragraph inherited RTL and moved the full stop. Every block of
    // organizer-written text has to decide its own direction.
    const data = parsePublishedTeachSpace({
      name: "Lena",
      theme: null,
      timezone: "Europe/Berlin",
      enabled_modules: ["teachReadings"],
      modules: {
        spaceSettings: { locale: "he" },
        teach: {
          settings: {
            teachProfile: { greeting: "Willkommen — schön, dass du da bist.", teacherType: "Yoga Teacher", locationLine: "Berlin" },
            teachAbout: { philosophy: "Move slowly enough to hear your body." },
          },
          items: { teachReadings: [{ id: "r1", title: "On beginning again", imageRef: null, metadata: {} }] },
        },
      },
    });
    const home = renderToStaticMarkup(createElement(TeachGuestApp, { data }));
    // The app itself is Hebrew and right-to-left...
    expect(home).toContain('dir="rtl"');
    // ...while each block the organizer wrote decides for itself.
    for (const text of ["Willkommen", "Yoga Teacher", "Berlin"]) {
      expect(home, text).toContain(text);
    }
    const autoBlocks = home.split('dir="auto"').length - 1;
    expect(autoBlocks, "organizer blocks marked dir=auto").toBeGreaterThanOrEqual(4);

    const about = renderToStaticMarkup(createElement(TeachGuestApp, { data, initialTab: "about" }));
    expect(about).toContain('dir="auto"');
    expect(about).toContain("Move slowly enough");
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
