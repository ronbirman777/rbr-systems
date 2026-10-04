import { COUNTRIES, findCountry } from "@/lib/countries";

/**
 * The one place this codebase parses, validates and formats a phone
 * number. It replaces three rules that had drifted apart:
 *
 *   lib/countries.ts        isLikelyValidNationalNumber   4-14 national digits
 *   lib/teach/links.ts      telUrl                        6-16 digits
 *   lib/share/whatsapp.ts   normalizeWhatsAppNumber       8-15 digits
 *
 * Unifying them is NOT the same as narrowing them. Stored phone values
 * are free text written by organizers over months, and Contact-module
 * visibility is derived from whether a stored value still produces a link
 * (lib/teach/moduleVisibility.ts). A stricter rule applied to the read
 * path would silently hide live Contact modules, so there are two named
 * policies and `lenient` is a strict superset of `strict`:
 *
 *   strict    what NEW input must satisfy. Real E.164: a recognised
 *             calling code and 7-15 total digits.
 *   lenient   what an ALREADY STORED value may be when building a link.
 *             6-16 digits, the union of every rule that shipped before.
 *
 * WhatsApp keeps its own 8-15 bound because that is wa.me's constraint,
 * not ours - see whatsappDigits.
 *
 * This is deliberately not libphonenumber: no per-country length tables
 * or carrier metadata, and no new dependency. It validates shape and
 * calling code, never that a number is in service.
 */

export const E164_MAX_DIGITS = 15; // ITU-T E.164
const STRICT_MIN_DIGITS = 7;
const LENIENT_MIN_DIGITS = 6;
const LENIENT_MAX_DIGITS = 16;

export type ParsedPhone = {
  /** Canonical storage/link form, e.g. "+972501234567". */
  e164: string;
  /** Calling code digits without "+", e.g. "972". */
  callingCode: string;
  /** Everything after the calling code, trunk prefix already removed. */
  nationalNumber: string;
  /**
   * Best-effort ISO country. Null when the calling code is shared and the
   * number alone cannot identify one - "+1" is 26 territories, so claiming
   * a country there would be a guess, not a parse.
   */
  country: string | null;
};

/** Calling codes longest-first, so "+1" never shadows "+1 876"-style longer codes. */
const CALLING_CODES: readonly { digits: string; countries: string[] }[] = (() => {
  const byDigits = new Map<string, string[]>();
  for (const c of COUNTRIES) {
    const digits = c.dialCode.slice(1);
    const list = byDigits.get(digits);
    if (list) list.push(c.code);
    else byDigits.set(digits, [c.code]);
  }
  return [...byDigits.entries()]
    .map(([digits, countries]) => ({ digits, countries }))
    .sort((a, b) => b.digits.length - a.digits.length);
})();

/**
 * Countries where a leading zero is part of the national number rather
 * than a trunk prefix to strip. Italy is the well-known case: Rome is
 * +39 06..., and dropping that 0 produces an unreachable number.
 *
 * Everywhere else this module treats one leading zero as a trunk prefix,
 * which is the common case (IL 05x, GB 07x, DE 01x all drop it). This is
 * a pragmatic rule, not full E.164 metadata - documented as such.
 */
const LEADING_ZERO_IS_SIGNIFICANT = new Set(["IT", "VA"]);

/** Every digit, discarding spaces, dashes, brackets and any other separator. */
export function phoneDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function stripInternationalPrefix(raw: string): { rest: string; wasInternational: boolean } {
  const trimmed = (raw ?? "").trim();
  if (trimmed.startsWith("+")) return { rest: phoneDigits(trimmed), wasInternational: true };
  const digits = phoneDigits(trimmed);
  // "00" is the international access prefix in most of the world.
  if (digits.startsWith("00")) return { rest: digits.slice(2), wasInternational: true };
  return { rest: digits, wasInternational: false };
}

function splitCallingCode(digits: string): { callingCode: string; nationalNumber: string; countries: string[] } | null {
  for (const entry of CALLING_CODES) {
    if (digits.startsWith(entry.digits) && digits.length > entry.digits.length) {
      return { callingCode: entry.digits, nationalNumber: digits.slice(entry.digits.length), countries: entry.countries };
    }
  }
  return null;
}

function dropTrunkPrefix(nationalNumber: string, country: string | null): string {
  if (!nationalNumber.startsWith("0")) return nationalNumber;
  if (country && LEADING_ZERO_IS_SIGNIFICANT.has(country)) return nationalNumber;
  return nationalNumber.replace(/^0+/, "");
}

