import Link from "next/link";

/**
 * Minimal entry point for the product app. The real marketing site stays
 * at the main static domain, untouched - this is just the door into
 * sign-up -> Create Your Space, not a rebuild of that site.
 */
export default function Home() {
  return (
    <main className="flex-1 flex items-center justify-center bg-[#FBF9F5] px-6 py-24 text-center">
      <div>
        <h1 className="font-serif text-3xl text-[#1B2E24]">RBR</h1>
        <p className="text-sm text-[#1B2E24]/60 mt-3 max-w-sm mx-auto">
          Your work deserves a digital space that feels like you.
        </p>
        <Link
          href="/sign-up"
          className="inline-block mt-8 rounded-full bg-[#1B2E24] text-[#FBF9F5] text-sm font-semibold uppercase tracking-wide px-6 py-3"
        >
          Create Your Space
        </Link>
      </div>
    </main>
  );
}
