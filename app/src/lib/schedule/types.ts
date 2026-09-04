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
});

export type PublicScheduleItem = z.infer<typeof publicScheduleItemSchema>;

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
