/**
 * Shared image shape ("treatment") vocabulary for brand and Studio image
 * previews: standard rectangle, rounded, circle. Pure CSS mapping - no
 * persistence and no media behaviour (versioned immutable media, Storage
 * cleanup and /api/media protection are untouched by this module).
 *
 * Products map onto it: Time to Flow's atmosphere "square" is a
 * rectangle; Time to Teach's hero "circle" is a circle.
 */
export const IMAGE_SHAPES = ["rectangle", "rounded", "circle"] as const;
export type ImageShape = (typeof IMAGE_SHAPES)[number];

export const IMAGE_SHAPE_LABEL: Record<ImageShape, string> = {
  rectangle: "Standard",
  rounded: "Rounded",
  circle: "Circle",
};

export function isImageShape(value: unknown): value is ImageShape {
  return typeof value === "string" && (IMAGE_SHAPES as readonly string[]).includes(value);
}

/** Border radius for a shape; `cornerPx` is the rounded radius (defaults to 16). */
export function imageShapeRadius(shape: ImageShape, cornerPx = 16): string {
  if (shape === "circle") return "9999px";
  if (shape === "rounded") return `${cornerPx}px`;
  return "0px";
}

/** Circle requires a square box; other shapes keep the supplied aspect ratio. */
export function imageShapeAspect(shape: ImageShape, fallbackAspect: string): string {
  return shape === "circle" ? "1 / 1" : fallbackAspect;
}

/** Map the existing Flow atmosphere image treatment onto the shared vocabulary. */
export function shapeFromAtmosphereTreatment(treatment: "rounded" | "square"): ImageShape {
  return treatment === "square" ? "rectangle" : "rounded";
}
