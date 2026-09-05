import Image from "next/image";
import { InnerDweSMark } from "@/components/brand/wordmark";

export function ProblemSection() {
  return (
    <section className="bg-idw-linen py-28 px-6">
      <div className="mx-auto max-w-[1280px] grid md:grid-cols-2 gap-14 items-center">
        <div>
          <div className="font-ui text-xs font-semibold uppercase tracking-[0.22em] text-idw-clay-text mb-4">
            The Problem
          </div>
          <h2 className="font-editorial italic font-light text-[36px] sm:text-[44px] leading-[1.15] text-idw-forest text-balance">
            Extraordinary experiences, fragmented tools.
          </h2>
          <p className="font-ui text-idw-forest/70 mt-6 leading-relaxed max-w-md">
            Retreat facilitators invest years building transformative environments. The physical
            space is considered down to the last detail — the light, the scent, the sequence of
            experiences.
          </p>
          <p className="font-ui text-idw-forest/70 mt-4 leading-relaxed max-w-md">
            Then guests arrive and are handed a PDF, a WhatsApp group, and a spreadsheet. The
            digital experience breaks the spell before it begins.
          </p>
        </div>

        <div className="relative rounded-2xl overflow-hidden aspect-[4/3] shadow-xl">
          <Image
            src="/marketing/problem-lotus.jpg"
            alt=""
            fill
            className="object-cover"
            sizes="(min-width: 768px) 50vw, 100vw"
          />
          <div className="absolute inset-0 bg-idw-forest/25" />
          <div className="absolute inset-0 flex items-center justify-center p-10">
            <div className="text-center max-w-sm">
              <InnerDweSMark size={30} className="mx-auto mb-4" />
              <p className="font-editorial italic text-idw-parchment text-xl leading-snug">
                &ldquo;InnerDweS brings the digital experience into alignment with the human
                one.&rdquo;
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
