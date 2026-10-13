import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  COMMON_CURRENCY_CODES,
  CURRENCIES,
  DEFAULT_SPACE_CURRENCY,
  currencyDisplayName,
  currencyPickerOptions,
  findCurrency,
  isIsoCurrency,
  isoCurrencySchema,
  normalizeCurrencyCode,
  resolveSpaceCurrency,
  searchCurrencies,
} from "@/lib/currencies";
import { formatPrice, formatPriceFallback, storedDecimals } from "@/lib/currencies/format";
import { getSpaceCurrency, resetSpaceCurrencyStore, setSpaceCurrency } from "@/lib/currencies/spaceCurrencyStore";
import { parseSpaceSettings, spaceSettingsSchema } from "@/lib/spaceSettings";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/locales";
import { CurrencySelect } from "@/components/forms/currency-select";

const APP = join(__dirname, "..", "..", "..");

describe("currency dataset (ISO 4217 active codes)", () => {
  it("is up to date with its generator", () => {
    expect(() => execFileSync(process.execPath, [join(APP, "scripts", "generate-currencies.mjs"), "--check"], { stdio: "pipe" })).not.toThrow();
  });

  it("has unique three-letter codes with ISO minor units", () => {
    const codes = CURRENCIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of CURRENCIES) {
      expect(c.code).toMatch(/^[A-Z]{3}$/);
      expect([0, 2, 3]).toContain(c.minorUnits);
      expect(c.name.length).toBeGreaterThan(1);
    }
    expect(findCurrency("JPY")?.minorUnits).toBe(0);
    expect(findCurrency("KWD")?.minorUnits).toBe(3);
    expect(findCurrency("EUR")?.minorUnits).toBe(2);
  });

  it("excludes funds, metals, test and withdrawn codes", () => {
    for (const code of ["XAU", "XAG", "XPT", "XPD", "XTS", "XXX", "XDR", "BOV", "CHE", "CHW", "CLF", "MXV", "USN", "UYI", "UYW", "HRK", "ANG", "SLL"]) {
      expect(isIsoCurrency(code), code).toBe(false);
    }
  });

  it("contains every pinned common code, with readable English names", () => {
    for (const code of COMMON_CURRENCY_CODES) expect(isIsoCurrency(code), code).toBe(true);
    expect(findCurrency("USD")?.name).toBe("US Dollar");
    expect(findCurrency("ILS")?.name).toBe("Israeli New Shekel");
  });
});

describe("validation", () => {
  it("isoCurrencySchema accepts only active ISO codes, normalising case", () => {
    expect(isoCurrencySchema.parse(" eur ")).toBe("EUR");
    for (const bad of ["€", "EURO", "BAHT", "XAU", "XTS", "AB", ""]) expect(isoCurrencySchema.safeParse(bad).success, bad).toBe(false);
  });
  it("normalizeCurrencyCode is null for anything that is not ISO", () => {
    expect(normalizeCurrencyCode("thb")).toBe("THB");
    expect(normalizeCurrencyCode("BAHT")).toBeNull();
    expect(normalizeCurrencyCode(42)).toBeNull();
  });
});

describe("Space default currency (D-CC3)", () => {
  it("defaults to EUR when spaceSettings has no currency", () => {
    expect(DEFAULT_SPACE_CURRENCY).toBe("EUR");
    expect(parseSpaceSettings(undefined).currency).toBeNull();
    expect(resolveSpaceCurrency(parseSpaceSettings({}).currency)).toBe("EUR");
    expect(resolveSpaceCurrency(parseSpaceSettings({ locale: "de" }).currency)).toBe("EUR");
  });
  it("keeps a chosen ISO code and reads an unknown stored value as unset", () => {
    expect(parseSpaceSettings({ currency: "thb" }).currency).toBe("THB");
    expect(resolveSpaceCurrency(parseSpaceSettings({ currency: "THB" }).currency)).toBe("THB");
    expect(parseSpaceSettings({ currency: "EURO" }).currency).toBeNull();
    expect(parseSpaceSettings({ currency: "EURO", locale: "he", country: "IL" })).toEqual({ country: "IL", locale: "he", currency: null });
  });
  it("adding currency does not disturb country/locale on a merged patch", () => {
    const merged = spaceSettingsSchema.parse({ ...parseSpaceSettings({ country: "IL", locale: "he" }), currency: "ILS" });
    expect(merged).toEqual({ country: "IL", locale: "he", currency: "ILS" });
  });
  it("the client store resolves unset to EUR and follows changes", () => {
    resetSpaceCurrencyStore();
    expect(getSpaceCurrency("t1")).toBeNull();
    setSpaceCurrency("t1", null);
    expect(getSpaceCurrency("t1")).toBe("EUR");
    setSpaceCurrency("t1", "gbp");
    expect(getSpaceCurrency("t1")).toBe("GBP");
    resetSpaceCurrencyStore();
  });
});

