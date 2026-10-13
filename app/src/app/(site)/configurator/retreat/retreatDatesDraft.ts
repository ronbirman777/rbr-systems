import { validateRetreatDates, type RetreatDatesError } from "@/lib/schedule/retreatDays";

/**
 * TASK 033 (fix 2): the pure dirty/save logic behind RetreatDatesPanel,
 * kept out of the component so it can be unit-tested in this project's
 * DOM-less test environment.
 *
 * The panel takes part in the shared Studio unsaved-changes guard exactly
 * like every module editor (studioSection.ts): an edit marks the section
 * dirty, only a successful save clears it, and a validation or server
 * error keeps it dirty so the Unsaved Changes dialog cannot drop it.
 */

/** The panel's editable values: "" means the field is empty (date unset). */
export type RetreatDatesDraft = { startDate: string; endDate: string };

/** The pair currently stored for the Space (null = unset). */
export type SavedRetreatDates = { startDate?: string | null; endDate?: string | null };

export function retreatDatesDraftFrom(saved: SavedRetreatDates): RetreatDatesDraft {
  return { startDate: saved.startDate ?? "", endDate: saved.endDate ?? "" };
}

/** True when the draft differs from the stored pair ("" and null both mean unset). */
export function retreatDatesChanged(draft: RetreatDatesDraft, saved: SavedRetreatDates): boolean {
  return (draft.startDate || null) !== (saved.startDate ?? null) || (draft.endDate || null) !== (saved.endDate ?? null);
}

export type RetreatDatesSavePlan =
  /** Client-side validation failed: nothing is sent, the section stays dirty. */
  | { kind: "invalid"; error: RetreatDatesError }
  /** The draft already equals the stored pair (edited and reverted): nothing
   * to send, and the section may be marked clean. */
  | { kind: "unchanged" }
  /** Send the draft to saveRetreatDates(); clean only if the server agrees. */
  | { kind: "save" };

/**
 * What a save of the current draft must do. Validation runs first, so an
 * invalid pair is never reported as "unchanged" and never clears dirty.
 */
export function planRetreatDatesSave(draft: RetreatDatesDraft, saved: SavedRetreatDates): RetreatDatesSavePlan {
  const error = validateRetreatDates(draft.startDate || null, draft.endDate || null);
  if (error) return { kind: "invalid", error };
  if (!retreatDatesChanged(draft, saved)) return { kind: "unchanged" };
  return { kind: "save" };
}
