"use client";

import { useActionState, type Dispatch, type SetStateAction } from "react";
import { ModuleItemPhotoField } from "@/components/module-item-photo-field";
import { persistNewItemStub, persistItemRemoval } from "@/lib/modules/persistItem";
import type { EditableTreatment } from "@/lib/modules/treatment";
import { saveTreatments, type SaveTreatmentsState } from "./actions";

const initialState: SaveTreatmentsState = { error: null };

export function blankTreatment(): EditableTreatment {
  return {
    id: crypto.randomUUID(),
    name: "",
    shortDescription: null,
    description: null,
    durationMinutes: null,
    imageRef: null,
    imageUrl: null,
    provider: null,
    location: null,
    bookingInfo: null,
  };
}

export type TreatmentsStepProps = {
  tenantId: string;
  treatments: EditableTreatment[];
  setTreatments: Dispatch<SetStateAction<EditableTreatment[]>>;
  onBack: () => void;
  onContinue: () => void;
};

export function TreatmentsStep({ tenantId, treatments, setTreatments, onBack, onContinue }: TreatmentsStepProps) {
  const [state, formAction, pending] = useActionState(saveTreatments, initialState);

  function update(id: string, patch: Partial<EditableTreatment>) {
    setTreatments((items) => items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  return (
    <form action={formAction} className="max-w-lg">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input
        type="hidden"
        name="items"
        value={JSON.stringify(
          treatments.map(
            ({ id, name, shortDescription, description, durationMinutes, imageRef, provider, location, bookingInfo }) => ({
              id,
              name,
              shortDescription,
              description,
              durationMinutes,
              imageRef,
              provider,
              location,
              bookingInfo,
            })
          )
        )}
      />
      <h1 className="font-ui text-[26px] tracking-[-0.01em] text-idw-forest">Treatments</h1>
      <p className="text-sm text-idw-forest/60 mt-1">What&apos;s available, and how to access it. Not a booking system yet.</p>

      <div className="mt-8 flex flex-col gap-4">
        {treatments.map((t, i) => (
          <div key={t.id} className="rounded-lg border border-idw-forest/12 p-4">
            <div className="flex justify-between items-start gap-2">
              <input
                value={t.name}
                onChange={(e) => update(t.id, { name: e.target.value })}
                placeholder="Treatment name, e.g. Deep Tissue Massage"
                className="flex-1 text-sm font-medium text-idw-forest outline-none border-b border-transparent focus:border-idw-sage pb-1"
              />
              <button
                type="button"
                onClick={() => {
                  setTreatments((items) => items.filter((it) => it.id !== t.id));
                  persistItemRemoval(tenantId, t.id);
                }}
                className="text-idw-forest/30 hover:text-idw-forest text-xs shrink-0"
              >
                Remove
              </button>
            </div>
            <input
              value={t.shortDescription ?? ""}
              onChange={(e) => update(t.id, { shortDescription: e.target.value || null })}
              placeholder="Short description"
              className="mt-3 w-full rounded-md border border-idw-forest/15 px-2 py-1.5 text-xs outline-none focus:border-idw-sage"
            />
            <div className="grid grid-cols-2 gap-2 mt-2">
              <input
                type="number"
                min={1}
                value={t.durationMinutes ?? ""}
                onChange={(e) => update(t.id, { durationMinutes: e.target.value ? Number(e.target.value) : null })}
                placeholder="Duration (minutes)"
                className="rounded-md border border-idw-forest/15 px-2 py-1.5 text-xs outline-none focus:border-idw-sage"
              />
              <input
                value={t.provider ?? ""}
                onChange={(e) => update(t.id, { provider: e.target.value || null })}
                placeholder="Practitioner / provider"
                className="rounded-md border border-idw-forest/15 px-2 py-1.5 text-xs outline-none focus:border-idw-sage"
              />
              <input
                value={t.location ?? ""}
                onChange={(e) => update(t.id, { location: e.target.value || null })}
                placeholder="Location"
                className="rounded-md border border-idw-forest/15 px-2 py-1.5 text-xs outline-none focus:border-idw-sage"
              />
              <input
                value={t.bookingInfo ?? ""}
                onChange={(e) => update(t.id, { bookingInfo: e.target.value || null })}
                placeholder="How to book, e.g. Ask at reception"
                className="rounded-md border border-idw-forest/15 px-2 py-1.5 text-xs outline-none focus:border-idw-sage"
              />
            </div>
            <textarea
              value={t.description ?? ""}
              onChange={(e) => update(t.id, { description: e.target.value || null })}
              placeholder="Full description"
              rows={2}
              className="mt-2 w-full rounded-md border border-idw-forest/15 px-2 py-1.5 text-xs outline-none focus:border-idw-sage resize-none"
            />
            <ModuleItemPhotoField
              tenantId={tenantId}
              moduleKey="treatments"
              itemId={t.id}
              title={t.name}
              subtitle={t.shortDescription}
              description={t.description}
              sortOrder={i}
              imageRef={t.imageRef}
              imageUrl={t.imageUrl}
              onChange={(patch) => update(t.id, patch)}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => {
            const item = blankTreatment();
            setTreatments((items) => [...items, item]);
            persistNewItemStub(tenantId, "treatments", item.id, treatments.length);
          }}
          className="rounded-lg border border-dashed border-idw-forest/25 text-idw-forest/60 hover:text-idw-forest hover:border-idw-forest/50 text-sm py-3 transition-colors"
        >
          + Add treatment
        </button>
      </div>

      {state.error && (
        <p className="text-sm text-red-700 mt-4" role="alert">
          {state.error}
        </p>
      )}

      <div className="mt-8 flex gap-3 items-center">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-idw-forest/20 text-idw-forest text-sm font-semibold uppercase tracking-wide px-6 py-3"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-idw-forest text-idw-parchment text-sm font-semibold uppercase tracking-wide px-6 py-3 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save Treatments"}
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="text-xs font-semibold uppercase tracking-wide text-idw-forest/50 hover:text-idw-forest"
        >
          Continue →
        </button>
      </div>
    </form>
  );
}
