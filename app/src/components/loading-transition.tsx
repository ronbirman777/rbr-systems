import { InnerDweSMark } from "@/components/brand/wordmark";

/**
 * Task 011 (items D/E) - the one shared "something is happening" moment
 * across the app: opening a Space from My Spaces and signing in both use
 * this, instead of a generic browser/spinner treatment. The mark's own
 * "idw-loading-breathe" animation (globals.css) is a slow scale+opacity
 * pulse - calm, not a spinner - and is fully inert under
 * prefers-reduced-motion (the same media query already used for the
 * marketing Hero's motion), leaving only the message and mark visible,
 * still legible and still communicating "in progress" via the live
 * region below.
 *
 * `role="status"` + `aria-live="polite"` means assistive tech announces
 * the message once, without needing focus to move here - this is
 * feedback, not an interruption, and the caller (route-level loading.tsx,
 * or a pending form state) is responsible for how long it stays mounted;
 * this component never fakes a minimum display duration itself.
 */
export function LoadingTransition({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex-1 flex flex-col items-center justify-center gap-4 py-24 bg-idw-parchment"
    >
      {/* TASK 033 (backport): the official mark breathing with a soft halo. */}
      <span className="relative inline-flex items-center justify-center w-[64px] h-[64px]" aria-hidden="true">
        <span className="idw-loading-halo absolute inset-0 rounded-full border border-idw-forest" />
        <InnerDweSMark size={40} className="idw-loading-breathe" />
      </span>
      <p className="text-sm font-medium text-idw-forest/80">{message}</p>
    </div>
  );
}
