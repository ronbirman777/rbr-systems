import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { InnerDweSMark } from "@/components/brand/wordmark";
import { PRODUCT_FAMILIES } from "@/lib/brand/productFamilies";
import { getSpaceSlotSummary } from "@/app/configurator/retreat/lifecycleActions";
import { createTeachSpace } from "@/app/configurator/teach/actions";
import { CreateTeachSubmit } from "./create-teach-submit";
import { SPACE_TYPES } from "@/lib/spaceTypes/registry";

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/log-in");

  // Task 011: an honest Add Space/upgrade-required state before the user
  // spends time filling out a form the database will reject anyway - the
  // real enforcement is the enforce_space_slot_capacity() trigger
  // (0017_space_management_slots.sql), this is just an honest preview of
  // that same authoritative check, not a separate source of truth.
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

  const flow = PRODUCT_FAMILIES.retreat;
  const heal = PRODUCT_FAMILIES.client_hub;
  const teach = SPACE_TYPES.teach;

  return (
    <main className="flex-1 bg-idw-parchment px-6 py-20 flex flex-col items-center">
      <div className="w-full max-w-5xl text-center">
        {/* Task 013: a visitor who reaches this ordinary (slot-available)
            screen but changes their mind had no way back to My Spaces -
            only the exceptional no-slots state above has one. Page-local
            rather than reusing BackToHomeLink (hard-coded to "/" with no
            destination/label props - see back-to-home-link.tsx) - same
            chevron + text visual treatment, just pointed at /space. A
            plain Link, not history-dependent back navigation: works
            identically whether /create was opened via "+ New Space" or a
            direct visit. Placed before the heading in both visual and
            DOM/keyboard order. */}
        <div className="text-left">
          <Link
            href="/space"
            aria-label="Back to My Spaces"
            className="inline-flex items-center gap-1 min-h-11 pl-1 pr-2.5 -ml-1 mb-4 rounded-lg text-idw-forest/70 hover:text-idw-forest active:bg-idw-forest/10 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="shrink-0">
              <path d="M12.5 15.5L7 10l5.5-5.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-sm font-semibold whitespace-nowrap">Back to My Spaces</span>
          </Link>
        </div>
        <InnerDweSMark size={28} className="mx-auto mb-6" />
        <h1 className="font-ui text-3xl text-idw-forest">What would you like to create?</h1>

        {error ? (
          <p role="alert" className="mt-6 text-sm text-idw-clay-text">
            {error === "slots"
              ? "You've used all your available Space slots. Replace an existing Space from My Spaces, or add a slot."
              : "We couldn't create that Space. Please try again."}
          </p>
        ) : null}

        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
          <Link
            href="/configurator/retreat"
            className="group relative overflow-hidden rounded-2xl border border-idw-forest/10 bg-white p-8 pt-7 transition-all hover:-translate-y-1 hover:shadow-[0_24px_48px_-24px_rgba(25,43,33,0.25)]"
            style={{ borderTopColor: flow.accent, borderTopWidth: 3 }}
          >
            <div
              className="text-xs font-semibold uppercase tracking-[0.14em]"
              style={{ color: flow.accent }}
            >
              {flow.name}
            </div>
            <h2 className="font-editorial italic text-2xl text-idw-forest mt-3 leading-snug">
              {flow.tagline}
            </h2>
            <span className="inline-block mt-6 text-xs font-semibold uppercase tracking-wide text-idw-forest/50 group-hover:text-idw-forest transition-colors">
              Begin →
            </span>
          </Link>

          {/* Time to Teach: created server-side first (createTeachSpace uses
              the same RLS-scoped tenants insert as Time to Flow, so the same
              owner-membership and slot-capacity triggers apply), then opens
              its own Studio. */}
          <form action={createTeachSpace} className="contents">
            <CreateTeachSubmit
              idleLabel="Begin →"
              pendingLabel="Creating your Space…"
              className="group relative overflow-hidden rounded-2xl border border-idw-forest/10 bg-white p-8 pt-7 text-left transition-all hover:-translate-y-1 hover:shadow-[0_24px_48px_-24px_rgba(25,43,33,0.25)]"
              style={{ borderTopColor: teach.product.accent, borderTopWidth: 3 }}
            >
              <div
                className="text-xs font-semibold uppercase tracking-[0.14em]"
                style={{ color: teach.product.accentText }}
              >
                {teach.product.name}
              </div>
              <h2 className="font-editorial italic text-2xl text-idw-forest mt-3 leading-snug">
                {teach.product.tagline}
              </h2>
              {teach.product.description ? (
                <p className="text-sm text-idw-forest/60 mt-3 leading-relaxed">{teach.product.description}</p>
              ) : null}
            </CreateTeachSubmit>
          </form>

          <div
            className="relative overflow-hidden rounded-2xl border border-idw-forest/10 bg-white p-8 pt-7"
            style={{ borderTopColor: heal.accent, borderTopWidth: 3 }}
          >
            <div
              className="text-xs font-semibold uppercase tracking-[0.14em]"
              style={{ color: heal.accent }}
            >
              {heal.name}
            </div>
            <h2 className="font-editorial italic text-2xl text-idw-forest mt-3 leading-snug">
              {heal.tagline}
            </h2>
            <span
              className="inline-block mt-6 text-[11px] font-semibold uppercase tracking-wide rounded-full px-3 py-1"
              style={{ color: heal.accent, backgroundColor: `${heal.accent}1a` }}
            >
              Coming Soon
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
