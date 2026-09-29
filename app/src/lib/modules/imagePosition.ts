import { z } from "zod";

/**
 * TASK 020 - the one shared focal-point data contract, extracted from the
 * facilitator-only prototype this replaces (facilitator.ts's own inline
 * `imagePosition` field previously duplicated this exact shape). Every
 * cropping surface in the product stores and reads this same shape, so a
 * single normalization/validation path protects all of them at once.
 *
 * Percentages (0-100), never 0-1 fractions or raw pixels - matches the
 * pre-existing facilitator convention exactly, so no conversion or
 * migration is needed for the one surface that already had this field.
 */
export const imagePositionSchema = z
  .object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) })
  .nullable()
  .default(null);

export type ImagePosition = { x: number; y: number } | null;

/** The shared default when no position has been set and a surface has no
 * established, evidenced reason to prefer a different default (see
 * Facilitators' own "center top" bias for headshots, preserved separately -
 * TASK-020 report, Section 5). */
export const CENTER_POSITION = { x: 50, y: 50 } as const;

/**
 * Clamps a raw x/y pair into the valid 0-100 range and rounds to whole
 * percentages (matching the precision the existing facilitator picker
 * already used) - the single place a pointer- or keyboard-derived
 * coordinate is sanitized before ever being stored or rendered, so an
 * out-of-bounds value (e.g. a click just outside the preview edge) can
 * never persist.
 */
export function clampImagePosition(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.round(Math.min(100, Math.max(0, x))),
    y: Math.round(Math.min(100, Math.max(0, y))),
  };
}

/**
 * Reads an untrusted metadata.imagePosition value (module_items.metadata,
 * module_configs.image_position, or a published_spaces snapshot) and
 * returns a valid position or null. The single place this validation
 * happens, reused by every hydration/publish-read path, so invalid,
 * stale, or legacy metadata (missing entirely, wrong shape, out-of-range
 * numbers) can never crash rendering - it just resolves to "use the
 * default," identically to a facilitator/item that never had one.
 */
export function parseImagePosition(value: unknown): ImagePosition {
  const parsed = imagePositionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * The one place an ImagePosition (or its absence) becomes a real CSS
 * `object-position` value. `fallback` lets one surface preserve an
 * established, evidenced default other than true center - every new
 * surface this task adds focal support to should pass the true-center
 * default (the parameter's own default) rather than inventing another
 * bespoke fallback.
 */
export function objectPositionStyle(
  position: ImagePosition,
  fallback: { x: number; y: number } = CENTER_POSITION
): string {
  const p = position ?? fallback;
  return `${p.x}% ${p.y}%`;
}
