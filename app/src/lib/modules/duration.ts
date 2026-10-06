/**
 * Seconds -> clock string, for anything with a length: an audio track, a
 * class, a schedule item.
 *
 * Locale-independent on purpose. The output is digits and colons, which
 * every locale this app supports reads the same way, so there is no
 * translator argument to get wrong. Null in, null out - the callers all
 * join it into a "·"-separated line and want it to vanish when unknown
 * rather than print "0:00".
 *
 * Moved here from lib/teach/schedule.ts unchanged (same rounding, same
 * h:mm:ss / m:ss split) so Flow's audio can format a duration without
 * importing from Teach; lib/teach/schedule.ts re-exports it for its
 * existing callers.
 */
export function formatDuration(totalSeconds: number | null | undefined): string | null {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds <= 0) return null;
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}
