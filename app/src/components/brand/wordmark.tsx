import { INNERDWES_BRAND } from "@/lib/brand/platform";

/**
 * The InnerDweS circular symbol, reconstructed from the approved brand
 * board (no vector source available): a deep forest ring covering most of
 * the circle, a deliberate open threshold at the bottom, a restrained clay
 * arc integrated into the lower-right portion of that opening (not
 * touching the forest ring on either side), and a small offset clay dot
 * floating in the upper-right interior.
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
 * Clock positions (visual, not exact degrees) for future adjustment:
 *  - Forest ring: 8 o'clock, clockwise all the way around, to 5 o'clock (270 deg)
 *  - Open threshold: 5 o'clock to 8 o'clock (the remaining 90 deg)
 *  - Clay arc: 6 o'clock to 7:30, i.e. the lower-right part of that opening,
 *    leaving visible negative space on both sides of it
 */
export function InnerDweSMark({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      {/* forest ring: visible from 8 o'clock, clockwise, to 5 o'clock (270 deg / 75%) */}
      <circle
        cx="50"
        cy="50"
        r="36"
        fill="none"
        stroke={INNERDWES_BRAND.forest}
        strokeWidth={6}
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray="75 25"
        transform="rotate(150 50 50)"
      />
      {/* clay arc: visible from 6 o'clock to 7:30 (45 deg / 12.5%), inside the opening */}
      <circle
        cx="50"
        cy="50"
        r="36"
        fill="none"
        stroke={INNERDWES_BRAND.clay}
        strokeWidth={6}
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray="12.5 87.5"
        transform="rotate(90 50 50)"
      />
      {/* inner dot - clay, offset upper-right, not touching the ring */}
      <circle cx="61.3" cy="38.7" r="5" fill={INNERDWES_BRAND.clay} />
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
