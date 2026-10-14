"use client";

import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { applyCouponAction, cancelCheckoutAction, startCheckoutAction, type StartCheckoutState } from "../billingActions";
import { formatMoney } from "@/lib/billing/money";
import { quoteRows, type QuoteViewLike } from "@/lib/billing/checkoutView";
import type { Locale } from "@/lib/i18n/locales";
import { getLegalDocument, legalHref, type LegalDocumentId } from "@/lib/legal/documents";

/**
 * The documents the checkout line refers to. The documents themselves are
 * published in English only, so the links carry the registry's English
 * titles (lang="en") rather than a translation of a title that does not exist.
 * They open a new tab so the checkout form and its consent ticks are kept.
 */
const CHECKOUT_LEGAL_DOCS: readonly LegalDocumentId[] = ["terms", "privacy", "billing"];

export type CheckoutFormLabels = {
  dueToday: string; then: string; firstCycle: string; firstCycles: string; everyCycle: string; perMonth: string;
  couponLabel: string; couponApply: string; couponRemove: string; couponApplied: string;
  consentImmediate: string; consentWithdrawal: string; termsLine: string;
  submit: string; preparing: string; canceledNotice: string; taxNote: string; perSpaceNote: string;
  /** Pre-translated message for every funnel error code. */
  errors: Record<string, string>;
};

const INITIAL: StartCheckoutState = { error: null };

