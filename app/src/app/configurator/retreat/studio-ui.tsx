"use client";

import { createContext, useContext, type ReactNode } from "react";
import { SECTION_EYEBROW_CLASS, SECTION_INTRO_CLASS, SECTION_TITLE_CLASS, SECTION_TITLE_STYLE } from "@/components/studio/section-header";
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

/**
 * The current Studio section's eyebrow (e.g. "My space", "Content",
 * "Publishing"). The configurator provides it once per step so every
 * StudioHeading renders the same eyebrow/title/intro hierarchy as the
 * Time to Teach Studio without each step file passing it.
 */
export const StudioEyebrowContext = createContext<string | undefined>(undefined);

export function StudioHeading({ children, eyebrow }: { children: ReactNode; eyebrow?: string }) {
  const ctx = useContext(StudioEyebrowContext);
  const label = eyebrow ?? ctx;
  return (
    <div className="flex flex-col gap-1.5">
      {label ? <p className={SECTION_EYEBROW_CLASS}>{label}</p> : null}
      <h1 className={SECTION_TITLE_CLASS} style={SECTION_TITLE_STYLE}>
        {children}
      </h1>
    </div>
  );
}

export function StudioIntro({ children }: { children: ReactNode }) {
  return <p className={`${SECTION_INTRO_CLASS} mt-1.5 mb-8`}>{children}</p>;
}

/**
 * The "→" that trails a forward action ("Continue →").
 *
 * It is NOT part of the translated string, and it is not a decoration
 * either: it means "onward", so it is one of the few glyphs that must
 * mirror in Hebrew. `rtl-mirror` (globals.css) flips it under
 * [dir="rtl"], which keeps the arrow pointing the way the reader is
 * going without every call site having to think about it.
 */
export function ForwardArrow() {
  return (
    <span aria-hidden="true" className="rtl-mirror">
      →
    </span>
  );
}
