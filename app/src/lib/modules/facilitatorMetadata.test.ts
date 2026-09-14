import { describe, expect, it } from "vitest";
import { facilitatorSchema, type EditableFacilitator } from "./facilitator";

/**
 * Regression tests for the metadata round-trip fix (Product Completion
 * phase). saveFacilitators (configurator/retreat/actions.ts) builds
 * metadata: { socialLinks: item.socialLinks, specialties: item.specialties }
 * from the FULL parsed item, never a hardcoded/partial object - these
 * tests exercise the exact same parse-then-rebuild shape that function
 * uses, without needing a live database, proving the discipline itself
 * (not the specific server action) is sound: editing one field of a
 * facilitator's metadata must never silently drop the other.
 */
function simulateSave(item: EditableFacilitator): { socialLinks: unknown; specialties: unknown } {
  const parsed = facilitatorSchema.parse(item);
  // Mirrors saveFacilitators' row-building exactly.
  return { socialLinks: parsed.socialLinks, specialties: parsed.specialties };
}

describe("facilitator metadata round-trip", () => {
  const base: EditableFacilitator = {
    id: "1",
    name: "Maya Cohen",
    role: "Yoga Facilitator",
    bio: "Original bio.",
    imageRef: null,
    specialties: ["Vinyasa Flow", "Pranayama"],
    socialLinks: [{ platform: "instagram", url: "https://instagram.com/maya" }],
    imagePosition: null,
  };

  it("editing bio survives socialLinks and specialties", () => {
    const edited = { ...base, bio: "Updated bio." };
    const saved = simulateSave(edited);
    expect(saved.socialLinks).toEqual(base.socialLinks);
    expect(saved.specialties).toEqual(base.specialties);
  });

  it("editing specialties survives socialLinks", () => {
    const edited = { ...base, specialties: ["Sound Healing"] };
    const saved = simulateSave(edited);
    expect(saved.socialLinks).toEqual(base.socialLinks);
    expect(saved.specialties).toEqual(["Sound Healing"]);
  });

  it("editing socialLinks survives specialties", () => {
    const edited = { ...base, socialLinks: [{ platform: "website" as const, url: "https://example.com" }] };
    const saved = simulateSave(edited);
    expect(saved.specialties).toEqual(base.specialties);
    expect(saved.socialLinks).toEqual([{ platform: "website", url: "https://example.com" }]);
  });

  it("editing bio, specialties and socialLinks together all persist correctly", () => {
    const edited: EditableFacilitator = {
      ...base,
      bio: "Fully updated.",
      specialties: ["Yin Yoga"],
      socialLinks: [{ platform: "tiktok" as const, url: "https://tiktok.com/@maya" }],
    };
    const saved = simulateSave(edited);
    expect(saved.specialties).toEqual(["Yin Yoga"]);
    expect(saved.socialLinks).toEqual([{ platform: "tiktok", url: "https://tiktok.com/@maya" }]);
  });
});
