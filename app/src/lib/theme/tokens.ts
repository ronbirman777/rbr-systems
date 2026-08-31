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

export const brandConfigSchema = z.object({
  name: z.string().min(1).max(80),
  logoUrl: z.string().url().nullable(),
  palette: z.enum(["forest-sage", "warm-earth", "soft-sand", "deep-forest"]),
  /** Optional customer override of the palette's primary color, hex only. */
  customPrimary: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable(),
  atmosphere: z.enum(["calm-organic", "warm-earthy", "clean-minimal"]),
  imageStyle: z.enum(["rounded", "square"]).optional(),
});

export type BrandConfig = z.infer<typeof brandConfigSchema>;
