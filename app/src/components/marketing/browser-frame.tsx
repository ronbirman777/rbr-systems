import type { ReactNode } from "react";

/**
 * Pure CSS browser chrome for the Selected Work case study - mirrors
 * PhoneFrame's role for the website surface. Unlike PhoneFrame elsewhere on
 * this site, what it wraps here is a real screenshot image, not a live
 * component - Wonderland is a past bespoke project, not something this
 * Next.js app renders.
 */
export function BrowserFrame({
  children,
  className = "",
  width = 340,
}: {
  children: ReactNode;
  className?: string;
  width?: number;
}) {
  return (
    <div
      className={`relative shrink-0 rounded-xl overflow-hidden bg-idw-graphite shadow-[0_30px_60px_-20px_rgba(25,43,33,0.45)] ${className}`}
      style={{ width }}
    >
      <div className="flex items-center gap-1.5 px-3 py-2.5 bg-black/25">
        <span className="w-2 h-2 rounded-full bg-red-400/70" />
        <span className="w-2 h-2 rounded-full bg-yellow-400/70" />
        <span className="w-2 h-2 rounded-full bg-green-400/70" />
      </div>
      <div className="relative aspect-[16/10] overflow-hidden bg-idw-parchment">{children}</div>
    </div>
  );
}
