import { DocumentShell, sharedMetadata, sharedViewport } from "../../../document-shell";
import { directionOf } from "@/lib/i18n";
import { localeFromPublishedModules } from "@/lib/spaceSettings";
import { socialSpaceBySlug } from "@/lib/share/publishedSocialSpace";

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
 * `socialSpaceBySlug` is React-cached per request and is the same read
 * generateMetadata and the page body already perform, so resolving the
 * locale here adds no query. An unknown slug resolves to English and
 * falls through to the page, which is what issues the 404 - the document
 * language must never be the thing that decides whether a Space exists.
 *
 * The locale comes only from the PUBLISHED snapshot, never the visitor's
 * device, matching how every other Guest surface picks its language.
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
  const loaded = await socialSpaceBySlug(slug);
  const locale = localeFromPublishedModules(loaded?.modules ?? null);
  return (
    <DocumentShell lang={locale} dir={directionOf(locale)}>
      {children}
    </DocumentShell>
  );
}
