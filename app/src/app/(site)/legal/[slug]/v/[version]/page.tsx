import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalDocumentView } from "@/components/legal/legal-document-view";
import { archivedLegalVersions, findArchivedLegalVersion, legalHref } from "@/lib/legal/documents";
import { LEGAL_ARCHIVED_BODIES } from "@/lib/legal/content/archive";

/**
 * A superseded version of a legal document, e.g. /legal/billing/v/1.0. Kept
 * at a stable URL so the exact text a version contained stays readable;
 * clearly labelled "Superseded version" and never indexed. Exactly the
 * superseded versions listed in the registry are prerendered; anything else
 * (including the current version number) is a 404. Exempt from the preview
 * gate like every /legal/* path (lib/preview-gate/config.ts).
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return archivedLegalVersions().map(({ doc, entry }) => ({ slug: doc.slug, version: entry.version }));
}

type Params = Promise<{ slug: string; version: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, version } = await params;
  const found = findArchivedLegalVersion(slug, version);
  if (!found) return {};
  return {
    title: `${found.doc.title} (Version ${found.entry.version}, superseded) · InnerDweS`,
    description: `Superseded Version ${found.entry.version} of the InnerDweS ${found.doc.title}, kept for reference. The current version is at ${legalHref(found.doc.id)}.`,
    robots: { index: false, follow: true },
  };
}

export default async function ArchivedLegalDocumentPage({ params }: { params: Params }) {
  const { slug, version } = await params;
  const found = findArchivedLegalVersion(slug, version);
  const body = found && LEGAL_ARCHIVED_BODIES[found.doc.id]?.[found.entry.version];
  if (!found || !body) notFound();
  return <LegalDocumentView doc={found.doc} body={body} archivedVersion={found.entry} />;
}
