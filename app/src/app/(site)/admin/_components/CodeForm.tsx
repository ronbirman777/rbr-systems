"use client";

import { useActionState, useId, useMemo } from "react";
import { verifyMfaAction, type VerifyState } from "../mfa/actions";
import { errorMessage } from "@/lib/billing/admin/ui/labels";
import { btnPrimary, errCls, hintCls, inputCls, labelCls } from "./styles";

/** The 6-digit authenticator code field + submit, shared by enrolment, sign-in verification and step-up. */
export function CodeFields({ error, pending, submitLabel }: { error: string | null; pending: boolean; submitLabel: string }) {
  const id = useId();
  const errId = `${id}-err`;
  const hintId = `${id}-hint`;
  return (
    <>
      <label htmlFor={id} className={labelCls}>6-digit code</label>
      <input
        id={id}
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        minLength={6}
        required
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${hintId} ${errId}` : hintId}
        className={`${inputCls} max-w-[12rem] text-center font-mono text-lg tracking-[0.4em]`}
      />
      <p id={hintId} className={hintCls}>Enter the code currently shown in your authenticator app. Codes change every 30 seconds.</p>
      {error ? <p id={errId} role="alert" className={errCls}>{errorMessage(error)}</p> : null}
      <button type="submit" disabled={pending} className={`${btnPrimary} mt-4`}>{pending ? "Checking..." : submitLabel}</button>
    </>
  );
}

/** Inline re-verify box shown when an action answers "step_up_required". On success the browser is sent back to `next` (a full reload), then the user retries. */
export function StepUp({ next }: { next: string }) {
  const bound = useMemo(() => verifyMfaAction.bind(null, next), [next]);
  const [state, formAction, pending] = useActionState<VerifyState, FormData>(bound, null);
  return (
    <form action={formAction} className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-4" aria-label="Re-verify with your authenticator">
      <h3 className="font-ui text-base text-idw-forest">Confirm it&apos;s you</h3>
      <p className="mb-3 mt-1 text-sm text-idw-forest/80">This change needs a fresh authenticator code. After you confirm, this page reloads and you can retry the change.</p>
      <CodeFields error={state && !state.ok ? state.error : null} pending={pending} submitLabel="Confirm" />
    </form>
  );
}
