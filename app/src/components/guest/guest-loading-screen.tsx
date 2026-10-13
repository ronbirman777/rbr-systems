import { InnerDweSMark } from "@/components/brand/wordmark";
import { createTranslator, type Locale } from "@/lib/i18n";

/**
 * TASK 033 (plan section 4.5, D-LD1) - the branded Guest loading screen.
 *
 * A streaming fallback plus a short hero-wait, never a timer:
 *
 *   "stream"   rendered by the Guest root layout's Suspense boundary while
 *              the published payload and the access chain resolve on the
 *              server. It replaces a blank wait; unknown or denied Spaces
 *              resolve into the existing 404 / access screen, because the
 *              boundary simply swaps in whatever the page renders.
 *   "overlay"  rendered by GuestHeroWait inside the Guest column after the
 *              content has arrived, until the hero image is decoded - hard
 *              capped at 1.5s (by CSS alone, and again by JS).
 *
 * Both are `position: fixed`, over a reserved layout, so they can never
 * shift anything (CLS 0), and both fade in only after 200ms (globals.css,
 * .idw-guest-loading) so a fast load never shows them at all.
 *
 * Visual: the existing InnerDweS mark with its calm idw-loading-breathe
 * (static under reduced motion - the existing globals.css override), on
 * parchment, with "Created with InnerDweS" from the existing attribution
 * key. The phrase and the visually hidden "Loading" come from the Space's
 * own locale (resolved by the layout with one light, indexed read - see
 * app/(guest)/guestDocument.ts). After loading the customer's brand is
 * primary again: nothing here stays on screen.
 *
 * Static markup, no hooks: usable as a server Suspense fallback and from
 * the client overlay alike. No third-party requests, no cookies.
 */

export type GuestLoadingVariant = "stream" | "overlay";

/** Id of the streaming fallback; the continuity script looks for it. */
export const GUEST_LOADING_STREAM_ID = "idw-guest-loading-stream";
const SHOWN_STYLE_ID = "idw-guest-loading-shown";

/**
 * Continuity, not a timer. 200ms after the streaming fallback is parsed -
 * the moment its CSS makes it visible - if it is STILL in the document
 * (the content has not swapped in yet), a rule is added that lets the
 * overlay start visible. Without it, a slow page would go fallback ->
 * 200ms of half-loaded content -> overlay. A fast page never runs the rule,
 * so its overlay keeps the normal 200ms appearance delay. The overlay's
 * 1.5s cap is unaffected. Runs once; injects a <style> (not an attribute on
 * <html>) so it can never cause a hydration mismatch.
 */
export const GUEST_LOADING_CONTINUITY_SCRIPT =
  `setTimeout(function(){try{if(!document.getElementById("${GUEST_LOADING_STREAM_ID}")||document.getElementById("${SHOWN_STYLE_ID}"))return;` +
  `var s=document.createElement("style");s.id="${SHOWN_STYLE_ID}";` +
  `s.textContent='.idw-guest-loading[data-variant="overlay"]{animation:idw-guest-loading-out .2s ease-in 1.3s forwards}';` +
  `document.head.appendChild(s)}catch(e){}},200)`;

export function guestLoadingCopy(locale: Locale): { loading: string; createdWith: string } {
  const { t } = createTranslator(locale);
  return {
    loading: t("common", "loading"),
    createdWith: t("attribution", "createdWith", { brand: "InnerDweS" }),
  };
}

export function GuestLoadingScreen({
  locale,
  variant = "stream",
  revealed,
}: {
  locale: Locale;
  variant?: GuestLoadingVariant;
  /** Overlay only: set once the hero is ready ("fade" if visible, else "instant"). */
  revealed?: "fade" | "instant";
}) {
  const copy = guestLoadingCopy(locale);
  return (
    <div
      id={variant === "stream" ? GUEST_LOADING_STREAM_ID : undefined}
      role="status"
      aria-live="polite"
      data-variant={variant}
      data-revealed={revealed}
      data-testid={`guest-loading-${variant}`}
      className={`idw-guest-loading fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 px-6 bg-idw-parchment ${
        variant === "overlay" ? "guest-column-fixed" : ""
      }`}
    >
      <InnerDweSMark size={44} className="idw-loading-breathe" />
      <span className="sr-only">{copy.loading}</span>
      <p
        className="text-[12px] leading-4 text-center"
        // Forest on parchment: well above AA (about 13:1) for small text.
        style={{ color: "var(--idw-forest)", fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}
      >
        {copy.createdWith}
      </p>
      {variant === "stream" ? <script dangerouslySetInnerHTML={{ __html: GUEST_LOADING_CONTINUITY_SCRIPT }} /> : null}
    </div>
  );
}
