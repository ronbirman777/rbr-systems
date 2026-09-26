"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { LoadingTransition } from "@/components/loading-transition";
import { requestPasswordReset, updatePassword, finalizeRecoverySession } from "./recoveryActions";
import { REQUEST_RESET_INITIAL_STATE, UPDATE_PASSWORD_INITIAL_STATE } from "./recoveryActionsState";

/**
 * Task 012 - /forgot-password's request form. The neutral "sent" notice
 * is shown ABOVE the form rather than replacing it (same pattern as
 * log-in's ConfirmErrorNotice) so a deliberate retry - e.g. the visitor
 * realizes they mistyped the address - is just "submit again," never an
 * automatic resend/poll this component invents on its own.
 */
export function RequestResetForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, REQUEST_RESET_INITIAL_STATE);
  const statusRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state.status !== "idle") statusRef.current?.focus();
  }, [state.status]);

  if (pending) {
    return <LoadingTransition message="Sending reset link…" />;
  }

  return (
    <>
      {state.status === "sent" && (
        <p
          ref={statusRef}
          tabIndex={-1}
          role="status"
          aria-live="polite"
          className="text-sm text-idw-forest/70 bg-idw-forest/5 rounded-lg px-3 py-2.5 mt-6 leading-relaxed outline-none"
        >
          If an account exists for that email, you&apos;ll receive a password reset link.
        </p>
      )}

      <form action={formAction} className="mt-8 flex flex-col gap-4">
        <div>
          <label
            htmlFor="forgot-password-email"
            className="text-xs font-semibold tracking-wide uppercase text-idw-forest/70"
          >
            Email
          </label>
          <input
            id="forgot-password-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-lg border border-idw-forest/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-idw-sage"
          />
        </div>

        {state.status === "error" && (
          <p ref={statusRef} tabIndex={-1} className="text-sm text-red-700 outline-none" role="alert">
            {state.message}
          </p>
        )}

        <button
          type="submit"
          className="mt-2 rounded-full bg-idw-forest text-idw-parchment text-sm font-semibold uppercase tracking-wide py-3 disabled:opacity-60"
        >
          Send reset link
        </button>
      </form>

      <p className="text-sm text-idw-forest/60 mt-6">
        <Link href="/log-in" className="underline">
          Back to log in
        </Link>
      </p>
    </>
  );
}

/**
 * /reset-password's new-password form. `hadInitialRecoveryContext` is the
 * server's own `getUser()` + recovery-flow-context verification (see
 * reset-password/page.tsx) - this component itself never re-derives or
 * trusts anything about *whose* account it's acting on; `updatePassword`
 * always acts on whatever the caller's own current Supabase session is.
 *
 * Captured via `useState`'s lazy initializer - read exactly once, on
 * mount - deliberately NOT re-read from the live prop on every render.
 * Found only by running the real flow in a browser: any Server Action
 * that sets/deletes a cookie makes Next.js re-render the *invoking page's
 * own Server Component tree* (this is documented Next.js behavior, not a
 * framework bug - see mutating-data.md's "Cookies" section: "When you set
 * or delete a cookie in a Server Action, Next.js re-renders the current
 * page... mounting or unmounting components as needed"). That applies to
 * every cookie-touching Server Action here, not only ones bound to a
 * `<form>` - including `finalizeRecoverySession`, called imperatively
 * once the update genuinely succeeds. If the PAGE's own render still
 * gated on live cookie state, that later, fully-successful cleanup would
 * flip the page's decision back to "no context," unmounting this very
 * component (and the "your password was updated" message it had just
 * shown) moments after a real success - reproduced directly before this
 * existed: the success text appeared, then was immediately replaced by
 * "request a new link." Capturing the server's verdict once, at mount,
 * means later cookie mutations this component *itself* deliberately
 * makes can never retroactively erase what it has already decided to
 * show.
 *
 * Does not rely on a browser `PASSWORD_RECOVERY` auth event (server-side
 * verifyOtp in the confirm route does not necessarily emit one) - all
 * state here comes from this component's own Server Action calls, not
 * from listening for a client-side Supabase event.
 */
