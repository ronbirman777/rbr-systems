import { Suspense } from "react";
import { DocumentShell, sharedMetadata, sharedViewport } from "../../../document-shell";
import { directionOf } from "@/lib/i18n";
import { socialSpaceBySlug } from "@/lib/share/publishedSocialSpace";
import { GuestLoadingScreen } from "@/components/guest/guest-loading-screen";
import { localeFromPublishedModules } from "@/lib/spaceSettings";
import { GUEST_FONT_VARIABLES } from "../../guest-fonts";
import { guestGate } from "../../guestGate";

/**
 * Root layout for the slug-addressed Guest App.
 *
 * It exists so the published Space's own language reaches `<html lang>`
 * and `<html dir>`. A Hebrew Space used to serve a fully mirrored,
 * fully Hebrew page inside `<html lang="en">` with no `dir` - the layout
 * was right (the screen sets `dir` on its own container) but the document
 * lied about itself to screen readers, translation prompts and
 * language-dependent typography. Production QA, TASK 029.
 *
 * The locale comes only from the PUBLISHED snapshot, never the visitor's
 * device, matching how every other Guest surface picks its language. An
 * unknown slug resolves to English and falls through to the page, which is
 * what issues the 404 - the document language must never be the thing that
 * decides whether a Space exists.
 *
 * TASK 033 (branded loading) and the HTTP status contract. Once a Suspense
 * fallback is flushed the response is committed to 200, and a notFound()
 * inside the stream can only become a soft not-found (200 + noindex). The
 * owner requirement is that unknown, unpublished, suspended and
 * commercially unavailable Spaces keep their real 404. So the layout:
 *
 *   1. awaits the per-request cached loader (socialSpaceBySlug: published
 *      row + availability/access chain, shared with generateMetadata and the
 *      page - ONE execution) BEFORE rendering any boundary - as it did
 *      before TASK 033;
 *   2. derives the decision with guestGate() and, only for a Space that
 *      will actually render its Guest App, streams the page inside a
 *      Suspense boundary whose fallback is the branded GuestLoadingScreen
 *      (it covers the app's own async render, e.g. Teach's Flow-link checks);
 *   3. for every denying outcome and for the code-entry screen renders the
 *      page with NO boundary, so the page's notFound() runs before anything
 *      is flushed and the response is a real 404.
 *
 * The client hero-wait overlay (GuestHeroWait) still covers image decode.
 */
export const viewport = sharedViewport;
export const metadata = sharedMetadata;

export default async function GuestSlugRootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Access is decided HERE, before any Suspense boundary exists - see above.
  const loaded = await socialSpaceBySlug(slug);
  const locale = localeFromPublishedModules(loaded?.modules ?? null);
  return (
    <DocumentShell lang={locale} dir={directionOf(locale)} fontVariables={GUEST_FONT_VARIABLES}>
      {guestGate(loaded) === "app" ? <Suspense fallback={<GuestLoadingScreen locale={locale} />}>{children}</Suspense> : children}
    </DocumentShell>
  );
}
