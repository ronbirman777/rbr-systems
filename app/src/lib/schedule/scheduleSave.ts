import { z } from "zod";

/**
 * TASK 033 (addendum B): the pure half of saveSchedule's delete rule, kept
 * out of the "use server" actions file so it can be unit-tested.
 *
 * Only ids the editor explicitly removed are ever deleted, and never one
 * that is also being saved in the same request.
 */
const removedIdsSchema = z.array(z.string().min(1).max(100)).max(2000);

/** The submitted `removedIds` field, or null when it is present but malformed. A missing field means "nothing removed". */
export function parseRemovedIds(value: FormDataEntryValue | null): string[] | null {
  if (value === null || value === "") return [];
  let raw: unknown;
  try {
    raw = JSON.parse(String(value));
  } catch {
    return null;
  }
  const parsed = removedIdsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** De-duplicated removed ids minus every id that is being saved. */
export function scheduleIdsToDelete(removedIds: readonly string[], savedIds: readonly string[]): string[] {
  const saved = new Set(savedIds);
  return Array.from(new Set(removedIds)).filter((id) => !saved.has(id));
}

/**
 * The editor-side bookkeeping: which rows exist in the database (loaded or
 * saved), and which of those the organizer removed since the last Save.
 * A new, never-saved session that is removed again never reaches the
 * server at all.
 */
export type SchedulePersistence = { persisted: ReadonlySet<string>; removed: ReadonlySet<string> };

export function schedulePersistenceFrom(ids: readonly string[]): SchedulePersistence {
  return { persisted: new Set(ids), removed: new Set() };
}

export function noteScheduleRemoval(state: SchedulePersistence, id: string): SchedulePersistence {
  if (!state.persisted.has(id)) return state;
  return { persisted: state.persisted, removed: new Set([...state.removed, id]) };
}

/** After a successful save of `savedIds` that also deleted `deletedIds`. */
export function afterScheduleSave(state: SchedulePersistence, savedIds: readonly string[], deletedIds: readonly string[]): SchedulePersistence {
  const persisted = new Set(state.persisted);
  const removed = new Set(state.removed);
  for (const id of deletedIds) {
    persisted.delete(id);
    removed.delete(id);
  }
  for (const id of savedIds) persisted.add(id);
  return { persisted, removed };
}
