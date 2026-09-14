import { z } from "zod";

/**
 * "customPages" module_key - built on module_items, one row per page.
 * Supports arbitrarily many organizer-created pages with no new table:
 * title=guest-facing title, description=body (plain text, never HTML -
 * no rich-text/markup surface exists anywhere in this codebase, so there
 * is nothing to sanitize), image_ref=optional photo (existing media
 * pipeline, unchanged), sort_order=ordering. enabled/disabled lives in
 * metadata, same reasoning and same publish-time filtering as FAQ.
 */
export const customPageSchema = z.object({
  title: z.string().min(1),
  body: z.string().nullable(),
  imageRef: z.string().nullable(),
  enabled: z.boolean(),
});

export type PublicCustomPage = z.infer<typeof customPageSchema>;
export type EditableCustomPage = PublicCustomPage & { id: string; imageUrl?: string | null };

/** Published snapshot shape - disabled pages never reach this far (see
 * faq.ts's identical reasoning), so no `enabled` field here either. */
export const publishedCustomPageSchema = z.object({
  title: z.string(),
  body: z.string().nullable(),
  imageRef: z.string().nullable(),
});
export type DisplayCustomPage = z.infer<typeof publishedCustomPageSchema> & { imageUrl: string | null };
