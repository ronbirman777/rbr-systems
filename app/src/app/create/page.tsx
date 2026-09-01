import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { InnerDweSMark } from "@/components/brand/wordmark";
import { PRODUCT_FAMILIES } from "@/lib/brand/productFamilies";

export default async function CreatePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/log-in");

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
