"use client";

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GuestApp } from "@/components/guest-app";
import { InnerDweSMark } from "@/components/brand/wordmark";
import { ModuleItemPhotoField } from "@/components/module-item-photo-field";
import { persistNewItemStub, persistItemRemoval } from "@/lib/modules/persistItem";
import { MealsStep } from "./meals-step";
import { TreatmentsStep } from "./treatments-step";
import { FacilitiesStep } from "./facilities-step";
import { ArrivalStep } from "./arrival-step";
import { ATMOSPHERES, PALETTES, type AtmosphereKey, type PaletteKey } from "@/lib/theme/tokens";
import type { EditableScheduleItem } from "@/lib/schedule/types";
import type { EditableFacilitator } from "@/lib/modules/facilitator";
import type { EditableMeal } from "@/lib/modules/meal";
import type { EditableTreatment } from "@/lib/modules/treatment";
import type { EditableFacility } from "@/lib/modules/facility";
import type { ArrivalInfo } from "@/lib/modules/arrival";
import { IMPLEMENTED_OPTIONAL_MODULES, OPTIONAL_MODULES, type OptionalModuleKey } from "@/lib/modules/catalog";
import { todayInTimezone, currentTimeInTimezone, listTimezones, DEFAULT_TIMEZONE } from "@/lib/timezone";
import {
  saveDraft,
  saveSchedule,
  saveModules,
  saveFacilitators,
  publishSpace,
  type SaveDraftState,
  type SaveScheduleState,
  type SaveModulesState,
  type SaveFacilitatorsState,
  type PublishState,
} from "./actions";

export type RetreatConfiguratorProps = {
  initialTenantId: string | null;
  initialName: string;
  initialTimezone: string;
  initialPalette: PaletteKey;
  initialAtmosphere: AtmosphereKey;
  initialSchedule: EditableScheduleItem[];
  initialFacilitators: EditableFacilitator[];
  initialMeals: EditableMeal[];
  initialTreatments: EditableTreatment[];
  initialFacilities: EditableFacility[];
  initialArrivalInfo: ArrivalInfo;
  initialEnabledModules: OptionalModuleKey[];
  initialPublishedAt: string | null;
};

const draftInitialState: SaveDraftState = { error: null, tenantId: null };
const scheduleInitialState: SaveScheduleState = { error: null };
const modulesInitialState: SaveModulesState = { error: null };
const facilitatorsInitialState: SaveFacilitatorsState = { error: null };
const publishInitialState: PublishState = { error: null, publishedAt: null };

function blankScheduleItem(): EditableScheduleItem {
  return {
    id: crypto.randomUUID(),
    date: new Date().toISOString().slice(0, 10),
    startTime: "09:00",
    endTime: null,
    title: "",
    facilitator: null,
    location: null,
    description: null,
    category: null,
  };
}

function blankFacilitator(): EditableFacilitator {
  return { id: crypto.randomUUID(), name: "", role: null, bio: null, imageRef: null, imageUrl: null };
}

type StepKey =
  | "identity"
  | "brand"
  | "modules"
  | "schedule"
  | "facilitators"
  | "meals"
  | "treatments"
  | "facilities"
  | "arrivalInfo"
  | "publish";

const STEP_LABELS: Record<Exclude<StepKey, "identity" | "brand" | "modules" | "publish">, string> = {
  schedule: "Schedule",
  facilitators: "Facilitators",
  meals: "Meals",
  treatments: "Treatments",
  facilities: "Facilities",
  arrivalInfo: "Arrival Info",
};

