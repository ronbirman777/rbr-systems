import { GUEST_BASE_PALETTE } from "@/lib/theme/tokens";
import { CANONICAL_BRAND_PRESETS, findBrandPreset, type BrandPreset } from "@/lib/brand/presets";
import type { TEACH_LEGACY_PRESET_KEYS, TeachStyle } from "./schemas";

/**
 * Time to Teach's controlled visual layer. Colours still flow through the
 * shared theme engine (brand_configs.custom_primary/custom_secondary ->
 * deriveThemeVars, contrast-checked); everything here is a closed set of
 * tokens - never free-form CSS - so every combination stays responsive and
 * readable.
 */

/**
 * LEGACY Teach presets, kept ONLY so Spaces saved before the shared brand
 * registry (lib/brand/presets.ts) keep resolving their old preset key. They
 * are not offered in any UI. Saved colours live in brand_configs, so old
 * Spaces render exactly as saved regardless of this table.
 */
export type TeachLegacyPreset = { key: (typeof TEACH_LEGACY_PRESET_KEYS)[number]; label: string; primary: string; accent: string; background: string };

export const TEACH_LEGACY_PRESETS: readonly TeachLegacyPreset[] = [
  { key: "calm", label: "Calm", primary: "#5B7A6E", accent: "#C9A98A", background: "#F6F2EA" },
  { key: "earth", label: "Earth", primary: "#7A4E34", accent: "#C98B5E", background: "#F3ECE2" },
  { key: "sage", label: "Sage", primary: "#52745A", accent: "#C9B48C", background: "#F4F1E8" },
  { key: "sunrise", label: "Sunrise", primary: "#A9553A", accent: "#E0A95E", background: "#FBF4EA" },
  { key: "mediterranean", label: "Mediterranean", primary: "#2F5D7C", accent: "#D9A05B", background: "#F4EFE6" },
  { key: "deepForest", label: "Deep Forest", primary: "#1F3A2E", accent: "#8FAF95", background: "#EEF0E8" },
  { key: "light", label: "Light", primary: "#6E675D", accent: "#CFC4B4", background: "#FBF9F5" },
  { key: "sacred", label: "Sacred", primary: "#6A4C6B", accent: "#C9A36A", background: "#F5EFE8" },
  { key: "minimal", label: "Minimal", primary: "#2A2A28", accent: "#9A958C", background: "#FAFAF7" },
];

/** Resolve a persisted preset key: canonical presets first, then the legacy keys of older Spaces. */
export function presetByKey(key: string): { key: string; label: string; primary: string; accent: string; background: string } | null {
  const canonical = findBrandPreset("teach", key);
  if (canonical) return { key: canonical.key, label: canonical.label, primary: canonical.primary, accent: canonical.accent, background: canonical.surface };
  return TEACH_LEGACY_PRESETS.find((p) => p.key === key) ?? null;
}

/**
 * Colours a brand-new Teach Space starts with (full canonical model). Existing Spaces are never touched.
 * Forest: its primary keeps white button text at WCAG AA (several lighter presets do not).
 */
export const DEFAULT_TEACH_PRESET: BrandPreset = CANONICAL_BRAND_PRESETS.find((p) => p.key === "forest")!;

/** What the Studio shows for a Space that has no saved colours at all (pre-registry default); never written back. */
export const LEGACY_TEACH_FALLBACK: TeachLegacyPreset = TEACH_LEGACY_PRESETS[0];

export const TYPOGRAPHY_LABEL = { classic: "Classic", editorial: "Editorial", serene: "Serene", modern: "Modern" } as const;
export const CORNERS_LABEL = { soft: "Soft", rounded: "Rounded", minimal: "Minimal" } as const;
export const HERO_LABEL = { arch: "Arched window", circle: "Portrait circle", fullbleed: "Full-bleed" } as const;
export const QUOTE_LABEL = { editorial: "Editorial serif", card: "Card", line: "Minimal line" } as const;
export const OVERLAY_LABEL = { none: "None", soft: "Soft", rich: "Rich" } as const;
export const SPACING_LABEL = { compact: "Compact", balanced: "Balanced", airy: "Airy" } as const;
export const TEXTURE_LABEL = { none: "None", grain: "Paper grain", linen: "Linen" } as const;
export const DIVIDER_LABEL = { none: "None", breath: "Breath line", wave: "Wave", leaf: "Leaf dot" } as const;

/** Display faces only; body/UI text always stays DM Sans (or Geist for "modern"). */
const DISPLAY_FONT: Record<TeachStyle["typography"], string> = {
  classic: "var(--font-dm-serif-display), Georgia, serif",
  editorial: "var(--font-fraunces), Georgia, serif",
  serene: "var(--font-tt-cormorant), Georgia, serif",
  modern: "var(--font-tt-lora), Georgia, serif",
};
const BODY_FONT: Record<TeachStyle["typography"], string> = {
  classic: "var(--font-dm-sans), system-ui, sans-serif",
  editorial: "var(--font-dm-sans), system-ui, sans-serif",
  serene: "var(--font-dm-sans), system-ui, sans-serif",
  modern: "var(--font-geist-sans), system-ui, sans-serif",
};
/** Cormorant reads small; nudge its display sizes up so headings stay legible. */
const DISPLAY_SCALE: Record<TeachStyle["typography"], string> = { classic: "1", editorial: "0.96", serene: "1.12", modern: "0.94" };
const CARD_RADIUS: Record<TeachStyle["corners"], number> = { soft: 28, rounded: 20, minimal: 6 };
const SECTION_GAP: Record<TeachStyle["spacing"], number> = { compact: 20, balanced: 28, airy: 40 };
const OVERLAY_ALPHA: Record<TeachStyle["overlay"], number> = { none: 0, soft: 0.28, rich: 0.5 };

export function teachStyleVars(style: TeachStyle): Record<string, string> {
  const radius = CARD_RADIUS[style.corners];
  return {
    "--tt-bg": style.background ?? GUEST_BASE_PALETTE.parchment,
    "--tt-surface": "#FDFAF4",
    "--tt-line": "#E6DDCD",
    "--tt-font-display": DISPLAY_FONT[style.typography],
    "--tt-font-body": BODY_FONT[style.typography],
    "--tt-display-scale": DISPLAY_SCALE[style.typography],
    "--tt-radius-card": `${radius}px`,
    "--tt-radius-image": `${Math.max(4, radius - 6)}px`,
    "--tt-radius-pill": style.corners === "minimal" ? "8px" : "999px",
    "--tt-section-gap": `${SECTION_GAP[style.spacing]}px`,
    "--tt-overlay": String(OVERLAY_ALPHA[style.overlay]),
  };
}

/** Subtle background textures as data-URI SVG noise/weave - no external assets. */
export function textureBackground(texture: TeachStyle["texture"]): string | undefined {
  if (texture === "grain") {
    return "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .35 0 0 0 0 .3 0 0 0 0 .25 0 0 0 .05 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";
  }
  if (texture === "linen") {
    return "repeating-linear-gradient(0deg, rgba(90,75,60,.035) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(90,75,60,.03) 0 1px, transparent 1px 4px)";
  }
  return undefined;
}
