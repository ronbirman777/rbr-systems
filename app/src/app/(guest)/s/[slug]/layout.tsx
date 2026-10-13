import { Suspense } from "react";
import { DocumentShell, sharedMetadata, sharedViewport } from "../../../document-shell";
import { directionOf } from "@/lib/i18n";
import { socialSpaceBySlug } from "@/lib/share/publishedSocialSpace";
import { GuestLoadingScreen } from "@/components/guest/guest-loading-screen";
import { GUEST_FONT_VARIABLES } from "../../guest-fonts";
import { guestDocumentBySlug } from "../../guestDocument";

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
 * TASK 033 (branded loading, plan 4.5). The layout no longer waits for the
 * whole published payload and access chain before sending a byte:
 *
 *   1. It starts that chain (socialSpaceBySlug, React-cached per request -
 *      the page, generateMetadata and this call share ONE execution) without
 *      awaiting it,
 *   2. awaits only a light, indexed read of the locale (guestDocument.ts),
 *   3. and, when a published row exists, streams the page inside a Suspense
 *      boundary whose fallback is the branded GuestLoadingScreen.
 *
 * An unknown slug gets no boundary, so the page's notFound() runs before
 * anything is flushed and the response keeps its real 404 status. A
 * published row that turns out unavailable resolves the boundary into the
 * same not-found UI (streamed, so with Next's injected noindex rather than a
 * 404 status) and a code-protected one into the access screen - never a
 * stuck loading screen.
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
  // Start the heavy chain now, in parallel with the light read below; the
  // page awaits this same promise. The catch only marks this branch
  // handled - the page still sees (and handles) any rejection itself.
  socialSpaceBySlug(slug).catch(() => undefined);
  const { exists, locale } = await guestDocumentBySlug(slug);
  return (
    <DocumentShell lang={locale} dir={directionOf(locale)} fontVariables={GUEST_FONT_VARIABLES}>
      {exists ? <Suspense fallback={<GuestLoadingScreen locale={locale} />}>{children}</Suspense> : children}
    </DocumentShell>
  );
}
