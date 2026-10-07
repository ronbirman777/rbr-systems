import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Fraunces, DM_Serif_Display, DM_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { SITE_URL } from "@/lib/site-url";
import type { Direction, Locale } from "@/lib/i18n";
import "./globals.css";

/**
 * The one <html>/<body> document, shared by every root layout.
 *
 * WHY THERE IS MORE THAN ONE ROOT LAYOUT. `<html lang>` and `<html dir>`
 * can only be written by a root layout - Next gives a nested segment no
 * way to contribute to them. The Guest App's language is a property of
 * the SPACE, resolved per request from the published snapshot, so a
 * single hardcoded `lang="en"` root was always going to be wrong for a
 * German or Hebrew Space: Production QA found a fully Hebrew Guest App
 * served as `<html lang="en">` with no `dir` at all (TASK 029).
 *
 * The fix is the supported Next.js one - drop `app/layout.tsx` and give
 * each route branch its own root:
 *
 *   (site)/layout.tsx                 everything authenticated and
 *                                     marketing, always English chrome
 *   (guest)/s/[slug]/layout.tsx       the published Space's own locale
 *   (guest)/g/[tenantId]/layout.tsx   the same, addressed by tenant id
 *
 * The guest roots resolve the locale from the SAME React-cached read the
 * page body uses, so the correct `lang`/`dir` costs no extra query.
 *
 * The one behavioural consequence of multiple roots is that navigating
 * between groups is a full document load rather than a client transition.
 * That is already how these links behave - the Studio reaches a live
 * Guest App through a plain anchor, never a <Link> - so nothing that used
 * to be a soft navigation becomes a hard one.
 *
 * Everything below this comment is the former app/layout.tsx verbatim:
 * same fonts, same metadata, same viewport, same body classes.
 */

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Editorial serif for the InnerDweS wordmark and deliberately expressive
// brand moments only (font-brand / font-editorial) - see globals.css.
// Not applied globally to interface headings; see the brand implementation
// plan for why.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["300", "500", "600"],
});

// Time to Flow Visual Fidelity Phase 1 - the Guest App's own two-role
// typography system (src/lib/theme/tokens.ts's GUEST_FONT_DISPLAY /
// GUEST_FONT_UI), distinct from InnerDweS's own font-brand/font-editorial
// above. DM Serif Display only ships weight 400 (normal + italic) on
// Google Fonts - Figma's source never uses another weight for it either.
const dmSerifDisplay = DM_Serif_Display({
  variable: "--font-dm-serif-display",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: "400",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

/**
 * `viewportFit: "cover"` is what makes env(safe-area-inset-*) resolve to
 * anything other than zero.
 *
 * Without it the page is laid out inside the notch-safe rectangle and
 * every inset reads 0, which is why the Guest App's existing
 * `pb-[max(env(safe-area-inset-bottom),14px)]` had been silently
 * collapsing to a flat 14px on every device since it was written. Opting
 * in means the page now extends under the notch and the home indicator,
 * so everything that sits against an edge has to pad itself with the real
 * inset - which the Guest shells now do.
 *
 * `interactiveWidget: "resizes-content"` keeps the on-screen keyboard
 * from floating a fixed bottom bar over the field being typed into.
 */
export const sharedViewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export const sharedMetadata: Metadata = {
  // Required so page-level openGraph/twitter image paths (see the
  // marketing route group's opengraph-image.tsx) resolve to an absolute
  // URL for social crawlers rather than a bare relative path.
  metadataBase: new URL(SITE_URL),
  title: "InnerDweS · Digital Wellness Solutions",
  description: "We are giving digital solutions to the wellness world.",
};

const FONT_VARIABLES = `${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${dmSerifDisplay.variable} ${dmSans.variable}`;

/**
 * `dir` is written only when it is RTL. An explicit `dir="ltr"` would be
 * correct but redundant on every English, German, Spanish and French
 * document, and leaving it off keeps those pages byte-identical to what
 * they rendered before this change.
 */
export function DocumentShell({
  lang,
  dir,
  children,
}: {
  lang: Locale;
  dir: Direction;
  children: ReactNode;
}) {
  return (
    <html lang={lang} dir={dir === "rtl" ? "rtl" : undefined} className={`${FONT_VARIABLES} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
