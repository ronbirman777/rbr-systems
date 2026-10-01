import type { Recurrence } from "./schemas";

/**
 * Human-readable recurrence text. Deliberately free of Temporal (and any
 * time-zone math) so the Guest App can show "Repeats every week on Sun, Wed"
 * without shipping the polyfill to guests. Expansion lives in recurrence.ts.
 */

const SHORT_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const UNIT: Record<Recurrence["freq"], [string, string]> = { daily: ["day", "days"], weekly: ["week", "weeks"], monthly: ["month", "months"] };

/** Weekday of a "YYYY-MM-DD" calendar date (0 = Sunday). */
export function weekdayOfDate(dateIso: string): number {
  return new Date(`${dateIso}T12:00:00Z`).getUTCDay();
}

/** Weekly rules with no explicit days repeat on the start date's weekday. */
export function effectiveWeekdays(rule: Recurrence, startDate: string): number[] {
  return rule.byWeekday.length > 0 ? rule.byWeekday : [weekdayOfDate(startDate)];
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}

export function formatLongDate(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  return `${d} ${SHORT_MONTHS[m - 1]} ${y}`;
}

/** e.g. "Every week on Sun, Wed · No end date", "Every 2 weeks on Mon · Until 31 Dec 2027". */
export function recurrenceSummary(rule: Recurrence, startDate: string, { withEnd = true } = {}): string {
  const [one, many] = UNIT[rule.freq];
  let text = rule.interval === 1 ? `Every ${one}` : `Every ${rule.interval} ${many}`;
  if (rule.freq === "weekly") text += ` on ${effectiveWeekdays(rule, startDate).map((d) => SHORT_WEEKDAYS[d]).join(", ")}`;
  if (rule.freq === "monthly") text += ` on the ${ordinal(Number(startDate.slice(8, 10)))}`;
  if (!withEnd) return text;
  const end =
    rule.end.type === "never"
      ? "No end date"
      : rule.end.type === "until"
        ? `Until ${formatLongDate(rule.end.until)}`
        : `${rule.end.count} ${rule.end.count === 1 ? "time" : "times"}`;
  return `${text} · ${end}`;
}

/** Which Studio preset a stored rule maps to (the UI never shows raw RRULE). */
export type RepeatPreset = "none" | "daily" | "weekly" | "monthly" | "custom";
export function repeatPresetOf(rule: Recurrence | null): RepeatPreset {
  if (!rule) return "none";
  return rule.interval === 1 ? rule.freq : "custom";
}
