import Link from "next/link";
import { InnerDweSMark } from "@/components/brand/wordmark";
import { MobileNavToggle } from "./mobile-nav-toggle";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/actions";
import { LogoutButton } from "@/components/logout-button";

const LINKS = [
  { href: "#product-family", label: "Products" },
  { href: "#philosophy", label: "Philosophy" },
  { href: "#system", label: "How It Works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#about", label: "About" },
];

/**
 * Task 011 (item 2): the marketing site now recognizes an authenticated
 * visitor via the exact same server-verified check every other gated route
 * already uses (`createClient()` -> `auth.getUser()` - see space/page.tsx
 * and configurator/retreat/[tenantId]/page.tsx), so session state cannot
 * independently drift between / and /space/Studio: they all read the same
 * cookies through the same call. No name is shown - the signup form only
 * ever collects email + password (verified: no full_name/display_name is
 * captured or stored anywhere in this codebase), so a guessed-from-email
 * greeting would be a lie. "Signed in" is neutral and accurate for every
 * account today; Task 012's real profile fields can replace it later.
 *
 * The always-visible topbar keeps exactly the same one-chip-plus-hamburger
 * shape at every width as before (only the chip's label/href swaps) - the
 * 320-375px row this component renders was the exact site of Task 010's
 * real overflow investigation, so no new element is added to it. The
 * secondary action (Log in / Log out) is `hidden sm:inline-flex` in the
 * topbar - the same proven-safe pattern already used for the tagline text
 * below - and is additionally always reachable through the mobile dropdown
 * regardless of width.
 */
export async function MarketingNav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAuthenticated = Boolean(user);

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
          {isAuthenticated ? (
            <>
              <span className="hidden sm:inline text-[11px] font-semibold uppercase tracking-wide text-idw-forest/40 mr-1">
                Signed in
              </span>
              <form action={signOut} className="hidden sm:block">
                <LogoutButton />
              </form>
              <Link
                href="/space"
                className="shrink-0 inline-flex items-center justify-center min-h-11 rounded-full bg-idw-forest text-idw-parchment font-ui text-xs sm:text-sm font-semibold px-3.5 sm:px-5 whitespace-nowrap transition-transform hover:-translate-y-0.5"
              >
                My Spaces
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/log-in"
                className="hidden sm:inline-flex items-center min-h-11 px-3 rounded-lg text-xs font-semibold uppercase tracking-wide text-idw-forest/60 hover:text-idw-forest active:bg-idw-forest/10 transition-colors"
              >
                Log in
              </Link>
              <Link
                href="/sign-up"
                className="shrink-0 inline-flex items-center justify-center min-h-11 rounded-full bg-idw-forest text-idw-parchment font-ui text-xs sm:text-sm font-semibold px-3.5 sm:px-5 whitespace-nowrap transition-transform hover:-translate-y-0.5"
              >
                Create Your Space
              </Link>
            </>
          )}
          <MobileNavToggle links={LINKS} isAuthenticated={isAuthenticated} />
        </div>
      </div>
    </header>
  );
}
