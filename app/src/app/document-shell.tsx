import type { Metadata, Viewport } from "next";
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
 * same metadata, same viewport, same body classes.
 *
 * FONTS (TASK 033, P5 "font diet"). The font declarations used to live in
 * this module, and next/font preloads every font declared in a module that
 * a root layout imports - so all 11 font files were preloaded on every
 * Guest page, competing with the hero for early bandwidth. They now live in
 * one module per root, and each root passes its own CSS variables in:
 *
 *   app/site-fonts.ts             (site)  - unchanged: same five families,
 *                                           same subsets, all preloaded
 *   app/(guest)/guest-fonts.ts    (guest) - the same five families and
 *                                           CSS variables, but only the
 *                                           above-the-fold faces preloaded
 *
 * Nothing that imports this module may declare a font, or it would be
 * preloaded on every route again.
 */

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

/**
 * `dir` is written only when it is RTL. An explicit `dir="ltr"` would be
 * correct but redundant on every English, German, Spanish and French
 * document, and leaving it off keeps those pages byte-identical to what
 * they rendered before this change.
 */
export function DocumentShell({
  lang,
  dir,
  fontVariables,
  children,
}: {
  lang: Locale;
  dir: Direction;
  /** The root's own font CSS variables (site-fonts.ts or guest-fonts.ts). */
  fontVariables: string;
  children: ReactNode;
}) {
  return (
    <html lang={lang} dir={dir === "rtl" ? "rtl" : undefined} className={`${fontVariables} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
