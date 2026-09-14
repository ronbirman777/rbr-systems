import type { ReactNode } from "react";
import { GUEST_BASE_PALETTE } from "@/lib/theme/tokens";

/**
 * Studio Completion pass - shared visual primitives ported from the
 * approved Figma Make source's Creator Workspace field components (FL,
 * FInput/FSelect/FTextarea, SectionSub - see App.tsx). Figma's own Studio
 * chrome uses the exact same Parchment/Forest/Sage/Clay/Sand/Dusk/Mist
 * palette as the Guest App (GUEST_BASE_PALETTE), not a separate token set
 * - reused directly here via inline style, same pattern as every Guest
 * screen this batch, so Studio and Guest App read as the same product.
 * Purely presentational - no new state, no new persistence. Shared by
 * retreat-configurator.tsx and every *-step.tsx editor file so they don't
 * each duplicate their own copy.
 */
export const STUDIO_INPUT_CLASS =
  "w-full bg-white border border-[#D4C5A9]/70 rounded-xl px-3.5 py-2.5 text-[13px] text-[#2D4A3E] outline-none focus:ring-2 focus:ring-[#2D4A3E]/15 focus:border-[#2D4A3E]/30 placeholder:text-[#9B8E84]/60 transition-all";

export function StudioLabel({ children }: { children: ReactNode }) {
  return (
    <label className="text-[10px] tracking-[0.16em] uppercase font-medium block mb-1.5" style={{ color: GUEST_BASE_PALETTE.mist }}>
      {children}
    </label>
  );
}

export function StudioSectionSub({ children, first }: { children: ReactNode; first?: boolean }) {
  return (
    <p
      className={`text-[10px] tracking-[0.18em] uppercase font-semibold mb-3 ${first ? "mt-0" : "mt-7"}`}
      style={{ color: GUEST_BASE_PALETTE.mist }}
    >
      {children}
    </p>
  );
}

export function StudioHeading({ children }: { children: ReactNode }) {
  return (
    <h1
      className="text-[20px] mb-1"
      style={{ fontFamily: "var(--font-dm-serif-display), serif", color: GUEST_BASE_PALETTE.forest }}
    >
      {children}
    </h1>
  );
}

export function StudioIntro({ children }: { children: ReactNode }) {
  return (
    <p className="text-[13px] leading-relaxed mb-8" style={{ color: GUEST_BASE_PALETTE.dusk }}>
      {children}
    </p>
  );
}
