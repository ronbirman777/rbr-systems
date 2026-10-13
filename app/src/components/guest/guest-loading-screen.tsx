import { InnerDweSMark } from "@/components/brand/wordmark";
import { createTranslator, type Locale } from "@/lib/i18n/core";
import { GUEST_HERO_SELECTOR, GUEST_LOGO_SELECTOR } from "@/lib/guest/heroWait";

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
 *   "overlay"  rendered by GuestHeroWait inside the Guest column with the
 *              content. Hidden by default; it becomes visible only to
 *              continue a streaming fallback that is already on screen,
 *              until the hero image has loaded - hard capped at 1.5s (by CSS
 *              alone, and again by JS). It never fades in over content that
 *              was already painted (QA defect D1).
 *
 * Both are `position: fixed`, over a reserved layout, so they can never
 * shift anything (CLS 0). The fallback fades in only after 200ms
 * (globals.css, .idw-guest-loading) so a fast load never shows it at all.
 *
 * Visual: the existing InnerDweS mark with its calm idw-loading-breathe
 * (static under reduced motion - the existing globals.css override), on
 * parchment, with "Created with InnerDweS" from the existing attribution
 * key. The phrase and the visually hidden "Loading" come from the Space's
 * own locale (resolved by the layout from the published snapshot it has
 * already gated - see app/(guest)/guestGate.ts). After loading the customer's brand is
 * primary again: nothing here stays on screen.
 *
 * Static markup, no hooks: usable as a server Suspense fallback and from
 * the client overlay alike. No third-party requests, no cookies.
 */

export type GuestLoadingVariant = "stream" | "overlay";

/** Id of the streaming fallback; the continuity script looks for it. */
export const GUEST_LOADING_STREAM_ID = "idw-guest-loading-stream";

/** Ids of the <style> rules the continuity script may inject (once each). */
export const GUEST_LOADING_SHOWN_STYLE_ID = "idw-guest-loading-shown";
export const GUEST_LOADING_DONE_STYLE_ID = "idw-guest-loading-done";

/**
 * Lets the overlay start visible - only ever injected while the streaming
 * fallback is still on screen - and hides it by 1.5s with CSS alone. The
 * `html` prefix out-ranks the default (hidden) overlay rule; the reveal
 * rules ([data-revealed]) out-rank this one.
 */
export const GUEST_LOADING_SHOWN_CSS =
  'html .idw-guest-loading[data-variant="overlay"]{opacity:1;visibility:visible;animation:idw-guest-loading-out .2s ease-in 1.3s forwards}';

/** The hero (or logo) has loaded or failed: fade out now, before hydration. */
export const GUEST_LOADING_DONE_CSS =
  'html .idw-guest-loading[data-variant="overlay"]:not([data-revealed]){animation:idw-guest-loading-out .2s ease-in forwards;pointer-events:none}';

/**
 * Continuity, not a timer - and the early "hero ready" decision (QA defect
 * D1). Runs while the HTML is parsed, so it needs no JS bundle and never
 * waits for hydration:
 *
 *   1. Image readiness, decided as early as the browser knows it: capture-
 *      phase load/error listeners on the document see the first
 *      img[data-guest-hero] (or, once parsing is done and there is no hero,
 *      the img[data-guest-logo]) settle - even inside React's hidden
 *      streaming container - and inject DONE. At DOMContentLoaded, no target
 *      at all, or a target that is already complete (cached / decoded /
 *      failed), injects DONE as well. Same targets as lib/guest/heroWait.ts.
 *   2. 200ms after the fallback is parsed - the moment its CSS makes it
 *      visible - if it is STILL in the document and the hero is not already
 *      settled, inject SHOWN, so the overlay continues the visible fallback
 *      instead of flashing half-loaded content.
 *
 * The overlay is hidden by default (globals.css), so a page whose content
 * arrived before its fallback ever became visible never shows the overlay:
 * it can never cover content that was already painted. Injects <style>
 * elements (never attributes on React-owned nodes), so it cannot cause a
 * hydration mismatch. Each rule is injected at most once.
 */
export const GUEST_LOADING_CONTINUITY_SCRIPT =
  `(function(){try{var d=document;` +
  `function css(id,t){if(d.getElementById(id))return;var s=d.createElement("style");s.id=id;s.textContent=t;d.head.appendChild(s)}` +
  `function done(){css("${GUEST_LOADING_DONE_STYLE_ID}",'${GUEST_LOADING_DONE_CSS}')}` +
  `function hero(){return d.querySelector("${GUEST_HERO_SELECTOR}")}` +
  `function logo(){return d.querySelector("${GUEST_LOGO_SELECTOR}")}` +
  `function settled(e){var t=e&&e.target;if(!t||t.tagName!=="IMG")return;var h=hero();if(t===h||(!h&&d.readyState!=="loading"&&t===logo()))done()}` +
  `d.addEventListener("load",settled,true);d.addEventListener("error",settled,true);` +
  `d.addEventListener("DOMContentLoaded",function(){var i=hero()||logo();if(!i||i.complete)done()});` +
  `setTimeout(function(){if(!d.getElementById("${GUEST_LOADING_STREAM_ID}")||d.getElementById("${GUEST_LOADING_DONE_STYLE_ID}"))return;` +
  `css("${GUEST_LOADING_SHOWN_STYLE_ID}",'${GUEST_LOADING_SHOWN_CSS}')},200)` +
  `}catch(e){}})()`;

export type GuestLoadingCopy = { loading: string; createdWith: string };

export function guestLoadingCopy(locale: Locale): GuestLoadingCopy {
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
  copy: givenCopy,
}: {
  locale: Locale;
  /**
   * Pre-translated text (TASK 033, QA D5). The overlay is rendered inside
   * the Guest client bundle, which carries only English; its server parent
   * (GuestDesktopShell) translates with every locale and passes the result.
   */
  copy?: GuestLoadingCopy;
  variant?: GuestLoadingVariant;
  /** Overlay only: set once the hero is ready ("fade" if visible, else "instant"). */
  revealed?: "fade" | "instant";
}) {
  const copy = givenCopy ?? guestLoadingCopy(locale);
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
