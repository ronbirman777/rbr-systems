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
