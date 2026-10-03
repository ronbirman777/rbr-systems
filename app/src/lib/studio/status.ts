/**
 * Shared Studio status vocabulary, used by every product's Studio so the
 * same state always reads the same way. Pure strings/functions - no
 * publication architecture here: "published" simply means the Space has a
 * published_at stamp.
 */

export type StudioPublishState = "draft" | "published";

export const STUDIO_STATUS_LABEL: Record<StudioPublishState, string> = {
  draft: "Draft",
  published: "Published",
};

export const PREVIEW_DRAFT_LABEL = "Previewing current draft";
export const PREVIEW_DRAFT_CAPTION = "Updates as you edit · guests see it after you publish";
export const SAVED_LABEL = "All changes saved";
export const UNSAVED_LABEL = "Unsaved changes";

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

export function saveStatusLabel(opts: { saving: boolean; dirty: boolean }): string {
  if (opts.saving) return "Saving…";
  return opts.dirty ? UNSAVED_LABEL : SAVED_LABEL;
}
