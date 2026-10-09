"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { completeMfaEnrollmentAction, startMfaEnrollmentAction, verifyMfaAction, type EnrollState, type VerifyState } from "../mfa/actions";
import { errorMessage, qrImageSrc } from "@/lib/billing/admin/ui/labels";
import { CodeFields } from "./CodeForm";
import { btnPrimary, btnSecondary, errCls } from "./styles";

function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className={btnSecondary}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setState("copied");
          } catch {
            setState("failed");
          }
        }}
      >
        Copy key
      </button>
      <span role="status" className="text-xs text-idw-forest/80">{state === "copied" ? "Copied" : state === "failed" ? "Copy failed - select the key and copy it manually" : ""}</span>
    </span>
  );
}

function EnrollCodeForm({ factorId }: { factorId: string }) {
  const bound = useMemo(() => completeMfaEnrollmentAction.bind(null, factorId), [factorId]);
  const [state, formAction, pending] = useActionState<VerifyState, FormData>(bound, null);
  return (
    <form action={formAction} className="mt-6">
      <h3 className="mb-2 font-ui text-base text-idw-forest">3. Enter the first code</h3>
      <CodeFields error={state && !state.ok ? state.error : null} pending={pending} submitLabel="Verify and finish" />
    </form>
  );
}

export function MfaEnroll() {
  const [enroll, setEnroll] = useState<EnrollState | null>(null);
  const [pending, startTransition] = useTransition();

  const src = enroll?.ok ? qrImageSrc(enroll.qrSvg) : null;
  return (
    <div>
      {!enroll?.ok ? (
        <>
          <button type="button" disabled={pending} className={btnPrimary} onClick={() => startTransition(async () => { setEnroll(await startMfaEnrollmentAction()); })}>
            {pending ? "Preparing..." : enroll ? "Try again" : "Set up authenticator"}
          </button>
          {enroll && !enroll.ok ? <p role="alert" className={`${errCls} mt-2 text-sm`}>{errorMessage(enroll.error)}</p> : null}
        </>
      ) : (
        <div>
          <h3 className="mb-2 font-ui text-base text-idw-forest">1. Add this account to your authenticator app</h3>
          <p className="mb-3 text-sm text-idw-forest/80">Use any standards-compliant authenticator app (time-based one-time passwords, 6 digits, 30 seconds). Scan the QR code, or enter the setup key by hand.</p>
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element -- a data: URL; next/image adds nothing here
            <img src={src} alt="QR code containing the authenticator setup key" width={192} height={192} className="mb-3 rounded-xl border border-idw-forest/15 bg-white p-2" />
          ) : (
            <p className="mb-3 text-sm text-idw-forest/80">The QR code could not be shown. Use the setup key below.</p>
          )}
          <h3 className="mb-1 mt-4 font-ui text-base text-idw-forest">2. Or enter the setup key manually</h3>
          <p className="mb-2 text-xs text-idw-forest/70">This key is shown once, only on this page. Treat it like a password and do not share it.</p>
          <code className="mb-2 block select-all break-all rounded-xl border border-idw-forest/15 bg-white px-3 py-3 font-mono text-sm tracking-wider" aria-label="Setup key">{enroll.secret}</code>
          <CopyButton text={enroll.secret} />
          <EnrollCodeForm factorId={enroll.factorId} />
        </div>
      )}
    </div>
  );
}

export function MfaVerify({ next }: { next: string }) {
  const bound = useMemo(() => verifyMfaAction.bind(null, next), [next]);
  const [state, formAction, pending] = useActionState<VerifyState, FormData>(bound, null);
  return (
    <form action={formAction}>
      <CodeFields error={state && !state.ok ? state.error : null} pending={pending} submitLabel="Verify" />
    </form>
  );
}