describe("search and picker options", () => {
  it("finds by code, English name and localized name", () => {
    expect(searchCurrencies("thb")[0].code).toBe("THB");
    expect(searchCurrencies("baht")[0].code).toBe("THB");
    expect(searchCurrencies("shekel")[0].code).toBe("ILS");
    expect(searchCurrencies("swiss").map((c) => c.code)).toContain("CHF");
    // German localized name ("Schweizer Franken") - only matches through Intl.DisplayNames.
    expect(searchCurrencies("schweizer", "de").map((c) => c.code)).toContain("CHF");
    expect(searchCurrencies("zzzz")).toEqual([]);
  });
  it("an exact code outranks a name match", () => {
    expect(searchCurrencies("eur")[0].code).toBe("EUR");
  });
  it("empty query: pinned common group first, then all others without duplicates", () => {
    const { common, rest } = currencyPickerOptions("");
    expect(common.map((c) => c.code)).toEqual([...COMMON_CURRENCY_CODES]);
    const all = [...common, ...rest].map((c) => c.code);
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(CURRENCIES.length);
    expect(currencyPickerOptions("yen").common).toEqual([]);
  });
  it("localized names fall back to English", () => {
    expect(currencyDisplayName("USD", "en")).toBe("US Dollar");
    expect(currencyDisplayName("USD", "de").length).toBeGreaterThan(0);
    expect(currencyDisplayName("NOPE", "de")).toBe("NOPE");
  });
});

const SNAPSHOT_CURRENCIES = ["USD", "EUR", "THB", "GBP", "ILS", "TRY", "CHF", "AUD", "SGD", "JPY", "KWD"] as const;

