import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { accountDictionary, translateAccount } from "@/lib/i18n/account";
import { SUPPORTED_LOCALES } from "@/lib/i18n/locales";
import { lifecycleUiCopy } from "./lifecycleUiCopy";

/**
 * TASK 032 C3: the remaining paid-mode dialog strings (Archive / Restore / Replace controls), the account-deletion
 * billing refusal and the guest-access / featured BILLING_LOCKED refusal are localized in all seven locales.
 */
const UI_KEYS = [
  "lifecycleArchiveButton", "lifecycleConfirmArchive", "lifecycleArchiving", "lifecycleRestoreButton", "lifecycleRestoring", "lifecycleReplaceButton",
  "lifecycleReplaceTitle", "lifecycleTypeNameLabel", "lifecycleNewNameLabel", "lifecycleDiscardReplace", "lifecycleReplacing", "lifecycleCancel",
] as const;
const MESSAGE_KEYS = ["studioLockedChangeRefused", "accountDeleteActiveSubscription", "accountDeleteBillingUnreadable"] as const;
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

describe("paid-mode dialog copy parity (7 locales)", () => {
  for (const locale of SUPPORTED_LOCALES) {
    it(`${locale}: every key present, non-empty, same placeholders as English, translated (not English)`, () => {
      const dict = accountDictionary("billing", locale);
      const en = accountDictionary("billing", "en");
      for (const key of [...UI_KEYS, ...MESSAGE_KEYS]) {
        expect(typeof dict[key], `${locale}.${key}`).toBe("string");
        expect(dict[key].trim().length, `${locale}.${key}`).toBeGreaterThan(1);
        expect(placeholders(dict[key]), `${locale}.${key}`).toEqual(placeholders(en[key]));
        if (locale !== "en") expect(dict[key], `${locale}.${key}`).not.toBe(en[key]);
      }
      expect(placeholders(dict.lifecycleTypeNameLabel)).toEqual(["space"]);
    });

    it(`${locale}: lifecycleUiCopy interpolates the exact Space name and leaves no placeholder`, () => {
      const name = "Lena Hoffmann – Return to Balance";
      const ui = lifecycleUiCopy(locale, name);
      expect(Object.keys(ui)).toHaveLength(UI_KEYS.length);
      expect(ui.typeNameLabel).toContain(name);
      for (const v of Object.values(ui)) expect(v).not.toMatch(/\{[a-z]+\}/i);
      // Archive vs Replace vs Restore must stay distinguishable in every language.
      expect(new Set([ui.archive, ui.replace, ui.restore, ui.cancel]).size).toBe(4);
    });
  }

  it("the billing-locked refusal no longer reuses the 'Payment required' heading (it also covers ended subscriptions)", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const d = accountDictionary("billing", locale);
      expect(d.studioLockedChangeRefused).not.toBe(d.studioSuspendedTitle);
      expect(d.studioLockedChangeRefused.length).toBeGreaterThan(d.studioSuspendedTitle.length);
    }
    expect(translateAccount("en", "billing", "accountDeleteActiveSubscription")).toMatch(/active subscription/i);
    expect(translateAccount("en", "billing", "accountDeleteActiveSubscription")).toMatch(/nothing was deleted/i);
  });
});

describe("call sites use the localized copy", () => {
  it("guest access and featured listing map BILLING_LOCKED (and the pre-check) to studioLockedChangeRefused", () => {
    for (const f of ["src/app/(site)/configurator/retreat/guestAccessActions.ts", "src/app/(site)/configurator/retreat/featuredActions.ts"]) {
      const src = read(f);
      expect(src).toContain('"billing", "studioLockedChangeRefused"');
      expect(src).not.toContain('"studioSuspendedTitle"');
    }
  });

  it("account deletion's billing refusal is translated in the account locale, not hard-coded English", () => {
    const src = read("src/app/(site)/(auth)/actions.ts");
    expect(src).toContain('"accountDeleteActiveSubscription"');
    expect(src).toContain('"accountDeleteBillingUnreadable"');
    expect(src).not.toContain("One of your Spaces still has an active subscription");
  });

  it("the lifecycle controls render buttons/labels from the ui copy; English literals live only in the legacy fallback", () => {
    const src = read("src/components/space-lifecycle-controls.tsx");
    const legacyStart = src.indexOf("function legacyUi(");
    const legacyEnd = src.indexOf("\n}", legacyStart);
    const outside = src.slice(0, legacyStart) + src.slice(legacyEnd);
    for (const literal of ['"Restoring…"', '"Archiving…"', '"Replacing…"', '"Confirm Archive"', '"Discard & Replace"', ">\n              Cancel\n", "Replace this Space\n", "New Space name\n"]) {
      expect(outside, literal).not.toContain(literal);
    }
    // The type-the-name confirmation still compares against the exact (untranslated) Space name.
    expect(src).toContain("typedName !== name");
    expect(src).toContain('<input type="hidden" name="expectedName" value={name} />');
    const page = read("src/app/(site)/space/page.tsx");
    expect(page).toContain("ui: lifecycleUiCopy(accountLocale, t.name)");
  });
});
