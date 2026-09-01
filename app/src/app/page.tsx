import Link from "next/link";
import { InnerDweSWordmark } from "@/components/brand/wordmark";

/**
 * Minimal entry point for the product app. The real marketing site stays
 * at the main static domain, untouched - this is just the door into
 * sign-up -> Create Your Space, not a rebuild of that site. It's still the
 * one deliberate "brand moment" surface in this pass, so it carries more
 * editorial weight than the functional chrome elsewhere.
 */
export default function Home() {
  return (
    <main className="relative flex-1 flex items-center justify-center overflow-hidden bg-idw-parchment px-6 py-24 text-center">
      {/* Very soft radial wash - not a visible gradient edge, just depth */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 30%, rgba(186,197,178,0.18), transparent 70%), radial-gradient(ellipse 50% 40% at 85% 85%, rgba(168,103,80,0.08), transparent 70%)",
        }}
      />
      {/* Extremely subtle flowing line motif - one continuous, gentle sweep,
          never repeated as a pattern */}
      <svg
        aria-hidden="true"
        viewBox="0 0 1000 600"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 w-full h-full opacity-[0.06]"
      >
        <path
          d="M -60,260 C 260,120 620,420 1060,220"
          fill="none"
          stroke="#192B21"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
      </svg>

      <div className="relative max-w-xl">
        <InnerDweSWordmark className="flex flex-col items-center" markSize={64} />
        <p className="font-editorial italic font-light text-3xl sm:text-4xl text-idw-forest leading-[1.3] mt-12 max-w-lg mx-auto">
          We are giving digital solutions to the wellness world.
        </p>
        <Link
          href="/sign-up"
          className="inline-block mt-12 rounded-full bg-idw-forest text-idw-parchment text-sm font-semibold uppercase tracking-wide px-8 py-3.5 shadow-[0_16px_40px_-16px_rgba(25,43,33,0.45)] transition-transform hover:-translate-y-0.5"
        >
          Create Your Space
        </Link>
      </div>
    </main>
  );
}
