import Link from "next/link";
import { InnerDweSMark } from "@/components/brand/wordmark";
import { MobileNavToggle } from "./mobile-nav-toggle";

const LINKS = [
  { href: "#product-family", label: "Products" },
  { href: "#philosophy", label: "Philosophy" },
  { href: "#system", label: "How It Works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#about", label: "About" },
];

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-50 bg-idw-parchment/95 backdrop-blur border-b border-idw-forest/10">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between gap-3 sm:gap-6">
        <Link href="/" className="flex items-center gap-2 sm:gap-2.5 shrink-0 min-w-0">
          <InnerDweSMark size={26} className="shrink-0" />
          <span className="leading-tight min-w-0">
            <span className="block font-brand italic text-base sm:text-lg text-idw-forest truncate">
              InnerDweS
            </span>
            {/* The uppercase-tracked descriptor is wider than it looks and was
                the actual cause of overflow at 320-375px - hidden until there's
                room for it rather than shrunk illegibly small. */}
            <span className="hidden sm:block text-[9px] font-semibold uppercase tracking-[0.18em] text-idw-clay-text">
              Digital Wellness Solutions
            </span>
          </span>
        </Link>

        <nav className="hidden lg:flex items-center gap-8" aria-label="Primary">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="font-ui text-sm text-idw-forest/70 hover:text-idw-forest transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <Link
            href="/sign-up"
            className="shrink-0 rounded-full bg-idw-forest text-idw-parchment font-ui text-xs sm:text-sm font-semibold px-3.5 py-2 sm:px-5 sm:py-2.5 whitespace-nowrap transition-transform hover:-translate-y-0.5"
          >
            Create Your Space
          </Link>
          <MobileNavToggle links={LINKS} />
        </div>
      </div>
    </header>
  );
}
