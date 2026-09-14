import { z } from "zod";

/**
 * "faq" module_key - built on module_items, one row per question. Reorder
 * is sort_order (existing column); enabled/disabled lives in metadata
 * (module_items has no boolean column of its own) - publish_space()
 * filters out disabled items at publish time, see migration 0014.
 */
export const faqItemSchema = z.object({
  question: z.string().min(1),
  answer: z.string().nullable(),
  enabled: z.boolean(),
});

export type PublicFaqItem = z.infer<typeof faqItemSchema>;
export type EditableFaqItem = PublicFaqItem & { id: string };

/** What the published snapshot actually contains for each FAQ item -
 * disabled items never reach this shape at all (publish_space() filters
 * them out before they're written), so there is no `enabled` field here. */
export const publishedFaqItemSchema = z.object({
  question: z.string(),
  answer: z.string().nullable(),
});
export type DisplayFaqItem = z.infer<typeof publishedFaqItemSchema>;
