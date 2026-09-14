"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { ModuleItemPhotoField } from "@/components/module-item-photo-field";
import { persistNewItemStub, persistItemRemoval, enqueueItemsOp } from "@/lib/modules/persistItem";
import type { EditableFacility } from "@/lib/modules/facility";
import { GUEST_BASE_PALETTE } from "@/lib/theme/tokens";
import { STUDIO_INPUT_CLASS, StudioLabel, StudioHeading, StudioIntro } from "./studio-ui";
import { saveFacilities, type SaveFacilitiesState } from "./actions";
import { useRegisteredSave, type StudioSectionEditorProps } from "./studioSection";

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
} & StudioSectionEditorProps;

/**
 * Studio Completion pass - same reused Meals-editor pattern (see
 * meals-step.tsx's doc comment). Same underlying state/persistence as
 * before.
 */
export function FacilitiesStep({ tenantId, facilities, setFacilities, onBack, onContinue, onDirty, onSaved, registerSave }: FacilitiesStepProps) {
  const [state, setState] = useState<SaveFacilitiesState>(initialState);
  const [pending, setPending] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  function update(id: string, patch: Partial<EditableFacility>) {
    onDirty();
    setFacilities((items) => items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function handleAdd() {
    const item = blankFacility();
    setFacilities((items) => [...items, item]);
    persistNewItemStub(tenantId, "facilities", item.id, facilities.length);
    setEditId(item.id);
  }

  function handleRemove(id: string) {
    setFacilities((items) => items.filter((it) => it.id !== id));
    persistItemRemoval(tenantId, id);
    if (editId === id) setEditId(null);
  }

  async function handleSave(): Promise<boolean> {
    const formData = new FormData();
    formData.set("tenantId", tenantId);
    formData.set(
      "items",
      JSON.stringify(
        facilities.map(({ id, name, description, imageRef, openingHours, location, importantInfo }) => ({
          id,
          name,
          description,
          imageRef,
          openingHours,
          location,
          importantInfo,
        }))
      )
    );
    const ids = facilities.map((f) => f.id);
    setPending(true);
    const result = await enqueueItemsOp(ids, () => saveFacilities(initialState, formData));
    setPending(false);
    setState(result);
    // A failed save must NOT clear the guard - the edits are still
    // only in memory, so the section stays dirty and the Unsaved
    // Changes dialog keeps protecting them.
    if (result.error) return false;
    onSaved();
    return true;
  }

  useRegisteredSave(registerSave, handleSave);

  const editing = editId ? (facilities.find((f) => f.id === editId) ?? null) : null;
  const editIdx = editing ? facilities.indexOf(editing) : -1;

  return (
    <div className="max-w-2xl">
      <StudioHeading>Help guests find their way</StudioHeading>
      <StudioIntro>The spaces guests will want to find - pools, studios, gardens, quiet corners.</StudioIntro>

      <div className="space-y-3 mb-4">
        {facilities.map((f) => {
          const isEditing = editId === f.id;
          return (
            <div
              key={f.id}
              className="group flex items-center gap-4 rounded-2xl border overflow-hidden bg-white transition-all"
              style={{
                borderColor: isEditing ? `${GUEST_BASE_PALETTE.forest}4d` : `${GUEST_BASE_PALETTE.sand}80`,
                boxShadow: isEditing ? "0 1px 3px rgba(45,74,62,0.08)" : "none",
              }}
            >
              <div className="w-20 h-20 flex-shrink-0" style={{ background: GUEST_BASE_PALETTE.parchmentDeep }}>
                {f.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.imageUrl} alt={f.name} className="w-full h-full object-cover" />
                ) : null}
              </div>
              <div className="flex-1 py-3 min-w-0 pr-3">
                {f.openingHours && (
                  <span className="text-[11px] font-medium" style={{ color: GUEST_BASE_PALETTE.clay }}>
                    {f.openingHours}
                  </span>
                )}
                <p className="text-[13px] font-medium truncate" style={{ color: GUEST_BASE_PALETTE.forest }}>
                  {f.name || "Untitled facility"}
                </p>
                <p className="text-[11px] mt-0.5 truncate" style={{ color: GUEST_BASE_PALETTE.mist }}>
                  {f.location}
                </p>
              </div>
              <div className="flex flex-col gap-1.5 pr-4 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setEditId(isEditing ? null : f.id)}
                  className="text-[11px] px-2.5 py-1 rounded-lg border transition-colors"
                  style={{ color: GUEST_BASE_PALETTE.forest, borderColor: "rgba(45,74,62,0.2)" }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(f.id)}
                  className="text-[11px] px-2.5 py-1 rounded-lg border transition-colors"
                  style={{ color: GUEST_BASE_PALETTE.mist, borderColor: `${GUEST_BASE_PALETTE.sand}80` }}
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={handleAdd}
        className="w-full border-2 border-dashed rounded-2xl py-3 text-[12px] font-medium transition-all mb-4"
        style={{ borderColor: `${GUEST_BASE_PALETTE.sand}99`, color: GUEST_BASE_PALETTE.mist }}
      >
        + Add Facility
      </button>

      {editing && (
        <div className="rounded-2xl border p-5" style={{ background: GUEST_BASE_PALETTE.parchmentDeep, borderColor: "rgba(45,74,62,0.15)" }}>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[14px] font-semibold" style={{ color: GUEST_BASE_PALETTE.forest }}>
              Editing {editing.name || "facility"}
            </h4>
            <button type="button" onClick={() => setEditId(null)} className="text-[11px]" style={{ color: GUEST_BASE_PALETTE.mist }}>
              Done
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <ModuleItemPhotoField
                tenantId={tenantId}
                moduleKey="facilities"
                itemId={editing.id}
                title={editing.name}
                description={editing.description}
                sortOrder={editIdx}
                imageRef={editing.imageRef}
                imageUrl={editing.imageUrl}
                onChange={(patch) => update(editing.id, patch)}
                previewAspect="39/16"
                ratioHint="This photo displays at slightly different heights depending on position - keep the subject centered and avoid tight crops at the edges."
              />
            </div>
            <div className="col-span-2 space-y-3">
              <div>
                <StudioLabel>Facility name</StudioLabel>
                <input
                  value={editing.name}
                  onChange={(e) => update(editing.id, { name: e.target.value })}
                  placeholder="e.g. Saltwater Pool"
                  className={STUDIO_INPUT_CLASS}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <StudioLabel>Opening hours</StudioLabel>
                  <input
                    value={editing.openingHours ?? ""}
                    onChange={(e) => update(editing.id, { openingHours: e.target.value || null })}
                    placeholder="e.g. 06:00 - 21:00"
                    className={STUDIO_INPUT_CLASS}
                  />
                </div>
                <div>
                  <StudioLabel>Location</StudioLabel>
                  <input
                    value={editing.location ?? ""}
                    onChange={(e) => update(editing.id, { location: e.target.value || null })}
                    placeholder="e.g. Lower Garden"
                    className={STUDIO_INPUT_CLASS}
                  />
                </div>
              </div>
              <div>
                <StudioLabel>Description</StudioLabel>
                <textarea
                  value={editing.description ?? ""}
                  onChange={(e) => update(editing.id, { description: e.target.value || null })}
                  placeholder="What guests will find here…"
                  rows={2}
                  className={`${STUDIO_INPUT_CLASS} resize-none`}
                />
              </div>
              <div>
                <StudioLabel>Important information (optional)</StudioLabel>
                <input
                  value={editing.importantInfo ?? ""}
                  onChange={(e) => update(editing.id, { importantInfo: e.target.value || null })}
                  placeholder="e.g. Please shower before entering"
                  className={STUDIO_INPUT_CLASS}
                />
              </div>
            </div>
          </div>
        </div>
      )}

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
          type="button"
          disabled={pending}
          onClick={handleSave}
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
    </div>
  );
}
