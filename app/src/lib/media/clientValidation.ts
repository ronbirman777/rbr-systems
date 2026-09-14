import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "./path";

export type ImageValidationResult = { ok: true } | { ok: false; title: string; body: string };

/**
 * The client-side half of the same size/type boundary actions.ts already
 * enforces server-side (ALLOWED_IMAGE_TYPES/MAX_IMAGE_BYTES in path.ts) -
 * this never replaces that enforcement, it only rejects an obviously-bad
 * file before any FormData is built or pending state is set, so an
 * oversized file never starts a loading state or touches the network.
 * A bypassed/malformed request still hits the real server check
 * untouched (see uploadBrandImage/uploadModuleItemPhoto in actions.ts).
 */
export function validateImageFile(file: File): ImageValidationResult {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { ok: false, title: "Unsupported image format", body: "Please choose a JPG, PNG, or WebP image." };
  }
  if (file.size <= 0) {
    return { ok: false, title: "Image could not be processed", body: "Please choose another image." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      title: "Image is too large",
      body: "This image is larger than 8 MB. Please choose a smaller image.",
    };
  }
  return { ok: true };
}

/**
 * Server-side upload rejections (actions.ts) are still real, plain-text
 * error messages - this maps the two known ones back onto the exact same
 * dialog copy the client-side check already uses, so an organizer sees
 * one consistent pattern regardless of which side caught the problem.
 * Anything else (e.g. a Storage/processing failure) falls back to a
 * generic, still-specific-to-images message - never a raw server string.
 */
export function classifyServerImageError(message: string): { title: string; body: string } {
  if (/\b8\s*mb\b|too large|size/i.test(message)) {
    return { title: "Image is too large", body: "This image is larger than 8 MB. Please choose a smaller image." };
  }
  if (/jpg|png|webp|format/i.test(message)) {
    return { title: "Unsupported image format", body: "Please choose a JPG, PNG, or WebP image." };
  }
  return { title: "Image could not be processed", body: "Please choose another image." };
}
