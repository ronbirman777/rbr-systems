import "server-only";
import sharp from "sharp";
import { MAX_IMAGE_DIMENSION } from "./path";

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
  return sharp(input)
    .rotate()
    .resize({ width: MAX_IMAGE_DIMENSION, height: MAX_IMAGE_DIMENSION, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
}