export function UpdatePasswordForm({ hadInitialRecoveryContext }: { hadInitialRecoveryContext: boolean }) {
  const [hasContext] = useState(() => hadInitialRecoveryContext);
  const [state, formAction, pending] = useActionState(updatePassword, UPDATE_PASSWORD_INITIAL_STATE);
  const [cleanupState, setCleanupState] = useState<"pending" | "done" | "failed">("pending");
  const [cleanupRetrying, startCleanupRetry] = useTransition();
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status !== "idle") statusRef.current?.focus();
  }, [state.status]);

  // Runs once, imperatively, the first time this component sees a
  // successful update - deliberately NOT another `<form action>`/
  // `useActionState` binding. See the long comment on
  // `finalizeRecoverySession` in recoveryActions.ts for exactly why: a
  // form-bound action here would re-trigger the enclosing page's own
  // server-side recovery-context gate on this same round trip and
  // silently replace this already-rendered success message with the
  // page's "link isn't active" state - reproduced directly before this
  // fix existed.
  useEffect(() => {
    if (state.status !== "success") return;
    let cancelled = false;
    finalizeRecoverySession().then((result) => {
      if (!cancelled) setCleanupState(result.status === "success" ? "done" : "failed");
    });
    return () => {
      cancelled = true;
    };
  }, [state.status]);

  function retryCleanup() {
    startCleanupRetry(async () => {
      const result = await finalizeRecoverySession();
      setCleanupState(result.status === "success" ? "done" : "failed");
    });
  }

  if (pending) {
    return <LoadingTransition message="Updating password…" />;
  }

  if (!hasContext) {
    return (
      <div role="status" aria-live="polite" className="mt-8 text-center">
        <h1 className="font-ui text-[26px] tracking-[-0.01em] text-idw-forest">This link isn&apos;t active</h1>
        <p className="text-sm text-idw-forest/60 mt-3 leading-relaxed">
          Please request a new password reset link to continue.
        </p>
        <Link
          href="/forgot-password"
          className="inline-block mt-8 rounded-full bg-idw-forest text-idw-parchment text-xs font-semibold uppercase tracking-wide px-5 py-2.5"
        >
          Request a new link
        </Link>
        <p className="text-sm text-idw-forest/60 mt-6">
          <Link href="/log-in" className="underline">
            Back to log in
          </Link>
        </p>
      </div>
    );
  }

  if (state.status === "success") {
    return (
      <div ref={statusRef} tabIndex={-1} role="status" aria-live="polite" className="mt-8 outline-none">
        <p className="text-sm text-idw-forest/70 leading-relaxed">Your password has been updated.</p>

        {cleanupState === "failed" && (
          <>
            <p className="text-sm text-idw-forest/70 leading-relaxed mt-4">
              We weren&apos;t able to finish signing this device out.
            </p>
            <button
              type="button"
              onClick={retryCleanup}
              disabled={cleanupRetrying}
              className="mt-4 rounded-full bg-idw-forest text-idw-parchment text-xs font-semibold uppercase tracking-wide px-5 py-2.5 disabled:opacity-60"
            >
              {cleanupRetrying ? "Signing out…" : "Try signing out again"}
            </button>
          </>
        )}

        <Link
          href="/log-in"
          className="inline-block mt-6 rounded-full bg-idw-forest text-idw-parchment text-xs font-semibold uppercase tracking-wide px-5 py-2.5"
        >
          Back to log in
        </Link>
      </div>
    );
  }

  if (state.status === "no_session") {
    return (
      <div ref={statusRef} tabIndex={-1} role="status" aria-live="polite" className="mt-8 outline-none">
        <p className="text-sm text-idw-forest/70 leading-relaxed">
          This reset session is no longer active. Please request a new link.
        </p>
        <Link
          href="/forgot-password"
          className="inline-block mt-6 rounded-full bg-idw-forest text-idw-parchment text-xs font-semibold uppercase tracking-wide px-5 py-2.5"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="font-ui text-[28px] tracking-[-0.01em] text-idw-forest">Choose a new password</h1>
      <form action={formAction} className="mt-8 flex flex-col gap-4">
      <div>
        <label htmlFor="reset-password-password" className="text-xs font-semibold tracking-wide uppercase text-idw-forest/70">
          New password
        </label>
        <input
          id="reset-password-password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="mt-1 w-full rounded-lg border border-idw-forest/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-idw-sage"
        />
      </div>
      <div>
        <label
          htmlFor="reset-password-confirm-password"
          className="text-xs font-semibold tracking-wide uppercase text-idw-forest/70"
        >
          Confirm password
        </label>
        <input
          id="reset-password-confirm-password"
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="mt-1 w-full rounded-lg border border-idw-forest/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-idw-sage"
        />
      </div>

      {state.status === "error" && (
        <div ref={statusRef} tabIndex={-1} className="text-sm text-red-700 outline-none" role="alert">
          {state.message}
        </div>
      )}

      <button
        type="submit"
        className="mt-2 rounded-full bg-idw-forest text-idw-parchment text-sm font-semibold uppercase tracking-wide py-3 disabled:opacity-60"
      >
        Update password
      </button>
      </form>
    </>
  );
}
