"use client";

/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";
import { createTranslator, type Locale } from "@/lib/i18n";
import { StudioButton } from "./studio-fields";

/**
 * One row of a Studio list editor: a summary line that expands into the
 * item's fields, with optional reorder arrows and a Remove button.
 *
 * This is the PRESENTATIONAL half of Teach's ItemList, lifted out so the
 * Flow configurator's new modules (readings, audio, guidelines) get the
 * identical row without copying 50 lines of markup. It holds no state and
 * knows nothing about persistence: which row is open, where the items
 * live, and what Remove actually does all stay with the caller.
 *
 * The STATEFUL half of ItemList was deliberately not extracted. It is
 * bound to Teach's StudioApi - a keyed item registry with per-section
 * dirty tracking and a generic removeItem - whereas the Flow configurator
 * keeps one useState per module and one server action per section. Making
 * one component serve both would mean either rewriting Flow's state model
 * or inventing an adapter that only Teach uses; neither belongs in an
 * extraction pass whose contract is zero behaviour change. The row is the
 * part that is genuinely common today.
 *
 * Every class name, hex value and aria label here is carried over
 * verbatim from the Teach original, so the rows it renders are
 * pixel-identical to the ones it replaced.
 */
export function CollapsibleItemRow({
  locale,
  testId,
  title,
  sub,
  thumb,
  open,
  onToggle,
  move,
  onRemove,
  removing = false,
  children,
}: {
  locale: Locale;
  /** Rendered as data-testid; existing Studio tests select on it. */
  testId?: string;
  title: string;
  sub: string;
  /**
   * The thumbnail URL, null for the empty placeholder square, or
   * undefined to leave out the thumbnail slot entirely (text-only rows
   * such as FAQ entries).
   */
  thumb?: string | null;
  open: boolean;
  onToggle: () => void;
  /** Omit to hide the reorder arrows (a list shown in a derived order). */
  move?: { up: () => void; down: () => void; upDisabled: boolean; downDisabled: boolean };
  onRemove?: () => void;
  removing?: boolean;
  /** The item's editor, rendered only while expanded. */
  children: ReactNode;
}) {
  const { t } = createTranslator(locale);
  return (
    <div className={`rounded-xl border ${open ? "border-[#9A7B4F]/60 bg-[#FBF8F2]" : "border-[#E2DACD] bg-white"}`} data-testid={testId}>
      <div className="flex items-center gap-3 p-3">
        {thumb !== undefined ? (
          thumb ? (
            <img src={thumb} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0" />
          ) : (
            <span className="w-11 h-11 rounded-lg bg-[#F1E9DC] shrink-0" aria-hidden="true" />
          )
        ) : null}
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex-1 min-w-0 text-left min-h-11">
          <span className="block text-[14px] font-semibold text-[#192B21] truncate">{title || t("common", "untitled")}</span>
          <span className="block text-[11.5px] text-[#8C8A84] truncate">{sub}</span>
        </button>
        {move ? (
          <span className="flex">
            <button type="button" onClick={move.up} aria-label={t("studio", "moveUp")} className="w-9 h-9 rounded-lg text-[#6F6C66] hover:bg-black/5 relative after:content-[''] after:absolute after:left-1/2 after:top-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:w-11 after:h-11" disabled={move.upDisabled}>
              ↑
            </button>
            <button type="button" onClick={move.down} aria-label={t("studio", "moveDown")} className="w-9 h-9 rounded-lg text-[#6F6C66] hover:bg-black/5 relative after:content-[''] after:absolute after:left-1/2 after:top-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:w-11 after:h-11" disabled={move.downDisabled}>
              ↓
            </button>
          </span>
        ) : null}
        <button type="button" onClick={onToggle} aria-label={open ? t("studio", "collapse") : t("common", "edit")} className="w-9 h-9 rounded-lg text-[#6F6C66] hover:bg-black/5 relative after:content-[''] after:absolute after:left-1/2 after:top-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:w-11 after:h-11">
          {open ? "▴" : "▾"}
        </button>
      </div>
      {open ? (
        <div className="px-3 sm:px-4 pb-4 flex flex-col gap-4 border-t border-[#E2DACD] pt-4">
          {children}
          {onRemove ? (
            <div className="flex justify-end">
              <StudioButton kind="danger" onClick={onRemove} disabled={removing}>
                {removing ? t("common", "removing") : t("common", "remove")}
              </StudioButton>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
