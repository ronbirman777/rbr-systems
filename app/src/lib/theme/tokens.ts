import { z } from "zod";

/**
 * The only two axes a customer can influence in the design system.
 *
 * PALETTE = color. ATMOSPHERE = presentation character (radius, surface warmth,
 * accent treatment, image treatment, spacing). Neither may touch navigation,
 * information architecture, or component layout - see brief section 11.
 */

export const PALETTES = {
  "forest-sage": { primary: "#1B2E24", secondary: "#8A9A86", label: "Forest Sage" },
  "warm-earth": { primary: "#7A4A28", secondary: "#C17A4A", label: "Warm Earth" },
  "soft-sand": { primary: "#A38A6B", secondary: "#E3D5C0", label: "Soft Sand" },
  "deep-forest": { primary: "#0F1F17", secondary: "#3E5C4B", label: "Deep Forest" },
} as const;

export type PaletteKey = keyof typeof PALETTES;

export const ATMOSPHERES = {
  "calm-organic": {
    label: "Calm & Organic",
    radiusScale: 1.3,
    surfaceWarmth: "soft",
    imageTreatment: "rounded",
    spacing: "generous",
  },
  "warm-earthy": {
    label: "Warm & Earthy",
    radiusScale: 1,
    surfaceWarmth: "warm",
    imageTreatment: "rounded",
    spacing: "cozy",
  },
  "clean-minimal": {
    label: "Clean & Minimal",
    radiusScale: 0.6,
    surfaceWarmth: "crisp",
    imageTreatment: "square",
    spacing: "tight",
  },
} as const;

export type AtmosphereKey = keyof typeof ATMOSPHERES;

/**
 * Product Completion phase - the 8 curated presets offered for BOTH
 * Primary and Accent Color (same list, exactly as the Figma Make
 * BrandScreen source presents them - colorPresets). Purely a UI
 * convenience; either color also accepts any custom hex via
 * customPrimary/customSecondary, which these presets simply populate.
 */
export const BRAND_COLOR_PRESETS = [
  { label: "Forest", hex: "#2D4A3E" },
  { label: "Sage", hex: "#6B9478" },
  { label: "Clay", hex: "#C4785A" },
  { label: "Ocean", hex: "#3B6E8F" },
  { label: "Dusk", hex: "#5C4A6B" },
  { label: "Ember", hex: "#8F3B3B" },
  { label: "Stone", hex: "#5C5249" },
  { label: "Moss", hex: "#4A6B3B" },
] as const;

/**
 * Time to Flow Visual Fidelity Phase 1 - the approved Guest App base
 * design system, extracted exactly from the Figma Make source of truth
 * (src/index.css's `@theme` block in the audited export). These are
 * InnerDweS-owned constants, not a customer-facing axis - unlike PALETTES
 * (still the only customer-controlled color choice this phase) and
 * ATMOSPHERES (still present for existing tenants, not customer-facing in
 * the approved UX - see deriveThemeVars), every tenant's Guest App uses
 * the exact same parchment/forest/sage/clay/sand/dusk/mist/cream values
 * beneath whatever primary color they've chosen. Do not add these to
 * brandConfigSchema or any organizer-facing control - the approved design
 * explicitly forbids exposing them as customization.
 */
export const GUEST_BASE_PALETTE = {
  parchment: "#F5F0E8",
  parchmentDeep: "#EAE2D0",
  forest: "#2D4A3E",
  forestMid: "#3D6355",
  sage: "#8FAF95",
  sagePale: "#C4D8C6",
  clay: "#C4785A",
  clayPale: "#DDA48C",
  sand: "#D4C5A9",
  dusk: "#6B6258",
  mist: "#9B8E84",
  cream: "#FDFAF4",
} as const;

/**
 * The approved two-role Guest App typography system (Figma source:
 * DM Serif Display for editorial/display moments, DM Sans for UI/body) -
 * wired to actual font loading in src/app/layout.tsx via next/font/google
 * as --font-dm-serif-display / --font-dm-sans. Referenced here as plain
 * CSS var() strings (not React font objects - this file has no "use
 * client"/server boundary of its own and stays framework-agnostic) so
 * deriveThemeVars can emit them without importing next/font.
 */
export const GUEST_FONT_DISPLAY = "var(--font-dm-serif-display), serif";
export const GUEST_FONT_UI = "var(--font-dm-sans), sans-serif";

const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .nullable();

export const brandConfigSchema = z.object({
  name: z.string().min(1).max(80),
  /** Tenant-media Storage reference (e.g. "{tenantId}/brand/logo/draft.webp")
   * - NOT a URL, signed or otherwise. Never persist a signed/temporary URL
   * here; resolve a display URL from this ref at render time instead, the
   * same way every other imageRef in this codebase works. Named logoRef
   * (not logoUrl) specifically so its type doesn't lie about what it
   * holds - see the brand_configs.logo_url -> logo_ref migration. */
  logoRef: z.string().nullable(),
  palette: z.enum(["forest-sage", "warm-earth", "soft-sand", "deep-forest"]),
  /** Optional organizer override of the palette's primary color, hex only. */
  customPrimary: hexColorSchema,
  /** Optional organizer override of the palette's accent/secondary color,
   * hex only - independent of customPrimary. Requires migration 0014
   * (brand_configs.custom_secondary) to actually persist; until then this
   * field parses and flows through deriveThemeVars correctly, but nothing
   * can save a non-null value to Production. */
  customSecondary: hexColorSchema,
  /** Final Brand Controls phase - Navigation/Tabs Color: overrides the
   * guest app's nav/tab active-state identity (bottom-nav active icon/
   * label/underline, Schedule's active date pill, and equivalent tab-like
   * active states). Falls back to the resolved primary when unset - see
   * deriveThemeVars. Persists via brand_configs.custom_navigation
   * (migration 0015). */
  customNavigation: hexColorSchema,
  /** Final Brand Controls phase - App Text Color: overrides the guest
   * app's main content text (page headings, card headings, session
   * titles, quote text, primary content labels) - never neutral
   * secondary captions, which stay derived/quiet for hierarchy. Falls
   * back to the resolved primary when unset. Persists via
   * brand_configs.custom_text (migration 0015). */
  customText: hexColorSchema,
  atmosphere: z.enum(["calm-organic", "warm-earthy", "clean-minimal"]),
  imageStyle: z.enum(["rounded", "square"]).optional(),
});

export type BrandConfig = z.infer<typeof brandConfigSchema>;
