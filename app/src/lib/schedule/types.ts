import { z } from "zod";

/**
 * The public-safe shape of a schedule item, shared by:
 *  - the configurator's Schedule editor (writing to the private
 *    schedule_items table)
 *  - the publish action (serializing into published_spaces.schedule)
 *  - TodayScreen (rendered from either the private table, live in the
 *    configurator preview, or the published snapshot, in the guest route)
 *
 * Deliberately excludes anything not meant to ever be public - there is no
 * id, tenant_id, or timestamp here, only what a guest should see.
 */
export const publicScheduleItemSchema = z.object({
  date: z.string(), // ISO date, e.g. "2026-03-14"
  startTime: z.string(), // "HH:MM"
  endTime: z.string().nullable(),
  title: z.string().min(1),
  facilitator: z.string().nullable(),
  location: z.string().nullable(),
  description: z.string().nullable(),
  category: z.string().nullable(),
  /**
   * TASK 029 (P5D): what to bring to, and what to expect from, THIS
   * activity - as opposed to the retreat-level lists in retreatProfile.
   * A 07:00 sunrise session wants a mat and a blanket; the retreat wants
   * layers and a journal. They are different answers to different
   * questions, which is why both exist.
   *
   * Stored in schedule_items.metadata (the one column migration 0033
   * added) and published by publish_space() only when actually present,
   * so an activity with neither is byte-identical to how it published
   * before. Hence `.default([])`: a snapshot from before 0033, and every
   * activity that has not been given extra details, has no such key.
   *
   * Nothing here touches date, time, recurrence or timezone logic - the
   * canonical schedule architecture is untouched.
   */
  whatToBring: z.array(z.string().min(1)).catch([]).default([]),
  whatToExpect: z.array(z.string().min(1)).catch([]).default([]),
});

export type PublicScheduleItem = z.infer<typeof publicScheduleItemSchema>;

/**
 * Just the metadata half, for reading schedule_items.metadata directly.
 *
 * The published payload carries these two keys inline on the activity
 * (publish_space merges them in), but the private table keeps them in
 * `metadata` - so the Studio loader parses that column through this,
 * and the Guest App parses the whole activity through
 * publicScheduleItemSchema. One set of rules, two entry points.
 */
export const activityExtrasSchema = publicScheduleItemSchema.pick({
  whatToBring: true,
  whatToExpect: true,
});

export type ActivityExtras = z.infer<typeof activityExtrasSchema>;

/** Whether this activity has any extra details worth a section at all. */
export function hasActivityExtras(item: Pick<PublicScheduleItem, "whatToBring" | "whatToExpect">): boolean {
  return item.whatToBring.length > 0 || item.whatToExpect.length > 0;
}

/**
 * Everything the private editor needs, one level up from the public shape -
 * only adds the row identity fields used for editing/persistence.
 */
export type EditableScheduleItem = PublicScheduleItem & { id: string };

export function todaysItems(schedule: PublicScheduleItem[], todayIso: string): PublicScheduleItem[] {
  return schedule
    .filter((item) => item.date === todayIso)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export function upcomingItems(
  schedule: PublicScheduleItem[],
  todayIso: string,
  limit = 3
): PublicScheduleItem[] {
  return schedule
    .filter((item) => item.date >= todayIso)
    .sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)))
    .slice(0, limit);
}

/**
 * The single session happening right now, if any - shared by TodayScreen
 * (Happening Now card) and ScheduleScreen (the "Now" timeline highlight)
 * so both derive the exact same answer from the exact same rule, rather
 * than each re-implementing this comparison independently.
 */
export function findNowItem(
  schedule: PublicScheduleItem[],
  todayIso: string,
  nowTime: string
): PublicScheduleItem | null {
  const today = todaysItems(schedule, todayIso);
  return today.find((item) => item.startTime <= nowTime && (!item.endTime || item.endTime > nowTime)) ?? null;
}

/** The single next session today, if any - see findNowItem. */
export function findNextItem(
  schedule: PublicScheduleItem[],
  todayIso: string,
  nowTime: string
): PublicScheduleItem | null {
  const today = todaysItems(schedule, todayIso);
  return today.find((item) => item.startTime > nowTime) ?? null;
}
