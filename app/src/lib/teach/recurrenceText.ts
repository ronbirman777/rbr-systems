import { isInvalidStored, type ClassMetadata, type OccurrenceException, type Recurrence } from "./schemas";
import { DEFAULT_LOCALE, translate, type Locale } from "@/lib/i18n";
import {
  capitalizeFirst,
  formatDayMonthYearLocalized,
  ordinalDayLocalized,
  shortWeekdayName,
} from "@/lib/i18n/datetime";

/**
 * Human-readable recurrence text. Deliberately free of Temporal (and any
 * time-zone math) so the Guest App can show "Repeats every week on Sun, Wed"
 * without shipping the polyfill to guests. Expansion lives in recurrence.ts.
 */

/** Weekday of a "YYYY-MM-DD" calendar date (0 = Sunday). */
export function weekdayOfDate(dateIso: string): number {
  return new Date(`${dateIso}T12:00:00Z`).getUTCDay();
}

/** Weekly rules with no explicit days repeat on the start date's weekday. */
export function effectiveWeekdays(rule: Recurrence, startDate: string): number[] {
  return rule.byWeekday.length > 0 ? rule.byWeekday : [weekdayOfDate(startDate)];
}

/** "every week", "every 2 weeks" - 1 and 2 are separate keys so Hebrew
 * can use its dual form ("כל שבועיים") instead of a counted plural. */
function intervalPhrase(rule: Recurrence, locale: Locale): string {
  const key = (
    {
      daily: ["recurEveryDay", "recurEveryTwoDays", "recurEveryNDays"],
      weekly: ["recurEveryWeek", "recurEveryTwoWeeks", "recurEveryNWeeks"],
      monthly: ["recurEveryMonth", "recurEveryTwoMonths", "recurEveryNMonths"],
    } as const
  )[rule.freq][rule.interval === 1 ? 0 : rule.interval === 2 ? 1 : 2];
  return translate(locale, "teach", key, { count: rule.interval });
}

function endPhrase(rule: Recurrence, locale: Locale): string {
  if (rule.end.type === "never") return translate(locale, "teach", "recurNoEnd");
  if (rule.end.type === "until") {
    return translate(locale, "teach", "recurUntil", { date: formatDayMonthYearLocalized(rule.end.until, locale) });
  }
  const n = rule.end.count;
  const key = n === 1 ? "recurOnce" : n === 2 ? "recurTwice" : "recurNTimes";
  return translate(locale, "teach", key, { count: n });
}

/**
 * e.g. "Every week on Sun, Wed · No end date", "Every 2 weeks on Mon ·
 * Until 31 Dec 2027", and their Hebrew and German equivalents.
 *
 * The phrase is assembled lowercase and capitalized on the way out,
 * because most callers put it at the start of a line while one embeds it
 * mid-sentence ("Repeats every week"). Pass `lowercase` for that case
 * rather than doing surgery on the returned string - a leading "Every"
 * is not something every language has.
 */
export function recurrenceSummary(
  rule: Recurrence,
  startDate: string,
  { withEnd = true, locale = DEFAULT_LOCALE, lowercase = false }: { withEnd?: boolean; locale?: Locale; lowercase?: boolean } = {}
): string {
  let text = intervalPhrase(rule, locale);
  if (rule.freq === "weekly") {
    const days = effectiveWeekdays(rule, startDate)
      .map((d) => shortWeekdayName(d, locale))
      .join(", ");
    text += ` ${translate(locale, "teach", "recurOnDays", { days })}`;
  }
  if (rule.freq === "monthly") {
    const day = ordinalDayLocalized(Number(startDate.slice(8, 10)), locale);
    text += ` ${translate(locale, "teach", "recurOnDayOfMonth", { day })}`;
  }
  const phrase = withEnd ? `${text} · ${endPhrase(rule, locale)}` : text;
  return lowercase ? phrase : capitalizeFirst(phrase);
}

/** Which Studio preset a stored rule maps to (the UI never shows raw RRULE). */
export type RepeatPreset = "none" | "daily" | "weekly" | "monthly" | "custom";
export function repeatPresetOf(rule: Recurrence | null): RepeatPreset {
  if (!rule) return "none";
  return rule.interval === 1 ? rule.freq : "custom";
}

// ---------------------------------------------------------------------------
// Safe accessors: stored recurrence data may be malformed (InvalidStored).
// ---------------------------------------------------------------------------

/** The class's repeat rule, or null when it has none OR it is malformed. */
export function validRule(meta: Pick<ClassMetadata, "recurrence">): Recurrence | null {
  return meta.recurrence && !isInvalidStored(meta.recurrence) ? meta.recurrence : null;
}

/** The class's per-date changes ({} when none or malformed). */
export function validExceptions(meta: Pick<ClassMetadata, "exceptions">): Record<string, OccurrenceException> {
  return isInvalidStored(meta.exceptions) ? {} : meta.exceptions;
}

/**
 * Which stored recurrence parts are malformed and need repair in the Studio.
 * null = nothing to repair (including every ordinary one-off class).
 */
export function recurrenceProblem(meta: Pick<ClassMetadata, "recurrence" | "exceptions">): { recurrence: boolean; exceptions: boolean } | null {
  const recurrence = isInvalidStored(meta.recurrence);
  const exceptions = isInvalidStored(meta.exceptions);
  return recurrence || exceptions ? { recurrence, exceptions } : null;
}
