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

/** The full canonical IANA timezone list, for a real dropdown - no hand-maintained list to go stale. */
export function listTimezones(): string[] {
  if (typeof Intl.supportedValuesOf === "function") {
    return Intl.supportedValuesOf("timeZone");
  }
  return ["UTC"];
}

export const DEFAULT_TIMEZONE = "UTC";
