"use client";

/* eslint-disable @next/next/no-img-element */
import type { KeyboardEvent, MouseEvent } from "react";
import {
  CENTER_FOCAL_POINT,
  clampFocalPoint,
  focalPointToObjectPosition,
  nudgeFocalPoint,
  type FocalPoint,
} from "@/lib/media/focalPoint";

/**
 * Shared focal point picker (platform component; Time to Teach is its first
 * user). Tap/click the full, uncropped photo to place the marker; arrow keys
 * nudge it 5%; "Reset to center" stores null. Beside it, live crop previews
 * (tall card, circle, wide banner) show the chosen point holding at every
 * aspect ratio - the same object-position rule the Guest App uses.
 */
export function FocalPointPicker({
  imageUrl,
  value,
  onChange,
  label = "Focal point",
}: {
  imageUrl: string;
  value: FocalPoint | null;
  onChange: (next: FocalPoint | null) => void;
  label?: string;
}) {
  const p = value ?? CENTER_FOCAL_POINT;

  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    onChange(clampFocalPoint(((e.clientX - rect.left) / rect.width) * 100, ((e.clientY - rect.top) / rect.height) * 100));
  }

  function handleKey(e: KeyboardEvent<HTMLButtonElement>) {
    const next = nudgeFocalPoint(value, e.key);
    if (next) {
      e.preventDefault();
      onChange(next);
    }
  }

  return (
    <div className="flex flex-col gap-2" data-testid="focal-point-picker">
      <p className="text-[12px] font-medium text-[#2D4A3E]">Tap the photo where the subject is — it stays in frame on every crop.</p>
      <div className="flex flex-wrap items-start gap-3">
        <button
          type="button"
          onClick={handleClick}
          onKeyDown={handleKey}
          aria-label={`${label}: ${p.x}% across, ${p.y}% down. Click to move, or use arrow keys.`}
          className="relative inline-block max-w-[220px] cursor-crosshair rounded-lg overflow-hidden border border-[#D4C5A9]/70 focus-visible:outline-2 focus-visible:outline-[#2D4A3E]"
        >
          <img src={imageUrl} alt="" className="block w-full h-auto max-h-[220px] object-contain bg-[#EAE2D0]" draggable={false} />
          <span
            aria-hidden="true"
            data-testid="focal-marker"
            className="absolute w-[18px] h-[18px] rounded-full border-[3px] border-white shadow-md -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: `${p.x}%`, top: `${p.y}%`, background: "#2D4A3E" }}
          />
        </button>
        <div className="flex items-end gap-2" aria-hidden="true">
          <img src={imageUrl} alt="" className="w-[46px] h-[72px] object-cover rounded-md" style={{ objectPosition: focalPointToObjectPosition(value) }} />
          <img src={imageUrl} alt="" className="w-[56px] h-[56px] object-cover rounded-full" style={{ objectPosition: focalPointToObjectPosition(value) }} />
          <img src={imageUrl} alt="" className="w-[96px] h-[40px] object-cover rounded-md" style={{ objectPosition: focalPointToObjectPosition(value) }} />
        </div>
      </div>
      <div className="flex items-center gap-3 text-[11.5px] text-[#9B8E84]">
        <span>
          {value ? `Focal point ${p.x}% · ${p.y}%` : "Centered (default)"}
        </span>
        {value ? (
          <button type="button" onClick={() => onChange(null)} className="underline text-[#2D4A3E] min-h-8">
            Reset to center
          </button>
        ) : null}
      </div>
    </div>
  );
}
