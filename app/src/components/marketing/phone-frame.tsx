import type { CSSProperties, ReactNode } from "react";

/**
 * Pure CSS device chrome for marketing display - the screen content inside
 * is always a real Guest App component (TodayScreen, ScheduleScreen, etc.)
 * rendered with curated demo props, never a hand-drawn approximation. This
 * file owns only the bezel/notch/status-bar, nothing about what a guest
 * actually sees.
 */
export function PhoneFrame({
  children,
  className = "",
  width = 260,
  widthLg,
}: {
  children: ReactNode;
  className?: string;
  width?: number;
  /** Optional wider size at the lg breakpoint - for a device meant to read
   * as substantially larger/dominant on desktop while still fitting
   * narrow mobile viewports at its base `width`. */
  widthLg?: number;
}) {
  return (
    <div
      className={`relative shrink-0 rounded-[2.2rem] bg-idw-graphite p-2 shadow-[0_30px_60px_-20px_rgba(25,43,33,0.45)] ${
        widthLg ? "w-[var(--phone-w)] lg:w-[var(--phone-w-lg)]" : ""
      } ${className}`}
      style={
        widthLg
          ? ({ "--phone-w": `${width}px`, "--phone-w-lg": `${widthLg}px` } as CSSProperties)
          : { width }
      }
    >
      <div className="absolute left-1/2 top-2 -translate-x-1/2 h-1.5 w-16 rounded-full bg-black/40 z-10" aria-hidden="true" />
      <div className="relative rounded-[1.7rem] overflow-hidden bg-idw-parchment aspect-[9/19.5]">
        <div className="absolute inset-0 overflow-y-auto no-scrollbar">{children}</div>
      </div>
    </div>
  );
}
