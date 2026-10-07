import type { Metadata } from "next";
import Link from "next/link";
import { InnerDweSMark } from "@/components/brand/wordmark";

const TITLE = "Time to Heal · InnerDweS";
const DESCRIPTION = "Thoughtful continuity between sessions, for therapists, healers and practitioners. Coming soon.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function TimeToHealPage() {
  return (
    <section className="flex-1 flex items-center justify-center bg-idw-sage/30 px-6 py-28 text-center">
      <div className="max-w-lg">
        <InnerDweSMark size={44} className="mx-auto mb-8" />
        <div className="font-ui text-xs font-semibold uppercase tracking-[0.22em] text-idw-clay mb-4">
          Time to Heal
        </div>
        <h1 className="font-editorial italic font-light text-[36px] sm:text-[44px] leading-[1.15] text-idw-forest text-balance">
          Coming soon.
        </h1>
        <p className="font-ui text-idw-forest/70 mt-6 leading-relaxed">
          Thoughtful continuity between sessions — for therapists, healers and practitioners.
          We&apos;re building Time to Heal with the same care as Time to Flow, and it isn&apos;t
          ready yet.
        </p>
        <p className="font-ui text-idw-forest/70 mt-4 leading-relaxed">
          Want to hear when it launches?{" "}
          <Link href="/time-to-elevate" className="underline font-medium text-idw-forest">
            Get in touch
          </Link>
          .
        </p>
        <Link
          href="/"
          className="inline-block mt-10 rounded-full bg-idw-forest text-idw-parchment font-ui text-sm font-semibold uppercase tracking-wide px-7 py-3.5 transition-transform hover:-translate-y-0.5"
        >
          Back to InnerDweS
        </Link>
      </div>
    </section>
  );
}
