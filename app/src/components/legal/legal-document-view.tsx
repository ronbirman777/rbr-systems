import Link from "next/link";
import {
  LEGAL_BASE_PATH,
  LEGAL_CONTACT_EMAIL,
  LEGAL_DOCUMENTS,
  formatLegalDate,
  legalHref,
  type LegalDocument,
} from "@/lib/legal/documents";
import type { LegalDocumentBody } from "@/lib/legal/content/types";
import { LegalBlocks } from "./legal-text";

function TableOfContents({ body, idSuffix }: { body: LegalDocumentBody; idSuffix: string }) {
  return (
    <nav aria-labelledby={`toc-heading-${idSuffix}`}>
      <p id={`toc-heading-${idSuffix}`} className="text-xs font-semibold uppercase tracking-[0.14em] text-idw-forest/70">
        Contents
      </p>
      <ol className="mt-3 space-y-1.5 text-sm leading-5">
        {body.sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="text-idw-forest/80 hover:text-idw-forest hover:underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-idw-forest rounded-sm"
            >
              {s.heading}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * One public legal document: breadcrumb, title, version line, table of
 * contents (a sticky sidebar from lg, a collapsible block below it), the
 * numbered sections and links to the other documents. Server-rendered and
 * static; the only interactive element is the native <details> disclosure.
 */
export function LegalDocumentView({ doc, body }: { doc: LegalDocument; body: LegalDocumentBody }) {
  const others = LEGAL_DOCUMENTS.filter((d) => d.id !== doc.id);
  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 sm:px-6 py-10 sm:py-14 lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-14">
      <aside className="hidden lg:block print:hidden">
        <div className="sticky top-8 max-h-[calc(100vh-4rem)] overflow-y-auto pb-8 pr-2">
          <TableOfContents body={body} idSuffix="sidebar" />
        </div>
      </aside>

      <article className="min-w-0 max-w-[72ch]" aria-labelledby="legal-title">
        <nav aria-label="Breadcrumb" className="print:hidden">
          <ol className="flex flex-wrap items-center gap-1.5 text-sm text-idw-forest/70">
            <li>
              <Link href={LEGAL_BASE_PATH} className="underline underline-offset-2 hover:text-idw-forest">
                Legal
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-idw-forest/80">
              {doc.title}
            </li>
          </ol>
        </nav>

        <h1
          id="legal-title"
          className="mt-4 font-editorial text-[32px] sm:text-[42px] leading-[1.12] tracking-[-0.01em] text-idw-forest text-balance"
        >
          {doc.title}
        </h1>
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-idw-forest/75">
          <div className="flex gap-1.5">
            <dt>Version</dt>
            <dd className="font-semibold text-idw-forest">{doc.version}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Effective</dt>
            <dd className="font-semibold text-idw-forest">
              <time dateTime={doc.effectiveDate}>{formatLegalDate(doc.effectiveDate)}</time>
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Last updated</dt>
            <dd className="font-semibold text-idw-forest">
              <time dateTime={doc.lastUpdated}>{formatLegalDate(doc.lastUpdated)}</time>
            </dd>
          </div>
        </dl>

        <a
          href="#document-text"
          className="sr-only focus:not-sr-only focus:mt-4 focus:inline-block focus:rounded-full focus:bg-idw-forest focus:px-4 focus:py-2 focus:text-sm focus:text-idw-parchment"
        >
          Skip table of contents
        </a>

        <details className="mt-8 rounded-2xl border border-idw-forest/15 bg-white/60 p-4 lg:hidden print:hidden">
          <summary className="cursor-pointer text-sm font-semibold text-idw-forest min-h-11 flex items-center">
            Table of contents
          </summary>
          <div className="mt-3">
            <TableOfContents body={body} idSuffix="inline" />
          </div>
        </details>

        <div
          id="document-text"
          tabIndex={-1}
          className="mt-8 space-y-4 font-ui text-[15px] sm:text-base leading-7 text-idw-forest/85 outline-none"
        >
          <LegalBlocks blocks={body.intro} />

          {body.sections.map((s) => (
            <section key={s.id} aria-labelledby={s.id} className="pt-6 space-y-4">
              <h2
                id={s.id}
                className="scroll-mt-6 font-ui text-xl sm:text-[22px] font-semibold leading-snug tracking-[-0.005em] text-idw-forest"
              >
                {s.heading}
              </h2>
              <LegalBlocks blocks={s.blocks} />
              {s.subsections?.map((ss) => (
                <section key={ss.id} aria-labelledby={ss.id} className="pt-2 space-y-3">
                  <h3 id={ss.id} className="scroll-mt-6 font-ui text-lg font-semibold text-idw-forest">
                    {ss.heading}
                  </h3>
                  <LegalBlocks blocks={ss.blocks} />
                </section>
              ))}
            </section>
          ))}
        </div>

        <aside aria-labelledby="related-heading" className="mt-14 border-t border-idw-forest/15 pt-8 print:hidden">
          <h2 id="related-heading" className="font-ui text-base font-semibold text-idw-forest">
            Related documents
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 text-sm">
            {others.map((d) => (
              <li key={d.id}>
                <Link href={legalHref(d.id)} className="text-idw-forest underline underline-offset-2 hover:decoration-2">
                  {d.title}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-idw-forest/75">
            Questions? Contact{" "}
            <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="underline underline-offset-2 text-idw-forest">
              {LEGAL_CONTACT_EMAIL}
            </a>
            .
          </p>
        </aside>
      </article>
    </div>
  );
}
