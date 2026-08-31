import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function CreatePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/log-in");

  return (
    <main className="flex-1 bg-[#FBF9F5] px-6 py-16 flex flex-col items-center">
      <div className="w-full max-w-3xl text-center">
        <h1 className="font-serif text-3xl text-[#1B2E24]">What would you like to create?</h1>

        <div className="mt-10 grid sm:grid-cols-2 gap-5 text-left">
          <Link
            href="/configurator/retreat"
            className="rounded-2xl border border-[#1B2E24]/12 bg-white p-8 hover:border-[#8A9A86] transition-colors"
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-[#8A9A86]">
              Retreat Experience
            </div>
            <h2 className="font-serif text-xl text-[#1B2E24] mt-2">
              For retreats, trainings and recurring programs.
            </h2>
          </Link>

          <div className="rounded-2xl border border-[#1B2E24]/12 bg-white p-8 opacity-60">
            <div className="text-xs font-semibold uppercase tracking-wide text-[#8A9A86]">
              Client Journey Hub
            </div>
            <h2 className="font-serif text-xl text-[#1B2E24] mt-2">
              For therapists, coaches and practitioners.
            </h2>
            <div className="text-xs text-[#1B2E24]/50 mt-3">Coming soon</div>
          </div>
        </div>
      </div>
    </main>
  );
}
