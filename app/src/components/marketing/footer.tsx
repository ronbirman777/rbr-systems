import Link from "next/link";
import { InnerDweSMark } from "@/components/brand/wordmark";
import { LEGAL_BASE_PATH, LEGAL_DOCUMENTS, legalHref } from "@/lib/legal/documents";

export function MarketingFooter() {
  return (
    <footer className="bg-idw-forest text-idw-parchment/80">
      <div className="mx-auto max-w-[1280px] px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
        <div className="flex items-center gap-2.5">
          <InnerDweSMark size={22} />
          <span className="leading-tight">
            <span className="block font-brand italic text-base text-idw-parchment">InnerDweS</span>
            <span className="block text-[9px] font-semibold uppercase tracking-[0.18em] text-idw-clay-on-dark">
              Digital Wellness Solutions
            </span>
          </span>
        </div>
        <p className="font-ui text-sm text-idw-parchment/60">
          Digital solutions for the wellness world. © 2026 InnerDweS.
        </p>
        <nav className="flex items-center gap-6" aria-label="Footer">
          <Link href="/time-to-elevate" className="font-ui text-sm text-idw-parchment/60 hover:text-idw-parchment">
            Contact
          </Link>
        </nav>
      </div>
      {/* Every public legal document, read from the one registry so the
          footer can never link a slug that does not exist. */}
      <div className="border-t border-idw-parchment/10">
        <nav aria-label="Legal" className="mx-auto max-w-[1280px] px-6 py-6">
          <ul className="flex flex-wrap justify-center sm:justify-start gap-x-6 gap-y-2.5">
            {LEGAL_DOCUMENTS.map((d) => (
              <li key={d.id}>
                <Link href={legalHref(d.id)} className="font-ui text-[13px] text-idw-parchment/70 hover:text-idw-parchment">
                  {d.title}
                </Link>
              </li>
            ))}
            <li>
              <Link href={LEGAL_BASE_PATH} className="font-ui text-[13px] text-idw-parchment/70 hover:text-idw-parchment">
                All legal documents
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
