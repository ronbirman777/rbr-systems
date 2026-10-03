import { Temporal } from "temporal-polyfill";
import type { ClassMetadata } from "./schemas";

/**
 * Canonical class time (time model v1).
 *
 * Source of truth = what the teacher typed: local date(s), local time(s) and
 * an explicit IANA time zone. From those we DERIVE canonical UTC instants
 * (startsAt / endsAt) for reliable ordering, "has it ended", and future
 * calendar/analytics use. Derived values are recomputed on every save
 * (server-side, in saveTeachItems) and can always be rebuilt from the local
 * fields - they are never edited directly.
 *
 * Local -> UTC resolution uses Temporal (temporal-polyfill), never hand-rolled
 * offset arithmetic:
 *  - DST gap (local time that doesn't exist, clocks jump forward): rejected.
 *  - DST overlap (local time that happens twice, clocks fall back): resolved
 *    deterministically to the EARLIER instant; the chosen UTC offset and the
 *    fact that it was ambiguous are persisted so the choice is explicit, and
 *    the Studio warns the teacher.
 *
 * Imported by server actions, the server-side published-space parse
 * (legacy rows) and the Studio editor - never by the client Guest App
 * bundle, which only reads the persisted instants.
 */

export const TIME_MODEL_VERSION = 1;

export type LocalResolution =
  | { ok: true; instant: string; offset: string; ambiguous: boolean; laterOffset: string | null }
  | { ok: false; reason: "nonexistent" | "invalid-time" | "invalid-timezone" };

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    Temporal.PlainDate.from("2025-01-01").toZonedDateTime({ timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Resolves a local wall time in an IANA zone to a UTC instant (see module doc). */
export function resolveLocalTime(date: string, time: string, timeZone: string): LocalResolution {
  if (!isValidTimeZone(timeZone)) return { ok: false, reason: "invalid-timezone" };
  let pdt: Temporal.PlainDateTime;
  try {
    pdt = Temporal.PlainDateTime.from(`${date}T${time}`, { overflow: "reject" });
  } catch {
    return { ok: false, reason: "invalid-time" };
  }
  const earlier = pdt.toZonedDateTime(timeZone, { disambiguation: "earlier" });
  const later = pdt.toZonedDateTime(timeZone, { disambiguation: "later" });
  // In a gap, no instant has this wall time: the resolved wall time differs.
  if (!earlier.toPlainDateTime().equals(pdt)) return { ok: false, reason: "nonexistent" };
  const ambiguous = earlier.epochNanoseconds !== later.epochNanoseconds;
  return {
    ok: true,
    instant: earlier.toInstant().toString(),
    offset: earlier.offset,
    ambiguous,
    laterOffset: ambiguous ? later.offset : null,
  };
}

const SHORT_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function label(date: string): string {
  const d = Temporal.PlainDate.from(date);
  return `${SHORT_WEEKDAYS[d.dayOfWeek % 7]} ${d.day} ${SHORT_MONTHS[d.month - 1]}`;
}

export type ClassTimeIssue = { field: "start" | "end"; kind: "error" | "warning"; message: string };

export type ClassTimeResult =
  | { ok: true; metadata: ClassMetadata; warnings: ClassTimeIssue[] }
  | { ok: false; issues: ClassTimeIssue[] };

function gapMessage(time: string, date: string, tz: string) {
  return `${time} doesn’t exist on ${label(date)} in ${tz} — the clocks move forward then. Please choose a time after the change.`;
}
function overlapMessage(time: string, date: string, tz: string, offset: string, laterOffset: string | null) {
  return `${time} happens twice on ${label(date)} in ${tz} (the clocks go back). We’ll use the first one (UTC${offset}${laterOffset ? `, not UTC${laterOffset}` : ""}).`;
}

/**
 * Validates a class's local times and returns metadata with the canonical
 * fields filled in: explicit timezone, startsAt, endsAt, offsets, ambiguity
 * flags and timeModelVersion. `fallbackTimeZone` (the Space's zone) is only
 * used for pre-model rows that have no explicit zone yet.
 */
export function computeClassTimes(meta: ClassMetadata, fallbackTimeZone: string): ClassTimeResult {
  const timeZone = meta.timezone ?? fallbackTimeZone;
  const issues: ClassTimeIssue[] = [];
  const warnings: ClassTimeIssue[] = [];

  const start = resolveLocalTime(meta.startDate, meta.startTime, timeZone);
  if (!start.ok) {
    issues.push({
      field: "start",
      kind: "error",
      message:
        start.reason === "nonexistent"
          ? gapMessage(meta.startTime, meta.startDate, timeZone)
          : start.reason === "invalid-timezone"
            ? `“${timeZone}” isn’t a recognised time zone.`
            : "The start date or time isn’t valid.",
    });
    return { ok: false, issues };
  }
  if (start.ambiguous) warnings.push({ field: "start", kind: "warning", message: overlapMessage(meta.startTime, meta.startDate, timeZone, start.offset, start.laterOffset) });

  let endsAt: string | null = null;
  let endOffset: string | null = null;
  let endAmbiguous = false;
  const endDate = meta.endDate && meta.endDate >= meta.startDate ? meta.endDate : meta.startDate;
  if (meta.endDate && meta.endDate < meta.startDate) {
    issues.push({ field: "end", kind: "error", message: "The end date is before the start date." });
    return { ok: false, issues };
  }
  if (meta.endTime) {
    const end = resolveLocalTime(endDate, meta.endTime, timeZone);
    if (!end.ok) {
      issues.push({
        field: "end",
        kind: "error",
        message: end.reason === "nonexistent" ? gapMessage(meta.endTime, endDate, timeZone) : "The end date or time isn’t valid.",
      });
      return { ok: false, issues };
    }
    if (Temporal.Instant.compare(Temporal.Instant.from(end.instant), Temporal.Instant.from(start.instant)) <= 0) {
      issues.push({ field: "end", kind: "error", message: "The class must end after it starts." });
      return { ok: false, issues };
    }
    if (end.ambiguous) warnings.push({ field: "end", kind: "warning", message: overlapMessage(meta.endTime, endDate, timeZone, end.offset, end.laterOffset) });
    endsAt = end.instant;
    endOffset = end.offset;
    endAmbiguous = end.ambiguous;
  }

  return {
    ok: true,
    warnings,
    metadata: {
      ...meta,
      timezone: timeZone,
      startsAt: start.instant,
      endsAt,
      startOffset: start.offset,
      endOffset,
      startAmbiguous: start.ambiguous,
      endAmbiguous,
      timeModelVersion: TIME_MODEL_VERSION,
    },
  };
}

/**
 * Read path for rows saved before the time model existed (no startsAt):
 * derive the instants in memory so they sort and expire correctly. Returns
 * the metadata unchanged if it can't be resolved (the Studio will ask the
 * teacher to fix it on the next save).
 */
export function withDerivedClassTimes(meta: ClassMetadata, fallbackTimeZone: string): ClassMetadata {
  if (meta.startsAt && meta.timeModelVersion === TIME_MODEL_VERSION) return meta;
  const r = computeClassTimes(meta, fallbackTimeZone);
  return r.ok ? r.metadata : meta;
}
