import type { CSSProperties } from "react";
import type { PaletteKey, AtmosphereKey } from "@/lib/theme/tokens";
import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import { publishedThemeSchema, brandMediaSchema, DEFAULT_PUBLISHED_THEME } from "@/lib/modules/publishedTheme";
import { publicMediaUrl } from "@/lib/media/path";
import type { PublishedSpaceRow } from "@/components/guest/published-space-screen";

export type PublishedGuestIdentity = {
  name: string;
  heroImageUrl: string | null;
  logoUrl: string | null;
  /** CSS custom properties (--rbr-primary etc.) - same derivation
   * published-space-screen.tsx uses for the real Guest App, so the code
   * screen uses the identical Primary/Accent/Text resolution rather than
   * a second copy of that logic. */
  vars: CSSProperties;
};

/**
 * The published brand images the Guest Access code screen itself shows
 * BEFORE a code is entered (hero + logo). This is the single definition of
 * "pre-gate identity media": /api/media may serve exactly these refs to a
 * request that has no access cookie yet, because the code screen already
 * renders them to every visitor - and nothing else.
 */
export function publishedIdentityImageRefs(modules: unknown): { heroImageRef: string | null; logoImageRef: string | null } {
  const brand = modules && typeof modules === "object" ? (modules as Record<string, unknown>).brand : undefined;
  const parsed = brandMediaSchema.safeParse(brand);
  return {
    heroImageRef: parsed.success ? (parsed.data.hero?.imageRef ?? null) : null,
    logoImageRef: parsed.success ? (parsed.data.logo?.imageRef ?? null) : null,
  };
}

/**
 * Extracted from published-space-screen.tsx's own brand/theme parsing so
 * the Guest Access code screen (shown BEFORE the Guest App itself, for a
 * protected Space) can use the same published-safe identity - never
 * draft data, never a new Storage read, just the same
 * publishedThemeSchema/brandMediaSchema/publicMediaUrl calls already
 * proven correct there.
 */
export function extractPublishedGuestIdentity(space: PublishedSpaceRow): PublishedGuestIdentity {
  const themeParsed = publishedThemeSchema.safeParse(space.theme);
  const theme = themeParsed.success ? themeParsed.data : DEFAULT_PUBLISHED_THEME;
  const { heroImageRef, logoImageRef } = publishedIdentityImageRefs(space.modules);
  const heroImageUrl = heroImageRef ? publicMediaUrl(heroImageRef) : null;
  const logoUrl = logoImageRef ? publicMediaUrl(logoImageRef) : null;

  const brand = {
    name: space.name,
    logoRef: logoImageRef,
    palette: theme.palette as PaletteKey,
    customPrimary: theme.customPrimary ?? null,
    customSecondary: theme.customSecondary ?? null,
    customNavigation: theme.customNavigation ?? null,
    customText: theme.customText ?? null,
    atmosphere: theme.atmosphere as AtmosphereKey,
    imageStyle: theme.imageStyle ?? "rounded",
  };

  return {
    name: space.name,
    heroImageUrl,
    logoUrl,
    vars: deriveThemeVars(brand) as CSSProperties,
  };
}
