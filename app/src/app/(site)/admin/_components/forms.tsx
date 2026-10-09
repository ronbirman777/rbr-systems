"use client";

import { useActionState, useId, useMemo, type ReactNode } from "react";
import { clearExemptAction, grantAdminAction, setExemptAction, type AdminActionResult } from "../billing/actions";
import { fieldErrors } from "@/lib/billing/admin/ui/labels";
import { useAdminI18n } from "./AdminI18n";
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
  const c = useAdminI18n();
  const { t } = c;
  const [state, formAction, pending] = useAct(action);
  const f = fieldErrors(state, c);
  return (
    <form action={formAction} noValidate={false}>
      <Field name="tenantId" label={t("fmTenantId")} hint={t("fmTenantIdHint")} error={state && !state.ok && state.error === "invalid" ? f.tenantId ?? t("fmEnterUuid") : undefined}>
        {(p) => <input id={p.id} name="tenantId" required pattern="[0-9a-fA-F\-]{36}" autoComplete="off" spellCheck={false} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className={`${inputCls} font-mono`} />}
      </Field>
      <Field name="reason" label={t("fmReason")} error={f.reason}>
        {(p) => <input id={p.id} name="reason" required minLength={5} maxLength={500} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className={inputCls} />}
      </Field>
      <Field name="expiresAt" label={t("fmExpires")} hint={t("fmExpiresHint")} error={f.expiresAt}>
        {(p) => <input id={p.id} name="expiresAt" type="datetime-local" aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className={`${inputCls} max-w-xs`} />}
      </Field>
      <button type="submit" disabled={pending} className={btnPrimary}>{pending ? t("fmSaving") : t("fmMarkExempt")}</button>
      <ResultNote result={state} okMessage={t("fmExemptOk")} />
    </form>
  );
}

export function ClearExemptForm({ tenantId }: { tenantId: string }) {
  const action = useMemo<Act>(() => clearExemptAction.bind(null, tenantId), [tenantId]);
  const c = useAdminI18n();
  const { t } = c;
  const [state, formAction, pending] = useAct(action);
  const f = fieldErrors(state, c);
  return (
    <form action={formAction}>
      <Field name="reason" label={t("fmClearReason")} hint={t("fmClearHint")} error={f.reason}>
        {(p) => <input id={p.id} name="reason" required minLength={5} maxLength={500} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className={inputCls} />}
      </Field>
      <button type="submit" disabled={pending} className={btnPrimary}>{pending ? t("fmSaving") : t("fmRemoveExemption")}</button>
      <ResultNote result={state} okMessage={t("fmClearOk")} />
    </form>
  );
}

export function GrantAdminForm() {
  const c = useAdminI18n();
  const { t } = c;
  const [state, formAction, pending] = useAct(grantAdminAction);
  const f = fieldErrors(state, c);
  return (
    <form action={formAction}>
      <Field name="email" label={t("fmEmail")} hint={t("fmEmailHint")} error={f.email}>
        {(p) => <input id={p.id} name="email" type="email" required autoComplete="off" aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className={inputCls} />}
      </Field>
      <Field name="role" label={t("fmRole")}>
        {(p) => (
          <select id={p.id} name="role" defaultValue="billing_admin" className={`${inputCls} max-w-xs`}>
            <option value="billing_admin">{t("roleBillingAdmin")}</option>
            <option value="owner">{t("fmRoleOwner")}</option>
          </select>
        )}
      </Field>
      <button type="submit" disabled={pending} className={btnPrimary}>{pending ? t("fmSaving") : t("fmGrantButton")}</button>
      <ResultNote result={state} okMessage={t("fmGrantOk")} />
    </form>
  );
}
