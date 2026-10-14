import Link from "next/link";
import {
  LEGAL_BASE_PATH,
  LEGAL_CONTACT_EMAIL,
  LEGAL_DOCUMENTS,
  formatLegalDate,
  legalHref,
  legalVersionHref,
  previousLegalVersions,
  type LegalDocument,
  type LegalDocumentVersion,
} from "@/lib/legal/documents";
import type { LegalDocumentBody } from "@/lib/legal/content/types";
import { LegalBlocks } from "./legal-text";

function TableOfContents({
  body,
  idSuffix,
  withHistory,
}: {
  body: LegalDocumentBody;
  idSuffix: string;
  withHistory: boolean;
}) {
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
        {withHistory ? (
          <li>
            <a
              href="#version-history"
              className="text-idw-forest/80 hover:text-idw-forest hover:underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-idw-forest rounded-sm"
            >
              Version history
            </a>
          </li>
        ) : null}
      </ol>
    </nav>
  );
}

/**
 * The document's published versions, newest first, each with its change
 * summary; superseded versions link to their archived text. Shown only once a
 * document has more than one version.
 */
function VersionHistory({ doc, shownVersion }: { doc: LegalDocument; shownVersion: string }) {
  return (
    <section aria-labelledby="version-history" className="pt-6 space-y-4">
      <h2
        id="version-history"
        className="scroll-mt-6 font-ui text-xl sm:text-[22px] font-semibold leading-snug tracking-[-0.005em] text-idw-forest"
      >
        Version history
      </h2>
      <ol className="space-y-4">
        {doc.history.map((v, i) => {
          const isCurrent = i === 0;
          const isShown = v.version === shownVersion;
          return (
            <li key={v.versionId} className="rounded-2xl border border-idw-forest/15 bg-white/60 p-4">
              <p className="font-semibold text-idw-forest">
                Version {v.version}
                {isCurrent ? " (current)" : " (superseded)"}
                {" · "}
                <span className="font-normal">
                  Effective <time dateTime={v.effectiveDate}>{formatLegalDate(v.effectiveDate)}</time>
                </span>
              </p>
              <p className="mt-1.5">{v.changeSummary}</p>
              {isShown ? (
                <p className="mt-1.5 text-sm text-idw-forest/75">You are reading this version.</p>
              ) : (
                <p className="mt-1.5 text-sm">
                  <Link
                    href={isCurrent ? legalHref(doc.id) : legalVersionHref(doc.id, v.version)}
                    className="text-idw-forest underline underline-offset-2 hover:decoration-2"
                  >
                    {isCurrent ? `Read the current version (${v.version})` : `Read version ${v.version} (superseded)`}
                  </Link>
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * One public legal document: breadcrumb, title, version line, table of
 * contents (a sticky sidebar from lg, a collapsible block below it), the
 * numbered sections and links to the other documents. Server-rendered and
 * static; the only interactive element is the native <details> disclosure.
 */
export function LegalDocumentView({
  doc,
  body,
  archivedVersion,
}: {
  doc: LegalDocument;
  body: LegalDocumentBody;
  /** Set when rendering a superseded version from the archive instead of the current one. */
  archivedVersion?: LegalDocumentVersion;
}) {
  const others = LEGAL_DOCUMENTS.filter((d) => d.id !== doc.id);
  const shown = archivedVersion ?? doc.history[0];
  const withHistory = previousLegalVersions(doc).length > 0;
  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 sm:px-6 py-10 sm:py-14 lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-14">
      <aside className="hidden lg:block print:hidden">
        <div className="sticky top-8 max-h-[calc(100vh-4rem)] overflow-y-auto pb-8 pr-2">
          <TableOfContents body={body} idSuffix="sidebar" withHistory={withHistory} />
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
            {archivedVersion ? (
              <>
                <li>
                  <Link href={legalHref(doc.id)} className="underline underline-offset-2 hover:text-idw-forest">
                    {doc.title}
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li aria-current="page" className="text-idw-forest/80">
                  Version {archivedVersion.version}
                </li>
              </>
            ) : (
              <li aria-current="page" className="text-idw-forest/80">
                {doc.title}
              </li>
            )}
          </ol>
        </nav>

        {archivedVersion ? (
          <div
            role="note"
            aria-label="Superseded version"
            data-testid="legal-superseded-banner"
            className="mt-6 rounded-2xl border border-idw-clay/50 bg-white/70 p-4 font-ui text-[15px] leading-6 text-idw-forest"
          >
            <p className="font-semibold">Superseded version</p>
            <p className="mt-1">
              This is Version {archivedVersion.version} of the {doc.title}, kept for reference. It has been replaced by
              Version {doc.version}, effective <time dateTime={doc.effectiveDate}>{formatLegalDate(doc.effectiveDate)}</time>.{" "}
              <Link href={legalHref(doc.id)} className="underline underline-offset-2 hover:decoration-2">
                Read the current version
              </Link>
              .
            </p>
          </div>
        ) : null}

        <h1
          id="legal-title"
          className="mt-4 font-editorial text-[32px] sm:text-[42px] leading-[1.12] tracking-[-0.01em] text-idw-forest text-balance"
        >
          {doc.title}
        </h1>
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-idw-forest/75">
          <div className="flex gap-1.5">
            <dt>Version</dt>
            <dd className="font-semibold text-idw-forest">{shown.version}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Effective</dt>
            <dd className="font-semibold text-idw-forest">
              <time dateTime={shown.effectiveDate}>{formatLegalDate(shown.effectiveDate)}</time>
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Last updated</dt>
            <dd className="font-semibold text-idw-forest">
              <time dateTime={shown.lastUpdated}>{formatLegalDate(shown.lastUpdated)}</time>
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
            <TableOfContents body={body} idSuffix="inline" withHistory={withHistory} />
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

          {withHistory ? <VersionHistory doc={doc} shownVersion={shown.version} /> : null}
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
