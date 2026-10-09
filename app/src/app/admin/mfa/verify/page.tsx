import { redirect } from "next/navigation";
import { requireAdminForMfaPages } from "@/lib/billing/admin/auth";
import { safeInternalRedirectPath } from "@/lib/safe-redirect";
import { MfaVerify } from "../../_components/MfaForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verify - InnerDweS Admin", robots: { index: false, follow: false } };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ next?: string; stepup?: string }> }) {
  const sp = await searchParams;
  const who = await requireAdminForMfaPages();
  const stepUp = sp.stepup === "1";
  if (who.aal2 && !stepUp) redirect("/admin/billing");
  const next = safeInternalRedirectPath(typeof sp.next === "string" ? sp.next : null, "/admin/billing");
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-10 sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-wide text-idw-forest/70">InnerDweS Admin</p>
      <h1 className="mt-1 font-ui text-2xl text-idw-forest sm:text-3xl">{stepUp ? "Confirm it’s you to continue" : "Verify your identity"}</h1>
      <p className="mb-6 mt-2 text-sm text-idw-forest/80">
        {stepUp
          ? "This area handles sensitive billing changes, so we ask for a fresh code from your authenticator app."
          : "Enter the 6-digit code from your authenticator app to open the Admin console."}
      </p>
      <div className="rounded-2xl border border-idw-forest/10 bg-white/70 p-5">
        <MfaVerify next={next} />
      </div>
      <p className="mt-6 text-xs text-idw-forest/70">Lost your authenticator? Ask another Owner/Admin to reset your factor, or follow docs/billing/ADMIN-RECOVERY.md. There is no bypass.</p>
    </main>
  );
}
