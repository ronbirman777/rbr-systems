import { BRAND_PRESET_KEYS, matchBrandPreset, type BrandPresetKey } from "./presets";

/**
 * TASK 033 Brand editor: the shared selection rules behind
 * BrandPaletteEditor, for Time to Flow and Time to Teach.
 *
 * Nothing here changes how colours are stored. Flow keeps its five
 * brand_configs columns (custom_primary, custom_secondary,
 * custom_navigation, custom_text, custom_surface); Teach keeps
 * brand_configs custom_primary/custom_secondary/custom_navigation/
 * custom_text plus teachStyle.background and teachStyle.preset.
 *
 *   mode "preset"  - the saved colours are one of the eight presets
 *   mode "custom"  - the organizer's own colours
 *   mode "default" - Flow only: nothing custom saved at all (a legacy
 *                    Space on its original palette); no preset is shown as
 *                    selected and nothing is rewritten
 */
export type PaletteMode = "preset" | "custom" | "default";
export type PaletteSelection = { mode: PaletteMode; selectedKey: BrandPresetKey | null };

const isPresetKey = (k: unknown): k is BrandPresetKey => typeof k === "string" && (BRAND_PRESET_KEYS as readonly string[]).includes(k);

/** Flow: derived from the saved colours (strict five-role match, case-insensitive). */
export function flowPaletteSelection(c: {
  primary: string | null;
  accent: string | null;
  navigation: string | null;
  text: string | null;
  surface: string | null;
}): PaletteSelection {
  const match = matchBrandPreset("retreat", c);
  if (match) return { mode: "preset", selectedKey: match.key };
  const anyCustom = [c.primary, c.accent, c.navigation, c.text, c.surface].some((v) => typeof v === "string" && v.trim() !== "");
  return { mode: anyCustom ? "custom" : "default", selectedKey: null };
}

/**
 * Teach: teachStyle.preset is what the organizer last chose. A known key is
 * that preset; "custom", a missing value or an unknown legacy key is custom
 * (the colours themselves are never touched by reading them).
 */
export function teachPaletteSelection(storedPreset: unknown): PaletteSelection {
  return isPresetKey(storedPreset) ? { mode: "preset", selectedKey: storedPreset } : { mode: "custom", selectedKey: null };
}

/** The custom section starts expanded only when the Space already uses custom colours. */
export function customSectionStartsOpen(selection: PaletteSelection): boolean {
  return selection.mode === "custom";
}

/**
 * Keep-last-custom. When the organizer leaves CUSTOM colours by picking a
 * preset, the colours they had are remembered in the editor (never saved
 * on their own) so "Restore my custom colours" can bring them back before
 * or after Save. Switching from one preset to another remembers nothing.
 */
export function stashOnPresetApply<T>(selection: PaletteSelection, current: T, previousStash: T | null): T | null {
  return selection.mode === "custom" ? current : previousStash;
}

/** Roving radio index for the preset cards: arrows wrap, Home/End jump. RTL mirrors left/right. */
export function nextPresetIndex(current: number, key: string, count: number, rtl = false): number | null {
  if (count <= 0) return null;
  const fwd = rtl ? "ArrowLeft" : "ArrowRight";
  const back = rtl ? "ArrowRight" : "ArrowLeft";
  if (key === fwd || key === "ArrowDown") return (current + 1) % count;
  if (key === back || key === "ArrowUp") return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}
