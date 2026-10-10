import type { AudioEntitlements } from "./entitlements";
import type { SubscriptionStatus } from "./types";

/**
 * Server-side audio quota enforcement (TASK B4). Pure: no I/O. The policy
 * is loaded by audioQuota.server.ts; the Studio actions (attach + publish)
 * call the checks below and translate the returned issue.
 *
 * Who is enforced (decided from the Space's OWN billing row, never from the
 * global paid-checkout flag, so switching the flag off can never lift the
 * limits of a Space that is already paid):
 *   - no billing row (every legacy / flag-off Space)  -> unenforced, unchanged
 *   - status 'exempt' (internal/complimentary)        -> unenforced; the base
 *     entitlement is display-only for them
 *   - any other status                                -> enforced against
 *     space_audio_entitlements() (base plan bundle + audio_pack add-ons)
 *   - the row or the entitlement could not be read    -> "unavailable": the
 *     action refuses (fail closed) rather than guessing
 *
 * Metering is Space/resource level only. Nothing here sees a listener.
 *
 * DURATION (TASK B4b): on an enforced Space the browser-reported length is
 * IGNORED. The finalize action downloads the stored object with the service
 * role and measures it (lib/media/audioDuration.ts through
 * billing/audioFinalize.server.ts); that server-derived value is the one
 * checked here and stored. A file the server cannot measure is refused. The
 * database re-checks the same limits on the item write itself and inside
 * publish_space() (migration 0043), so neither a direct PostgREST write nor
 * a direct RPC call can skip them; these checks exist for clear, localized
 * messages.
 */

export const SECONDS_PER_MINUTE = 60;

/** The existing schema ceiling on a stored durationSeconds (12 h). */
export const MAX_STORED_DURATION_SECONDS = 60 * 60 * 12;

export type AudioQuotaPolicy =
  | { mode: "unenforced"; reason: "legacy" | "exempt" }
  | { mode: "enforced"; limits: AudioEntitlements }
  | { mode: "unavailable" };

export const LEGACY_AUDIO_POLICY: AudioQuotaPolicy = { mode: "unenforced", reason: "legacy" };
export const UNAVAILABLE_AUDIO_POLICY: AudioQuotaPolicy = { mode: "unavailable" };

const positiveInt = (v: unknown): number | null => (typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : null);

/** Pure policy decision from the billing row's status and the entitlement row (space_audio_entitlements). */
export function decideAudioQuotaPolicy(
  subscription: { status: SubscriptionStatus | string } | null,
  entitlement: { library_minutes?: unknown; max_recording_minutes?: unknown; listening_minutes_per_month?: unknown } | null
): AudioQuotaPolicy {
  if (!subscription) return LEGACY_AUDIO_POLICY;
  if (subscription.status === "exempt") return { mode: "unenforced", reason: "exempt" };
  const libraryMinutes = positiveInt(entitlement?.library_minutes);
  const maxRecordingMinutes = positiveInt(entitlement?.max_recording_minutes);
  const listeningMinutesPerMonth = positiveInt(entitlement?.listening_minutes_per_month);
  if (libraryMinutes === null || maxRecordingMinutes === null || listeningMinutesPerMonth === null) return UNAVAILABLE_AUDIO_POLICY;
  return { mode: "enforced", limits: { libraryMinutes, maxRecordingMinutes, listeningMinutesPerMonth } };
}

/**
 * The pre-B4 normalization of a client-reported duration, kept byte for byte
 * for unenforced Spaces: rounded whole seconds within 0..12 h, else null.
 */
export function normalizeReportedDuration(durationSeconds: unknown): number | null {
  return typeof durationSeconds === "number" &&
    Number.isFinite(durationSeconds) &&
    durationSeconds >= 0 &&
    durationSeconds <= MAX_STORED_DURATION_SECONDS
    ? Math.round(durationSeconds)
    : null;
}

export type AudioQuotaIssue =
  | { code: "unavailable" }
  | { code: "durationUnknown" }
  | { code: "recordingTooLong"; maxMinutes: number }
  | { code: "libraryFull"; limitMinutes: number; usedMinutes: number };

/** An audio item as stored in module_items.metadata. Only items with a file count. */
export type StoredAudioItem = { metadata: Record<string, unknown> | null | undefined };

const hasFile = (item: StoredAudioItem) => typeof item.metadata?.audioRef === "string";
const storedSeconds = (item: StoredAudioItem): number | null => {
  const v = item.metadata?.durationSeconds;
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
};

/** Total stored seconds of the items that have a file, and how many of them have no known length. */
export function summarizeLibrary(items: readonly StoredAudioItem[]): { totalSeconds: number; unknownCount: number; longestSeconds: number } {
  let totalSeconds = 0;
  let unknownCount = 0;
  let longestSeconds = 0;
  for (const item of items) {
    if (!hasFile(item)) continue;
    const s = storedSeconds(item);
    if (s === null) unknownCount += 1;
    else {
      totalSeconds += s;
      longestSeconds = Math.max(longestSeconds, s);
    }
  }
  return { totalSeconds, unknownCount, longestSeconds };
}

export type AttachCheckResult = { ok: true; durationSeconds: number | null } | { ok: false; issue: AudioQuotaIssue };

