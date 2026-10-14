import type { CSSProperties, ReactNode } from "react";
import { deriveThemeVars } from "@/lib/theme/deriveTheme";

/**
 * The ONE Guest App shell for every published Time to Flow and Time to
 * Teach Space (backport of the TASK 033 P4 shell, fd5e9fe - shell/layout
 * part only; release/033-ux-fast).
 *
 * Owner rule: on a phone the Guest App fills the screen width (safe areas
 * and dvh respected by the apps themselves, unchanged); on a tablet or
 * desktop it is a centred, narrow vertical column - at most 430px wide,
 * running the full height of the window (not a fixed-height device frame)
 * - over a calm backdrop derived from the Space's theme. Guest content
 * never becomes a full-width desktop website.
 *
 *   - up to 430px the shell is a no-op wrapper, so every phone in portrait
 *     renders the full-width layout it rendered before;
 *   - from 431px (GUEST_COLUMN_MIN_VIEWPORT = max + 1) - any window wider
 *     than the column, including a phone in landscape - the column is at
 *     most 430px (GUEST_COLUMN_MAX_WIDTH). The earlier 640px (`sm`)
 *     breakpoint left a 431-639px band with a full-width app.
 *   Both values live in globals.css (.guest-desktop-shell) and are mirrored
 *   in lib/guest/column.ts so media `sizes` strings derive from them.
 *
 * Inside the column the Guest App's own container queries (Teach's
 * `@container` root and its ResizeObserver-based agenda switch) see the
 * COLUMN width, not the window, so Teach renders its phone presentation
 * (bottom tabs, single-column hero, day strip) at every window width.
 *
 * Backdrop: a whisper of the Space's primary colour mixed into the
 * platform's parchment base. It carries no text; the column edge is drawn
 * by a hairline and a soft shadow, not by colour contrast alone.
 *
 * Neither Guest App has `position: fixed` elements today (Teach's header
 * and bottom tabs are `sticky`, Flow's chrome is in normal flow inside its
 * own full-height box), so nothing can escape the column. Centring is
 * symmetric, so RTL needs nothing extra; `dir`/`lang` stay on the app
 * roots exactly as before.
 */

/** The backdrop outside the column: the Space's primary, barely, over parchment. */
export const GUEST_BACKDROP = "color-mix(in srgb, var(--rbr-primary) 10%, var(--rbr-parchment-deep))";

export function GuestDesktopShell({
  brand,
  vars: themeVars,
  children,
  as: Column = "div",
  columnClassName = "",
  columnStyle,
  lang,
  dir,
}: {
  /** The Space's published brand - only its theme tokens are used, for the backdrop. */
  brand?: Parameters<typeof deriveThemeVars>[0];
  /** Already-derived theme tokens (the access-code screen receives these instead of a brand). */
  vars?: CSSProperties;
  children: ReactNode;
  /** Element for the column itself (Flow's column is its <main>; Teach owns its own <main>). */
  as?: "div" | "main";
  columnClassName?: string;
  columnStyle?: CSSProperties;
  lang?: string;
  dir?: "ltr" | "rtl";
}) {
  const vars = themeVars ?? (brand ? (deriveThemeVars(brand) as CSSProperties) : {});
  return (
    <div data-guest-shell="" className="guest-desktop-shell" style={{ ...vars, ["--guest-backdrop" as string]: GUEST_BACKDROP }}>
      <Column lang={lang} dir={dir} data-guest-column="" className={`guest-desktop-shell__column ${columnClassName}`.trim()} style={columnStyle}>
        {children}
      </Column>
    </div>
  );
}
