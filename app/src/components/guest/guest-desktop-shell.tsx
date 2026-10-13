import type { CSSProperties, ReactNode } from "react";
import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import type { Locale } from "@/lib/i18n";
import { GuestHeroWait } from "./guest-hero-wait";

/**
 * TASK 033 (owner decision "Shell"): the one desktop frame for every
 * published Guest App.
 *
 * Time to Flow used to sit in a 390x780 rounded "device" from `sm` up, and
 * Time to Teach stretched into a full-width desktop website. The owner chose
 * a single, shared answer for both: on a tablet or desktop the Guest App is
 * a centred, phone-width COLUMN that runs the full height of the window,
 * with a calm backdrop either side. Navigation, the "Created with" footer,
 * scrolling and the loading overlay all stay inside the column; nothing of
 * the app reaches the backdrop.
 *
 * Breakpoint and width (documented decision):
 *   - below 640px (Tailwind `sm`) the shell is a no-op wrapper, so every
 *     phone - including the largest at 430px and phones in landscape up to
 *     639px - renders exactly the full-width layout it rendered before;
 *   - from 640px the column is at most 480px wide (GUEST_COLUMN_MAX_WIDTH):
 *     the largest current phone width plus a little air, and narrow enough
 *     that a 640px tablet still shows the backdrop on both sides.
 *   Both values live in globals.css (.guest-desktop-shell) and are mirrored
 *   in lib/guest/column.ts so media `sizes` strings can be derived from them.
 *
 * Inside the column the Guest App's own container queries see a phone-width
 * container, so Teach renders its phone layout (bottom tabs) rather than its
 * desktop website layout - the point of the decision.
 *
 * Backdrop: derived from the Space's own theme tokens - a whisper of its
 * primary colour mixed into the platform's parchment base - so the frame
 * belongs to the Space without competing with it. It carries no text, so no
 * text contrast rule applies to it; the column edge is drawn by a hairline
 * and a soft shadow rather than by colour contrast alone.
 *
 * The branded hero-wait overlay (GuestHeroWait, D-LD1) is part of the shell,
 * so both apps get the same loading behaviour from this one mount.
 *
 * `position: fixed` elements inside the column must opt into
 * `.guest-column-fixed` to stay inside it on desktop (the loading overlay
 * does). There are no other fixed elements in either Guest App today:
 * Teach's bottom tabs and header are `sticky`, which already stays within
 * the column, and Flow's chrome is in normal flow inside a fixed-height box.
 *
 * Direction: centring is symmetric and `.guest-column-fixed` uses a
 * centre-anchored transform, so RTL needs nothing extra; `dir`/`lang` stay
 * on the app roots exactly as before.
 */

export { GUEST_COLUMN_MIN_VIEWPORT, GUEST_COLUMN_MAX_WIDTH, GUEST_COLUMN_MEDIA, columnSizes } from "@/lib/guest/column";

/** The backdrop outside the column: the Space's primary, barely, over parchment. */
export const GUEST_BACKDROP = "color-mix(in srgb, var(--rbr-primary) 10%, var(--rbr-parchment-deep))";

export function GuestDesktopShell({
  brand,
  locale,
  children,
  as: Column = "div",
  columnClassName = "",
  columnStyle,
  lang,
  dir,
}: {
  /** The Space's published brand - only its theme tokens are used, for the backdrop. */
  brand: Parameters<typeof deriveThemeVars>[0];
  /** The Space's locale, for the loading overlay's localized text. */
  locale: Locale;
  children: ReactNode;
  /** Element for the column itself (Flow's column is its <main>; Teach owns its own <main>). */
  as?: "div" | "main";
  columnClassName?: string;
  columnStyle?: CSSProperties;
  lang?: string;
  dir?: "ltr" | "rtl";
}) {
  const vars = deriveThemeVars(brand) as CSSProperties;
  return (
    <div
      data-guest-shell=""
      className="guest-desktop-shell"
      style={{ ...vars, ["--guest-backdrop" as string]: GUEST_BACKDROP }}
    >
      <Column lang={lang} dir={dir} className={`guest-desktop-shell__column ${columnClassName}`.trim()} style={columnStyle}>
        <GuestHeroWait locale={locale} />
        {children}
      </Column>
    </div>
  );
}
