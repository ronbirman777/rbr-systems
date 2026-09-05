import Link from "next/link";
import { InnerDweSMark } from "@/components/brand/wordmark";

export function MarketingFooter() {
  return (
    <footer className="bg-idw-forest text-idw-parchment/80">
      <div className="mx-auto max-w-[1280px] px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
        <div className="flex items-center gap-2.5">
          <InnerDweSMark size={22} />
          <span className="leading-tight">
            <span className="block font-brand italic text-base text-idw-parchment">InnerDweS</span>
            <span className="block text-[9px] font-semibold uppercase tracking-[0.18em] text-idw-clay">
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
    </footer>
  );
}