/**
 * Parses user input into canonical E.164.
 *
 * An international number (leading "+" or "00") identifies its own
 * country and `defaultCountry` is ignored - pasting "+49 170 1234567"
 * while Israel is selected gives a German number, not a mangled one.
 * Otherwise the input is treated as a national number for
 * `defaultCountry`, with a trunk prefix removed.
 *
 * Returns null when the input cannot be a valid number; callers decide
 * whether that is an error (new input) or simply "no link" (stored value).
 */
export function parsePhone(
  input: string | null | undefined,
  options: { defaultCountry?: string | null } = {}
): ParsedPhone | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  // Letters are never part of a number here; reject rather than silently
  // discard them, so "call me on 050..." is not accepted as a phone.
  if (/[a-z]/i.test(raw)) return null;

  const { rest, wasInternational } = stripInternationalPrefix(raw);
  if (!rest) return null;

  if (wasInternational) {
    const split = splitCallingCode(rest);
    if (!split) return null;
    const country = split.countries.length === 1 ? split.countries[0] : null;
    const national = dropTrunkPrefix(split.nationalNumber, country);
    return finish(split.callingCode, national, country);
  }

  const country = findCountry(options.defaultCountry ?? null);
  if (!country) return null;
  const national = dropTrunkPrefix(rest, country.code);
  return finish(country.dialCode.slice(1), national, country.code);
}

function finish(callingCode: string, nationalNumber: string, country: string | null): ParsedPhone | null {
  if (!nationalNumber) return null;
  const e164 = `+${callingCode}${nationalNumber}`;
  const total = callingCode.length + nationalNumber.length;
  if (total < STRICT_MIN_DIGITS || total > E164_MAX_DIGITS) return null;
  return { e164, callingCode, nationalNumber, country };
}

/** Strict: what new input must satisfy before it is saved. */
export function isValidPhone(input: string | null | undefined, options: { defaultCountry?: string | null } = {}): boolean {
  return parsePhone(input, options) !== null;
}

/** Canonical form for storage and links, or null when not parseable. */
export function toE164(input: string | null | undefined, options: { defaultCountry?: string | null } = {}): string | null {
  return parsePhone(input, options)?.e164 ?? null;
}

/**
 * Lenient: a value already in the database that should still produce a
 * link. Accepts the union of every rule that shipped before this module,
 * so no Contact method that works today stops working. Returns the digits
 * with any international prefix removed, or null.
 */
export function storedPhoneDigits(value: string | null | undefined): string | null {
  const { rest } = stripInternationalPrefix(value ?? "");
  if (!rest) return null;
  return rest.length >= LENIENT_MIN_DIGITS && rest.length <= LENIENT_MAX_DIGITS ? rest : null;
}

/**
 * Digits for a wa.me link. 8-15 is WhatsApp's own accepted range, and is
 * kept byte-for-byte identical to the rule that shipped before, because
 * Teach derives Contact-module visibility from whether this returns a
 * value - narrowing it would hide live modules.
 */
export function whatsappDigits(value: string | null | undefined): string | null {
  const { rest } = stripInternationalPrefix(value ?? "");
  return /^\d{8,15}$/.test(rest) ? rest : null;
}

/**
 * Readable form, kept separate from the canonical stored value: national
 * digits grouped in threes after the calling code. Deliberately simple -
 * real per-country grouping needs metadata this module does not carry,
 * and a wrong-but-confident format reads worse than a plain one.
 */
export function formatPhoneDisplay(input: string | null | undefined, options: { defaultCountry?: string | null } = {}): string {
  const parsed = parsePhone(input, options);
  if (!parsed) return (input ?? "").trim();
  const grouped = parsed.nationalNumber.replace(/(\d{3})(?=\d)/g, "$1 ");
  return `+${parsed.callingCode} ${grouped}`.trim();
}

/**
 * The phone country a picker should preselect for a Space in `country`.
 * A suggestion only: the organizer can pick any other, and changing the
 * Space country never rewrites a number that is already stored.
 */
export function suggestedPhoneCountry(spaceCountry: string | null | undefined): string | null {
  return findCountry(spaceCountry ?? null)?.code ?? null;
}

/**
 * tel: link for a value already stored by an organizer. Uses the lenient
 * policy, so every number that dials today still dials; new input is held
 * to the strict rule where it is entered.
 *
 * A stored "+" or "00" prefix means the organizer intended an
 * international number, so the link keeps "+". A bare national number
 * stays national - rewriting it would require guessing a country.
 */
export function telUrl(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const digits = storedPhoneDigits(trimmed);
  if (!digits) return null;
  return /^\+|^00/.test(trimmed) ? `tel:+${digits}` : `tel:${digits}`;
}
