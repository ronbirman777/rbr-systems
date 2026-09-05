"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Optional, very subtle pointer parallax for the Hero background - a small
 * hand-rolled rAF loop, not a motion library (per the approved plan: the
 * inspected Superdesign reference itself has no parallax at all, so this
 * stays a light, skippable enhancement, never load-bearing for the Hero's
 * feel). No-ops entirely on touch devices (no pointer to track) and under
 * prefers-reduced-motion - the background simply stays still in both cases.
 */
export function HeroParallax({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hasFinePointer = window.matchMedia("(pointer: fine)").matches;
    if (reduceMotion || !hasFinePointer) return;

    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;
    let raf = 0;

    function onMove(e: PointerEvent) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      targetX = (e.clientX / w - 0.5) * 2; // -1..1
      targetY = (e.clientY / h - 0.5) * 2;
    }

    function tick() {
      x += (targetX - x) * 0.05;
      y += (targetY - y) * 0.05;
      if (el) el.style.transform = `translate3d(${x * -8}px, ${y * -8}px, 0)`;
      raf = requestAnimationFrame(tick);
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} className="absolute inset-0 will-change-transform">
      {children}
    </div>
  );
}
