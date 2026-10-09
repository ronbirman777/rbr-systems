import Link from "next/link";
import type { ReactNode } from "react";
import { requireAdminPage } from "@/lib/billing/admin/auth";
import { AdminNav } from "../_components/AdminNav";

export const dynamic = "force-dynamic";

export default async function BillingAdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdminPage();
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6">
      <header className="mb-6 border-b border-idw-forest/10 pb-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="font-ui text-lg text-idw-forest">InnerDweS Admin</p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-idw-forest/75">
            <span>{admin.email ?? "Admin"} ({admin.role === "owner" ? "Owner" : "Billing admin"})</span>
            <Link href="/space" className="inline-flex min-h-11 items-center font-medium underline underline-offset-2">Back to My Spaces</Link>
          </div>
        </div>
        <AdminNav />
      </header>
      <main id="admin-main">{children}</main>
    </div>
  );
}
