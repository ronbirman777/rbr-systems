import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STUDIO_REORDER_BUTTON_CLASS, STUDIO_REORDER_COLUMN_CLASS } from "@/app/(site)/configurator/retreat/studio-ui";

const SRC = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

/**
 * Two layout invariants that only a browser could catch, pinned here so a
 * refactor cannot quietly undo them.
 */
describe("Explore tile titles wrap instead of being cut", () => {
  const explore = read("components/guest/explore-screen.tsx");

  it("clamps the SolidTile title to two lines rather than truncating it", () => {
    // `truncate` cut every module name too long for a half-width tile. At
    // 320px that was most of them in every language, English included,
    // and German "Meine Aufnahmen" and Spanish "Sigue en contacto" still
    // lost their ends at 390. The tile is 140px tall with a 32px icon and
    // 16px padding, so two lines of 18px at leading-tight fit with room to
    // spare - the fix is layout, and the approved translations are
    // untouched.
    expect(explore).toContain("line-clamp-2 break-words");
    expect(explore).not.toContain("leading-tight mt-0.5 truncate");
  });

  it("leaves the wider EntryCard title alone", () => {
    // EntryCard is full-width and never truncated; nothing to fix there,
    // and changing it would be an unrelated visual edit.
    expect(explore).toContain('${compact ? "text-[18px]" : "text-[24px]"} leading-tight mt-0.5 text-white');
  });
});

describe("reorder controls are reachable by keyboard", () => {
  it("tile a 44x44 column as two real halves", () => {
    expect(STUDIO_REORDER_COLUMN_CLASS).toContain("w-11");
    expect(STUDIO_REORDER_BUTTON_CLASS).toContain("w-11");
    expect(STUDIO_REORDER_BUTTON_CLASS).toContain("h-[22px]");
    // No pseudo-element hit area may come back: one that overflows its own
    // element is what made "move up" move the item down.
    expect(STUDIO_REORDER_BUTTON_CLASS).not.toContain("after:");
  });

  it("show a focus ring to keyboard users, inset so it cannot be mistaken for the sibling", () => {
    expect(STUDIO_REORDER_BUTTON_CLASS).toContain("focus-visible:outline");
    expect(STUDIO_REORDER_BUTTON_CLASS).toContain("focus-visible:-outline-offset-2");
  });

  it("carry a name, since the glyph alone is not one", () => {
    for (const file of [
      "app/(site)/configurator/retreat/faq-step.tsx",
      "app/(site)/configurator/retreat/custom-pages-step.tsx",
      "app/(site)/configurator/retreat/stay-connected-step.tsx",
    ]) {
      const src = read(file);
      expect(src, file).toContain('aria-label={t("studio", "moveUp")}');
      expect(src, file).toContain('aria-label={t("studio", "moveDown")}');
    }
  });
});
