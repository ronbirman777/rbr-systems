"use client";

import { useState } from "react";

/**
 * Hamburger toggle for the primary nav links below the `lg` breakpoint,
 * where they're hidden from the header bar (see nav.tsx - `hidden lg:flex`).
 * Fixes the 768px overflow bug: the links used to appear at `md` (768px),
 * a width where logo + 5 links + CTA didn't actually fit. Below `lg`, this
 * is the only way to reach them - logo (home) and the CTA stay directly
 * visible regardless, so there's always a usable path through the site.
 */
export function MobileNavToggle({ links }: { links: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-nav-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        className="flex items-center justify-center w-9 h-9 rounded-full text-idw-forest hover:bg-idw-forest/8 transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          {open ? <path d="M5 5l14 14M19 5L5 19" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>

      {open && (
        <nav
          id="mobile-nav-menu"
          aria-label="Primary"
          className="absolute right-0 top-full mt-2 w-56 rounded-2xl bg-idw-parchment border border-idw-forest/10 shadow-[0_16px_40px_-16px_rgba(25,43,33,0.35)] py-2 flex flex-col"
        >
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="font-ui text-sm text-idw-forest/80 hover:text-idw-forest hover:bg-idw-forest/5 px-5 py-2.5 transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}
