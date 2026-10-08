"use client";

import type { ReactNode } from "react";
import { ChevronLeftIcon } from "./icons";

/**
 * The bits of Flow screen chrome the TASK 029 screens share.
 *
 * Deliberately only the new screens use these: the older Explore
 * sub-screens each inline their own copy, and rewriting them to import
 * from here would be churn with no user-visible result. What matters is
 * that the three screens added together look like one another and like
 * the rest of Flow - which is what this file guarantees - not that every
 * screen in the app is refactored onto it.
 *
 * Everything here reads --rbr-* tokens, so it inherits the organizer's
 * palette. Nothing is borrowed from the Teach design system (--tt-*):
 * Flow's Readings and Audio share Teach's DATA and BEHAVIOUR, not its
 * appearance.
 */
export function FlowScreenHeader({ eyebrow, title }: { eyebrow: string; title: ReactNode }) {
  return (
    <div className="px-6 pt-7 pb-5">
      <p
        className="text-[10px] tracking-[0.18em] uppercase font-medium mb-1"
        style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}
      >
        {eyebrow}
      </p>
      <h1
        className="text-[24px] font-normal leading-tight"
        style={{ fontFamily: "var(--rbr-font-display)", color: "var(--rbr-text)" }}
      >
        {title}
      </h1>
    </div>
  );
}

/** "Nothing here yet", in the Space's own muted voice. */
export function FlowEmptyNote({ children }: { children: ReactNode }) {
  return (
    <div className="px-6 pb-10 text-xs" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}>
      {children}
    </div>
  );
}

/**
 * The in-screen back control, for a detail view that sits one level
 * below its own list.
 *
 * Distinct from ExploreSubPage's back button, which leaves the module
 * entirely. The chevron carries direction, so it mirrors under RTL
 * (`rtl-mirror`, globals.css) rather than pointing the wrong way in
 * Hebrew.
 */
export function FlowBackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ color: "var(--rbr-mist)", fontFamily: "var(--rbr-font-ui)" }}
      className="flex items-center gap-1.5 px-6 pt-5 pb-1 text-[11px] font-medium tracking-[0.08em] uppercase shrink-0 min-h-11 touch-manipulation transition-opacity active:opacity-60"
    >
      <ChevronLeftIcon />
      {label}
    </button>
  );
}

/** One organizer-authored list, as a column of hanging bullets. */
export function FlowBulletList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 items-start">
          <span
            aria-hidden="true"
            className="w-1 h-1 rounded-full shrink-0 mt-[0.5em]"
            style={{ background: "var(--rbr-secondary)" }}
          />
          <span
            dir="auto"
            className="text-[13px] leading-relaxed"
            style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-dusk)" }}
          >
            {item}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A titled block on a detail screen - "What to Bring", "A note", etc. */
export function FlowSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="px-6 pb-6">
      <h2
        className="text-[10px] tracking-[0.2em] uppercase font-semibold mb-2.5"
        style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}
