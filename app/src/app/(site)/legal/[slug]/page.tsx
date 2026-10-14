import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalDocumentView } from "@/components/legal/legal-document-view";
import { LEGAL_DOCUMENTS, findLegalDocumentBySlug, legalHref } from "@/lib/legal/documents";
import { LEGAL_BODIES } from "@/lib/legal/content";

// Exactly the seven registered documents are prerendered; any other slug is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return LEGAL_DOCUMENTS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const doc = findLegalDocumentBySlug(slug);
  if (!doc) return {};
  return {
    title: `${doc.title} · InnerDweS`,
    description: doc.summary,
    alternates: { canonical: legalHref(doc.id) },
  };
}

export default async function LegalDocumentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = findLegalDocumentBySlug(slug);
  if (!doc) notFound();
  return <LegalDocumentView doc={doc} body={LEGAL_BODIES[doc.id]} />;
}
