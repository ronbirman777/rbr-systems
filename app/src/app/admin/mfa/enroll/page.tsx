import { redirect } from "next/navigation";
import { requireAdminForMfaPages } from "@/lib/billing/admin/auth";
import { MfaEnroll } from "../../_components/MfaForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up authenticator - InnerDweS Admin", robots: { index: false, follow: false } };

export default async function EnrollPage() {
  const who = await requireAdminForMfaPages();
  if (who.aal2) redirect("/admin/billing");
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-10 sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-wide text-idw-forest/70">InnerDweS Admin</p>
      <h1 className="mt-1 font-ui text-2xl text-idw-forest sm:text-3xl">Set up two-step verification</h1>
      <p className="mb-6 mt-2 text-sm text-idw-forest/80">Admin access requires an authenticator app in addition to your password. Set it up once; you will enter a fresh code when you sign in and before sensitive changes.</p>
      <div className="rounded-2xl border border-idw-forest/10 bg-white/70 p-5">
        <MfaEnroll />
      </div>
      <p className="mt-6 text-xs text-idw-forest/70">Lost your authenticator? Ask another Owner/Admin to reset your factor, or follow docs/billing/ADMIN-RECOVERY.md. There is no bypass.</p>
    </main>
  );
}
