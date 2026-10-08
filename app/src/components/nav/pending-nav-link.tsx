"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type MouseEvent, type ReactNode } from "react";

/**
 * The one back / "My Spaces" navigation control (TASK 031 W3).
 *
 * WHY IT EXISTS. The Studio's back controls were bare buttons or links with
 * no pressed state, no pending state and, on the two desktop bars, no
 * visible response at all between the tap and /space finally streaming in -
 * on a phone that reads as "nothing happened", so people tap again. This is
 * ONE implementation of the behaviour every such control needs, instead of
 * a patched copy per screen:
 *
 *  - It is a real <a href> (next/link): middle-click, "open in new tab",
 *    long-press and assistive-tech link semantics all keep working, and
 *    the route is prefetched. Modified or non-primary clicks are left to
 *    the browser untouched.
 *  - PRESS feedback is pure CSS, so it is there on pointer-down, before
 *    any JavaScript runs: a background tint, a slight scale, and the
 *    platform tap highlight for touch.
 *  - FOCUS: the global :focus-visible ring (clay, 2px) applies; nothing
 *    here removes it.
 *  - PENDING: navigation runs inside a transition, so React knows when it
 *    is genuinely in flight. While it is, the control is aria-busy /
 *    aria-disabled, ignores further clicks (no duplicate navigation) and
 *    announces "Opening…" to screen readers. A visual spinner only appears
 *    after `spinnerDelayMs` - a navigation that lands at once never flashes
 *    a fake loading state - and it is positioned absolutely, so the layout
 *    never shifts.
 *  - GUARD: `beforeNavigate(go)` lets a caller put its unsaved-changes
 *    check in front. Nothing navigates until the caller calls `go()`;
 *    cancelling simply never calls it, leaving the control usable.
 *  - HIT AREA: a real min 44x44 box. No ::after bleed, because pseudo
 *    hit-areas on adjacent controls are exactly what made TASK 029's
 *    reorder arrows trigger the wrong button.
 */
export const NAV_CONTROL_BASE =
  "relative inline-flex items-center min-h-11 min-w-11 rounded-lg touch-manipulation select-none transition-[background-color,transform,opacity] duration-100 " +
  "[-webkit-tap-highlight-color:rgba(25,43,33,0.14)] active:bg-idw-forest/10 active:scale-[0.97] motion-reduce:active:scale-100 " +
  "data-[pending=true]:opacity-70 data-[pending=true]:cursor-progress";

export type NavClickAction = "browser" | "ignore" | "guard" | "go";

/**
 * What a click on the control should do. Pure, so the rules that matter are
 * testable without a DOM:
 *  - a modified or non-primary click is the browser's (open in new tab);
 *  - while a navigation is in flight (or about to be) every further click is
 *    swallowed - this is the "no duplicate navigation" rule;
 *  - otherwise a guard, when present, decides; without one, go.
 */
export function navClickAction(
  event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean },
  state: { pending: boolean; started: boolean; hasGuard: boolean }
): NavClickAction {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return "browser";
  if (state.pending || state.started) return "ignore";
  return state.hasGuard ? "guard" : "go";
}

export function PendingNavLink({
  href,
  children,
  className = "",
  pendingLabel,
  ariaLabel,
  beforeNavigate,
  spinnerDelayMs = 250,
  testId,
}: {
  href: string;
  children: ReactNode;
  /** Layout/colour only; the press, focus and pending behaviour is built in. */
  className?: string;
  /** Read out to assistive tech while the navigation is in flight. */
  pendingLabel: string;
  ariaLabel?: string;
  /** An unsaved-changes (or similar) guard. Call `go()` to proceed; never calling it cancels. */
  beforeNavigate?: (go: () => void) => void;
  spinnerDelayMs?: number;
  testId?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showSpinner, setShowSpinner] = useState(false);
  // Covers the gap between "go() was called" and React reporting pending, so
  // two quick taps can never start two navigations.
  const startedRef = useRef(false);
  const sawPendingRef = useRef(false);

  useEffect(() => {
    if (isPending) {
      sawPendingRef.current = true;
      const timer = setTimeout(() => setShowSpinner(true), spinnerDelayMs);
      return () => clearTimeout(timer);
    }
    // Back to idle (arrived, failed or was interrupted): usable again.
    if (sawPendingRef.current) {
      sawPendingRef.current = false;
      startedRef.current = false;
    }
    // Resetting the delayed spinner when the transition settles is the whole point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowSpinner(false);
  }, [isPending, spinnerDelayMs]);

  function go() {
    if (startedRef.current) return;
    startedRef.current = true;
    startTransition(() => {
      router.push(href);
    });
  }

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    const action = navClickAction(event, { pending: isPending, started: startedRef.current, hasGuard: Boolean(beforeNavigate) });
    if (action === "browser") return;
    event.preventDefault();
    if (action === "go") go();
    else if (action === "guard") beforeNavigate?.(go);
  }

  return (
    <Link
      href={href}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-busy={isPending || undefined}
      aria-disabled={isPending || undefined}
      data-pending={isPending ? "true" : undefined}
      data-testid={testId}
      className={`${NAV_CONTROL_BASE} ${className}`}
    >
      {children}
      {showSpinner ? (
        <span
          aria-hidden="true"
          data-testid="nav-spinner"
          className="pointer-events-none absolute top-1/2 -translate-y-1/2 end-0 translate-x-full ms-1 w-3.5 h-3.5 rounded-full border-2 border-idw-forest/25 border-t-idw-forest animate-spin motion-reduce:animate-none"
        />
      ) : null}
      <span role="status" aria-live="polite" className="sr-only">
        {isPending ? pendingLabel : ""}
      </span>
    </Link>
  );
}
