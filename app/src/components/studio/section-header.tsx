import type { ReactNode } from "react";

/** Shared Studio heading styles, so every Studio section reads identically. */
export const SECTION_EYEBROW_CLASS = "text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A7B4F]";
export const SECTION_TITLE_CLASS = "text-[30px] leading-tight text-[#192B21]";
export const SECTION_TITLE_STYLE = { fontFamily: "var(--font-fraunces), serif" } as const;
export const SECTION_INTRO_CLASS = "text-[13.5px] text-[#6F6C66] leading-relaxed max-w-[62ch]";

/**
 * The one Studio section heading (eyebrow / title / intro), shared by the
 * Time to Teach and Time to Flow Studios.
 */
export function SectionHeader({ eyebrow, title, intro }: { eyebrow?: string; title: ReactNode; intro?: ReactNode }) {
  return (
    <header className="flex flex-col gap-1.5">
      {eyebrow ? <p className={SECTION_EYEBROW_CLASS}>{eyebrow}</p> : null}
      <h1 className={SECTION_TITLE_CLASS} style={SECTION_TITLE_STYLE}>
        {title}
      </h1>
      {intro ? <p className={SECTION_INTRO_CLASS}>{intro}</p> : null}
    </header>
  );
}
