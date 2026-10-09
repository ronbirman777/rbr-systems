"use client";

import { useActionState, useId, useMemo, type ReactNode } from "react";
import { clearExemptAction, grantAdminAction, setExemptAction, type AdminActionResult } from "../billing/actions";
import { fieldErrors } from "@/lib/billing/admin/ui/labels";
import { ResultNote } from "./ResultNote";
import { btnPrimary, errCls, hintCls, inputCls, labelCls } from "./styles";

type Act = (prev: AdminActionResult | null, fd: FormData) => Promise<AdminActionResult>;

function Field({ name, label, hint, error, children }: { name: string; label: string; hint?: string; error?: string; children: (p: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="mb-3" data-field={name}>
      <label htmlFor={id} className={labelCls}>{label}</label>
      {children({ id, describedBy, invalid: !!error })}
      {hint ? <p id={hintId} className={hintCls}>{hint}</p> : null}
      {error ? <p id={errId} role="alert" className={errCls}>{error}</p> : null}
    </div>
  );
}

function useAct(action: Act) {
  return useActionState<AdminActionResult | null, FormData>(action, null);
}

export function SetExemptForm() {
  const action = useMemo<Act>(() => (prev, fd) => setExemptAction(String(fd.get("tenantId") ?? "").trim(), prev, fd), []);
  const [state, formAction, pending] = useAct(action);
  const f = fieldErrors(state);
  return (
    <form action={formAction} noValidate={false}>
      <Field name="tenantId" label="Space (tenant) ID" hint="The Space's UUID, e.g. from the Space page address." error={state && !state.ok && state.error === "invalid" ? f.tenantId ?? "Enter a valid UUID" : undefined}>
        {(p) => <input id={p.id} name="tenantId" required pattern="[0-9a-fA-F\-]{36}" autoComplete="off" spellCheck={false} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className={`${inputCls} font-mono`} />}
      </Field>
      <Field name="reason" label="Reason (required, audited)" error={f.reason}>
        {(p) => <input id={p.id} name="reason" required minLength={5} maxLength={500} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className={inputCls} />}
      </Field>
      <Field name="expiresAt" label="Expires (optional, UTC)" hint="Leave empty for no expiry. Date and time are UTC." error={f.expiresAt}>
        {(p) => <input id={p.id} name="expiresAt" type="datetime-local" aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className={`${inputCls} max-w-xs`} />}
      </Field>
      <button type="submit" disabled={pending} className={btnPrimary}>{pending ? "Saving..." : "Mark Space exempt"}</button>
      <ResultNote result={state} okMessage="Space marked exempt." />
    </form>
  );
}

export function ClearExemptForm({ tenantId }: { tenantId: string }) {
  const action = useMemo<Act>(() => clearExemptAction.bind(null, tenantId), [tenantId]);
  const [state, formAction, pending] = useAct(action);
  const f = fieldErrors(state);
  return (
    <form action={formAction}>
      <Field name="reason" label="Reason for removing the exemption (required, audited)" hint="After removal the Space needs a subscription to stay operational." error={f.reason}>
        {(p) => <input id={p.id} name="reason" required minLength={5} maxLength={500} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className={inputCls} />}
      </Field>
      <button type="submit" disabled={pending} className={btnPrimary}>{pending ? "Saving..." : "Remove exemption"}</button>
      <ResultNote result={state} okMessage="Exemption removed." />
    </form>
  );
}

export function GrantAdminForm() {
  const [state, formAction, pending] = useAct(grantAdminAction);
  const f = fieldErrors(state);
  return (
    <form action={formAction}>
      <Field name="email" label="Account email" hint="The person must already have an InnerDweS account. They will need to set up an authenticator on first visit." error={f.email}>
        {(p) => <input id={p.id} name="email" type="email" required autoComplete="off" aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className={inputCls} />}
      </Field>
      <Field name="role" label="Role">
        {(p) => (
          <select id={p.id} name="role" defaultValue="billing_admin" className={`${inputCls} max-w-xs`}>
            <option value="billing_admin">Billing admin</option>
            <option value="owner">Owner (can manage Admins and the launch switch)</option>
          </select>
        )}
      </Field>
      <button type="submit" disabled={pending} className={btnPrimary}>{pending ? "Saving..." : "Grant Admin access"}</button>
      <ResultNote result={state} okMessage="Admin access granted." />
    </form>
  );
}
