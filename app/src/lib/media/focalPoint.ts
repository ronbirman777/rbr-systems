import { imagePositionSchema, objectPositionStyle, type ImagePosition } from "@/lib/modules/imagePosition";

/**
 * Time to Teach's view of the shared focal point. The data contract, clamping
 * and CSS mapping live in lib/modules/imagePosition.ts (TASK 020); this file
 * only adds the tolerant read-side schema Teach's module schemas rely on, so a
 * malformed stored value degrades to `null` (center) instead of failing the
 * whole item parse. Stored shape is unchanged: { x, y } percentages or null.
 */
export type FocalPoint = NonNullable<ImagePosition>;

export const optionalFocalPointSchema = imagePositionSchema.catch(null);

export function focalPointToObjectPosition(point: ImagePosition | undefined): string {
  return objectPositionStyle(point ?? null);
}