export function RetreatConfigurator({
  initialTenantId,
  initialName,
  initialTimezone,
  initialPalette,
  initialAtmosphere,
  initialSchedule,
  initialFacilitators,
  initialMeals,
  initialTreatments,
  initialFacilities,
  initialArrivalInfo,
  initialEnabledModules,
  initialPublishedAt,
}: RetreatConfiguratorProps) {
  const router = useRouter();
  const [step, setStep] = useState<StepKey>("identity");
  const [name, setName] = useState(initialName);
  const [timezone, setTimezone] = useState(initialTimezone || DEFAULT_TIMEZONE);
  const [palette, setPalette] = useState<PaletteKey>(initialPalette);
  const [atmosphere, setAtmosphere] = useState<AtmosphereKey>(initialAtmosphere);
  const [enabledModules, setEnabledModules] = useState<Set<OptionalModuleKey>>(
    new Set(initialEnabledModules)
  );
  const [schedule, setSchedule] = useState<EditableScheduleItem[]>(initialSchedule);
  const [facilitators, setFacilitators] = useState<EditableFacilitator[]>(initialFacilitators);
  const [meals, setMeals] = useState<EditableMeal[]>(initialMeals);
  const [treatments, setTreatments] = useState<EditableTreatment[]>(initialTreatments);
  const [facilities, setFacilities] = useState<EditableFacility[]>(initialFacilities);
  const [arrivalInfo, setArrivalInfo] = useState<ArrivalInfo>(initialArrivalInfo);

  const [draftState, draftAction, draftPending] = useActionState(saveDraft, {
    ...draftInitialState,
    tenantId: initialTenantId,
  });
  const [modulesState, modulesFormAction, modulesPending] = useActionState(saveModules, modulesInitialState);
  const [scheduleState, scheduleFormAction, schedulePending] = useActionState(saveSchedule, scheduleInitialState);
  const [facilitatorsState, facilitatorsFormAction, facilitatorsPending] = useActionState(
    saveFacilitators,
    facilitatorsInitialState
  );

  const [publishState, publishFormAction, publishPending] = useActionState(publishSpace, {
    ...publishInitialState,
    publishedAt: initialPublishedAt,
  });

  const tenantId = draftState.tenantId ?? initialTenantId;
  const currentPublishedAt = publishState.publishedAt ?? initialPublishedAt;

  function toggleModule(key: OptionalModuleKey) {
    setEnabledModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const steps = useMemo(() => {
    const list: { key: StepKey; label: string }[] = [
      { key: "identity", label: "Identity" },
      { key: "brand", label: "Brand" },
      { key: "modules", label: "Modules" },
    ];
    (Object.keys(STEP_LABELS) as (keyof typeof STEP_LABELS)[]).forEach((key) => {
      if (enabledModules.has(key)) list.push({ key, label: STEP_LABELS[key] });
    });
    list.push({ key: "publish", label: "Publish" });
    return list;
  }, [enabledModules]);

  /** Generic prev/next navigation over the current step list - this is
   * what lets the configurator scale to any number of enabled optional
   * modules without a hardcoded chain of "if enabled X, go to X, else Y". */
  function goToStep(delta: 1 | -1) {
    const idx = steps.findIndex((s) => s.key === step);
    const next = steps[idx + delta];
    if (next) setStep(next.key);
  }

  function updateScheduleItem(id: string, patch: Partial<EditableScheduleItem>) {
    setSchedule((items) => items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }
  function updateFacilitator(id: string, patch: Partial<EditableFacilitator>) {
    setFacilitators((items) => items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  const todayIso = todayInTimezone(timezone);

  return (
    <div className="grid lg:grid-cols-[280px_1fr_360px] gap-0 flex-1 min-h-0">
      {/* LEFT: setup progress */}
      <aside className="border-r border-idw-forest/10 bg-white px-7 py-9 hidden lg:block overflow-y-auto">
        <InnerDweSMark size={26} className="mb-10" />
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-idw-forest/40">
          Setup Progress
        </div>
        <ol className="mt-6 flex flex-col gap-1">
          {steps.map((s, i) => (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => setStep(s.key)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-3 ${
                  step === s.key ? "bg-idw-forest text-idw-parchment" : "text-idw-forest/70 hover:bg-idw-forest/5"
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                    step === s.key ? "bg-idw-parchment text-idw-forest" : "bg-idw-forest/10"
                  }`}
                >
                  {i + 1}
                </span>
                {s.label}
              </button>
            </li>
          ))}
        </ol>
        {tenantId && (
          <div className="mt-8 pt-6 border-t border-idw-forest/10 text-xs text-idw-forest/50">
            {currentPublishedAt ? (
              <>
                Live since {new Date(currentPublishedAt).toLocaleDateString()}
                <a
                  href={`/g/${tenantId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mt-1 text-idw-forest underline"
                >
                  View live guest app →
                </a>
              </>
            ) : (
              "Not published yet"
            )}
          </div>
        )}
      </aside>

      {/* CENTER: configuration */}
      <section className="px-6 py-12 sm:px-12 overflow-y-auto">
        {step === "identity" && (
          <form action={draftAction} className="max-w-lg">
            <input type="hidden" name="tenantId" value={tenantId ?? ""} />
            <input type="hidden" name="name" value={name} />
            <input type="hidden" name="timezone" value={timezone} />
            <h1 className="font-ui text-[26px] tracking-[-0.01em] text-idw-forest">Identity</h1>
            <p className="text-sm text-idw-forest/60 mt-1">Set the basics for your retreat.</p>

            <label className="block mt-8 text-xs font-semibold uppercase tracking-wide text-idw-forest/70">
              Retreat name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Wonderland Healing Center"
              className="mt-1 w-full rounded-lg border border-idw-forest/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-idw-sage"
            />

            <label className="block mt-6 text-xs font-semibold uppercase tracking-wide text-idw-forest/70">
              Retreat timezone
            </label>
            <p className="text-xs text-idw-forest/50 mt-0.5">
              Schedule times and &quot;today&quot; are based on this, not the guest&apos;s device.
            </p>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="mt-1 w-full rounded-lg border border-idw-forest/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-idw-sage"
            >
              {listTimezones().map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setStep("brand")}
              className="mt-8 rounded-full bg-idw-forest text-idw-parchment text-sm font-semibold uppercase tracking-wide px-6 py-3"
            >
              Continue to Brand
            </button>
          </form>
        )}

        {step === "brand" && (
          <form action={draftAction} className="max-w-lg">
            <input type="hidden" name="tenantId" value={tenantId ?? ""} />
            <input type="hidden" name="name" value={name} />
            <input type="hidden" name="timezone" value={timezone} />
            <h1 className="font-ui text-[26px] tracking-[-0.01em] text-idw-forest">Brand</h1>
            <p className="text-sm text-idw-forest/60 mt-1">Set the visual identity for your retreat app.</p>

            <div className="mt-8">
              <div className="text-xs font-semibold uppercase tracking-wide text-idw-forest/70">
                Choose your palette
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(Object.keys(PALETTES) as PaletteKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPalette(key)}
                    className={`rounded-lg border p-3 text-left text-xs font-medium transition-colors hover:border-idw-forest/40 ${
                      palette === key ? "border-idw-forest" : "border-idw-forest/12"
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
              <div className="text-xs font-semibold uppercase tracking-wide text-idw-forest/70">App style</div>
              <div className="mt-2 flex flex-col gap-2">
                {(Object.keys(ATMOSPHERES) as AtmosphereKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAtmosphere(key)}
                    className={`rounded-lg border p-3 text-left text-xs font-medium flex items-center justify-between ${
                      atmosphere === key ? "border-idw-forest" : "border-idw-forest/12"
                    }`}
                  >
                    {ATMOSPHERES[key].label}
                    <span
                      className={`w-3.5 h-3.5 rounded-full border ${
                        atmosphere === key ? "bg-idw-forest border-idw-forest" : "border-idw-forest/30"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
            <input type="hidden" name="atmosphere" value={atmosphere} />

            {draftState.error && (
              <p className="text-sm text-red-700 mt-4" role="alert">
                {draftState.error}
              </p>
            )}

            <div className="mt-8 flex gap-3">
              <button
                type="button"
                onClick={() => setStep("identity")}
                className="rounded-full border border-idw-forest/20 text-idw-forest text-sm font-semibold uppercase tracking-wide px-6 py-3"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={draftPending}
                className="rounded-full bg-idw-forest text-idw-parchment text-sm font-semibold uppercase tracking-wide px-6 py-3 disabled:opacity-60"
              >
                {draftPending ? "Saving…" : "Save Draft"}
              </button>
              {tenantId && (
                <button
                  type="button"
                  onClick={() => setStep("modules")}
                  className="text-xs font-semibold uppercase tracking-wide text-idw-forest/50 hover:text-idw-forest"
                >
                  Continue to Modules →
                </button>
              )}
            </div>
          </form>
        )}

        {step === "modules" && tenantId && (
          <form action={modulesFormAction} className="max-w-lg">
            <input type="hidden" name="tenantId" value={tenantId} />
            {IMPLEMENTED_OPTIONAL_MODULES.map((key) => (
              <input key={key} type="hidden" name={`module_${key}`} value={enabledModules.has(key) ? "on" : "off"} />
            ))}
            <h1 className="font-ui text-[26px] tracking-[-0.01em] text-idw-forest">Modules</h1>
            <p className="text-sm text-idw-forest/60 mt-1">
              Choose what appears in your guest app. Home is always included.
            </p>

            <div className="mt-8 flex flex-col gap-2">
              <div className="rounded-lg border border-idw-forest/10 bg-idw-forest/5 p-3 flex items-center justify-between text-sm text-idw-forest/50">
                Home / Today
                <span className="text-[10px] font-semibold uppercase tracking-wide">Always on</span>
              </div>
              {IMPLEMENTED_OPTIONAL_MODULES.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleModule(key)}
                  className={`rounded-lg border p-3 flex items-center justify-between text-sm ${
                    enabledModules.has(key) ? "border-idw-forest text-idw-forest" : "border-idw-forest/12 text-idw-forest/60"
                  }`}
                >
                  {OPTIONAL_MODULES[key].label}
                  <span
                    className={`w-3.5 h-3.5 rounded-full border ${
                      enabledModules.has(key) ? "bg-idw-forest border-idw-forest" : "border-idw-forest/30"
                    }`}
                  />
                </button>
              ))}
            </div>

            {modulesState.error && (
              <p className="text-sm text-red-700 mt-4" role="alert">
                {modulesState.error}
              </p>
            )}

            <div className="mt-8 flex gap-3 items-center">
              <button
                type="button"
                onClick={() => setStep("brand")}
                className="rounded-full border border-idw-forest/20 text-idw-forest text-sm font-semibold uppercase tracking-wide px-6 py-3"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={modulesPending}
                className="rounded-full bg-idw-forest text-idw-parchment text-sm font-semibold uppercase tracking-wide px-6 py-3 disabled:opacity-60"
              >
                {modulesPending ? "Saving…" : "Save Modules"}
              </button>
              <button
                type="button"
                onClick={() => goToStep(1)}
                className="text-xs font-semibold uppercase tracking-wide text-idw-forest/50 hover:text-idw-forest"
              >
                Continue →
              </button>
            </div>
          </form>
        )}

        {step === "schedule" && tenantId && (
          <form action={scheduleFormAction} className="max-w-lg">
            <input type="hidden" name="tenantId" value={tenantId} />
            <input type="hidden" name="items" value={JSON.stringify(schedule)} />
            <h1 className="font-ui text-[26px] tracking-[-0.01em] text-idw-forest">Schedule</h1>
            <p className="text-sm text-idw-forest/60 mt-1">
              What&apos;s happening, and when. This becomes what guests see.
            </p>

            <div className="mt-8 flex flex-col gap-4">
              {schedule.map((item) => (
                <div key={item.id} className="rounded-lg border border-idw-forest/12 p-4">
                  <div className="flex justify-between items-start gap-2">
                    <input
                      value={item.title}
                      onChange={(e) => updateScheduleItem(item.id, { title: e.target.value })}
                      placeholder="Session title"
                      className="flex-1 text-sm font-medium text-idw-forest outline-none border-b border-transparent focus:border-idw-sage pb-1"
                    />
                    <button
                      type="button"
                      onClick={() => setSchedule((items) => items.filter((it) => it.id !== item.id))}
                      className="text-idw-forest/30 hover:text-idw-forest text-xs shrink-0"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <input
                      type="date"
                      value={item.date}
                      onChange={(e) => updateScheduleItem(item.id, { date: e.target.value })}
                      className="rounded-md border border-idw-forest/15 px-2 py-1.5 text-xs outline-none focus:border-idw-sage"
                    />
                    <input
                      type="time"
                      value={item.startTime}
                      onChange={(e) => updateScheduleItem(item.id, { startTime: e.target.value })}
                      className="rounded-md border border-idw-forest/15 px-2 py-1.5 text-xs outline-none focus:border-idw-sage"
                    />
                    <input
                      value={item.facilitator ?? ""}
                      onChange={(e) => updateScheduleItem(item.id, { facilitator: e.target.value || null })}
                      placeholder="Facilitator"
                      className="rounded-md border border-idw-forest/15 px-2 py-1.5 text-xs outline-none focus:border-idw-sage"
                    />
                    <input
                      value={item.location ?? ""}
                      onChange={(e) => updateScheduleItem(item.id, { location: e.target.value || null })}
                      placeholder="Location"
                      className="rounded-md border border-idw-forest/15 px-2 py-1.5 text-xs outline-none focus:border-idw-sage"
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setSchedule((items) => [...items, blankScheduleItem()])}
                className="rounded-lg border border-dashed border-idw-forest/25 text-idw-forest/60 hover:text-idw-forest hover:border-idw-forest/50 text-sm py-3 transition-colors"
              >
                + Add schedule item
              </button>
            </div>

            {scheduleState.error && (
              <p className="text-sm text-red-700 mt-4" role="alert">
                {scheduleState.error}
              </p>
            )}

            <div className="mt-8 flex gap-3 items-center">
              <button
                type="button"
                onClick={() => goToStep(-1)}
                className="rounded-full border border-idw-forest/20 text-idw-forest text-sm font-semibold uppercase tracking-wide px-6 py-3"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={schedulePending}
                className="rounded-full bg-idw-forest text-idw-parchment text-sm font-semibold uppercase tracking-wide px-6 py-3 disabled:opacity-60"
              >
                {schedulePending ? "Saving…" : "Save Schedule"}
              </button>
              <button
                type="button"
                onClick={() => goToStep(1)}
                className="text-xs font-semibold uppercase tracking-wide text-idw-forest/50 hover:text-idw-forest"
              >
                Continue →
              </button>
            </div>
          </form>
        )}

        {step === "facilitators" && tenantId && (
          <form action={facilitatorsFormAction} className="max-w-lg">
            <input type="hidden" name="tenantId" value={tenantId} />
            <input
              type="hidden"
              name="items"
              value={JSON.stringify(facilitators.map(({ id, name, role, bio, imageRef }) => ({ id, name, role, bio, imageRef })))}
            />
            <h1 className="font-ui text-[26px] tracking-[-0.01em] text-idw-forest">Facilitators</h1>
            <p className="text-sm text-idw-forest/60 mt-1">Who&apos;s leading your retreat.</p>

            <div className="mt-8 flex flex-col gap-4">
              {facilitators.map((f, i) => (
                <div key={f.id} className="rounded-lg border border-idw-forest/12 p-4">
                  <div className="flex justify-between items-start gap-2">
                    <input
                      value={f.name}
                      onChange={(e) => updateFacilitator(f.id, { name: e.target.value })}
                      placeholder="Full name"
                      className="flex-1 text-sm font-medium text-idw-forest outline-none border-b border-transparent focus:border-idw-sage pb-1"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setFacilitators((items) => items.filter((it) => it.id !== f.id));
                        persistItemRemoval(tenantId, f.id);
                      }}
                      className="text-idw-forest/30 hover:text-idw-forest text-xs shrink-0"
                    >
                      Remove
                    </button>
                  </div>
                  <input
                    value={f.role ?? ""}
                    onChange={(e) => updateFacilitator(f.id, { role: e.target.value || null })}
                    placeholder="Role, e.g. Yoga & Breathwork Facilitator"
                    className="mt-3 w-full rounded-md border border-idw-forest/15 px-2 py-1.5 text-xs outline-none focus:border-idw-sage"
                  />
                  <textarea
                    value={f.bio ?? ""}
                    onChange={(e) => updateFacilitator(f.id, { bio: e.target.value || null })}
                    placeholder="Short bio"
                    rows={2}
                    className="mt-2 w-full rounded-md border border-idw-forest/15 px-2 py-1.5 text-xs outline-none focus:border-idw-sage resize-none"
                  />
                  <ModuleItemPhotoField
                    tenantId={tenantId}
                    moduleKey="facilitators"
                    itemId={f.id}
                    title={f.name}
                    subtitle={f.role}
                    description={f.bio}
                    sortOrder={i}
                    imageRef={f.imageRef}
                    imageUrl={f.imageUrl}
                    onChange={(patch) => updateFacilitator(f.id, patch)}
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  const item = blankFacilitator();
                  setFacilitators((items) => [...items, item]);
                  persistNewItemStub(tenantId, "facilitators", item.id, facilitators.length);
                }}
                className="rounded-lg border border-dashed border-idw-forest/25 text-idw-forest/60 hover:text-idw-forest hover:border-idw-forest/50 text-sm py-3 transition-colors"
              >
                + Add facilitator
              </button>
            </div>

            {facilitatorsState.error && (
              <p className="text-sm text-red-700 mt-4" role="alert">
                {facilitatorsState.error}
              </p>
            )}

            <div className="mt-8 flex gap-3 items-center">
              <button
                type="button"
                onClick={() => goToStep(-1)}
                className="rounded-full border border-idw-forest/20 text-idw-forest text-sm font-semibold uppercase tracking-wide px-6 py-3"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={facilitatorsPending}
                className="rounded-full bg-idw-forest text-idw-parchment text-sm font-semibold uppercase tracking-wide px-6 py-3 disabled:opacity-60"
              >
                {facilitatorsPending ? "Saving…" : "Save Facilitators"}
              </button>
              <button
                type="button"
                onClick={() => goToStep(1)}
                className="text-xs font-semibold uppercase tracking-wide text-idw-forest/50 hover:text-idw-forest"
              >
                Continue →
              </button>
            </div>
          </form>
        )}

        {step === "meals" && tenantId && (
          <MealsStep
            tenantId={tenantId}
            meals={meals}
            setMeals={setMeals}
            onBack={() => goToStep(-1)}
            onContinue={() => goToStep(1)}
          />
        )}

        {step === "treatments" && tenantId && (
          <TreatmentsStep
            tenantId={tenantId}
            treatments={treatments}
            setTreatments={setTreatments}
            onBack={() => goToStep(-1)}
            onContinue={() => goToStep(1)}
          />
        )}

        {step === "facilities" && tenantId && (
          <FacilitiesStep
            tenantId={tenantId}
            facilities={facilities}
            setFacilities={setFacilities}
            onBack={() => goToStep(-1)}
            onContinue={() => goToStep(1)}
          />
        )}

        {step === "arrivalInfo" && tenantId && (
          <ArrivalStep
            tenantId={tenantId}
            info={arrivalInfo}
            setInfo={setArrivalInfo}
            onBack={() => goToStep(-1)}
            onContinue={() => goToStep(1)}
          />
        )}

        {step === "publish" && tenantId && (
          <form action={publishFormAction} className="max-w-lg">
            <input type="hidden" name="tenantId" value={tenantId} />
            <h1 className="font-ui text-[26px] tracking-[-0.01em] text-idw-forest">Publish</h1>
            <p className="text-sm text-idw-forest/60 mt-1">
              {currentPublishedAt
                ? "Your changes stay private until you republish."
                : "Nothing is visible to guests until you publish."}
            </p>

            <div className="mt-8 rounded-lg border border-idw-forest/12 p-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-idw-forest/50">Status</div>
              <div className="text-sm text-idw-forest mt-1">
                {currentPublishedAt
                  ? `Live · last published ${new Date(currentPublishedAt).toLocaleString()}`
                  : "Draft · never published"}
              </div>
            </div>

            {publishState.error && (
              <p className="text-sm text-red-700 mt-4" role="alert">
                {publishState.error}
              </p>
            )}

            <div className="mt-8 flex gap-3 items-center">
              <button
                type="button"
                onClick={() => goToStep(-1)}
                className="rounded-full border border-idw-forest/20 text-idw-forest text-sm font-semibold uppercase tracking-wide px-6 py-3"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={publishPending}
                className="rounded-full bg-idw-forest text-idw-parchment text-sm font-semibold uppercase tracking-wide px-6 py-3 disabled:opacity-60"
              >
                {publishPending ? "Publishing…" : currentPublishedAt ? "Republish" : "Publish"}
              </button>
            </div>

            {currentPublishedAt && (
              <a
                href={`/g/${tenantId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-6 text-xs text-idw-forest underline"
              >
                View live guest app →
              </a>
            )}
          </form>
        )}
      </section>

      {/* RIGHT: live preview */}
      <aside className="bg-idw-forest px-8 py-12 flex flex-col items-center">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-idw-parchment/50">
          Live Preview
        </div>
        <div className="text-[11px] text-idw-parchment/35 mt-1">What your guests will see</div>
        <div className="mt-7 w-[260px] h-[520px] rounded-[40px] lg:w-[220px] lg:h-[440px] lg:rounded-[36px] border-[6px] border-black bg-black overflow-hidden shadow-2xl">
          <GuestApp
            tenantName={name}
            brand={{
              name,
              logoUrl: null,
              palette,
              customPrimary: null,
              atmosphere,
              imageStyle: "rounded",
            }}
            todayIso={todayIso}
            nowTime={currentTimeInTimezone(timezone)}
            enabledModules={Array.from(enabledModules)}
            schedule={schedule}
            facilitators={facilitators.map((f) => ({ ...f, imageUrl: f.imageUrl ?? null }))}
            meals={meals.map((m) => ({ ...m, imageUrl: m.imageUrl ?? null }))}
            treatments={treatments.map((t) => ({ ...t, imageUrl: t.imageUrl ?? null }))}
            facilities={facilities.map((f) => ({ ...f, imageUrl: f.imageUrl ?? null }))}
            arrivalInfo={arrivalInfo}
          />
        </div>
        {tenantId && (
          <button
            type="button"
            onClick={() => router.push(`/configurator/retreat/${tenantId}`)}
            className="mt-6 text-xs text-idw-parchment/60 underline"
          >
            Resume this draft later at this link
          </button>
        )}
      </aside>
    </div>
  );
}
