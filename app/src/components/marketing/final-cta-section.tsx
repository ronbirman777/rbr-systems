import Link from "next/link";
import { InnerDweSMark } from "@/components/brand/wordmark";

export function FinalCtaSection() {
  return (
    <section className="relative bg-idw-graphite text-idw-parchment py-32 px-6 text-center overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 50% 30%, rgba(186,197,178,0.14), transparent 70%), radial-gradient(ellipse 50% 40% at 50% 100%, rgba(25,43,33,0.9), transparent 70%)",
        }}
      />
      <div className="relative max-w-2xl mx-auto">
        <InnerDweSMark size={44} className="mx-auto mb-8" />
        <h2 className="font-editorial italic font-light text-[32px] sm:text-[44px] leading-[1.2] text-idw-parchment text-balance">
          Create a digital space worthy of the experience you create.
        </h2>
        <Link
          href="/sign-up"
          className="inline-block mt-10 rounded-full bg-idw-parchment text-idw-forest font-ui text-sm font-semibold uppercase tracking-wide px-9 py-4 transition-transform hover:-translate-y-0.5"
        >
          Create Your Space
        </Link>
      </div>
    </section>
  );
}
