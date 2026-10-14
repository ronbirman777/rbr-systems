import type { EditableScheduleItem } from "./types";

/**
 * TASK 033 Studio UX: end-time suggestion and session duplication for the
 * Flow Studio Schedule editor. Pure helpers, no React, no clock.
 *
 * TIME MODEL. A session is one calendar `date` plus "HH:MM" start/end
 * strings, compared lexicographically everywhere (findNowItem, the guest
 * timeline). There is no end date, so a session cannot cross midnight: an
 * end earlier than its start is never "happening". A suggestion that would
 * reach or pass 24:00 is therefore NOT produced - the end is left empty
 * (null), which the schema already accepts ("End time (optional)") - rather
 * than inventing a wrap-around value or a date change.
 */

/** The default length of a new session, in minutes (09:00 -> 10:00). */
export const DEFAULT_SESSION_MINUTES = 60;

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "HH:MM" -> minutes since midnight, or null for anything else. */
export function timeToMinutes(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const m = HHMM.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function minutesToTime(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * The suggested end for a start time: start + `minutes`, or null when the
 * start is not a valid time or the result would reach midnight (the model
 * has no overnight sessions - see the module comment).
 */
export function suggestEndTime(startTime: string, minutes: number = DEFAULT_SESSION_MINUTES): string | null {
  const start = timeToMinutes(startTime);
  if (start === null || !Number.isFinite(minutes) || minutes <= 0) return null;
  const end = start + Math.round(minutes);
  return end < 24 * 60 ? minutesToTime(end) : null;
}

/**
 * The duration the editor keeps following for a session whose end has not
 * been edited by hand: the session's own (positive) duration when it has
 * one, else the default hour.
 */
export function followDuration(startTime: string, endTime: string | null): number {
  const s = timeToMinutes(startTime);
  const e = timeToMinutes(endTime);
  return s !== null && e !== null && e > s ? e - s : DEFAULT_SESSION_MINUTES;
}

/**
 * The patch for a start-time edit.
 *
 * `followMinutes` is the duration the end follows, or null when the end
 * must not move: an existing saved session, or one whose end the organizer
 * changed by hand. When following, an invalid/partial start (a cleared
 * field) leaves the end alone; a start whose suggestion would cross
 * midnight clears the end rather than keeping a now-earlier value.
 */
export function startTimePatch(
  startTime: string,
  followMinutes: number | null
): Pick<EditableScheduleItem, "startTime"> & Partial<Pick<EditableScheduleItem, "endTime">> {
  if (followMinutes === null || timeToMinutes(startTime) === null) return { startTime };
  return { startTime, endTime: suggestEndTime(startTime, followMinutes) };
}

/**
 * A separate copy of `item` with a new id: every editable field carried
 * over, the list fields copied (never shared by reference), the original
 * untouched.
 */
export function duplicateScheduleItem(item: EditableScheduleItem, newId: string): EditableScheduleItem {
  if (newId === item.id) throw new Error("a duplicate needs a new id");
  return {
    ...item,
    id: newId,
    whatToBring: [...item.whatToBring],
    whatToExpect: [...item.whatToExpect],
  };
}
