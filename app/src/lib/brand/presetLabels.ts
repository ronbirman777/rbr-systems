import type { BrandPresetKey } from "./presets";

/**
 * The dictionary key for each brand preset's NAME.
 *
 * The preset data in presets.ts keeps its English `label`, because that
 * data is shared with the publish path and pinned by brand.test.ts. The
 * name shown to an organizer comes from here instead, so a preset reads
 * in the Space's own language - it is design vocabulary, like the
 * typography and corner options, not a brand name.
 */
export type PresetLabelKey =
  | "presetSoftSky"
  | "presetSageLight"
  | "presetDeepNavy"
  | "presetWarmKhaki"
  | "presetEarthBrown"
  | "presetDustyRose"
  | "presetTerracotta"
  | "presetForest";

export const PRESET_LABEL: Record<BrandPresetKey, PresetLabelKey> = {
  softSky: "presetSoftSky",
  sageLight: "presetSageLight",
  deepNavy: "presetDeepNavy",
  warmKhaki: "presetWarmKhaki",
  earthBrown: "presetEarthBrown",
  dustyRose: "presetDustyRose",
  terracotta: "presetTerracotta",
  forest: "presetForest",
};
