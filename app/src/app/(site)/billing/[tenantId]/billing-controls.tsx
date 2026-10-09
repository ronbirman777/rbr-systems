"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { cancelSubscriptionAction, openBillingPortalAction, resumeSubscriptionAction, type BillingActionResult } from "./actions";

export type BillingControlsLabels = {
  cancelSection: string; cancelBody: string; cancelButton: string; confirmTitle: string; confirmBody: string; confirmYes: string; confirmNo: string;
  resume: string; resumed: string; updatePayment: string; error: string; cancelScheduled: string | null;
};

const outline = "inline-flex items-center justify-center min-h-11 px-5 rounded-full border border-idw-forest/20 text-sm font-semibold text-idw-forest hover:border-idw-forest/50 active:bg-idw-forest/10 disabled:opacity-50";

/** Owner actions. The server actions re-check ownership; nothing here decides authority. No window.confirm - a real <dialog>. */
export function BillingControls({
  tenantId, canCancel, canResume, canUpdatePayment, labels,
}: {
  tenantId: string; canCancel: boolean; canResume: boolean; canUpdatePayment: boolean; labels: BillingControlsLabels;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  function run(action: (id: string) => Promise<BillingActionResult>, okText: string | null) {
    setMessage(null);
    start(async () => {
      const r = await action(tenantId);
      if (r && !r.ok) setMessage({ kind: "error", text: labels.error });
      else {
        if (okText) setMessage({ kind: "ok", text: okText });
        router.refresh();
      }
    });
  }

  function closeDialog() {
    dialogRef.current?.close();
    openerRef.current?.focus();
  }

  if (!canCancel && !canResume && !canUpdatePayment) return null;

  return (
    <section className="rounded-2xl border border-idw-forest/10 bg-white p-5 sm:p-6 space-y-4">
      {labels.cancelScheduled ? <p className="text-sm text-idw-forest/80">{labels.cancelScheduled}</p> : null}
      <div className="flex flex-wrap gap-2.5">
        {canUpdatePayment ? (
          <button type="button" disabled={pending} className={outline} onClick={() => run(openBillingPortalAction, null)}>{labels.updatePayment}</button>
        ) : null}
        {canResume ? (
          <button type="button" disabled={pending} className={outline} onClick={() => run(resumeSubscriptionAction, labels.resumed)}>{labels.resume}</button>
        ) : null}
      </div>
      {canCancel ? (
        <div className="border-t border-idw-forest/10 pt-4">
          <h2 className="text-sm font-semibold text-idw-forest">{labels.cancelSection}</h2>
          <p className="mt-1 text-sm leading-relaxed text-idw-forest/70">{labels.cancelBody}</p>
          <button ref={openerRef} type="button" disabled={pending} className={`${outline} mt-3`} onClick={() => dialogRef.current?.showModal()}>
            {labels.cancelButton}
          </button>
        </div>
      ) : null}

      <p aria-live="polite" className={message ? `text-sm ${message.kind === "error" ? "text-idw-clay-text" : "text-idw-forest/80"}` : "sr-only"} role={message?.kind === "error" ? "alert" : undefined}>
        {message?.text ?? ""}
      </p>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onCancel={() => openerRef.current?.focus()}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-idw-forest/10 bg-white p-6 text-idw-forest backdrop:bg-idw-forest/40"
      >
        <h2 id={titleId} className="font-ui text-lg" dir="auto">{labels.confirmTitle}</h2>
        <p id={bodyId} className="mt-2 text-sm leading-relaxed text-idw-forest/70">{labels.confirmBody}</p>
        <div className="mt-6 flex flex-wrap gap-2.5">
          <button type="button" autoFocus className="inline-flex items-center justify-center min-h-11 px-5 rounded-full bg-idw-forest text-sm font-semibold text-idw-parchment" onClick={closeDialog}>
            {labels.confirmNo}
          </button>
          <button
            type="button"
            disabled={pending}
            className={outline}
            onClick={() => {
              closeDialog();
              run(cancelSubscriptionAction, null);
            }}
          >
            {labels.confirmYes}
          </button>
        </div>
      </dialog>
    </section>
  );
}
