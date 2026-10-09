import { PendingNavLink } from "@/components/nav/pending-nav-link";

/** The "Back to My Spaces" control for account-level billing pages (same look as the Create page's back link). */
export function BackToSpaces({ label, href = "/space" }: { label: string; href?: string }) {
  return (
    <PendingNavLink
      href={href}
      pendingLabel={label}
      className="gap-1 ps-1 pe-2.5 mb-4 text-idw-forest/70 hover:text-idw-forest"
    >
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="shrink-0 rtl:rotate-180">
        <path d="M12.5 15.5L7 10l5.5-5.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-sm font-semibold">{label}</span>
    </PendingNavLink>
  );
}
