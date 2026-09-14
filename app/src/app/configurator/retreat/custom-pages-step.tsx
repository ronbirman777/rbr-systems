"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { ModuleItemPhotoField } from "@/components/module-item-photo-field";
import { persistNewItemStub, persistItemRemoval, enqueueItemsOp } from "@/lib/modules/persistItem";
import type { EditableCustomPage } from "@/lib/modules/customPage";
import { GUEST_BASE_PALETTE } from "@/lib/theme/tokens";
import { STUDIO_INPUT_CLASS, StudioLabel, StudioHeading, StudioIntro } from "./studio-ui";
import { saveCustomPages, type SaveCustomPagesState } from "./actions";
import { useRegisteredSave, type StudioSectionEditorProps } from "./studioSection";
import { DEFAULT_CUSTOM_PAGES_LIMIT } from "@/lib/entitlements/customPagesLimit";

const initialState: SaveCustomPagesState = { error: null };

export function blankCustomPage(): EditableCustomPage {
  return { id: crypto.randomUUID(), title: "", body: null, imageRef: null, imageUrl: null, enabled: true };
}

export type CustomPagesStepProps = {
  tenantId: string;
  customPages: EditableCustomPage[];
  setCustomPages: Dispatch<SetStateAction<EditableCustomPage[]>>;
  onBack: () => void;
  onContinue: () => void;
} & StudioSectionEditorProps;

/**
 * Organizer-created generic information pages - "What to Bring",
 * "Community Guidelines", whatever titles the organizer chooses. One row
 * per page (module_items, module_key="customPages"), no new table
 * regardless of how many pages exist. Same list + expand-to-edit-panel
 * pattern, reorder via sort_order (drag isn't built this batch - the
 * up/down buttons already used by FAQ do the same job).
 */
