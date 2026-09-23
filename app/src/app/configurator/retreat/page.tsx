import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { RetreatConfigurator } from "./retreat-configurator";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import { EMPTY_ARRIVAL_INFO } from "@/lib/modules/arrival";
import { EMPTY_STAY_CONNECTED } from "@/lib/modules/stayConnected";
import { getSpaceSlotSummary } from "./lifecycleActions";
import { InnerDweSMark } from "@/components/brand/wordmark";

export default async function NewRetreatConfiguratorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/log-in");

  // Task 011: this route is a second, direct entry point into "new Studio"
  // alongside /create (a signed-in user can navigate straight here) - the
  // same honest pre-check applies, not just the one at /create. The real
  // enforcement remains the database trigger; this only avoids letting
  // someone fill out an entire draft before discovering it can't save.
  const slots = await getSpaceSlotSummary(user.id);
  if (slots.slotsAvailable <= 0) {
    return (
      <main className="flex-1 bg-idw-parchment px-6 py-20 flex flex-col items-center">
        <div className="w-full max-w-md text-center">
          <InnerDweSMark size={28} className="mx-auto mb-6" />
          <h1 className="font-ui text-3xl text-idw-forest">No available Space slots</h1>
          <p className="mt-4 text-sm text-idw-forest/60">
            You&apos;re using {slots.slotsUsed} of {slots.slotsAllowed} Space{" "}
            {slots.slotsAllowed === 1 ? "slot" : "slots"}. To create a new Space, replace an
            existing one from My Spaces, or add another slot.
          </p>
          <Link
            href="/space"
            className="inline-block mt-8 text-xs font-semibold uppercase tracking-wide text-idw-forest border border-idw-forest/20 rounded-full px-5 py-2.5 hover:border-idw-forest/50 transition-colors"
          >
            Go to My Spaces
          </Link>
        </div>
      </main>
    );
  }

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
