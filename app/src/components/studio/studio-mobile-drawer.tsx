"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { lockScroll, trapFocusIndex } from "@/lib/studio/scrollLock";

/**
 * TASK 033: the mobile Studio navigation drawer, shared by the Time to Flow
 * configurator and the Time to Teach Studio.
 *
 * Root cause it replaces (measured, WebKit + Chromium at 390px): the Teach
 * Studio rendered its menu as an IN-FLOW block under the sticky header, so
 * opening it from the bottom of a long section (Brand, scrollY 2510) put
 * the panel at top -2441px - entirely above the viewport. The Flow drawer
 * was already `position: fixed`, but its Menu button sat in a non-sticky bar
 * that scrolled away, and neither had a scroll lock, focus trap, Escape or
 * focus return.
 *
 * - Portalled to <body>, so no ancestor can become the containing block of
 *   `position: fixed` (a transform, filter or backdrop-filter - the Teach
 *   header has `backdrop-blur` - would otherwise re-anchor it).
 * - `fixed inset-0`, height `100dvh` with a `100vh`-equivalent fallback
 *   (inset-0 alone), safe-area padding, and its own scroll region with
 *   `overscroll-behavior: contain`, so a long menu scrolls inside the panel.
 * - Background: scroll-locked without losing the position (lib/studio/
 *   scrollLock.ts) and `inert` while open.
 * - A modal dialog (role=dialog, aria-modal, labelled): Escape, the close
 *   button or a backdrop tap closes; Tab is trapped; focus returns to the
 *   element that opened it. No animation, so reduced motion is respected
 *   by construction.
 * - `lang`/`dir` are passed explicitly because the portal leaves the
 *   Studio shell that sets them.
 */
export function StudioMobileDrawer({
  open,
  onClose,
  id,
  label,
  closeLabel,
  lang,
  dir,
  header,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  id: string;
  label: string;
  closeLabel: string;
  lang?: string;
  dir?: "ltr" | "rtl";
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    // The control that opened the drawer gets focus back on close. Safari
    // does not focus a button on click, so activeElement may be <body>:
    // fall back to the trigger that names this drawer in aria-controls.
    const active = document.activeElement;
    const opener =
      active instanceof HTMLElement && active !== document.body
        ? active
        : document.querySelector<HTMLElement>(`[aria-controls="${id}"]`);
    const release = lockScroll();
    const root = document.getElementById(id);
    // Everything else in <body> is inert while the drawer is open.
    const inerted: Element[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el === root || el.hasAttribute("inert") || el.tagName === "SCRIPT") continue;
      el.setAttribute("inert", "");
      inerted.push(el);
    }
    const first = panelRef.current?.querySelector<HTMLElement>("[data-drawer-close]");
    first?.focus({ preventScroll: true });

    function focusables(): HTMLElement[] {
      return Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) return;
      e.preventDefault();
      const next = trapFocusIndex(list.indexOf(document.activeElement as HTMLElement), list.length, e.shiftKey);
      list[next]?.focus();
    }
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      for (const el of inerted) el.removeAttribute("inert");
      release();
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open, id]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      id={id}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      lang={lang}
      dir={dir}
      data-testid="studio-mobile-drawer"
      className="lg:hidden fixed inset-0 z-[100] flex h-dvh"
    >
      <div aria-hidden="true" data-drawer-backdrop className="absolute inset-0" style={{ background: "rgba(27,46,36,0.45)" }} onClick={() => onClose()} />
      <div
        ref={panelRef}
        className="relative w-[280px] max-w-[85vw] h-full max-h-dvh bg-white flex flex-col overflow-hidden shadow-2xl"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
          paddingInlineStart: "env(safe-area-inset-left)",
        }}
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2 shrink-0">
          <div className="min-w-0 ps-2">{header}</div>
          <button
            type="button"
            data-drawer-close
            onClick={() => onClose()}
            aria-label={closeLabel}
            className="w-11 h-11 shrink-0 flex items-center justify-center rounded-lg text-idw-forest/60 text-xl leading-none active:bg-idw-forest/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-current"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div data-drawer-scroll className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4">
          {children}
        </div>
        {footer ? <div className="shrink-0 px-4 pt-3 pb-4 border-t border-idw-forest/10">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}
