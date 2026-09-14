import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RetreatConfigurator } from "./retreat-configurator";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import { EMPTY_ARRIVAL_INFO } from "@/lib/modules/arrival";
import { EMPTY_STAY_CONNECTED } from "@/lib/modules/stayConnected";

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
        initialSlug={null}
        initialTimezone={DEFAULT_TIMEZONE}
        initialPalette="forest-sage"
        initialAtmosphere="calm-organic"
        initialCustomPrimary={null}
        initialCustomSecondary={null}
        initialCustomNavigation={null}
        initialCustomText={null}
        initialHeroImageRef={null}
        initialHeroImageUrl={null}
        initialSpaceImageRef={null}
        initialSpaceImageUrl={null}
        initialLogoRef={null}
        initialLogoUrl={null}
        initialSchedule={[]}
        initialFacilitators={[]}
        initialMeals={[]}
        initialTreatments={[]}
        initialFacilities={[]}
        initialArrivalInfo={EMPTY_ARRIVAL_INFO}
        initialFaq={[]}
        initialCustomPages={[]}
        initialStayConnected={EMPTY_STAY_CONNECTED}
        initialEnabledModules={[]}
        initialPublishedAt={null}
        initialIsPubliclyAvailable={false}
        publishedHeroImageUrl={null}
        initialGuestAccessSettings={{ mode: "public", hasCode: false, updatedAt: null }}
        initialFeaturedSubmission={{
          status: "not_submitted",
          description: null,
          location: null,
          website: null,
          instagram: null,
          additionalLinks: [],
          submittedAt: null,
          hasApprovedSnapshot: false,
        }}
      />
    </main>
  );
}
