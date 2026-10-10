import { createHash } from "node:crypto";

/**
 * TASK 032 (0046) - content fingerprint helpers (server only: node:crypto).
 * sha256 of the stored bytes, lowercase hex - the form
 * billing_audio_verifications.sha256 stores and checks (^[0-9a-f]{64}$).
 */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export type ContentFingerprint = { sizeBytes: number; sha256: string };

export function sameFingerprint(a: ContentFingerprint, b: ContentFingerprint): boolean {
  return a.sizeBytes === b.sizeBytes && a.sha256 === b.sha256;
}
