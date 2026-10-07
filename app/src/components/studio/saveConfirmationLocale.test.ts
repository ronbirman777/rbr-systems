import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A save confirmation must be translated when it is RENDERED, never when
 * it is stored.
 *
 * THE BUG THIS CATCHES. Both setting cards did this:
 *
 *     setMessage(result.error ? { ok: false, text: result.error }
 *                             : { ok: true, text: t("common", "saved") });
 *
 * `t` is bound to the locale of the render that created the handler, and
 * the language card calls `setLocale(next)` on the same tick, so the
 * string was resolved against the OUTGOING language and then frozen in
 * state. On Production, switching to French said "Guardado", switching to
 * Hebrew said "Enregistré", and switching to German said "Saved" - the
 * confirmation was always exactly one language behind. It is the one
 * untranslated system string the Hebrew leak audit found.
 *
 * The invariant is structural, so it is asserted structurally: the
 * success branch may not carry text at all. Anything that stores a
 * translated string cannot re-translate when the locale changes, however
 * it is written.
 *
 * The error branch is exempt and deliberately so - that string comes back
 * from a server action and there is no key to resolve it from again.
 */

const CARDS = ["space-language-card.tsx", "space-country-card.tsx"];

describe("Studio save confirmations follow the current locale", () => {
  for (const file of CARDS) {
    const src = readFileSync(join(__dirname, file), "utf8");

    it(`${file} stores no translated text in message state`, () => {
      // The success shape is a bare flag.
      expect(src).toContain("{ ok: true }");
      // ...and never a resolved string alongside it.
      expect(src).not.toMatch(/ok:\s*true\s*,\s*text:/);
    });

    it(`${file} resolves "saved" at render time`, () => {
      // The call survives, but inside the JSX rather than the handler.
      expect(src).toContain('t("common", "saved")');
      const render = src.slice(src.indexOf("return ("));
      expect(render).toContain('t("common", "saved")');
    });

    it(`${file} keeps the server's error text as given`, () => {
      expect(src).toContain("{ ok: false, text: result.error }");
    });
  }
});