/**
 * The attach (upload-finalize) check. `otherItems` are the Space's OTHER
 * audio items (the one being replaced is excluded by the caller). Returns
 * the durationSeconds to STORE:
 *   - unenforced (legacy/exempt): the browser claim, normalized exactly as
 *     before B4 (`serverSeconds` is not consulted - it is not even measured);
 *   - enforced: the SERVER-DERIVED whole seconds; the browser claim is
 *     ignored. null (could not be measured) is refused.
 *
 * Boundaries are inclusive at whole-second resolution: 60:00 (3600 s)
 * passes, 60:01 (3601 s) is refused; a library exactly at its allowance
 * passes, one second over is refused.
 */
export function checkAudioAttach(
  policy: AudioQuotaPolicy,
  input: { claimedSeconds: unknown; serverSeconds: number | null; otherItems: readonly StoredAudioItem[] }
): AttachCheckResult {
  if (policy.mode === "unenforced") return { ok: true, durationSeconds: normalizeReportedDuration(input.claimedSeconds) };
  if (policy.mode === "unavailable") return { ok: false, issue: { code: "unavailable" } };

  const { maxRecordingMinutes, libraryMinutes } = policy.limits;
  const measured = input.serverSeconds;
  if (typeof measured !== "number" || !Number.isSafeInteger(measured) || measured < 0) return { ok: false, issue: { code: "durationUnknown" } };
  if (measured > maxRecordingMinutes * SECONDS_PER_MINUTE) {
    return { ok: false, issue: { code: "recordingTooLong", maxMinutes: maxRecordingMinutes } };
  }
  const { totalSeconds } = summarizeLibrary(input.otherItems);
  if (totalSeconds + measured > libraryMinutes * SECONDS_PER_MINUTE) {
    return { ok: false, issue: { code: "libraryFull", limitMinutes: libraryMinutes, usedMinutes: Math.ceil(totalSeconds / SECONDS_PER_MINUTE) } };
  }
  return { ok: true, durationSeconds: measured };
}

/**
 * Maps a refused service-role finalize write (audioFinalize.server.ts) to the
 * message the organizer sees. "limit" is the database's own AUDIO_LIMIT
 * refusal - reachable only when another upload committed between this
 * action's check and its write - so it is reported as a full library.
 */
export function enforcedAttachWriteIssue(
  reason: "studioLocked" | "limit" | "failed",
  limits: AudioEntitlements,
  otherItems: readonly StoredAudioItem[]
): AudioQuotaIssue | "studioLocked" {
  if (reason === "studioLocked") return "studioLocked";
  if (reason === "failed") return { code: "unavailable" };
  return { code: "libraryFull", limitMinutes: limits.libraryMinutes, usedMinutes: Math.ceil(summarizeLibrary(otherItems).totalSeconds / SECONDS_PER_MINUTE) };
}

/**
 * The publish-time re-check over every audio item with a file. Catches what
 * attach cannot: concurrent attaches, rows written before enforcement, and
 * values changed outside attach. An item with no known length blocks the
 * publish of an enforced Space (it must be re-uploaded).
 */
export function checkAudioPublish(policy: AudioQuotaPolicy, items: readonly StoredAudioItem[] | null): { ok: true } | { ok: false; issue: AudioQuotaIssue } {
  if (policy.mode === "unenforced") return { ok: true };
  if (policy.mode === "unavailable" || items === null) return { ok: false, issue: { code: "unavailable" } };
  const { maxRecordingMinutes, libraryMinutes } = policy.limits;
  const { totalSeconds, unknownCount, longestSeconds } = summarizeLibrary(items);
  if (unknownCount > 0) return { ok: false, issue: { code: "durationUnknown" } };
  if (longestSeconds > maxRecordingMinutes * SECONDS_PER_MINUTE) {
    return { ok: false, issue: { code: "recordingTooLong", maxMinutes: maxRecordingMinutes } };
  }
  if (totalSeconds > libraryMinutes * SECONDS_PER_MINUTE) {
    return { ok: false, issue: { code: "libraryFull", limitMinutes: libraryMinutes, usedMinutes: Math.ceil(totalSeconds / SECONDS_PER_MINUTE) } };
  }
  return { ok: true };
}

/** Studio dictionary key for each issue, per stage (attach vs publish wording). */
export function audioQuotaMessageKey(issue: AudioQuotaIssue, stage: "attach" | "publish") {
  switch (issue.code) {
    case "unavailable":
      return "audioAllowanceUnavailable" as const;
    case "durationUnknown":
      return stage === "attach" ? ("audioDurationUnknown" as const) : ("publishAudioDurationUnknown" as const);
    case "recordingTooLong":
      return stage === "attach" ? ("audioRecordingTooLong" as const) : ("publishAudioRecordingTooLong" as const);
    case "libraryFull":
      return stage === "attach" ? ("audioLibraryFull" as const) : ("publishAudioLibraryFull" as const);
  }
}

export function audioQuotaMessageValues(issue: AudioQuotaIssue): Record<string, number> {
  if (issue.code === "recordingTooLong") return { max: issue.maxMinutes };
  if (issue.code === "libraryFull") return { limit: issue.limitMinutes, used: issue.usedMinutes };
  return {};
}
