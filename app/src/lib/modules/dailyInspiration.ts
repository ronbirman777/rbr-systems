import { z } from "zod";

/**
 * "dailyInspiration" module_key - the retreat's own reflections.
 *
 * Until TASK 030 W1.5 Flow's Daily Inspiration was only an on/off switch
 * over a fixed InnerDweS list (lib/content/dailyQuotes.ts); nothing was
 * stored. A Space may now author its own, built on module_items with the
 * FAQ shape: description = the reflection text (required), title = an
 * optional label shown as its attribution line, metadata.enabled = whether
 * guests see it, sort_order = the order.
 *
 * Time to Teach keeps its own quotes in module_settings
 * (lib/teach/schemas.ts) and is not affected: publish_space() skips this
 * block for Teach Spaces.
 *
 * FALLBACK. A Space with the module on and no enabled reflection keeps
 * showing the built-in list, exactly as before. Custom reflections only
 * take over once at least one is enabled.
 */
export const DAILY_INSPIRATION_KEY = "dailyInspiration";

export const inspirationItemSchema = z.object({
  /** Optional attribution / label. Empty string means none. */
  label: z.string().max(160),
  /** May be empty while a draft is being written; empty text never publishes. */
  text: z.string().max(1000),
  enabled: z.boolean(),
});

export type PublicInspirationItem = z.infer<typeof inspirationItemSchema>;
export type EditableInspirationItem = PublicInspirationItem & { id: string };

/** What the snapshot holds for each reflection. Disabled and empty items
 * never reach it (publish_space() filters them), so there is no `enabled`. */
export const publishedInspirationSchema = z.object({
  label: z.string().nullable().catch(null).default(null),
  text: z.string().min(1),
});
export type DisplayInspirationItem = z.infer<typeof publishedInspirationSchema>;

/** Tolerant read of modules.dailyInspiration: absent, malformed or empty
 * all resolve to [] (meaning: use the built-in fallback). */
export function parsePublishedInspirations(raw: unknown): DisplayInspirationItem[] {
  if (!Array.isArray(raw)) return [];
  const out: DisplayInspirationItem[] = [];
  for (const entry of raw) {
    const parsed = publishedInspirationSchema.safeParse(entry);
    if (parsed.success && parsed.data.text.trim()) out.push({ label: parsed.data.label?.trim() || null, text: parsed.data.text.trim() });
  }
  return out;
}

/** The reflections guests would see from an editor's current state. */
export function visibleInspirations(items: readonly EditableInspirationItem[]): DisplayInspirationItem[] {
  return items
    .filter((i) => i.enabled && i.text.trim())
    .map((i) => ({ label: i.label.trim() || null, text: i.text.trim() }));
}
