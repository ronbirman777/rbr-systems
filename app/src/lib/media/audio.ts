/**
 * Audio file rules shared by the draft upload, the publish copy and the
 * Studio. Product-neutral on purpose: the media layer must not import a
 * product's schema module. (The 100 MB cap is the existing temporary
 * limit, not a billing/entitlement rule.)
 */
import { parseVersionedMediaPath, type VersionedMediaParts } from "./path";

export const AUDIO_ALLOWED_TYPES: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/ogg": "ogg",
};

export const AUDIO_MIME_BY_EXTENSION: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
};

export const AUDIO_EXTENSIONS: ReadonlySet<string> = new Set(Object.values(AUDIO_ALLOWED_TYPES));

export const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

export function isAudioSizeAllowed(sizeBytes: number): boolean {
  return Number.isFinite(sizeBytes) && sizeBytes > 0 && sizeBytes <= MAX_AUDIO_BYTES;
}

/** Drops any `; codecs=...` parameter and case, as Storage reports mimetypes. */
export function normalizeMimeType(type: string): string {
  return type.split(";")[0].trim().toLowerCase();
}

/**
 * Parses a versioned DRAFT audio ref (`{tenant}/{module}/{item}/{uploadId}/draft.<ext>`
 * with a supported audio extension); null for anything else, including
 * published refs and the legacy unversioned shape.
 */
export function parseAudioDraftRef(ref: string): VersionedMediaParts | null {
  const parts = parseVersionedMediaPath(ref);
  if (!parts || parts.kind !== "draft" || !AUDIO_EXTENSIONS.has(parts.ext)) return null;
  return parts;
}

/**
 * What is wrong with this file for an audio upload, or null when nothing
 * is - the shared half of the Studio's client-side pre-check.
 *
 * Only the RULE is shared; the message is not. The two products word the
 * refusal differently and in three locales, so this returns a reason the
 * caller translates rather than a string. The server re-checks both the
 * mimetype and the size when it mints the upload path, so this is a
 * courtesy to the organizer, never the enforcement point.
 *
 * It deliberately matches the existing Teach check byte for byte: the
 * browser-reported `type` is looked up as given (not normalized - Storage
 * normalization applies to what Storage reports, not to a File), and the
 * size test is a bare upper bound, so a zero-byte file still reaches the
 * server that will reject it.
 */
export type AudioFileProblem = "unsupportedType" | "tooLarge";

export function audioFileProblem(file: { type: string; size: number }): AudioFileProblem | null {
  if (!AUDIO_ALLOWED_TYPES[file.type]) return "unsupportedType";
  if (file.size > MAX_AUDIO_BYTES) return "tooLarge";
  return null;
}
