import { z } from "zod";

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

export const SOCIAL_PLATFORM_LABEL: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  website: "Website",
};

export const socialLinkSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS),
  url: z.string().trim().url(),
});

export type SocialLink = z.infer<typeof socialLinkSchema>;

export const socialLinksSchema = z.array(socialLinkSchema);
