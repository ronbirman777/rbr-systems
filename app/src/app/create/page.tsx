import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { InnerDweSMark } from "@/components/brand/wordmark";
import { PRODUCT_FAMILIES } from "@/lib/brand/productFamilies";
import { getSpaceSlotSummary } from "@/app/configurator/retreat/lifecycleActions";

export default async function CreatePage() {
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

  return (
    <main className="flex-1 bg-idw-parchment px-6 py-20 flex flex-col items-center">
      <div className="w-full max-w-3xl text-center">
        <InnerDweSMark size={28} className="mx-auto mb-6" />
        <h1 className="font-ui text-3xl text-idw-forest">What would you like to create?</h1>

        <div className="mt-12 grid sm:grid-cols-2 gap-6 text-left">
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
