"use client";

import { useFormStatus } from "react-dom";
import { InnerDweSMark } from "@/components/brand/wordmark";

/**
 * Task 011: My Spaces' "Log out" action. Must be a child of a
 * `<form action={signOut}>` (see space/page.tsx) - `useFormStatus()` reads
 * that parent form's own pending state directly, which is why this needs
 * no separate `useActionState` plumbing: `signOut()` (src/app/(auth)/actions.ts)
 * is the exact same Supabase `auth.signOut()` + `redirect("/log-in")` the
 * rest of the app would use, not a second auth implementation. Real
 * pending state (not a fixed delay) drives both the disabled/press-guard
 * behavior and the InnerDweS loading mark, matching every other action on
 * this page.
 *
 * `className` appends to (never replaces) the base styling, so every call
 * site keeps the same real >=44px touch target and pending-state behavior -
 * used as-is on My Spaces, and with layout-only additions (e.g. `w-full
 * justify-start`) inside the marketing nav's mobile dropdown.
 */
export function LogoutButton({ className = "" }: { className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label="Log out"
      className={`inline-flex items-center gap-1.5 min-h-11 px-3 rounded-lg text-xs font-semibold uppercase tracking-wide text-idw-forest/60 hover:text-idw-forest active:bg-idw-forest/10 transition-colors disabled:opacity-50 ${className}`}
    >
      {pending && <InnerDweSMark size={14} className="idw-loading-breathe shrink-0" />}
      {pending ? "Logging out…" : "Log out"}
    </button>
  );
}
