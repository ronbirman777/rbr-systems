import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RetreatConfigurator } from "./retreat-configurator";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import { EMPTY_ARRIVAL_INFO } from "@/lib/modules/arrival";

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
        initialTimezone={DEFAULT_TIMEZONE}
        initialPalette="forest-sage"
        initialAtmosphere="calm-organic"
        initialSchedule={[]}
        initialFacilitators={[]}
        initialMeals={[]}
        initialTreatments={[]}
        initialFacilities={[]}
        initialArrivalInfo={EMPTY_ARRIVAL_INFO}
        initialEnabledModules={[]}
        initialPublishedAt={null}
      />
    </main>
  );
}