export function CustomPagesStep({ tenantId, customPages, setCustomPages, onBack, onContinue, onDirty, onSaved, registerSave }: CustomPagesStepProps) {
  const [state, setState] = useState<SaveCustomPagesState>(initialState);
  const [pending, setPending] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  function update(id: string, patch: Partial<EditableCustomPage>) {
    onDirty();
    setCustomPages((items) => items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function move(id: string, direction: -1 | 1) {
    setCustomPages((items) => {
      const index = items.findIndex((it) => it.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= items.length) return items;
      const next = [...items];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function handleAdd() {
    if (customPages.length >= DEFAULT_CUSTOM_PAGES_LIMIT) return;
    const item = blankCustomPage();
    setCustomPages((items) => [...items, item]);
    persistNewItemStub(tenantId, "customPages", item.id, customPages.length);
    setEditId(item.id);
  }

  function handleRemove(id: string) {
    setCustomPages((items) => items.filter((it) => it.id !== id));
    persistItemRemoval(tenantId, id);
    if (editId === id) setEditId(null);
  }

  async function handleSave(): Promise<boolean> {
    const formData = new FormData();
    formData.set("tenantId", tenantId);
    formData.set(
      "items",
      JSON.stringify(customPages.map(({ id, title, body, imageRef, enabled }) => ({ id, title, body, imageRef, enabled })))
    );
    const ids = customPages.map((p) => p.id);
    setPending(true);
    const result = await enqueueItemsOp(ids, () => saveCustomPages(initialState, formData));
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

  const editing = editId ? (customPages.find((p) => p.id === editId) ?? null) : null;
  const editIdx = editing ? customPages.indexOf(editing) : -1;
  // UX-only mirror of the real limit enforced server-side in
  // saveCustomPages() (getCustomPagesLimit) - this constant is read from
  // the same shared module, not a second hardcoded 3.
  const atLimit = customPages.length >= DEFAULT_CUSTOM_PAGES_LIMIT;

  return (
    <div className="max-w-2xl">
      <StudioHeading>Add custom pages</StudioHeading>
      <StudioIntro>Choose your own titles - What to Bring, Community Guidelines, About the Retreat, anything you need.</StudioIntro>
      <p className="text-[11px] mb-4" style={{ color: GUEST_BASE_PALETTE.mist }}>
        {customPages.length} of {DEFAULT_CUSTOM_PAGES_LIMIT} pages used
      </p>

      <div className="space-y-2 mb-4">
        {customPages.map((page, i) => {
          const isEditing = editId === page.id;
          return (
            <div
              key={page.id}
              className="group flex items-center gap-3 rounded-2xl p-4 border bg-white transition-all"
              style={{
                borderColor: isEditing ? `${GUEST_BASE_PALETTE.forest}4d` : `${GUEST_BASE_PALETTE.sand}80`,
                opacity: page.enabled ? 1 : 0.55,
              }}
            >
              <div className="flex flex-col gap-0.5 flex-shrink-0">
                <button type="button" onClick={() => move(page.id, -1)} disabled={i === 0} className="text-[10px] disabled:opacity-20" style={{ color: GUEST_BASE_PALETTE.mist }}>
                  ▲
                </button>
                <button type="button" onClick={() => move(page.id, 1)} disabled={i === customPages.length - 1} className="text-[10px] disabled:opacity-20" style={{ color: GUEST_BASE_PALETTE.mist }}>
                  ▼
                </button>
              </div>
              <p className="flex-1 min-w-0 text-[13px] font-medium truncate" style={{ color: GUEST_BASE_PALETTE.forest }}>
                {page.title || "Untitled page"}
              </p>
              {!page.enabled && (
                <span className="text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wide font-medium flex-shrink-0" style={{ background: `${GUEST_BASE_PALETTE.sand}80`, color: GUEST_BASE_PALETTE.dusk }}>
                  Disabled
                </span>
              )}
              <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button type="button" onClick={() => setEditId(isEditing ? null : page.id)} className="text-[11px] px-2.5 py-1 rounded-lg border" style={{ color: GUEST_BASE_PALETTE.forest, borderColor: "rgba(45,74,62,0.2)" }}>
                  Edit
                </button>
                <button type="button" onClick={() => handleRemove(page.id)} className="text-[11px] px-2.5 py-1 rounded-lg border" style={{ color: GUEST_BASE_PALETTE.mist, borderColor: `${GUEST_BASE_PALETTE.sand}80` }}>
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {atLimit ? (
        <div
          className="w-full rounded-2xl py-3 px-4 text-[12px] mb-4 text-center"
          style={{ background: `${GUEST_BASE_PALETTE.sand}40`, color: GUEST_BASE_PALETTE.dusk }}
        >
          <p className="font-medium">You&apos;ve reached the {DEFAULT_CUSTOM_PAGES_LIMIT}-page limit.</p>
          <p className="mt-0.5">Need more pages for your retreat? Contact us.</p>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleAdd}
          className="w-full border-2 border-dashed rounded-2xl py-3 text-[12px] font-medium transition-all mb-4"
          style={{ borderColor: `${GUEST_BASE_PALETTE.sand}99`, color: GUEST_BASE_PALETTE.mist }}
        >
          + Add Page
        </button>
      )}

      {editing && (
        <div className="rounded-2xl border p-5" style={{ background: GUEST_BASE_PALETTE.parchmentDeep, borderColor: "rgba(45,74,62,0.15)" }}>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[14px] font-semibold" style={{ color: GUEST_BASE_PALETTE.forest }}>
              Editing {editing.title || "page"}
            </h4>
            <button type="button" onClick={() => setEditId(null)} className="text-[11px]" style={{ color: GUEST_BASE_PALETTE.mist }}>
              Done
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <ModuleItemPhotoField
                tenantId={tenantId}
                moduleKey="customPages"
                itemId={editing.id}
                title={editing.title}
                description={editing.body}
                sortOrder={editIdx}
                imageRef={editing.imageRef}
                imageUrl={editing.imageUrl}
                onChange={(patch) => update(editing.id, patch)}
                previewAspect="13/6"
                ratioHint="Recommended: landscape photo, about 2:1."
              />
            </div>
            <div className="col-span-2 space-y-3">
              <div>
                <StudioLabel>Page title</StudioLabel>
                <input value={editing.title} onChange={(e) => update(editing.id, { title: e.target.value })} placeholder="e.g. What to Bring" className={STUDIO_INPUT_CLASS} />
              </div>
              <div>
                <StudioLabel>Content</StudioLabel>
                <textarea value={editing.body ?? ""} onChange={(e) => update(editing.id, { body: e.target.value || null })} rows={5} className={`${STUDIO_INPUT_CLASS} resize-none`} />
              </div>
              <label className="flex items-center gap-2 text-[12px]" style={{ color: GUEST_BASE_PALETTE.dusk }}>
                <input type="checkbox" checked={editing.enabled} onChange={(e) => update(editing.id, { enabled: e.target.checked })} />
                Visible to guests
              </label>
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
        <button type="button" onClick={onBack} className="rounded-full border border-idw-forest/20 text-idw-forest text-sm font-semibold uppercase tracking-wide px-6 py-3">
          Back
        </button>
        <button type="button" disabled={pending} onClick={handleSave} className="rounded-full bg-idw-forest text-idw-parchment text-sm font-semibold uppercase tracking-wide px-6 py-3 disabled:opacity-60">
          {pending ? "Saving…" : "Save Pages"}
        </button>
        <button type="button" onClick={onContinue} className="text-xs font-semibold uppercase tracking-wide text-idw-forest/50 hover:text-idw-forest">
          Continue →
        </button>
      </div>
    </div>
  );
}
