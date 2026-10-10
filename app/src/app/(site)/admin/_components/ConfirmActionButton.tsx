"use client";

import { useId, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { AdminActionResult } from "../billing/actions";
import { useAdminI18n } from "./AdminI18n";
import { ResultNote } from "./ResultNote";
import { btnDanger, btnPrimary, btnSecondary } from "./styles";

/**
 * Button + native <dialog> confirmation (never window.confirm). The server action
 * re-authorises everything; this component only asks and reports. Focus returns
 * to the trigger when the dialog closes.
 */
export function ConfirmActionButton({
  label, title, message, confirmLabel, action, variant = "secondary", okMessage, disabled,
}: {
  label: string; title: string; message: ReactNode; confirmLabel: string;
  action: () => Promise<AdminActionResult>;
  variant?: "primary" | "secondary" | "danger"; okMessage?: string; disabled?: boolean;
}) {
  const { t } = useAdminI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [result, setResult] = useState<AdminActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const id = useId();
  const triggerCls = variant === "danger" ? btnDanger : variant === "primary" ? btnPrimary : btnSecondary;

  // Runs the action. Also the step-up retry: after an inline re-verify the same action is re-sent (the server
  // re-checks the recent-MFA timestamp); the confirmation dialog is not shown a second time.
  function run() {
    startTransition(async () => {
      let r: AdminActionResult;
      try {
        r = await action();
      } catch {
        r = { ok: false, error: "save_failed" };
      }
      setResult(r);
      dialogRef.current?.close();
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="inline-block max-w-full align-top">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled || pending}
        className={triggerCls}
        onClick={() => { setResult(null); dialogRef.current?.showModal(); }}
      >
        {pending ? t("working") : label}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={`${id}-t`}
        aria-describedby={`${id}-d`}
        onClose={() => triggerRef.current?.focus()}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-idw-parchment p-6 text-idw-forest shadow-xl backdrop:bg-black/50"
      >
        <h2 id={`${id}-t`} className="font-ui text-lg">{title}</h2>
        <div id={`${id}-d`} className="mt-2 text-sm text-idw-forest/85">{message}</div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" autoFocus className={btnSecondary} onClick={() => dialogRef.current?.close()}>{t("cancelButton")}</button>
          <button type="button" disabled={pending} className={variant === "danger" ? btnDanger : btnPrimary} onClick={run}>{pending ? t("working") : confirmLabel}</button>
        </div>
      </dialog>
      <ResultNote result={result} okMessage={okMessage} onRetry={run} />
    </div>
  );
}
