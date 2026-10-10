"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { stepUpVerifyAction, type StepUpState } from "../mfa/actions";
import { errorMessage } from "@/lib/billing/admin/ui/labels";
import { useAdminI18n } from "./AdminI18n";
import { btnPrimary, errCls, hintCls, inputCls, labelCls } from "./styles";

/** The 6-digit authenticator code field + submit, shared by enrolment, sign-in verification and step-up. */
export function CodeFields({ error, pending, submitLabel }: { error: string | null; pending: boolean; submitLabel: string }) {
  const c = useAdminI18n();
  const id = useId();
  const errId = `${id}-err`;
  const hintId = `${id}-hint`;
  return (
    <>
      <label htmlFor={id} className={labelCls}>{c.t("codeLabel")}</label>
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
      <p id={hintId} className={hintCls}>{c.t("codeHint")}</p>
      {error ? <p id={errId} role="alert" className={errCls}>{errorMessage(error, c)}</p> : null}
      <button type="submit" disabled={pending} className={`${btnPrimary} mt-4`}>{pending ? c.t("codeChecking") : submitLabel}</button>
    </>
  );
}

/**
 * Inline re-verify box shown when an action answers "step_up_required". It verifies the fresh code in place (no
 * navigation, so the surrounding form keeps what the admin typed) and then calls `onVerified`, which re-submits the
 * pending action. The server action still re-checks the recent-MFA timestamp itself.
 */
export function StepUp({ onVerified }: { onVerified: () => void }) {
  const { t } = useAdminI18n();
  const [state, formAction, pending] = useActionState<StepUpState, FormData>(stepUpVerifyAction, null);
  const done = useRef<number | null>(null);
  useEffect(() => {
    if (state?.ok && done.current !== state.at) {
      done.current = state.at;
      onVerified();
    }
  }, [state, onVerified]);
  return (
    <form action={formAction} className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-4" aria-label={t("stepUpAria")}>
      <h3 className="font-ui text-base text-idw-forest">{t("stepUpTitle")}</h3>
      <p className="mb-3 mt-1 text-sm text-idw-forest/80">{t("stepUpBody")}</p>
      <CodeFields error={state && !state.ok ? state.error : null} pending={pending} submitLabel={t("stepUpConfirm")} />
    </form>
  );
}
