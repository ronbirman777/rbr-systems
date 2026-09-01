import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RetreatConfigurator } from "./retreat-configurator";

export default async function NewRetreatConfiguratorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/log-in");

  return (
    <main className="flex-1 flex flex-col min-h-0 bg-idw-parchment">
      <RetreatConfigurator
        initialTenantId={null}
        initialName=""
        initialPalette="forest-sage"
        initialAtmosphere="calm-organic"
      />
    </main>
  );
}
