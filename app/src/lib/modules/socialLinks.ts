import { z } from "zod";

import { DEFAULT_LOCALE, translate, type Locale } from "@/lib/i18n";
/**
 * Shared platform vocabulary for both Stay Connected (Space-level) and
 * Facilitator social links (person-level). A single source of truth so
 * both features render the same icons/labels and validate the same way.
 * Adding a new platform later is purely a code change here - the
 * underlying storage (module_settings.data / module_items.metadata) is
 * plain jsonb and needs no migration for it, see socialLinkSchema below.
 */
export const SOCIAL_PLATFORMS = ["instagram", "facebook", "youtube", "tiktok", "linkedin", "website"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

/**
 * Platform names are brands and never translate; "website" is an
 * ordinary noun and does, so this is a function of the locale rather
 * than a constant.
 */
export function socialPlatformLabel(locale: Locale = DEFAULT_LOCALE): Record<SocialPlatform, string> {
  return {
    instagram: "Instagram",
    facebook: "Facebook",
    youtube: "YouTube",
    tiktok: "TikTok",
    linkedin: "LinkedIn",
    website: translate(locale, "common", "website"),
  };
}

export const socialLinkSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS),
  url: z.string().trim().url(),
});

export type SocialLink = z.infer<typeof socialLinkSchema>;

export const socialLinksSchema = z.array(socialLinkSchema);

/**
 * Task 015 UX fix: a same-shape, non-blocking check for the editor's own
 * inline hint (typing an obviously-incomplete URL shouldn't feel broken
 * mid-keystroke) - reuses `socialLinkSchema`'s own `url` rule rather than
 * a second, possibly-divergent regex, so the hint and the real save-time
 * validation always agree.
 */
export function isLikelyValidUrl(value: string): boolean {
  return socialLinkSchema.shape.url.safeParse(value).success;
}
