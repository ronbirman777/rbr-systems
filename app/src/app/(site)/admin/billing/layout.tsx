import type { ReactNode } from "react";
import { requireAdminPage } from "@/lib/billing/admin/auth";
import { AdminNav } from "../_components/AdminNav";
import { AdminShell } from "../_components/AdminShell";

export const dynamic = "force-dynamic";

/** Revenue & Billing: owner and billing_admin (no `roles` restriction - today's behaviour). Every page also gates itself. */
export default async function BillingAdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdminPage();
  return <AdminShell admin={admin} subnav={<AdminNav ownerItems={admin.role === "owner"} />}>{children}</AdminShell>;
}
