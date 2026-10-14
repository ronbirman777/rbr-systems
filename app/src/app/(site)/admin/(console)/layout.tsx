import type { ReactNode } from "react";
import { OWNER_ONLY, requireAdminPage } from "@/lib/billing/admin/auth";
import { AdminShell } from "../_components/AdminShell";

export const dynamic = "force-dynamic";

/**
 * Owner-only console sections (/admin/overview, /admin/spaces, ... ; spec §2 "●"). A billing_admin gets the same 404
 * as a stranger. Layouts do not re-run on client navigation, so every page below ALSO calls requireAdminPage itself
 * with its section's roles (lib/admin/sections.ts).
 */
export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdminPage({ roles: OWNER_ONLY });
  return <AdminShell admin={admin}>{children}</AdminShell>;
}
