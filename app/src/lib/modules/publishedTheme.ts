import { z } from "zod";

/**
 * The published_spaces.theme shape, and the brand-level media block
 * inside published_spaces.modules.brand - extracted from
 * published-space-screen.tsx so both are independently testable (old vs.
 * new snapshot parsing, see publishedTheme.test.ts).
 *
 * customPrimary/customSecondary and the whole brandMediaSchema object are
 * optional specifically so a snapshot published before migration 0014
 * existed - which has none of these keys at all - still parses cleanly.
 * zod only fails a field that's present but wrong-shaped, never one
 * that's simply absent, when the field itself is optional/has a default.
 * This is what lets an existing tenant's already-published Guest App keep
 * rendering without being forced to republish.
 */
export const publishedThemeSchema = z.object({
  palette: z.enum(["forest-sage", "warm-earth", "soft-sand", "deep-forest"]),
  atmosphere: z.enum(["calm-organic", "warm-earthy", "clean-minimal"]),
  imageStyle: z.enum(["rounded", "square"]).optional(),
  customPrimary: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  customSecondary: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  /** Final Brand Controls phase - Navigation/Tabs Color and App Text
   * Color (migration 0015). Both optional for the exact same reason as
   * customPrimary/customSecondary above: any snapshot published before
   * 0015 has none of these keys at all, so parsing must succeed on their
   * total absence, not just on a present-but-null value. */
  customNavigation: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  customText: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
});

export type PublishedTheme = z.infer<typeof publishedThemeSchema>;

export const DEFAULT_PUBLISHED_THEME: PublishedTheme = {
  palette: "forest-sage",
  atmosphere: "calm-organic",
  imageStyle: "rounded",
  customPrimary: null,
  customSecondary: null,
  customNavigation: null,
  customText: null,
};

export const brandMediaSchema = z.object({
  hero: z.object({ imageRef: z.string().nullable() }).optional(),
  space: z.object({ imageRef: z.string().nullable() }).optional(),
  logo: z.object({ imageRef: z.string().nullable() }).optional(),
});

export type BrandMedia = z.infer<typeof brandMediaSchema>;
