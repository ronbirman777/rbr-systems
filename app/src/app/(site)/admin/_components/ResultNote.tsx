"use client";

import { usePathname } from "next/navigation";
import type { AdminActionResult } from "../billing/actions";
import { errorMessage } from "@/lib/billing/admin/ui/labels";
import { StepUp } from "./CodeForm";

/** Shows the outcome of a server action. A "step_up_required" result opens the inline re-verify box. */
export function ResultNote({ result, okMessage = "Done." }: { result: AdminActionResult | null; okMessage?: string }) {
  const pathname = usePathname();
  if (!result) return null;
  if (result.ok) return <p role="status" className="mt-2 text-sm font-medium text-emerald-800">{okMessage}</p>;
  return (
    <div className="mt-2">
      <p role="alert" className="text-sm font-medium text-idw-clay-text">{errorMessage(result.error)}</p>
      {result.error === "step_up_required" ? <StepUp next={pathname} /> : null}
      {result.error === "mfa_required" ? <a className="text-sm underline" href="/admin/mfa/verify">Open verification</a> : null}
    </div>
  );
}
