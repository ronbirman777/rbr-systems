"use client";

import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { waitForGuestHero } from "@/lib/guest/heroWait";
import { GuestLoadingScreen, type GuestLoadingCopy } from "./guest-loading-screen";

/**
 * TASK 033 (D-LD1) - the client half of the branded loading: an overlay in
 * the Guest column that stays only until the hero image is decoded (or the
 * logo, when there is no hero), hard-capped at 1.5s, revealed at once on an
 * image error or when there is nothing to wait for. See lib/guest/heroWait.ts.
 *
 * It is server-rendered with the content, so it is already in place before
 * hydration - but HIDDEN unless it continues a streaming fallback that was
 * already visible (QA defect D1; see GUEST_LOADING_CONTINUITY_SCRIPT, which
 * also fades it out as soon as the hero has loaded, without waiting for
 * this hydration-time effect). CSS alone hides it by 1.5s if JavaScript
 * never runs. Once revealed it fades out (or disappears instantly if it was
 * not visible) and is then removed.
 */
export function GuestHeroWait({ locale, copy }: { locale: Locale; copy?: GuestLoadingCopy }) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState<"fade" | "instant" | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const root = host.closest("[data-guest-shell]") ?? document;
    let removeTimer: number | undefined;
    const cancel = waitForGuestHero(root, () => {
      const overlay = host.firstElementChild as HTMLElement | null;
      const opacity = overlay ? Number.parseFloat(getComputedStyle(overlay).opacity) : 0;
      const mode = opacity >= 0.5 ? "fade" : "instant";
      setRevealed(mode);
      removeTimer = window.setTimeout(() => setGone(true), mode === "fade" ? 250 : 0);
    });
    return () => {
      cancel();
      if (removeTimer !== undefined) window.clearTimeout(removeTimer);
    };
  }, []);

  if (gone) return null;
  return (
    <div ref={ref} className="contents">
      <GuestLoadingScreen locale={locale} copy={copy} variant="overlay" revealed={revealed ?? undefined} />
    </div>
  );
}
