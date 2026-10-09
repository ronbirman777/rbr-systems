import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * TASK 032: in paid mode the Archive / Replace confirmations must not talk about
 * "Space slots" (each paid Space is its own subscription). Legacy mode keeps the
 * Task 011 copy exactly. The dialogs only render after a click, so this checks the
 * source: every slot sentence sits in the legacy (paidMode false) branch.
 */
const source = readFileSync(path.join(process.cwd(), "src/components/space-lifecycle-controls.tsx"), "utf8");
const flat = source.replace(/\s+/g, " ");

describe("SpaceLifecycleControls copy (TASK 032 paid mode)", () => {
  it("takes a paidMode flag that defaults to the legacy copy and forwards it to both Replace dialogs", () => {
    expect(source).toContain("paidMode = false,");
    expect(source.match(/<ReplaceDialog [^>]*paidMode=\{paidMode\}/g)).toHaveLength(2);
  });

  it("legacy copy is unchanged (Task 011 text, in the non-paid branch)", () => {
    expect(flat).toContain(
      ": ( <p className=\"text-xs text-idw-forest/70 normal-case font-normal\"> Archiving &ldquo;{name}&rdquo; removes it from active/public use. It keeps using its Space slot — archiving does not free capacity for a new Space. Guests will no longer be able to reach it. </p> )}"
    );
    expect(flat).toContain(
      ": ( <p className=\"mt-2 text-[13px] leading-relaxed text-idw-forest/60\"> This discards &ldquo;{name}&rdquo;&apos;s existing content — its published version, schedule, and module content — and reuses the same Space slot for a new draft. This cannot be undone. Type the Space&apos;s current name to confirm. </p> )}"
    );
  });

  it("the paid-mode branches never mention a Space slot", () => {
    const branches = [...flat.matchAll(/\{paidMode \? \(([\s\S]*?)\) : \(/g)].map((m) => m[1]);
    expect(branches).toHaveLength(2);
    for (const b of branches) {
      expect(b.toLowerCase()).not.toContain("slot");
      expect(b).toContain("{name}");
    }
  });
});
