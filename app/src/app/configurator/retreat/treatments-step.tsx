"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { ModuleItemPhotoField } from "@/components/module-item-photo-field";
import { persistNewItemStub, persistItemRemoval, enqueueItemsOp } from "@/lib/modules/persistItem";
import type { EditableTreatment } from "@/lib/modules/treatment";
import { GUEST_BASE_PALETTE } from "@/lib/theme/tokens";
import { STUDIO_INPUT_CLASS, StudioLabel, StudioHeading, StudioIntro } from "./studio-ui";
import { saveTreatments, type SaveTreatmentsState } from "./actions";
import { useRegisteredSave, type StudioSectionEditorProps } from "./studioSection";

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
} & StudioSectionEditorProps;

/**
 * Studio Completion pass - same reused Meals-editor pattern (see
 * meals-step.tsx's doc comment; Figma's own MealsEditorScreen explicitly
 * names Treatments as reusing this exact structure). Same underlying
 * state/persistence as before.
 */
export function TreatmentsStep({ tenantId, treatments, setTreatments, onBack, onContinue, onDirty, onSaved, registerSave }: TreatmentsStepProps) {
  const [state, setState] = useState<SaveTreatmentsState>(initialState);
  const [pending, setPending] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  function update(id: string, patch: Partial<EditableTreatment>) {
    onDirty();
    setTreatments((items) => items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function handleAdd() {
    const item = blankTreatment();
    setTreatments((items) => [...items, item]);
    persistNewItemStub(tenantId, "treatments", item.id, treatments.length);
    setEditId(item.id);
  }

  function handleRemove(id: string) {
    setTreatments((items) => items.filter((it) => it.id !== id));
    persistItemRemoval(tenantId, id);
    if (editId === id) setEditId(null);
  }

  async function handleSave(): Promise<boolean> {
    const formData = new FormData();
    formData.set("tenantId", tenantId);
    formData.set(
      "items",
      JSON.stringify(
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
      )
    );
    const ids = treatments.map((t) => t.id);
    setPending(true);
    const result = await enqueueItemsOp(ids, () => saveTreatments(initialState, formData));
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

  const editing = editId ? (treatments.find((t) => t.id === editId) ?? null) : null;
  const editIdx = editing ? treatments.indexOf(editing) : -1;

  return (
    <div className="max-w-2xl">
      <StudioHeading>Present your treatments</StudioHeading>
      <StudioIntro>
        What&apos;s available, and how to access it. Not a booking system yet - guests are told how to book.
      </StudioIntro>

      <div className="space-y-3 mb-4">
        {treatments.map((t) => {
          const isEditing = editId === t.id;
          return (
            <div
              key={t.id}
              className="group flex items-center gap-4 rounded-2xl border overflow-hidden bg-white transition-all"
              style={{
                borderColor: isEditing ? `${GUEST_BASE_PALETTE.forest}4d` : `${GUEST_BASE_PALETTE.sand}80`,
                boxShadow: isEditing ? "0 1px 3px rgba(45,74,62,0.08)" : "none",
              }}
            >
              <div className="w-20 h-20 flex-shrink-0" style={{ background: GUEST_BASE_PALETTE.parchmentDeep }}>
                {t.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.imageUrl} alt={t.name} className="w-full h-full object-cover" />
                ) : null}
              </div>
              <div className="flex-1 py-3 min-w-0 pr-3">
                <div className="flex items-baseline gap-2 mb-0.5">
                  {t.durationMinutes && (
                    <span className="text-[11px] font-medium" style={{ color: GUEST_BASE_PALETTE.clay }}>
                      {t.durationMinutes} min
                    </span>
                  )}
                </div>
                <p className="text-[13px] font-medium truncate" style={{ color: GUEST_BASE_PALETTE.forest }}>
                  {t.name || "Untitled treatment"}
                </p>
                <p className="text-[11px] mt-0.5 truncate" style={{ color: GUEST_BASE_PALETTE.mist }}>
                  {[t.location, t.bookingInfo].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex flex-col gap-1.5 pr-4 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setEditId(isEditing ? null : t.id)}
                  className="text-[11px] px-2.5 py-1 rounded-lg border transition-colors"
                  style={{ color: GUEST_BASE_PALETTE.forest, borderColor: "rgba(45,74,62,0.2)" }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(t.id)}
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
        + Add Treatment
      </button>

      {editing && (
        <div className="rounded-2xl border p-5" style={{ background: GUEST_BASE_PALETTE.parchmentDeep, borderColor: "rgba(45,74,62,0.15)" }}>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[14px] font-semibold" style={{ color: GUEST_BASE_PALETTE.forest }}>
              Editing {editing.name || "treatment"}
            </h4>
            <button type="button" onClick={() => setEditId(null)} className="text-[11px]" style={{ color: GUEST_BASE_PALETTE.mist }}>
              Done
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <ModuleItemPhotoField
                tenantId={tenantId}
                moduleKey="treatments"
                itemId={editing.id}
                title={editing.name}
                subtitle={editing.shortDescription}
                description={editing.description}
                sortOrder={editIdx}
                imageRef={editing.imageRef}
                imageUrl={editing.imageUrl}
                onChange={(patch) => update(editing.id, patch)}
                previewAspect="39/20"
                ratioHint="Recommended: landscape photo, about 2:1."
              />
            </div>
            <div className="col-span-2 space-y-3">
              <div>
                <StudioLabel>Treatment name</StudioLabel>
                <input
                  value={editing.name}
                  onChange={(e) => update(editing.id, { name: e.target.value })}
                  placeholder="e.g. Traditional Thai Massage"
                  className={STUDIO_INPUT_CLASS}
                />
              </div>
              <div>
                <StudioLabel>Short description</StudioLabel>
                <input
                  value={editing.shortDescription ?? ""}
                  onChange={(e) => update(editing.id, { shortDescription: e.target.value || null })}
                  placeholder="One line for the entry card"
                  className={STUDIO_INPUT_CLASS}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <StudioLabel>Duration (minutes)</StudioLabel>
                  <input
                    type="number"
                    min={1}
                    value={editing.durationMinutes ?? ""}
                    onChange={(e) => update(editing.id, { durationMinutes: e.target.value ? Number(e.target.value) : null })}
                    placeholder="90"
                    className={STUDIO_INPUT_CLASS}
                  />
                </div>
                <div>
                  <StudioLabel>Practitioner / provider</StudioLabel>
                  <input
                    value={editing.provider ?? ""}
                    onChange={(e) => update(editing.id, { provider: e.target.value || null })}
                    placeholder="Optional"
                    className={STUDIO_INPUT_CLASS}
                  />
                </div>
                <div>
                  <StudioLabel>Location</StudioLabel>
                  <input
                    value={editing.location ?? ""}
                    onChange={(e) => update(editing.id, { location: e.target.value || null })}
                    placeholder="e.g. Spa Room 2"
                    className={STUDIO_INPUT_CLASS}
                  />
                </div>
                <div>
                  <StudioLabel>Booking info</StudioLabel>
                  <input
                    value={editing.bookingInfo ?? ""}
                    onChange={(e) => update(editing.id, { bookingInfo: e.target.value || null })}
                    placeholder="e.g. Book at reception"
                    className={STUDIO_INPUT_CLASS}
                  />
                </div>
              </div>
              <div>
                <StudioLabel>Full description</StudioLabel>
                <textarea
                  value={editing.description ?? ""}
                  onChange={(e) => update(editing.id, { description: e.target.value || null })}
                  placeholder="What this treatment involves…"
                  rows={2}
                  className={`${STUDIO_INPUT_CLASS} resize-none`}
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
    </div>
  );
}
