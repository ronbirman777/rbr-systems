import type { AdminRole } from "@/lib/billing/admin/auth";
import type { AdminKey } from "@/lib/billing/admin/ui/labels";

/**
 * The nine top-level Admin sections (spec §2) and who may open each one. This is the single source the
 * navigation, the page gates and the role-matrix test read, so a section can never be visible in the nav
 * but ungated (or the reverse).
 *
 * `connected` = the section shows real data in this batch. Unconnected sections render an explicit
 * "No data source connected" state: never zeros.
 *
 * Pure data (no server imports): the client nav imports the type and receives the filtered list as props.
 */
export type AdminSectionKey =
  | "overview" | "spaces" | "billing" | "usage" | "infrastructure" | "backups" | "alerts" | "costs" | "integrations";

export type AdminSection = {
  key: AdminSectionKey;
  href: string;
  labelKey: AdminKey;
  roles: readonly AdminRole[];
  connected: boolean;
};

const OWNER: readonly AdminRole[] = ["owner"];

export const ADMIN_SECTIONS: readonly AdminSection[] = [
  { key: "overview", href: "/admin/overview", labelKey: "secOverview", roles: OWNER, connected: true },
  { key: "spaces", href: "/admin/spaces", labelKey: "secSpaces", roles: OWNER, connected: true },
  // Revenue & Billing keeps today's access: owner AND billing_admin (the existing billing pages, unchanged).
  { key: "billing", href: "/admin/billing", labelKey: "secBilling", roles: ["owner", "billing_admin"], connected: true },
  { key: "usage", href: "/admin/usage", labelKey: "secUsage", roles: OWNER, connected: false },
  { key: "infrastructure", href: "/admin/infrastructure", labelKey: "secInfrastructure", roles: OWNER, connected: false },
  { key: "backups", href: "/admin/backups", labelKey: "secBackups", roles: OWNER, connected: false },
  { key: "alerts", href: "/admin/alerts", labelKey: "secAlerts", roles: OWNER, connected: false },
  { key: "costs", href: "/admin/costs", labelKey: "secCosts", roles: OWNER, connected: false },
  { key: "integrations", href: "/admin/integrations", labelKey: "secIntegrations", roles: OWNER, connected: false },
];

export function sectionByKey(key: AdminSectionKey): AdminSection {
  const s = ADMIN_SECTIONS.find((x) => x.key === key);
  if (!s) throw new Error(`unknown admin section ${key}`);
  return s;
}

/** Roles allowed to open a section; pages pass this to requireAdminPage({ roles }). */
export function sectionRoles(key: AdminSectionKey): readonly AdminRole[] {
  return sectionByKey(key).roles;
}

export function sectionsFor(role: AdminRole): AdminSection[] {
  return ADMIN_SECTIONS.filter((s) => s.roles.includes(role));
}

/** Where /admin (and a finished MFA prompt) sends this role: the first section it may open. */
export function landingPathFor(role: AdminRole): string {
  return sectionsFor(role)[0]?.href ?? "/admin/billing";
}
