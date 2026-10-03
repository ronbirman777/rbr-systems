import { TEACH_PRESETS } from "@/lib/teach/style";
import type { ProductTypeKey } from "./productFamilies";

/**
 * Shared Brand preset architecture. A preset is a named starting point for
 * the colour roles every product's Brand step exposes. Presets are a UI
 * convenience only: applying one just populates the product's existing
 * colour fields (custom hex values), which stay fully editable - nothing
 * new is persisted and no schema is involved.
 *
 * Roles a preset may set: primary + accent are universal; background and
 * text are optional because not every product lets the organizer change
 * them (Time to Flow's Guest App uses the fixed InnerDweS base palette for
 * background/text; Time to Teach has a background colour).
 */
export type BrandPreset = {
  key: string;
  label: string;
  primary: string;
  accent: string;
  background?: string;
  text?: string;
};

export type BrandPresetProduct = Extract<ProductTypeKey, "retreat" | "teach" | "client_hub">;

const TEACH_BRAND_PRESETS: readonly BrandPreset[] = TEACH_PRESETS.map((p) => ({
  key: p.key,
  label: p.label,
  primary: p.primary,
  accent: p.accent,
  background: p.background,
}));

/** Time to Flow starter looks. Colours only; the Guest App base palette is fixed. */
const FLOW_BRAND_PRESETS: readonly BrandPreset[] = [
  { key: "forest", label: "Forest", primary: "#2D4A3E", accent: "#6B9478" },
  { key: "ocean", label: "Ocean", primary: "#3B6E8F", accent: "#C4785A" },
  { key: "clay", label: "Clay", primary: "#C4785A", accent: "#4A6B3B" },
  { key: "dusk", label: "Dusk", primary: "#5C4A6B", accent: "#C4A36A" },
  { key: "ember", label: "Ember", primary: "#8F3B3B", accent: "#6B9478" },
  { key: "stone", label: "Stone", primary: "#5C5249", accent: "#C4785A" },
];

const REGISTRY: Record<BrandPresetProduct, readonly BrandPreset[]> = {
  retreat: FLOW_BRAND_PRESETS,
  teach: TEACH_BRAND_PRESETS,
  // Time to Heal reuses the Flow starter set until it has its own.
  client_hub: FLOW_BRAND_PRESETS,
};

export function getBrandPresets(product: BrandPresetProduct): readonly BrandPreset[] {
  return REGISTRY[product];
}

export function findBrandPreset(product: BrandPresetProduct, key: string): BrandPreset | null {
  return REGISTRY[product].find((p) => p.key === key) ?? null;
}

/** The preset whose primary + accent match the current colours, if any. */
export function matchBrandPreset(
  product: BrandPresetProduct,
  current: { primary: string | null; accent: string | null },
): BrandPreset | null {
  if (!current.primary || !current.accent) return null;
  const p = current.primary.toLowerCase();
  const a = current.accent.toLowerCase();
  return REGISTRY[product].find((x) => x.primary.toLowerCase() === p && x.accent.toLowerCase() === a) ?? null;
}
