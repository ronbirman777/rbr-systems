"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { completeMfaEnrollmentAction, startMfaEnrollmentAction, verifyMfaAction, type EnrollState, type VerifyState } from "../mfa/actions";
import { errorMessage, qrImageSrc } from "@/lib/billing/admin/ui/labels";
import { useAdminI18n } from "./AdminI18n";
import { CodeFields } from "./CodeForm";
import { btnPrimary, btnSecondary, errCls } from "./styles";

function CopyButton({ text }: { text: string }) {
  const { t } = useAdminI18n();
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
        {t("mfaCopyKey")}
      </button>
      <span role="status" className="text-xs text-idw-forest/80">{state === "copied" ? t("mfaCopied") : state === "failed" ? t("mfaCopyFailed") : ""}</span>
    </span>
  );
}

function EnrollCodeForm({ factorId }: { factorId: string }) {
  const { t } = useAdminI18n();
  const bound = useMemo(() => completeMfaEnrollmentAction.bind(null, factorId), [factorId]);
  const [state, formAction, pending] = useActionState<VerifyState, FormData>(bound, null);
  return (
    <form action={formAction} className="mt-6">
      <h3 className="mb-2 font-ui text-base text-idw-forest">{t("mfaStep3")}</h3>
      <CodeFields error={state && !state.ok ? state.error : null} pending={pending} submitLabel={t("mfaVerifyFinish")} />
    </form>
  );
}

export function MfaEnroll() {
  const c = useAdminI18n();
  const { t } = c;
  const [enroll, setEnroll] = useState<EnrollState | null>(null);
  const [pending, startTransition] = useTransition();

  const src = enroll?.ok ? qrImageSrc(enroll.qrSvg) : null;
  return (
    <div>
      {!enroll?.ok ? (
        <>
          <button type="button" disabled={pending} className={btnPrimary} onClick={() => startTransition(async () => { setEnroll(await startMfaEnrollmentAction()); })}>
            {pending ? t("mfaPreparing") : enroll ? t("mfaTryAgain") : t("mfaSetUp")}
          </button>
          {enroll && !enroll.ok ? <p role="alert" className={`${errCls} mt-2 text-sm`}>{errorMessage(enroll.error, c)}</p> : null}
        </>
      ) : (
        <div>
          <h3 className="mb-2 font-ui text-base text-idw-forest">{t("mfaStep1")}</h3>
          <p className="mb-3 text-sm text-idw-forest/80">{t("mfaStep1Body")}</p>
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element -- a data: URL; next/image adds nothing here
            <img src={src} alt={t("mfaQrAlt")} width={192} height={192} className="mb-3 rounded-xl border border-idw-forest/15 bg-white p-2" />
          ) : (
            <p className="mb-3 text-sm text-idw-forest/80">{t("mfaQrFail")}</p>
          )}
          <h3 className="mb-1 mt-4 font-ui text-base text-idw-forest">{t("mfaStep2")}</h3>
          <p className="mb-2 text-xs text-idw-forest/70">{t("mfaKeyNote")}</p>
          <code className="mb-2 block select-all break-all rounded-xl border border-idw-forest/15 bg-white px-3 py-3 font-mono text-sm tracking-wider" aria-label={t("mfaSetupKeyAria")}>{enroll.secret}</code>
          <CopyButton text={enroll.secret} />
          <EnrollCodeForm factorId={enroll.factorId} />
        </div>
      )}
    </div>
  );
}

export function MfaVerify({ next }: { next: string }) {
  const { t } = useAdminI18n();
  const bound = useMemo(() => verifyMfaAction.bind(null, next), [next]);
  const [state, formAction, pending] = useActionState<VerifyState, FormData>(bound, null);
  return (
    <form action={formAction}>
      <CodeFields error={state && !state.ok ? state.error : null} pending={pending} submitLabel={t("mfaVerify")} />
    </form>
  );
}
