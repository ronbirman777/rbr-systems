/**
 * Shared Studio status vocabulary, used by every product's Studio so the
 * same state always reads the same way. No publication architecture
 * here: "published" simply means the Space has a published_at stamp.
 *
 * These are functions of the Space locale rather than constants. They
 * were constants, and browser QA caught the consequence: this module is
 * shared infrastructure rather than a product surface, so it sat outside
 * the string audit's roots and kept returning English into an otherwise
 * fully translated Hebrew and German Studio.
 */
import { DEFAULT_LOCALE, translate, type Locale } from "@/lib/i18n";

export type StudioPublishState = "draft" | "published";

export function studioStatusLabel(
  state: StudioPublishState,
  locale: Locale = DEFAULT_LOCALE
): string {
  return translate(locale, "studio", state === "published" ? "published" : "draft");
}

export function previewDraftLabel(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "studio", "previewingDraft");
}
export function previewDraftCaption(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "studio", "previewDraftCaption");
}

export function studioPublishState(publishedAt: string | null | undefined): StudioPublishState {
  return publishedAt ? "published" : "draft";
}

/** "2026-10-03 10:38 UTC" - deterministic (no locale/timezone drift between server and client render). */
export function formatPublishedAtUtc(publishedAt: string | null | undefined): string | null {
  if (!publishedAt) return null;
  const d = new Date(publishedAt);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function saveStatusLabel(
  opts: { saving: boolean; dirty: boolean },
  locale: Locale = DEFAULT_LOCALE
): string {
  if (opts.saving) return translate(locale, "common", "savingNow");
  return translate(locale, "studio", opts.dirty ? "unsavedChangesShort" : "allChangesSaved");
}
