"use client";

import { cloneElement, createContext, useContext, useId, type ReactElement, type ReactNode } from "react";
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
/**
 * Hit area, not visual size.
 *
 * The Studio's row actions are deliberately quiet: "Edit", "Remove",
 * "Done" and the ▲▼ reorder arrows are small text, and making them
 * physically 44x44 would turn a compact list into a toolbar. Measured at
 * 390px, the arrows were 10x15 and the text actions 16-17px tall - fine
 * to look at, hard to hit, and below the WCAG 2.2 target-size floor.
 *
 * These expand the TARGET with an invisible centred ::after box, so the
 * layout, the type size and the spacing are all unchanged while the thing
 * a finger has to land on is at least 44x44. `SQUARE` is for icon-sized
 * controls (both axes grow), `ROW` for text actions that are already wide
 * enough and only need height.
 *
 * docs/tasks/029/a11y-names.mjs measures the union of the box and this
 * pseudo-element, so a control counts as compliant only if the hit area
 * is really there.
 */
export const STUDIO_HIT_SQUARE_CLASS =
  "relative after:content-[''] after:absolute after:left-1/2 after:top-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:w-11 after:h-11";
export const STUDIO_HIT_ROW_CLASS =
  "relative after:content-[''] after:absolute after:-inset-x-2 after:top-1/2 after:-translate-y-1/2 after:h-11";

export const STUDIO_INPUT_CLASS =
  "w-full bg-white border border-[#D4C5A9]/70 rounded-xl px-3.5 py-2.5 text-[13px] text-[#2D4A3E] outline-none focus:ring-2 focus:ring-[#2D4A3E]/15 focus:border-[#2D4A3E]/30 placeholder:text-[#9B8E84]/60 transition-all";

/**
 * A field label. It has always rendered a real <label>, which is exactly
 * why the problem was easy to miss: the element was right, the
 * ASSOCIATION was not. The control sits NEXT TO the label, not inside it,
 * so without `htmlFor` the visible label was not the field's accessible
 * name - a11y-names.mjs measured 54 unnamed controls across the Flow
 * Studio because of it.
 *
 * `htmlFor` is optional, because this also labels things that are not a
 * single form control (a swatch group, a photo block). For an ordinary
 * field prefer `StudioField`, which wires the association for you.
 */
export function StudioLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-[10px] tracking-[0.16em] uppercase font-medium block mb-1.5"
      style={{ color: GUEST_BASE_PALETTE.mist }}
    >
      {children}
    </label>
  );
}

/**
 * A label and its control, associated.
 *
 * The id is generated here and cloned onto the child, so no editor has to
 * invent one. That matters most inside the item editors, where the same
 * fields are rendered per item and a hand-written id would either collide
 * across items or have to be threaded through every field.
 *
 * Renders a fragment rather than a wrapper, so it drops into the existing
 * one-div-per-field layout without changing any spacing.
 */
export function StudioField({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactElement<{ id?: string }>;
}) {
  const id = useId();
  return (
    <>
      <StudioLabel htmlFor={id}>{label}</StudioLabel>
      {cloneElement(children, { id })}
    </>
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
