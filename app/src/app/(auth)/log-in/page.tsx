"use client";

import { Suspense, useActionState, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { InnerDweSMark } from "@/components/brand/wordmark";
import { LoadingTransition } from "@/components/loading-transition";
import { BackToHomeLink } from "@/components/back-to-home-link";
import { signIn, resendConfirmationEmail, type AuthActionState } from "../actions";

const initialState: AuthActionState = { error: null };

/**
 * Task 014 (item A, resend verification): the only user-accessible place
 * this was previously reachable was sign-up's own in-memory "check your
 * email" state (gone the moment that page unmounts/refreshes) - not
 * discoverable again later, e.g. from a failed login on an unconfirmed
 * account. This surfaces the SAME existing `resendConfirmationEmail`
 * Server Action (no new verification mechanism) right where a real user
 * would actually be stuck: the "Email not confirmed" error on /log-in.
 *
 * The email input above is an uncontrolled field (no client state exists
 * for it, by design, elsewhere on this page) - `emailRef` reads its
 * current value at click time rather than duplicating it into state.
 *
 * Messaging is deliberately neutral on both outcomes it distinguishes:
 * success is always the same "check your email" copy regardless of
 * whether Supabase's `resend()` call found a genuinely unconfirmed
 * account (this mirrors the anti-enumeration posture already established
 * for login/recovery - resend must not become a new way to confirm
 * whether an address exists or its confirmation state). Only a clearly
 * infrastructural failure (rate limiting, or any other error) gets its
 * own distinct, still-neutral copy, since collapsing "moved too fast" and
 * "invalid email" into identical wording would make a genuine mistyped
 * address impossible to notice and retry correctly - the emitted string
 * from `resendConfirmationEmail`'s `friendlyAuthError` mapping is used
 * as-is (already vetted safe copy), not reinterpreted.
 */
function ResendConfirmationEmail({ emailRef }: { emailRef: React.RefObject<HTMLInputElement | null> }) {
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (pending) return; // prevents a duplicate submission while one is in flight
    const email = emailRef.current?.value.trim();
    if (!email) {
      setStatus("error");
      setErrorMessage("Enter your email address above first.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await resendConfirmationEmail(email);
        if (result.error) {
          setStatus("error");
          setErrorMessage(result.error);
        } else {
          setStatus("sent");
          setErrorMessage(null);
        }
      } catch {
        setStatus("error");
        setErrorMessage("Something went wrong. Please try again.");
      }
    });
  }

  if (status === "sent") {
    return (
      <p className="text-sm text-idw-forest/70 bg-idw-forest/5 rounded-lg px-3 py-2.5 mt-3" role="status">
        If that address needs confirming, we&apos;ve sent a new confirmation email.
      </p>
    );
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="text-sm text-idw-forest/70 underline disabled:opacity-50"
      >
        {pending ? "Sending…" : "Resend confirmation email"}
      </button>
      {status === "error" && errorMessage && (
        <p className="text-sm text-red-700 mt-1.5" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

function ConfirmErrorNotice() {
  const searchParams = useSearchParams();
  if (searchParams.get("confirmError") !== "1") return null;

  return (
    <p className="text-sm text-idw-forest/70 bg-idw-forest/5 rounded-lg px-3 py-2.5 mt-4">
      That confirmation link is invalid or has expired. If you&apos;ve already confirmed your
      email, just log in below — otherwise{" "}
      <Link href="/sign-up" className="underline">
        sign up again
      </Link>{" "}
      to get a new confirmation email.
    </p>
  );
}

export default function LogInPage() {
  const [state, formAction, pending] = useActionState(signIn, initialState);
  const emailRef = useRef<HTMLInputElement>(null);

  // Task 011 (item E): the instant the form submits, replace it with the
  // same premium loading language Space-opening uses (item D) rather than
  // leaving the form sitting there looking frozen with only a button-text
  // change. `pending` (React's own action-pending state) already prevents
  // a genuine duplicate submission even before this renders - this is the
  // visible confirmation of that, not the guard itself. No auth internals
  // are exposed here or anywhere below; errors still go through
  // friendlyAuthError() in the action itself, unchanged.
  if (pending) {
    return <LoadingTransition message="Signing you in…" />;
  }

  return (
    <main className="flex-1 flex items-center justify-center bg-idw-parchment px-6 py-16">
      <div className="w-full max-w-sm">
        <BackToHomeLink />
        <InnerDweSMark size={28} className="mb-6" />
        <h1 className="font-ui text-[28px] tracking-[-0.01em] text-idw-forest">Log in</h1>

        <Suspense fallback={null}>
          <ConfirmErrorNotice />
        </Suspense>

        <form action={formAction} className="mt-8 flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold tracking-wide uppercase text-idw-forest/70">
              Email
            </label>
            <input
              ref={emailRef}
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-idw-forest/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-idw-sage"
            />
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <label className="text-xs font-semibold tracking-wide uppercase text-idw-forest/70">
                Password
              </label>
              {/* Task 012 */}
              <Link href="/forgot-password" className="text-xs text-idw-forest/60 underline">
                Forgot password?
              </Link>
            </div>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-idw-forest/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-idw-sage"
            />
          </div>

          {state.error && (
            <p className="text-sm text-red-700" role="alert">
              {state.error}
            </p>
          )}
          {state.unconfirmedEmail && <ResendConfirmationEmail emailRef={emailRef} />}

          <button
            type="submit"
            className="mt-2 rounded-full bg-idw-forest text-idw-parchment text-sm font-semibold uppercase tracking-wide py-3 disabled:opacity-60"
          >
            Log in
          </button>

          {/* Task 011 (item 1): no "Keep me signed in" checkbox - Supabase's
              SSR cookie layer (see the investigation cited in
              TASK-011-FINAL-REPORT.md's UPDATE 4) hardcodes every session
              cookie's lifetime to 400 days on every write, with no supported
              way to make an "unchecked" state write a real, shorter,
              browser-session-only cookie - a checkbox that couldn't change
              this would be exactly the misleading control the task asked not
              to build. This line states the one real, current, always-true
              behavior instead. */}
          <p className="text-xs text-idw-forest/50 text-center -mt-1">
            You&apos;ll stay signed in on this device until you log out.
          </p>
        </form>

        <p className="text-sm text-idw-forest/60 mt-6">
          New here?{" "}
          <Link href="/sign-up" className="underline">
            Create your account
          </Link>
        </p>
      </div>
    </main>
  );
}
