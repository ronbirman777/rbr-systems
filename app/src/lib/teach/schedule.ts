import type { AvailabilityMetadata, ClassMetadata, TeachItem } from "./schemas";

/**
 * Pure date logic for the Teach schedule. Dates are calendar dates
 * ("YYYY-MM-DD") and times are wall-clock "HH:MM" in the Space's time zone;
 * "today"/"now" always come from todayInTimezone/currentTimeInTimezone
 * (src/lib/timezone.ts) - never the guest device clock.
 */

export type TeachClass = TeachItem<"teachClasses">;
export type TeachAvailability = TeachItem<"teachAvailability">;

export function addDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekdayOf(dateIso: string): number {
  return new Date(`${dateIso}T12:00:00Z`).getUTCDay();
}

export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function classEndDate(meta: ClassMetadata): string {
  return meta.endDate && meta.endDate >= meta.startDate ? meta.endDate : meta.startDate;
}

export function classOccursOn(meta: ClassMetadata, dateIso: string): boolean {
  return dateIso >= meta.startDate && dateIso <= classEndDate(meta);
}

/** A class has ended once its end (date + time; start time if no end time) is before now. */
export function isClassPast(meta: ClassMetadata, todayIso: string, nowTime: string): boolean {
  const end = classEndDate(meta);
  if (end < todayIso) return true;
  if (end > todayIso) return false;
  return (meta.endTime ?? meta.startTime) <= nowTime;
}

export function sortClasses<T extends TeachClass>(classes: T[]): T[] {
  return [...classes].sort((a, b) =>
    a.metadata.startDate === b.metadata.startDate
      ? a.metadata.startTime.localeCompare(b.metadata.startTime)
      : a.metadata.startDate.localeCompare(b.metadata.startDate)
  );
}

/** Classes happening on a date, in time-of-day order (multi-day classes included). */
export function classesOn<T extends TeachClass>(classes: T[], dateIso: string): T[] {
  return classes
    .filter((c) => classOccursOn(c.metadata, dateIso))
    .sort((a, b) => a.metadata.startTime.localeCompare(b.metadata.startTime));
}

/** Next class that hasn't ended yet, strictly after today (for the empty-today state). */
export function nextUpcomingClass<T extends TeachClass>(classes: T[], todayIso: string): T | null {
  return sortClasses(classes).find((c) => c.metadata.startDate > todayIso) ?? null;
}

export function availabilityOccursOn(meta: AvailabilityMetadata, dateIso: string): boolean {
  if (!meta.enabled) return false;
  if (meta.repeat === "once") return meta.date === dateIso;
  return meta.weekday !== null && weekdayOf(dateIso) === meta.weekday;
}

export function availabilityOn<T extends TeachAvailability>(windows: T[], dateIso: string): T[] {
  return windows
    .filter((w) => availabilityOccursOn(w.metadata, dateIso))
    .sort((a, b) => a.metadata.from.localeCompare(b.metadata.from));
}

export type ScheduleDay = { date: string; classCount: number; availabilityCount: number };

/**
 * The guest day strip: today plus the next `days - 1` days, plus any later
 * dated classes are reachable via "later" grouping in the list itself.
 */
export function buildScheduleDays(
  classes: TeachClass[],
  windows: TeachAvailability[],
  todayIso: string,
  days = 14
): ScheduleDay[] {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(todayIso, i);
    return {
      date,
      classCount: classes.filter((c) => classOccursOn(c.metadata, date)).length,
      availabilityCount: windows.filter((w) => availabilityOccursOn(w.metadata, date)).length,
    };
  });
}

/** Human description of a window, e.g. "Every Tuesday · 10:00 – 13:00". */
export function describeAvailability(meta: AvailabilityMetadata): string {
  const when =
    meta.repeat === "weekly"
      ? meta.weekday !== null
        ? `Every ${WEEKDAY_LABELS[meta.weekday]}`
        : "Weekly"
      : meta.date ?? "One-off";
  return `${when} · ${meta.from} – ${meta.to}`;
}

export function durationMinutes(meta: ClassMetadata): number | null {
  if (!meta.endTime) return null;
  const [sh, sm] = meta.startTime.split(":").map(Number);
  const [eh, em] = meta.endTime.split(":").map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  return classEndDate(meta) === meta.startDate && mins > 0 ? mins : null;
}

export function formatDuration(totalSeconds: number | null | undefined): string | null {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds <= 0) return null;
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

/** "Teaching since 2014 · 11 years" */
export function teachingSinceLabel(since: number | null, todayIso: string): string | null {
  if (!since) return null;
  const years = Number(todayIso.slice(0, 4)) - since;
  if (years <= 0) return `Teaching since ${since}`;
  return `Teaching since ${since} · ${years} ${years === 1 ? "year" : "years"}`;
}
