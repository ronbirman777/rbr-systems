import { z } from "zod";

/**
 * "guidelines" module_key - the house rules an organizer tells every
 * guest once: quiet hours, phones, shoes off at the shala door.
 *
 * Built on module_items with no metadata at all (TASK 029, decision 4):
 * title, description, sort_order. Shaped like FAQ because that is what it
 * is - a short ordered list of headed paragraphs - and deliberately
 * without FAQ's per-item `enabled` flag, which exists there because an
 * organizer parks half-written questions. A guideline is either house
 * policy or it is deleted.
 */
export const guidelineSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable(),
});

export type PublicGuideline = z.infer<typeof guidelineSchema>;
export type EditableGuideline = PublicGuideline & { id: string };
export type DisplayGuideline = PublicGuideline;

/** The published shape - identical, since there is nothing to filter. */
export const publishedGuidelineSchema = guidelineSchema;

export const GUIDELINES_KEY = "guidelines";
