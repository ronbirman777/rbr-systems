import { INNERDWES_BRAND } from "@/lib/brand/platform";

/**
 * The InnerDweS circular symbol, reconstructed from the approved Concept 03
 * brand board: a deep forest ring that is almost fully closed, with one
 * small, deliberate "threshold" opening at the bottom - not a wide
 * quarter-circle gap. Inside that opening sits a short clay arc, shorter
 * than the gap itself, so empty breathing space remains on both sides of
 * it (the ring doesn't hand off directly to the arc). A small solid clay
 * dot floats independently in the upper-right interior, offset from
 * center, touching neither the ring nor the arc.
 *
 * Built with `pathLength` + `stroke-dasharray` on plain <circle> elements
 * rather than hand-authored SVG arc-path commands (`A rx,ry ... large-arc
 * sweep`) - an earlier version used raw arc paths with manually guessed
 * flags, which picked the wrong one of the two possible circle centers for
 * a chord and bowed a path through the middle instead of around the ring,
 * rendering as a sunburst/asterisk rather than a ring. `pathLength="100"`
 * makes the dasharray numbers literal percentages of the circle's true
 * circumference, so there's no geometry to get wrong - this is the more
 * reliable technique.
 *
 * Proportions (tuned from the brand board image, not measured from a vector
 * source - nudge GAP_PERCENT/ARC_PERCENT/rotation here if a closer look at
 * the reference calls for it):
 *  - Ring: ~88% visible, ~12% opening, opening centered at 6 o'clock (bottom)
 *  - Clay arc: ~5% of the circle, centered in that same opening, leaving
 *    roughly equal empty space flanking it on both sides
 *  - Dot: offset up-and-right of center, at 1:30, clear of the ring's inner edge
 */
const RING_VISIBLE_PERCENT = 88;
const RING_GAP_PERCENT = 100 - RING_VISIBLE_PERCENT;
// Rotation (degrees) that centers the ring's gap at 6 o'clock - derived from
// SVG circles starting their path at 3 o'clock: centerOfGap = visible*1.8 + rotation + 180,
// solved for rotation so centerOfGap lands on 90 (6 o'clock, mod 360).
const RING_ROTATION = 270 - RING_VISIBLE_PERCENT * 1.8;

const ARC_VISIBLE_PERCENT = 5;
// Same circle, opposite role (visible arc instead of visible ring): centering
// its short visible stroke at 6 o'clock, inside the ring's opening.
const ARC_ROTATION = 90 - ARC_VISIBLE_PERCENT * 1.8;

export function InnerDweSMark({
  className,
  size = 32,
  tone = "on-light",
}: {
  className?: string;
  size?: number;
  /** "on-dark" swaps only the ring's stroke color (Forest -> Parchment) for
   * use on dark photographic surfaces (e.g. the Hero) - same geometry,
   * same Clay arc/dot, never a redraw. */
  tone?: "on-light" | "on-dark";
}) {
  const ringColor = tone === "on-dark" ? INNERDWES_BRAND.parchment : INNERDWES_BRAND.forest;
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      {/* forest ring: ~88% visible, small threshold opening at the bottom */}
      <circle
        cx="50"
        cy="50"
        r="36"
        fill="none"
        stroke={ringColor}
        strokeWidth={6}
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={`${RING_VISIBLE_PERCENT} ${RING_GAP_PERCENT}`}
        transform={`rotate(${RING_ROTATION} 50 50)`}
      />
      {/* clay arc: short, centered in the opening, with breathing space on both sides */}
      <circle
        cx="50"
        cy="50"
        r="36"
        fill="none"
        stroke={INNERDWES_BRAND.clay}
        strokeWidth={6}
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={`${ARC_VISIBLE_PERCENT} ${100 - ARC_VISIBLE_PERCENT}`}
        transform={`rotate(${ARC_ROTATION} 50 50)`}
      />
      {/* inner dot - clay, offset upper-right at ~1:30, independent of the ring */}
      <circle cx="64" cy="36" r="4.5" fill={INNERDWES_BRAND.clay} />
    </svg>
  );
}

export function InnerDweSWordmark({
  className,
  markSize = 32,
  showDescriptor = true,
}: {
  className?: string;
  markSize?: number;
  showDescriptor?: boolean;
}) {
  // Text scales proportionally with the mark rather than a fixed size, so
  // larger "brand moment" placements (e.g. the root page) read as one
  // deliberately-scaled lockup, not a small logo with oversized type bolted on.
  const wordmarkPx = Math.round(markSize * 1.15);
  const descriptorPx = Math.max(10, Math.round(markSize * 0.28));

  return (
    <div className={className}>
      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap justify-center">
        <InnerDweSMark size={markSize} />
        <span
          className="font-brand italic text-idw-forest"
          style={{ fontSize: wordmarkPx, lineHeight: 1 }}
        >
          InnerDweS
        </span>
      </div>
      {showDescriptor && (
        <div
          className="font-semibold uppercase tracking-[0.2em] text-idw-forest/60 mt-2"
          style={{ fontSize: descriptorPx }}
        >
          Digital Wellness Solutions
        </div>
      )}
    </div>
  );
}
