import { z } from "zod";

/**
 * Shared focal point for every cover/crop image (Time to Teach first; the
 * shape is intentionally identical to the Facilitator `imagePosition`
 * already stored by Time to Flow - see src/lib/modules/facilitator.ts - so
 * there is one metadata convention platform-wide, not two).
 *
 * Percentages (0-100) of the image's own width/height, rendered as CSS
 * `object-position: x% y%` under `object-fit: cover`, which keeps the chosen
 * point in frame at every aspect ratio. `null` means "no choice made" and
 * renders as the center - so reset, replace and remove all store `null`.
 */
export const focalPointSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
});

export type FocalPoint = z.infer<typeof focalPointSchema>;

/** Tolerant read-side schema: anything malformed degrades to `null` (center). */
export const optionalFocalPointSchema = focalPointSchema.nullable().catch(null).default(null);

export const CENTER_FOCAL_POINT: FocalPoint = { x: 50, y: 50 };

export function clampFocalPoint(x: number, y: number): FocalPoint {
  const clamp = (v: number) => Math.round(Math.min(100, Math.max(0, Number.isFinite(v) ? v : 50)));
  return { x: clamp(x), y: clamp(y) };
}

export function focalPointToObjectPosition(point: FocalPoint | null | undefined): string {
  const p = point ?? CENTER_FOCAL_POINT;
  return `${p.x}% ${p.y}%`;
}

/** Keyboard nudge (arrow keys) in 5% steps, used by the focal point picker. */
export function nudgeFocalPoint(point: FocalPoint | null, key: string, step = 5): FocalPoint | null {
  const p = point ?? CENTER_FOCAL_POINT;
  switch (key) {
    case "ArrowLeft":
      return clampFocalPoint(p.x - step, p.y);
    case "ArrowRight":
      return clampFocalPoint(p.x + step, p.y);
    case "ArrowUp":
      return clampFocalPoint(p.x, p.y - step);
    case "ArrowDown":
      return clampFocalPoint(p.x, p.y + step);
    default:
      return null;
  }
}
