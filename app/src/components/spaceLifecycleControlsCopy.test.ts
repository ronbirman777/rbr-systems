import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SUPPORTED_LOCALES } from "@/lib/i18n/locales";
import { accountDictionary, translateAccount } from "@/lib/i18n/account";

/**
 * TASK 032: in paid mode the Archive / Replace confirmations must not talk about
 * "Space slots" (each paid Space is its own subscription). Legacy mode keeps the
 * Task 011 copy exactly. The dialogs only render after a click, so this checks the
 * source: every slot sentence sits in the legacy (paidMode false) branch.
 */
const source = readFileSync(path.join(process.cwd(), "src/components/space-lifecycle-controls.tsx"), "utf8");
const flat = source.replace(/\s+/g, " ");

describe("SpaceLifecycleControls copy (TASK 032 paid mode)", () => {
  it("takes already-translated paid copy that defaults to the legacy text and forwards it to both Replace dialogs", () => {
    expect(source).toContain("paidCopy = null,");
    expect(source.match(/<ReplaceDialog [^>]*paidCopy=\{paidCopy\}/g)).toHaveLength(2);
  });

  it("legacy copy is unchanged (Task 011 text, in the non-paid branch)", () => {
    expect(flat).toContain(
      ": ( <p className=\"text-xs text-idw-forest/70 normal-case font-normal\"> Archiving &ldquo;{name}&rdquo; removes it from active/public use. It keeps using its Space slot — archiving does not free capacity for a new Space. Guests will no longer be able to reach it. </p> )}"
    );
    expect(flat).toContain(
      ": ( <p className=\"mt-2 text-[13px] leading-relaxed text-idw-forest/60\"> This discards &ldquo;{name}&rdquo;&apos;s existing content — its published version, schedule, and module content — and reuses the same Space slot for a new draft. This cannot be undone. Type the Space&apos;s current name to confirm. </p> )}"
    );
  });

  it("the paid-mode branches render only the translated copy, with its lang/dir (no English literal in the component)", () => {
    const branches = [...flat.matchAll(/\{paidCopy \? \(([\s\S]*?)\) : \(/g)].map((m) => m[1]);
    expect(branches).toHaveLength(2);
    expect(branches[0]).toContain("{paidCopy.archiveBody}");
    expect(branches[1]).toContain("{paidCopy.replaceBody}");
    for (const b of branches) {
      expect(b).toContain("lang={paidCopy.lang} dir={paidCopy.dir}");
      // Nothing but markup and the expression: no hard-coded English words left in the branch.
      expect(b.replace(/<[^>]*>|\{[^}]*\}/g, "").trim()).toBe("");
    }
    expect(flat).not.toContain("Archiving does not cancel its subscription");
    expect(flat).not.toContain("starts a new draft in the same Space");
  });

  it("My Spaces passes the paid copy from the billing namespace in the account locale", () => {
    const page = readFileSync(path.join(process.cwd(), "src/app/(site)/space/page.tsx"), "utf8");
    expect(page).toContain('translateAccount(accountLocale, "billing", "lifecycleArchivePaidBody", { space: t.name })');
    expect(page).toContain('translateAccount(accountLocale, "billing", "lifecycleReplacePaidBody", { space: t.name })');
    expect(page).toMatch(/lang: accountLocale,\s*dir: directionOf\(accountLocale\)/);
  });
});

describe("paid lifecycle copy exists in all seven locales", () => {
  const keys = ["lifecycleArchivePaidBody", "lifecycleReplacePaidBody"] as const;
  for (const locale of SUPPORTED_LOCALES) {
    for (const key of keys) {
      it(`${locale}: ${key} is present, non-empty, keeps {space} and never mentions a slot`, () => {
        const raw = accountDictionary("billing", locale)[key];
        expect(typeof raw).toBe("string");
        expect(raw.trim().length).toBeGreaterThan(20);
        expect(raw.match(/\{space\}/g)).toHaveLength(1);
        expect(raw.toLowerCase()).not.toMatch(/slot|platz|plaza|emplacement|יחידת|slot|yuva/);
        const out = translateAccount(locale, "billing", key, { space: "Lena Hoffmann" });
        expect(out).toContain("Lena Hoffmann");
        expect(out).not.toMatch(/\{[a-z]+\}/i);
        if (locale !== "en") expect(raw).not.toBe(accountDictionary("billing", "en")[key]);
      });
    }
  }
});
