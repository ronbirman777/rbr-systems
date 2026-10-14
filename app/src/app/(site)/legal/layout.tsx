import Link from "next/link";
import { InnerDweSMark } from "@/components/brand/wordmark";
import { MarketingFooter } from "@/components/marketing/footer";
import { LEGAL_BASE_PATH } from "@/lib/legal/documents";

/**
 * Shell for the public legal pages. Deliberately not the marketing layout:
 * MarketingNav reads the auth session (which would make every legal page
 * dynamic) and its in-page anchors (#pricing, ...) only work on the
 * homepage. These pages are static, need no account and are exempt from the
 * pre-launch preview gate (lib/preview-gate/config.ts isPublicLegalPath).
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-idw-parchment text-idw-forest print:bg-white">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-idw-forest focus:px-4 focus:py-2 focus:text-sm focus:text-idw-parchment"
      >
        Skip to main content
      </a>
      <header className="border-b border-idw-forest/10 bg-idw-parchment print:border-0">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label="InnerDweS home">
            <InnerDweSMark size={26} className="shrink-0" />
            <span className="font-brand text-lg italic text-idw-forest">InnerDweS</span>
          </Link>
          <nav aria-label="Legal section" className="print:hidden">
            <Link
              href={LEGAL_BASE_PATH}
              className="inline-flex min-h-11 items-center rounded-full px-3 font-ui text-sm font-semibold text-idw-forest/80 hover:text-idw-forest"
            >
              Legal
            </Link>
          </nav>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <div className="print:hidden">
        <MarketingFooter />
      </div>
    </div>
  );
}
