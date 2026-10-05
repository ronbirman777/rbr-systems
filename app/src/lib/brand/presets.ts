import type { ProductTypeKey } from "./productFamilies";

/**
 * The canonical InnerDweS Brand presets - the single source of truth for
 * every product's Brand step (Time to Flow, Time to Teach and, later,
 * Time to Heal). Each preset is the full five-role brand model:
 *
 *   primary     buttons, highlights
 *   accent      dividers, soft details
 *   navigation  navigation / app background tint
 *   text        body text base
 *   surface     tint behind cards and pages
 *
 * Presets are a UI convenience only. Applying one writes those roles into the
 * product's existing colour fields (custom hex values), which stay fully
 * editable ("Custom colors"). Nothing new is persisted, no schema is involved,
 * and merely changing a preset here never rewrites a saved Space - a Space
 * only changes when its organizer explicitly clicks a preset.
 */
export type BrandPreset = {
  key: BrandPresetKey;
  label: string;
  primary: string;
  accent: string;
  navigation: string;
  text: string;
  surface: string;
};

export const BRAND_PRESET_KEYS = [
  "softSky",
  "sageLight",
  "deepNavy",
  "warmKhaki",
  "earthBrown",
  "dustyRose",
  "terracotta",
  "forest",
] as const;
export type BrandPresetKey = (typeof BRAND_PRESET_KEYS)[number];

export type BrandPresetProduct = Extract<ProductTypeKey, "retreat" | "teach" | "client_hub">;

export const CANONICAL_BRAND_PRESETS: readonly BrandPreset[] = [
  { key: "softSky", label: "Soft Sky", primary: "#5F7F8C", accent: "#B7CED6", navigation: "#EAF2F4", text: "#26343A", surface: "#F6FAFB" },
  { key: "sageLight", label: "Sage Light", primary: "#6F846C", accent: "#BAC5B2", navigation: "#E7EDE3", text: "#283229", surface: "#F5F7F2" },
  { key: "deepNavy", label: "Deep Navy", primary: "#2D4053", accent: "#91A8B8", navigation: "#E1E8ED", text: "#202B34", surface: "#F5F7F8" },
  { key: "warmKhaki", label: "Warm Khaki", primary: "#7B735E", accent: "#C8B98E", navigation: "#EEE8D8", text: "#373329", surface: "#F8F4EB" },
  { key: "earthBrown", label: "Earth Brown", primary: "#6A4B3A", accent: "#B58E72", navigation: "#E9DED5", text: "#34271F", surface: "#F7F1EC" },
  { key: "dustyRose", label: "Dusty Rose", primary: "#8B6268", accent: "#D7B4B7", navigation: "#F0E3E4", text: "#3A2B2E", surface: "#FAF5F5" },
  { key: "terracotta", label: "Terracotta", primary: "#A86750", accent: "#D6A28D", navigation: "#F1E1D8", text: "#3A2922", surface: "#FBF5F1" },
  { key: "forest", label: "Forest", primary: "#192B21", accent: "#BAC5B2", navigation: "#EBE1D5", text: "#232926", surface: "#F3EFE7" },
];

/** Every product resolves from the same registry. client_hub has no Brand UI yet. */
const REGISTRY: Record<BrandPresetProduct, readonly BrandPreset[]> = {
  retreat: CANONICAL_BRAND_PRESETS,
  teach: CANONICAL_BRAND_PRESETS,
  client_hub: CANONICAL_BRAND_PRESETS,
};

export function getBrandPresets(product: BrandPresetProduct): readonly BrandPreset[] {
  return REGISTRY[product];
}

export function findBrandPreset(product: BrandPresetProduct, key: string): BrandPreset | null {
  return REGISTRY[product].find((p) => p.key === key) ?? null;
}

const same = (a: string | null | undefined, b: string) => (a ?? "").toLowerCase() === b.toLowerCase();

/**
 * The preset whose roles all equal the current colours, if any. Strict: a
 * Space that only shares primary + accent (navigation/text derived or custom)
 * is "Custom colors", not the preset. `surface` is compared only when the
 * product persists one (Teach); Flow's background is fixed.
 */
export function matchBrandPreset(
  product: BrandPresetProduct,
  current: { primary: string | null; accent: string | null; navigation: string | null; text: string | null; surface?: string | null },
): BrandPreset | null {
  return (
    REGISTRY[product].find(
      (x) =>
        same(current.primary, x.primary) &&
        same(current.accent, x.accent) &&
        same(current.navigation, x.navigation) &&
        same(current.text, x.text) &&
        (current.surface === undefined || same(current.surface, x.surface)),
    ) ?? null
  );
}

export type BrandPresetColors = { primary: string; accent: string; navigation: string; text: string; surface?: string };

/**
 * The colour fields a preset click writes - the preset's full model.
 *
 * Since 028B every product persists a surface (Flow via the shared
 * brand_configs.custom_surface column added in 0032, Teach via its
 * existing teachStyle.background), so all five roles are written for all
 * of them. client_hub has no Brand UI yet and simply never calls this.
 */
export function presetColorUpdate(product: BrandPresetProduct, preset: BrandPreset): BrandPresetColors {
  void product;
  return {
    primary: preset.primary,
    accent: preset.accent,
    navigation: preset.navigation,
    text: preset.text,
    surface: preset.surface,
  };
}
