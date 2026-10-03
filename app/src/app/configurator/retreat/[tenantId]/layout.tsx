import { loadStudioTenant } from "@/lib/configurator/studioTenant";

export default async function StudioTenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  await loadStudioTenant(tenantId, "retreat");
  return children;
}
