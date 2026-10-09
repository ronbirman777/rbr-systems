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
 * TRUST GAP (documented in docs/billing/ENTITLEMENTS.md): a recording's
 * length is measured in the BROWSER (detectAudioDuration) and reported to
 * the server. The server cannot decode audio today, so it validates the
 * claim and bounds it from below by the stored object's real size
 * (minPlausibleDurationSeconds): a client can under-report a compressed
 * file, but never below what its byte size makes physically plausible.
 */

export const SECONDS_PER_MINUTE = 60;

/** The existing schema ceiling on a stored durationSeconds (12 h). */
export const MAX_STORED_DURATION_SECONDS = 60 * 60 * 12;

/**
 * Highest byte rate we accept as plausible per container. Generous on
 * purpose so an honest file is never inflated:
 *   - wav: 24-bit / 96 kHz stereo PCM = 576,000 B/s
 *   - compressed (mp3/m4a/aac/ogg): 512 kbit/s = 64,000 B/s (above MP3's
 *     320 kbit/s ceiling and typical AAC/Vorbis maxima)
 * An unknown extension uses the most lenient (wav) rate.
 */
export const MAX_PLAUSIBLE_BYTES_PER_SECOND: Readonly<Record<string, number>> = {
  wav: 576_000,
  mp3: 64_000,
  m4a: 64_000,
  aac: 64_000,
  ogg: 64_000,
};

export function minPlausibleDurationSeconds(sizeBytes: number, ext: string): number {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return 0;
  const rate = MAX_PLAUSIBLE_BYTES_PER_SECOND[ext] ?? MAX_PLAUSIBLE_BYTES_PER_SECOND.wav;
  return Math.ceil(sizeBytes / rate);
}

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
 * the durationSeconds to STORE: for an enforced Space that is the claim
 * raised to the byte-size floor, so the publish-time sum cannot be lowered
 * below what the bytes make plausible.
 *
 * Boundaries are inclusive at whole-second resolution: 60:00 (3600 s)
 * passes, 60:01 (3601 s) is refused; a library exactly at its allowance
 * passes, one second over is refused.
 */
export function checkAudioAttach(
  policy: AudioQuotaPolicy,
  input: { claimedSeconds: unknown; sizeBytes: number; ext: string; otherItems: readonly StoredAudioItem[] }
): AttachCheckResult {
  if (policy.mode === "unenforced") return { ok: true, durationSeconds: normalizeReportedDuration(input.claimedSeconds) };
  if (policy.mode === "unavailable") return { ok: false, issue: { code: "unavailable" } };

  const { maxRecordingMinutes, libraryMinutes } = policy.limits;
  const claim = input.claimedSeconds;
  if (typeof claim !== "number" || !Number.isFinite(claim) || claim < 0) return { ok: false, issue: { code: "durationUnknown" } };
  const effective = Math.max(Math.round(claim), minPlausibleDurationSeconds(input.sizeBytes, input.ext));
  if (effective > maxRecordingMinutes * SECONDS_PER_MINUTE) {
    return { ok: false, issue: { code: "recordingTooLong", maxMinutes: maxRecordingMinutes } };
  }
  const { totalSeconds } = summarizeLibrary(input.otherItems);
  if (totalSeconds + effective > libraryMinutes * SECONDS_PER_MINUTE) {
    return { ok: false, issue: { code: "libraryFull", limitMinutes: libraryMinutes, usedMinutes: Math.ceil(totalSeconds / SECONDS_PER_MINUTE) } };
  }
  return { ok: true, durationSeconds: effective };
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
