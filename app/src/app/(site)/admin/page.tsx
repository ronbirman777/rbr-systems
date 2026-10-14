import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/billing/admin/auth";
import { landingPathFor } from "@/lib/admin/sections";

export const dynamic = "force-dynamic";

/** /admin: gated like every other Admin page, then sent to the first section this role may see (owner: Overview; billing_admin: Billing). */
export default async function AdminIndex() {
  const admin = await requireAdminPage();
  redirect(landingPathFor(admin.role));
}
