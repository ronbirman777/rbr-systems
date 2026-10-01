/**
 * "Today" for a retreat Space must be computed relative to the Space's own
 * IANA timezone, never the guest's device or the server's - a guest in a
 * different timezone from the retreat should still see the retreat's own
 * "today". Uses Intl (built into Node and every modern browser), no library.
 */
export function todayInTimezone(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

/**
 * Current time-of-day ("HH:MM", 24h) in the Space timezone - used for
 * "happening now" / "up next" context in Today and Schedule. Same
 * timezone-first principle as todayInTimezone: never the guest device's or
 * the server's clock reading.
 */
export function currentTimeInTimezone(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h}:${m}`;
}

export const DEFAULT_TIMEZONE = "UTC";

/**
 * Zero-offset zones that are not geographic: they only ever mean "UTC".
 * Region zones that merely share offset 0 (Africa/Abidjan, Atlantic/Reykjavik,
 * Europe/London, ...) are deliberately NOT here - they stay what the user chose.
 */
const UTC_FAMILY = new Set([
  "UTC", "Etc/UTC", "UCT", "Etc/UCT", "Universal", "Etc/Universal", "Zulu", "Etc/Zulu",
  "GMT", "Etc/GMT", "Etc/GMT0", "GMT0", "Etc/GMT+0", "Etc/GMT-0", "GMT+0", "GMT-0",
  "Greenwich", "Etc/Greenwich",
]);

/** The canonical IANA zone list from Intl. NOTE: it never contains UTC or any UTC-family value. */
export function listTimezones(): string[] {
  if (typeof Intl.supportedValuesOf === "function") {
    return Intl.supportedValuesOf("timeZone");
  }
  return [DEFAULT_TIMEZONE];
}

/**
 * The dropdown value that represents a stored timezone. The stored value is
 * never rewritten here - only which <option> is shown as selected. UTC-family
 * values select "UTC"; every other value (including Africa/Abidjan) is itself.
 */
export function timezoneSelectValue(stored: string | null | undefined): string {
  if (!stored) return DEFAULT_TIMEZONE;
  return UTC_FAMILY.has(stored) ? DEFAULT_TIMEZONE : stored;
}

/**
 * Dropdown options: "UTC" first (Intl omits it), then the canonical zones.
 * A stored value that is neither (a legacy alias such as Asia/Calcutta) is
 * appended so the control shows it instead of silently falling back to the
 * first option.
 */
export function timezoneOptions(stored?: string | null): string[] {
  const options = [DEFAULT_TIMEZONE, ...listTimezones().filter((tz) => tz !== DEFAULT_TIMEZONE)];
  const selected = timezoneSelectValue(stored);
  return options.includes(selected) ? options : [...options, selected];
}
