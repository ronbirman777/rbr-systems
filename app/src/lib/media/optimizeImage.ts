import "server-only";
import sharp from "sharp";
import { MAX_IMAGE_DIMENSION } from "./path";
import { sniffImage } from "./imageSignature";

/**
 * Same re-encode rule as Time to Flow's uploads (configurator/retreat/
 * actions.ts optimizeUploadedImage): EXIF-rotate, fit inside
 * MAX_IMAGE_DIMENSION without enlarging, WebP q82. Kept as a shared helper
 * for Time to Teach's settings-image uploads so guests are never served an
 * original upload; the retreat file keeps its own copy untouched in v1 (a
 * later cleanup can point it here).
 */
export async function optimizeImageToWebp(file: File): Promise<Buffer> {
  const input = Buffer.from(await file.arrayBuffer());
  // TASK 032 (0045): the bytes themselves must be a JPEG/PNG/WebP with a sane
  // header before any decoder sees them - never the declared type or name.
  if (!sniffImage(input)) throw new Error("The upload is not a JPEG, PNG or WebP image.");
  return sharp(input)
    .rotate()
    .resize({ width: MAX_IMAGE_DIMENSION, height: MAX_IMAGE_DIMENSION, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
}
