import { describe, expect, it } from "vitest";
import {
  formatPhoneDisplay,
  isValidPhone,
  parsePhone,
  storedPhoneDigits,
  suggestedPhoneCountry,
  telUrl,
  toE164,
  whatsappDigits,
} from "./index";
import { whatsappUrl, normalizeWhatsAppNumber } from "@/lib/share/whatsapp";
import { contactHref } from "@/lib/teach/links";

describe("parsing national input against a selected country", () => {
  it("parses Israel, Germany and a +1 region from national digits", () => {
    expect(toE164("501234567", { defaultCountry: "IL" })).toBe("+972501234567");
    expect(toE164("17012345678", { defaultCountry: "DE" })).toBe("+4917012345678");
    expect(toE164("4155551234", { defaultCountry: "US" })).toBe("+14155551234");
  });

  it("drops a national trunk prefix", () => {
    expect(toE164("0501234567", { defaultCountry: "IL" })).toBe("+972501234567");
    expect(toE164("07700900123", { defaultCountry: "GB" })).toBe("+447700900123");
  });

  it("keeps a leading zero where it is part of the number, not a trunk prefix", () => {
    // Rome is +39 06..., so stripping the 0 would produce an unreachable number.
    expect(toE164("0612345678", { defaultCountry: "IT" })).toBe("+390612345678");
  });

  it("ignores separators and spacing", () => {
    expect(toE164("(050) 123-4567", { defaultCountry: "IL" })).toBe("+972501234567");
    expect(toE164("  050 123 4567  ", { defaultCountry: "IL" })).toBe("+972501234567");
  });

  it("refuses letters rather than silently discarding them", () => {
    expect(toE164("call me on 0501234567", { defaultCountry: "IL" })).toBeNull();
    expect(toE164("050-CALL-NOW", { defaultCountry: "IL" })).toBeNull();
  });

  it("needs a country for a national number", () => {
    expect(toE164("501234567", {})).toBeNull();
    expect(toE164("501234567", { defaultCountry: "ZZ" })).toBeNull();
  });
});

describe("international input identifies its own country", () => {
  it("honours a pasted + number over the selected country", () => {
    const parsed = parsePhone("+49 170 1234567", { defaultCountry: "IL" })!;
    expect(parsed.e164).toBe("+491701234567");
    expect(parsed.country).toBe("DE");
    expect(parsed.callingCode).toBe("49");
  });

  it("accepts the 00 international access prefix", () => {
    expect(toE164("0049 170 1234567", { defaultCountry: "IL" })).toBe("+491701234567");
  });

  it("leaves the country unresolved for a shared calling code rather than guessing", () => {
    // +1 is 26 NANP territories; naming one would be a guess, not a parse.
    const parsed = parsePhone("+1 415 555 1234")!;
    expect(parsed.e164).toBe("+14155551234");
    expect(parsed.callingCode).toBe("1");
    expect(parsed.country).toBeNull();
  });

  it("prefers the longest matching calling code", () => {
    // 972 must win over 97, and 1 must not swallow a longer code.
    expect(parsePhone("+972501234567")!.callingCode).toBe("972");
    expect(parsePhone("+35385123456")!.country).toBe("IE");
  });

  it("treats Kosovo's +383 as an ordinary calling code", () => {
    // The ISO-assignment caveat is a dataset concern; phone handling must
    // not special-case it.
    expect(toE164("44123456", { defaultCountry: "XK" })).toBe("+38344123456");
    const parsed = parsePhone("+383 44 123 456")!;
    expect(parsed.callingCode).toBe("383");
    expect(parsed.country).toBe("XK");
  });

  it("rejects an unassigned calling code", () => {
    expect(toE164("+999123456789")).toBeNull();
  });
});

