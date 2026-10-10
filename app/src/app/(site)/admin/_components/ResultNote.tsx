"use client";

import { useRouter } from "next/navigation";
import type { AdminActionResult } from "../billing/actions";
import { errorMessage } from "@/lib/billing/admin/ui/labels";
import { useAdminI18n } from "./AdminI18n";
import { StepUp } from "./CodeForm";

/**
 * Shows the outcome of a server action. A "step_up_required" result opens the inline re-verify box; once it has
 * verified, `onRetry` re-submits the same pending action (the form keeps its values). Without `onRetry` the page
 * data is refreshed in place and the admin retries by hand.
 */
export function ResultNote({ result, okMessage, onRetry }: { result: AdminActionResult | null; okMessage?: string; onRetry?: () => void }) {
  const router = useRouter();
  const c = useAdminI18n();
  if (!result) return null;
  if (result.ok) return <p role="status" className="mt-2 text-sm font-medium text-emerald-800">{okMessage ?? c.t("rnDone")}</p>;
  return (
    <div className="mt-2">
      <p role="alert" className="text-sm font-medium text-idw-clay-text">{errorMessage(result.error, c)}</p>
      {result.error === "step_up_required" ? <StepUp onVerified={onRetry ?? (() => router.refresh())} /> : null}
      {result.error === "mfa_required" ? <a className="text-sm underline" href="/admin/mfa/verify">{c.t("rnOpenVerification")}</a> : null}
    </div>
  );
}
