import type { Metadata } from "next";
import Link from "next/link";
import { InnerDweSMark } from "@/components/brand/wordmark";

const TITLE = "Time to Elevate · InnerDweS";
const DESCRIPTION = "Bespoke digital ecosystems for wellness organizations. Talk to us.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

/**
 * A plain mailto contact path, not a fake lead-capture form - there is no
 * backend to receive form submissions here, and adding one is out of scope
 * for a marketing pass (would mean new Supabase schema, which is off-limits
 * this phase). The address below is a placeholder pending confirmation -
 * see the implementation report.
 */
export default function TimeToElevatePage() {
  return (
    <section className="flex-1 flex items-center justify-center bg-idw-forest text-idw-parchment px-6 py-28 text-center">
      <div className="max-w-lg">
        <InnerDweSMark size={44} className="mx-auto mb-8" />
        <div className="font-ui text-xs font-semibold uppercase tracking-[0.22em] text-idw-clay mb-4">
          Time to Elevate
        </div>
        <h1 className="font-editorial italic font-light text-[36px] sm:text-[44px] leading-[1.15] text-idw-parchment text-balance">
          Digital ecosystems shaped around the way your organization works.
        </h1>
        <p className="font-ui text-idw-parchment/70 mt-6 leading-relaxed">
          For wellness centers, organizations and bespoke experiences. Every Time to Elevate
          engagement starts with a conversation about how your organization actually works.
        </p>
        <a
          href="mailto:hello@innerdwes.com"
          className="inline-block mt-10 rounded-full bg-idw-clay text-idw-parchment font-ui text-sm font-semibold uppercase tracking-wide px-7 py-3.5 transition-transform hover:-translate-y-0.5"
        >
          Talk to us
        </a>
        <div>
          <Link href="/" className="inline-block mt-6 font-ui text-sm text-idw-parchment/60 underline">
            Back to InnerDweS
          </Link>
        </div>
      </div>
    </section>
  );
}