describe("E.164 bounds", () => {
  it("rejects numbers past the 15-digit maximum", () => {
    expect(toE164("+9721234567890123")).toBeNull();
    expect(isValidPhone("1234567890123", { defaultCountry: "IL" })).toBe(false);
  });

  it("rejects an empty or prefix-only value", () => {
    for (const v of ["", "   ", "+", "00", null, undefined]) {
      expect(toE164(v as string, { defaultCountry: "IL" })).toBeNull();
    }
  });
});

describe("backward compatibility: nothing that links today stops linking", () => {
  // The read path must stay at least as permissive as the three rules
  // that shipped before. Teach derives Contact-module visibility from
  // whether a stored value produces a link, so narrowing it would hide
  // live modules on real Spaces.
  const legacyStored = [
    "+972501234567",
    "0501234567",
    "+1 (415) 555-1234",
    "00972501234567",
    "972501234567",
    "123456", // 6 digits - the old telUrl floor
    "+44 7700 900123",
  ];

  it("still produces a tel: link for every legacy stored shape", () => {
    for (const value of legacyStored) {
      expect(telUrl(value), value).not.toBeNull();
    }
  });

  it("keeps the WhatsApp accepted range byte-identical to the shipped rule", () => {
    // 8-15 digits, "+"/"00" tolerated - exactly the previous behaviour.
    expect(whatsappDigits("+972501234567")).toBe("972501234567");
    expect(whatsappDigits("00972501234567")).toBe("972501234567");
    expect(whatsappDigits("1234567")).toBeNull(); // 7 - below WhatsApp's floor
    expect(whatsappDigits("12345678")).toBe("12345678"); // 8 - at the floor
    expect(whatsappDigits("1234567890123456")).toBeNull(); // 16 - above the ceiling
    expect(normalizeWhatsAppNumber("+972 50 123 4567")).toBe("972501234567");
  });

  it("keeps Teach contact hrefs working for legacy values", () => {
    expect(contactHref("whatsapp", "+972501234567")).toBe("https://wa.me/972501234567");
    expect(contactHref("phone", "0501234567")).toBe("tel:0501234567");
    expect(whatsappUrl("+972501234567", "hi")).toContain("https://wa.me/972501234567?text=");
  });

  it("preserves national vs international intent in tel: links", () => {
    // A bare national number stays national; rewriting it would need a
    // country we do not have.
    expect(telUrl("0501234567")).toBe("tel:0501234567");
    expect(telUrl("+972501234567")).toBe("tel:+972501234567");
    // "00" dials internationally only from its origin country, so it is
    // normalised to "+" - a deliberate improvement, not a regression.
    expect(telUrl("00972501234567")).toBe("tel:+972501234567");
  });

  it("returns no link at all for junk, so a dead button is never rendered", () => {
    for (const value of ["", "   ", "abc", "12345", null, undefined]) {
      expect(storedPhoneDigits(value as string), String(value)).toBeNull();
      expect(telUrl(value as string), String(value)).toBeNull();
    }
  });
});

describe("display formatting is separate from canonical storage", () => {
  it("groups the national part without touching the stored value", () => {
    expect(formatPhoneDisplay("+972501234567")).toBe("+972 501 234 567");
    expect(toE164("+972501234567")).toBe("+972501234567");
  });

  it("echoes unparseable input rather than blanking what someone typed", () => {
    expect(formatPhoneDisplay("not a number")).toBe("not a number");
  });
});

describe("country suggestion never rewrites", () => {
  it("suggests the Space country as the phone country", () => {
    expect(suggestedPhoneCountry("IL")).toBe("IL");
    expect(suggestedPhoneCountry("de")).toBe("DE");
    expect(suggestedPhoneCountry("ZZ")).toBeNull();
    expect(suggestedPhoneCountry(null)).toBeNull();
  });

  it("is only a suggestion - an explicit country still wins", () => {
    // Same digits, different selected country, different result: nothing
    // is rewritten behind the user's back.
    expect(toE164("1701234567", { defaultCountry: "DE" })).toBe("+491701234567");
    expect(toE164("1701234567", { defaultCountry: "GB" })).toBe("+441701234567");
  });
});
