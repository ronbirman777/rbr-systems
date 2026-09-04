"use client";

import { useActionState, type Dispatch, type SetStateAction } from "react";
import { ModuleItemPhotoField } from "@/components/module-item-photo-field";
import { persistNewItemStub, persistItemRemoval } from "@/lib/modules/persistItem";
import type { EditableFacility } from "@/lib/modules/facility";
import { saveFacilities, type SaveFacilitiesState } from "./actions";

const initialState: SaveFacilitiesState = { error: null };

export function blankFacility(): EditableFacility {
  return {
    id: crypto.randomUUID(),
    name: "",
    description: null,
    imageRef: null,
    imageUrl: null,
    openingHours: null,
    location: null,
    importantInfo: null,
  };
}

export type FacilitiesStepProps = {
  tenantId: string;
  facilities: EditableFacility[];
  setFacilities: Dispatch<SetStateAction<EditableFacility[]>>;
  onBack: () => void;
  onContinue: () => void;
};

export function FacilitiesStep({
  tenantId,
  facilities,
  setFacilities,
  onBack,
  onContinue,
}: FacilitiesStepProps) {
  const [state, formAction, pending] = useActionState(saveFacilities, initialState);

  function update(id: string, patch: Partial<EditableFacility>) {
    setFacilities((items) => items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  return (
    <form action={formAction} className="max-w-lg">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input
        type="hidden"
        name="items"
        value={JSON.stringify(
          facilities.map(({ id, name, description, imageRef, openingHours, location, importantInfo }) => ({
            id,
            name,
            description,
            imageRef,
            openingHours,
            location,
            importantInfo,
          }))
        )}
      />
      <h1 className="font-ui text-[26px] tracking-[-0.01em] text-idw-forest">Facilities</h1>
      <p className="text-sm text-idw-forest/60 mt-1">The spaces guests will want to find.</p>

      <div className="mt-8 flex flex-col gap-4">
        {facilities.map((f, i) => (
          <div key={f.id} className="rounded-lg border border-idw-forest/12 p-4">
            <div className="flex justify-between items-start gap-2">
              <input
                value={f.name}
                onChange={(e) => update(f.id, { name: e.target.value })}
                placeholder="Facility name, e.g. Pool"
                className="flex-1 text-sm font-medium text-idw-forest outline-none border-b border-transparent focus:border-idw-sage pb-1"
              />
              <button
                type="button"
                onClick={() => {
                  setFacilities((items) => items.filter((it) => it.id !== f.id));
                  persistItemRemoval(tenantId, f.id);
                }}
                className="text-idw-forest/30 hover:text-idw-forest text-xs shrink-0"
              >
                Remove
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <input
                value={f.openingHours ?? ""}
                onChange={(e) => update(f.id, { openingHours: e.target.value || null })}
                placeholder="Opening hours"
                className="rounded-md border border-idw-forest/15 px-2 py-1.5 text-xs outline-none focus:border-idw-sage"
              />
              <input
                value={f.location ?? ""}
                onChange={(e) => update(f.id, { location: e.target.value || null })}
                placeholder="Location"
                className="rounded-md border border-idw-forest/15 px-2 py-1.5 text-xs outline-none focus:border-idw-sage"
              />
            </div>
            <textarea
              value={f.description ?? ""}
              onChange={(e) => update(f.id, { description: e.target.value || null })}
              placeholder="Description"
              rows={2}
              className="mt-2 w-full rounded-md border border-idw-forest/15 px-2 py-1.5 text-xs outline-none focus:border-idw-sage resize-none"
            />
            <input
              value={f.importantInfo ?? ""}
              onChange={(e) => update(f.id, { importantInfo: e.target.value || null })}
              placeholder="Important information (optional)"
              className="mt-2 w-full rounded-md border border-idw-forest/15 px-2 py-1.5 text-xs outline-none focus:border-idw-sage"
            />
            <ModuleItemPhotoField
              tenantId={tenantId}
              moduleKey="facilities"
              itemId={f.id}
              title={f.name}
              description={f.description}
              sortOrder={i}
              imageRef={f.imageRef}
              imageUrl={f.imageUrl}
              onChange={(patch) => update(f.id, patch)}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => {
            const item = blankFacility();
            setFacilities((items) => [...items, item]);
            persistNewItemStub(tenantId, "facilities", item.id, facilities.length);
          }}
          className="rounded-lg border border-dashed border-idw-forest/25 text-idw-forest/60 hover:text-idw-forest hover:border-idw-forest/50 text-sm py-3 transition-colors"
        >
          + Add facility
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
          {pending ? "Saving…" : "Save Facilities"}
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