describe("formatPrice - 7 locales x 11 currencies", () => {
  it("matches the formatting snapshot", () => {
    const table: Record<string, Record<string, string | null>> = {};
    for (const locale of SUPPORTED_LOCALES) {
      table[locale] = {};
      for (const code of SNAPSHOT_CURRENCIES) table[locale][code] = formatPrice(1250.5, code, locale);
    }
    expect(table).toMatchSnapshot();
  });

  it("never prints a bare $ for USD, AUD or SGD in any locale", () => {
    const bareDollar = /(^|[^A-Za-z])\$(?![A-Za-z])/;
    for (const locale of SUPPORTED_LOCALES) {
      for (const code of ["USD", "AUD", "SGD"]) {
        for (const amount of [0, 7, 700, 1250.5]) {
          const out = formatPrice(amount, code, locale)!;
          const symbolOrCode = out.replace(/[⁨⁩‏]/g, "");
          expect(bareDollar.test(symbolOrCode) && !/(US|AU|A|SG|S)\$|\$(US|AU|SG)/.test(symbolOrCode), `${locale} ${code}: ${out}`).toBe(false);
        }
      }
    }
  });

  it("never rounds or hides stored decimals", () => {
    expect(formatPrice(1250.5, "JPY", "en")).toBe("JP¥1,250.5");
    expect(formatPrice(700, "JPY", "en")).toBe("JP¥700");
    expect(formatPrice(10.125, "EUR", "en")).toBe("€10.125");
    expect(formatPrice(10.1, "EUR", "en")).toBe("€10.10");
    expect(formatPrice(1.2345, "KWD", "en")).toBe("KWD\u00a01.2345");
    expect(formatPrice(5, "KWD", "en")).toBe("KWD\u00a05.000");
    for (const locale of SUPPORTED_LOCALES) {
      const out = formatPrice(99.999, "USD", locale)!;
      expect(out.replace(/\D/g, ""), `${locale}: ${out}`).toContain("99999");
    }
  });

  it("isolates the price for RTL (Hebrew) and not for LTR locales", () => {
    const he = formatPrice(700, "ILS", "he")!;
    expect(he.startsWith("⁨")).toBe(true);
    expect(he.endsWith("⁩")).toBe(true);
    expect(he).toContain("₪");
    expect(formatPrice(700, "ILS", "en")!.startsWith("⁨")).toBe(false);
    const legacy = formatPrice(700, "BAHT", "he")!;
    expect(legacy.startsWith("⁨") && legacy.endsWith("⁩")).toBe(true);
  });

  it("legacy non-ISO codes render raw with locale digits, never rewritten", () => {
    expect(formatPrice(1500.5, "EURO", "en")).toBe("1,500.5 EURO");
    expect(formatPrice(1500, "BAHT", "de")).toBe("1.500 BAHT");
    expect(formatPrice(700, "€", "en")).toBe("700 €");
    expect(formatPrice(700, " euro ", "en")).toBe("700 euro");
  });

  it("no currency prints the amount only; no price prints nothing", () => {
    expect(formatPrice(900, null, "en")).toBe("900");
    expect(formatPrice(null, "EUR", "en")).toBeNull();
    expect(formatPrice(undefined, "EUR", "en")).toBeNull();
    expect(formatPrice(Number.NaN, "EUR", "en")).toBeNull();
  });

  it("lower-case ISO codes are recognised", () => {
    expect(formatPrice(10, "eur", "en")).toBe("€10.00");
  });

  it("fallback (pre-mount) is plain digits + stored code", () => {
    expect(formatPriceFallback(700, "THB", "en")).toBe("700 THB");
    expect(formatPriceFallback(1250.5, "EUR", "de")).toBe("1.250,5 EUR");
    expect(formatPriceFallback(null, "EUR", "en")).toBeNull();
  });

  it("storedDecimals reads what is stored", () => {
    expect(storedDecimals(700)).toBe(0);
    expect(storedDecimals(1250.5)).toBe(1);
    expect(storedDecimals(0.125)).toBe(3);
    expect(storedDecimals(1e-7)).toBe(7);
  });
});

describe("CurrencySelect (server render)", () => {
  const render = (value: string | null, locale: Locale = "en") =>
    renderToStaticMarkup(createElement(CurrencySelect, { value, onChange: () => {}, label: "Currency", locale, name: "currency" }));

  it("is an ARIA combobox showing code and name, posting only the ISO code", () => {
    const html = render("EUR");
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain("EUR — Euro");
    expect(html).toContain('type="hidden" name="currency" value="EUR"');
    expect(html).not.toContain("currency-unrecognised");
  });

  it("shows a legacy non-ISO value raw with a notice, and posts nothing", () => {
    const html = render("EURO");
    expect(html).toContain("currency-unrecognised");
    expect(html).toContain("Unrecognised currency “EURO”, choose one.");
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('type="hidden" name="currency" value=""');
  });

  it("renders the localized notice and placeholder in RTL locales", () => {
    const html = render("BAHT", "he");
    expect(html).toContain("BAHT");
    expect(html).toContain("חיפוש מטבע…");
    expect(html).toContain('dir="auto"');
  });

  it("empty value: no notice and the search placeholder", () => {
    const html = render(null);
    expect(html).toContain("Search currencies…");
    expect(html).not.toContain("currency-unrecognised");
  });
});

describe("billing separation", () => {
  it("nothing in lib/currencies (or the picker/card) imports lib/billing", () => {
    const dir = join(APP, "src", "lib", "currencies");
    const files = [
      ...readdirSync(dir).map((f) => join(dir, f)),
      join(APP, "src", "components", "forms", "currency-select.tsx"),
      join(APP, "src", "components", "studio", "space-currency-card.tsx"),
    ].filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts"));
    expect(files.length).toBeGreaterThan(3);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/from\s+["'][^"']*lib\/billing/);
      expect(source, file).not.toMatch(/import\(["'][^"']*lib\/billing/);
    }
  });
});
