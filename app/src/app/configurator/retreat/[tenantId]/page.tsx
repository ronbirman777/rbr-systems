import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RetreatConfigurator } from "../retreat-configurator";
import type { AtmosphereKey, PaletteKey } from "@/lib/theme/tokens";

export default async function ResumeRetreatConfiguratorPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/log-in");

  // RLS scopes this to tenants the signed-in user is a member of - a draft
  // belonging to someone else simply won't come back, regardless of the id.
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant) notFound();

  const { data: brand } = await supabase
    .from("brand_configs")
    .select("palette, atmosphere")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return (
    <main className="flex-1 flex flex-col min-h-0 bg-idw-parchment">
      <RetreatConfigurator
        initialTenantId={tenant.id}
        initialName={tenant.name}
        initialPalette={(brand?.palette as PaletteKey) ?? "forest-sage"}
        initialAtmosphere={(brand?.atmosphere as AtmosphereKey) ?? "calm-organic"}
      />
    </main>
  );
}
