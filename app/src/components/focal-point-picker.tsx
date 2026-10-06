"use client";

import { useRef, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { clampImagePosition, type ImagePosition } from "@/lib/modules/imagePosition";
import { createTranslator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

const KEYBOARD_STEP = 2;

export type FocalPointPickerProps = {
  imageUrl: string;
  position: ImagePosition;
  onChange: (position: ImagePosition) => void;
  /** Default marker position (and rendered object-position) while
   * `position` is null - true center (50, 50) unless the caller has an
   * established, evidenced reason to differ (see TeamEditor's "center
   * top" bias for facilitator headshots, preserved deliberately). */
  defaultPosition?: { x: number; y: number };
  /** The Space's system language, for this control's own instructions. */
  locale?: Locale;
  /** Tailwind `aspect-[]` value for the preview box - should match this
   * surface's real guest render shape as closely as practical, so the
   * preview crop the organizer sees while choosing a focus point is the
   * same shape guests will actually see. */
  aspect?: string;
  /** Identifies which image this control affects, for its accessible name
   * and live-region text - several may exist on one editor screen at once
   * (e.g. "Meals cover image", one per meal's own photo). */
  label: string;
};

/**
 * TASK 020 - the one shared focal-point capability every organizer-
 * uploaded, cover-cropped image in the product uses. Extracted and
 * generalized from the facilitator-only prototype it replaces
 * (retreat-configurator.tsx previously had its own local
 * FacilitatorFocalPointPicker with an identical click-to-set interaction
 * and the exact same 0-100 coordinate convention - this is that same
 * control, not a second, parallel implementation, now reusable by every
 * cropping surface the TASK 020 audit found).
 *
 * Deliberately still the simplest possible interaction - click/tap to
 * set, arrow keys to nudge, Reset to default - not a drag-handle crop
 * editor. Coordinates are mapped through the container's own actual
 * rendered bounding box (`getBoundingClientRect`), so scaling between the
 * preview's displayed size and the underlying image's real pixel
 * dimensions is irrelevant - a click is always read as "this percentage
 * across the box the organizer can see," which is exactly what
 * `object-position` itself consumes.
 */
export function FocalPointPicker({
  imageUrl,
  position,
  onChange,
  defaultPosition = { x: 50, y: 50 },
  aspect = "4/3",
  label,
  locale = DEFAULT_LOCALE,
}: FocalPointPickerProps) {
  const { t } = createTranslator(locale);
  const containerRef = useRef<HTMLDivElement>(null);
  const x = position?.x ?? defaultPosition.x;
  const y = position?.y ?? defaultPosition.y;

  function setFromPointer(clientX: number, clientY: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const nextX = ((clientX - rect.left) / rect.width) * 100;
    const nextY = ((clientY - rect.top) / rect.height) * 100;
    onChange(clampImagePosition(nextX, nextY));
  }

  function handleClick(e: ReactMouseEvent<HTMLDivElement>) {
    setFromPointer(e.clientX, e.clientY);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-KEYBOARD_STEP, 0],
      ArrowRight: [KEYBOARD_STEP, 0],
      ArrowUp: [0, -KEYBOARD_STEP],
      ArrowDown: [0, KEYBOARD_STEP],
    };
    const move = moves[e.key];
    if (move) {
      // Arrow keys must nudge the marker, never scroll the page behind it.
      e.preventDefault();
      onChange(clampImagePosition(x + move[0], y + move[1]));
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      // This is a plain focusable div, not a real <button> (it also
      // handles click-to-position, which a <button> click handler can't
      // distinguish from a keyboard activation) - prevent Enter/Space from
      // ever bubbling into an unwanted implicit form submission.
      e.preventDefault();
    }
  }

  const instructionsId = `focal-instructions-${label.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div className="mt-3">
      <p id={instructionsId} className="text-[11px] mb-1.5 text-idw-forest/50">
        {t("studio", "focalHint")}
      </p>
      <div
        ref={containerRef}
        role="button"
        tabIndex={0}
        aria-label={`${label} focus point`}
        aria-describedby={instructionsId}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className="relative w-full max-w-[220px] rounded-xl overflow-hidden cursor-crosshair border border-idw-forest/15 focus:outline focus:outline-2 focus:outline-idw-sage focus:outline-offset-2"
        style={{ aspectRatio: aspect.replace("/", " / ") }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          className="w-full h-full object-cover"
          style={{ objectPosition: `${x}% ${y}%` }}
        />
        {/* Shape + outline, not color alone: a white-ringed dark dot with
            its own drop shadow so it reads against both light and dark
            image regions. */}
        <div
          aria-hidden="true"
          className="absolute w-4 h-4 rounded-full border-2 border-white -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            background: "#2D4A3E",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.35), 0 1px 4px rgba(0,0,0,0.45)",
          }}
        />
      </div>
      <span className="sr-only" aria-live="polite">
        {t("studio", "focalPointSet", { x: Math.round(x), y: Math.round(y) })}
      </span>
      {position !== null && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="mt-1.5 text-[11px] underline text-idw-forest/50"
        >
          Reset to default
        </button>
      )}
    </div>
  );
}
