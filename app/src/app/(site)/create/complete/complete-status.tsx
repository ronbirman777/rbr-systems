"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  completeView, isTerminal, nextPollDelay, parseCheckoutStatus, POLL_GIVE_UP_MS, type CheckoutStatus, type CompleteView,
} from "@/lib/billing/checkoutPolling";

export type CompleteLabels = {
  settingUp: string; hint: string; confirmed: string; stillPreparing: string; noPaymentYet: string; expired: string;
  canceled: string; generic: string; returnToSpaces: string; reference: string;
};

/**
 * Polls the server for the checkout's real state. The URL proves nothing: "Payment confirmed" is shown only when the
 * server reports processing/ready, and "ready" is the only thing that navigates.
 */
export function CompleteStatus({ checkoutId, labels }: { checkoutId: string; labels: CompleteLabels }) {
  const router = useRouter();
  const [status, setStatus] = useState<CheckoutStatus | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    const started = Date.now();

    const schedule = () => {
      if (stopped) return;
      timer = setTimeout(poll, nextPollDelay(attempt++));
    };

    async function poll() {
      if (stopped) return;
      if (document.visibilityState === "hidden") {
        // Paused while the tab is hidden; resumes on visibilitychange.
        return;
      }
      const sinceStart = Date.now() - started;
      if (sinceStart > POLL_GIVE_UP_MS) {
        setGaveUp(true);
        return;
      }
      try {
        const res = await fetch(`/api/billing/checkout-status?c=${encodeURIComponent(checkoutId)}`, { cache: "no-store", credentials: "same-origin" });
        if (stopped) return;
        const parsed = res.ok ? parseCheckoutStatus(await res.json()) : null;
        setElapsed(Date.now() - started);
        if (parsed) {
          setStatus(parsed);
          if (parsed.state === "ready") {
            stopped = true;
            router.replace(`/create/welcome/${parsed.tenantId}`);
            return;
          }
          if (isTerminal(parsed)) {
            stopped = true;
            return;
          }
        }
      } catch {
        // transient network error: keep trying
      }
      schedule();
    }

    function onVisibility() {
      if (stopped || document.visibilityState !== "visible") return;
      clearTimeout(timer);
      void poll();
    }
    document.addEventListener("visibilitychange", onVisibility);
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [checkoutId, router]);

  const view: CompleteView = completeView(status, elapsed, gaveUp);
  const showConfirmed = view === "confirmed" || view === "still_preparing" || view === "ready";
  const spinning = view === "setting_up" || view === "confirmed" || view === "ready";
  const message: Record<CompleteView, string | null> = {
    setting_up: labels.hint, confirmed: labels.hint, ready: labels.hint, still_preparing: labels.stillPreparing,
    no_payment_yet: labels.noPaymentYet, expired: labels.expired, canceled: labels.canceled, gave_up: labels.generic,
  };
  const showLink = view === "expired" || view === "canceled" || view === "no_payment_yet" || view === "gave_up";

  return (
    <div className="space-y-4">
      {showLink ? null : <h1 className="font-ui text-2xl sm:text-3xl text-idw-forest">{labels.settingUp}</h1>}
      <div role="status" aria-live="polite" className="space-y-4">
      {showConfirmed ? <p className="text-sm font-semibold text-idw-forest">{labels.confirmed}</p> : null}
      {message[view] ? <p className="text-sm leading-relaxed text-idw-forest/70">{message[view]}</p> : null}
      {spinning ? (
        <span aria-hidden="true" className="mx-auto block h-5 w-5 rounded-full border-2 border-idw-forest/25 border-t-idw-forest animate-spin motion-reduce:animate-none" />
      ) : null}
      {view === "still_preparing" ? (
        <p className="text-xs text-idw-forest/50" dir="ltr">{labels.reference}: {checkoutId.slice(0, 8)}</p>
      ) : null}
      {showLink ? (
        <Link href="/space" className="inline-flex items-center justify-center min-h-11 px-5 rounded-full border border-idw-forest/20 text-sm font-semibold text-idw-forest hover:border-idw-forest/50">
          {labels.returnToSpaces}
        </Link>
      ) : null}
      </div>
    </div>
  );
}