export function CheckoutForm({
  spaceType, locale, initialQuote, canceled, labels,
}: {
  spaceType: "teach" | "retreat";
  locale: Locale;
  initialQuote: QuoteViewLike;
  canceled: boolean;
  labels: CheckoutFormLabels;
}) {
  const [state, formAction, pending] = useActionState(startCheckoutAction, INITIAL);
  const [quote, setQuote] = useState<QuoteViewLike>(initialQuote);
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [immediate, setImmediate] = useState(false);
  const [withdrawal, setWithdrawal] = useState(false);
  const [applying, startApply] = useTransition();
  const ids = { coupon: useId(), couponErr: useId(), submitErr: useId(), terms: useId() };

  // Coming back from Stripe unpaid: free the coupon reservation once. The server decides whether anything is open.
  const cancelSent = useRef(false);
  useEffect(() => {
    if (canceled && !cancelSent.current) {
      cancelSent.current = true;
      void cancelCheckoutAction(spaceType);
    }
  }, [canceled, spaceType]);

  const money = (minor: number) => formatMoney(minor, quote.currency, locale);
  const msg = (c: string) => labels.errors[c] ?? labels.errors.unavailable ?? "";

  function run(next: string) {
    startApply(async () => {
      const r = await applyCouponAction(spaceType, next);
      if (r.quote) setQuote(r.quote);
      if (r.ok) {
        setCouponError(null);
        setApplied(r.couponCode);
        if (r.couponCode) setAnnounce(labels.couponApplied.replace("{code}", r.couponCode));
        else { setCode(""); setAnnounce(""); }
      } else {
        setApplied(null);
        setCouponError(r.error);
        setAnnounce(msg(r.error));
      }
    });
  }

  const rows = quoteRows(quote, labels);
  const submitError = state.error;
  const busy = pending || applying;

  return (
    <div className="space-y-6">
      {canceled ? <p role="status" className="rounded-xl bg-idw-forest/5 px-4 py-3 text-sm text-idw-forest/80">{labels.canceledNotice}</p> : null}

      <dl className="rounded-2xl border border-idw-forest/10 bg-white p-5 space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="flex items-baseline justify-between gap-4">
            <dt className={`text-sm ${r.id === "today" ? "font-semibold text-idw-forest" : "text-idw-forest/70"}`}>{r.label}</dt>
            <dd className={`text-end ${r.id === "today" ? "text-lg font-semibold text-idw-forest" : "text-sm text-idw-forest"}`}>
              {money(r.minor)}{r.perMonth ? <span className="text-idw-forest/60"> {labels.perMonth}</span> : null}
            </dd>
          </div>
        ))}
      </dl>

      <div>
        <label htmlFor={ids.coupon} className="block text-sm font-semibold text-idw-forest">{labels.couponLabel}</label>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            id={ids.coupon}
            type="text"
            dir="auto"
            value={applied ?? code}
            readOnly={applied !== null}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (!applied && code.trim() && !busy) run(code.trim()); } }}
            maxLength={64}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={couponError ? true : undefined}
            aria-describedby={couponError ? ids.couponErr : undefined}
            className="min-h-11 flex-1 min-w-0 rounded-xl border border-idw-forest/20 bg-white px-3 text-sm text-idw-forest"
          />
          {applied ? (
            <button type="button" disabled={busy} onClick={() => run("")} className="min-h-11 px-4 rounded-full border border-idw-forest/20 text-sm font-semibold text-idw-forest disabled:opacity-50">
              {labels.couponRemove}
            </button>
          ) : (
            <button type="button" disabled={busy || code.trim() === ""} onClick={() => run(code.trim())} className="min-h-11 px-4 rounded-full border border-idw-forest/20 text-sm font-semibold text-idw-forest disabled:opacity-50">
              {labels.couponApply}
            </button>
          )}
        </div>
        {couponError ? <p id={ids.couponErr} role="alert" className="mt-2 text-sm text-idw-clay-text">{msg(couponError)}</p> : null}
        <p aria-live="polite" className={applied ? "mt-2 text-sm text-idw-forest/80" : "sr-only"}>{announce}</p>
      </div>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="spaceType" value={spaceType} />
        <input type="hidden" name="coupon" value={applied ?? ""} />

        <label className="flex items-start gap-3 min-h-11 text-sm text-idw-forest/80">
          <input type="checkbox" name="consentImmediate" required checked={immediate} onChange={(e) => setImmediate(e.target.checked)}
            aria-describedby={submitError === "consent" ? ids.submitErr : undefined} className="mt-0.5 h-5 w-5 shrink-0 accent-[#192b21]" />
          <span>{labels.consentImmediate}</span>
        </label>
        <label className="flex items-start gap-3 min-h-11 text-sm text-idw-forest/80">
          <input type="checkbox" name="consentWithdrawal" required checked={withdrawal} onChange={(e) => setWithdrawal(e.target.checked)}
            aria-describedby={submitError === "consent" ? ids.submitErr : undefined} className="mt-0.5 h-5 w-5 shrink-0 accent-[#192b21]" />
          <span>{labels.consentWithdrawal}</span>
        </label>
        <div id={ids.terms} className="text-xs text-idw-forest/60">
          <p>{labels.termsLine}</p>
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1" data-testid="checkout-legal-links">
            {CHECKOUT_LEGAL_DOCS.map((id) => (
              <li key={id}>
                <a href={legalHref(id)} target="_blank" rel="noopener" lang="en" hrefLang="en" className="underline underline-offset-2 text-idw-forest/80 hover:text-idw-forest">
                  {getLegalDocument(id).title}
                </a>
              </li>
            ))}
          </ul>
        </div>

        {submitError ? <p id={ids.submitErr} role="alert" className="text-sm text-idw-clay-text">{msg(submitError)}</p> : null}

        <button
          type="submit"
          disabled={busy}
          aria-describedby={submitError ? `${ids.terms} ${ids.submitErr}` : ids.terms}
          className="w-full min-h-12 rounded-full bg-idw-forest px-6 text-sm font-semibold text-idw-parchment disabled:opacity-60 active:scale-[0.99] motion-reduce:active:scale-100"
        >
          {pending ? labels.preparing : labels.submit}
        </button>
        <p className="text-xs text-idw-forest/50">{labels.taxNote}</p>
        <p className="text-xs text-idw-forest/50">{labels.perSpaceNote}</p>
      </form>
    </div>
  );
}
