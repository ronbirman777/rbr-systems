"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { TodayScreen } from "@/components/today-screen";
import { ATMOSPHERES, PALETTES, type AtmosphereKey, type PaletteKey } from "@/lib/theme/tokens";
import { saveDraft, type SaveDraftState } from "./actions";

export type RetreatConfiguratorProps = {
  initialTenantId: string | null;
  initialName: string;
  initialPalette: PaletteKey;
  initialAtmosphere: AtmosphereKey;
};

const initialState: SaveDraftState = { error: null, tenantId: null };

export function RetreatConfigurator({
  initialTenantId,
  initialName,
  initialPalette,
  initialAtmosphere,
}: RetreatConfiguratorProps) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState(initialName);
  const [palette, setPalette] = useState<PaletteKey>(initialPalette);
  const [atmosphere, setAtmosphere] = useState<AtmosphereKey>(initialAtmosphere);
  const [state, formAction, pending] = useActionState(saveDraft, {
    ...initialState,
    tenantId: initialTenantId,
  });

  const tenantId = state.tenantId ?? initialTenantId;

  return (
    <div className="grid lg:grid-cols-[280px_1fr_360px] gap-0 flex-1 min-h-0">
      {/* LEFT: setup progress */}
      <aside className="border-r border-[#1B2E24]/10 bg-white px-6 py-8 hidden lg:block">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#1B2E24]/40">
          Setup Progress
        </div>
        <ol className="mt-5 flex flex-col gap-1">
          {[
            { n: 1, label: "Identity" },
            { n: 2, label: "Brand" },
          ].map((s) => (
            <li key={s.n}>
              <button
                type="button"
                onClick={() => setStep(s.n as 1 | 2)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-3 ${
                  step === s.n ? "bg-[#1B2E24] text-[#FBF9F5]" : "text-[#1B2E24]/70 hover:bg-[#1B2E24]/5"
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                    step === s.n ? "bg-[#FBF9F5] text-[#1B2E24]" : "bg-[#1B2E24]/10"
                  }`}
                >
                  {s.n}
                </span>
                {s.label}
              </button>
            </li>
          ))}
        </ol>
      </aside>

      {/* CENTER: configuration */}
      <section className="px-6 py-10 sm:px-10 overflow-y-auto">
        <form action={formAction} className="max-w-lg">
          <input type="hidden" name="tenantId" value={tenantId ?? ""} />
          {/*
            The visible "name" field only exists in the DOM on step 1 (it's
            inside that step's conditional block, which React unmounts on
            step 2) - so a plain named input there would go missing from the
            submitted FormData once the user moves on to Brand. This hidden
            mirror keeps the current value present regardless of step.
          */}
          <input type="hidden" name="name" value={name} />

          {step === 1 && (
            <div>
              <h1 className="font-serif text-2xl text-[#1B2E24]">Identity</h1>
              <p className="text-sm text-[#1B2E24]/60 mt-1">Set the basics for your retreat.</p>

              <label className="block mt-8 text-xs font-semibold uppercase tracking-wide text-[#1B2E24]/70">
                Retreat name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Wonderland Healing Center"
                className="mt-1 w-full rounded-lg border border-[#1B2E24]/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#8A9A86]"
              />

              <button
                type="button"
                onClick={() => setStep(2)}
                className="mt-8 rounded-full bg-[#1B2E24] text-[#FBF9F5] text-sm font-semibold uppercase tracking-wide px-6 py-3"
              >
                Continue to Brand
              </button>
            </div>
          )}

          {step === 2 && (
            <div>
              <h1 className="font-serif text-2xl text-[#1B2E24]">Brand</h1>
              <p className="text-sm text-[#1B2E24]/60 mt-1">
                Set the visual identity for your retreat app.
              </p>

              <div className="mt-8">
                <div className="text-xs font-semibold uppercase tracking-wide text-[#1B2E24]/70">
                  Choose your palette
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(Object.keys(PALETTES) as PaletteKey[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPalette(key)}
                      className={`rounded-lg border p-3 text-left text-xs font-medium ${
                        palette === key ? "border-[#1B2E24]" : "border-[#1B2E24]/12"
                      }`}
                    >
                      <span
                        className="block w-full h-6 rounded-md mb-2"
                        style={{
                          background: `linear-gradient(90deg, ${PALETTES[key].primary}, ${PALETTES[key].secondary})`,
                        }}
                      />
                      {PALETTES[key].label}
                    </button>
                  ))}
                </div>
              </div>
              <input type="hidden" name="palette" value={palette} />

              <div className="mt-6">
                <div className="text-xs font-semibold uppercase tracking-wide text-[#1B2E24]/70">
                  App style
                </div>
                <div className="mt-2 flex flex-col gap-2">
                  {(Object.keys(ATMOSPHERES) as AtmosphereKey[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setAtmosphere(key)}
                      className={`rounded-lg border p-3 text-left text-xs font-medium flex items-center justify-between ${
                        atmosphere === key ? "border-[#1B2E24]" : "border-[#1B2E24]/12"
                      }`}
                    >
                      {ATMOSPHERES[key].label}
                      <span
                        className={`w-3.5 h-3.5 rounded-full border ${
                          atmosphere === key ? "bg-[#1B2E24] border-[#1B2E24]" : "border-[#1B2E24]/30"
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <input type="hidden" name="atmosphere" value={atmosphere} />

              {state.error && (
                <p className="text-sm text-red-700 mt-4" role="alert">
                  {state.error}
                </p>
              )}

              <div className="mt-8 flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-full border border-[#1B2E24]/20 text-[#1B2E24] text-sm font-semibold uppercase tracking-wide px-6 py-3"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-full bg-[#1B2E24] text-[#FBF9F5] text-sm font-semibold uppercase tracking-wide px-6 py-3 disabled:opacity-60"
                >
                  {pending ? "Saving…" : "Save Draft"}
                </button>
              </div>

              {tenantId && !pending && !state.error && (
                <p className="text-xs text-[#1B2E24]/50 mt-3">Saved. You can safely close and come back.</p>
              )}
            </div>
          )}
        </form>
      </section>

      {/* RIGHT: live preview */}
      <aside className="bg-[#1B2E24] px-8 py-10 flex flex-col items-center">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#FBF9F5]/50">
          Live Preview
        </div>
        <div className="mt-6 w-[220px] h-[440px] rounded-[36px] border-[6px] border-black bg-black overflow-hidden shadow-2xl">
          <TodayScreen
            tenantName={name}
            brand={{
              name,
              logoUrl: null,
              palette,
              customPrimary: null,
              atmosphere,
              imageStyle: "rounded",
            }}
          />
        </div>
        {tenantId && (
          <button
            type="button"
            onClick={() => router.push(`/configurator/retreat/${tenantId}`)}
            className="mt-6 text-xs text-[#FBF9F5]/60 underline"
          >
            Resume this draft later at this link
          </button>
        )}
      </aside>
    </div>
  );
}
