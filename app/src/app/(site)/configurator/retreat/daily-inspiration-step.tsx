"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { persistNewItemStub, persistItemRemoval, enqueueItemsOp } from "@/lib/modules/persistItem";
import { DAILY_INSPIRATION_KEY, type EditableInspirationItem } from "@/lib/modules/dailyInspiration";
import { GUEST_BASE_PALETTE } from "@/lib/theme/tokens";
import {
  STUDIO_HIT_ROW_CLASS,
  STUDIO_REORDER_BUTTON_CLASS,
  STUDIO_REORDER_COLUMN_CLASS,
  STUDIO_INPUT_CLASS,
  StudioField,
  StudioHeading,
  StudioIntro,
  ForwardArrow,
} from "./studio-ui";
import { EmptyState } from "@/components/studio/empty-state";
import { saveDailyInspiration, type SaveDailyInspirationState } from "./actions";
import { useRegisteredSave, type StudioSectionEditorProps } from "./studioSection";
import { createTranslator } from "@/lib/i18n";

const initialState: SaveDailyInspirationState = { error: null };

export function blankInspiration(): EditableInspirationItem {
  return { id: crypto.randomUUID(), label: "", text: "", enabled: true };
}

/** One-line summary for the collapsed row: the start of the reflection. */
function summary(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 90 ? `${flat.slice(0, 90)}…` : flat;
}

export type DailyInspirationStepProps = {
  tenantId: string;
  items: EditableInspirationItem[];
  setItems: Dispatch<SetStateAction<EditableInspirationItem[]>>;
  onBack: () => void;
  onContinue: () => void;
} & StudioSectionEditorProps;

/**
 * Daily Inspiration (TASK 030 W1.5): the Space's own reflections.
 *
 * The FAQ editor's shape on purpose - an ordered list, expand to edit, a
 * per-item visible-to-guests switch - so an organizer learns one pattern.
 * Order is the stored order (`sort_order` from the array index on save).
 * The text is the organizer's own and is never translated; every field is
 * dir="auto" so a Hebrew reflection in an English Studio (or the reverse)
 * lays out correctly. Edits stay in the draft until Republish.
 */
export function DailyInspirationStep({
  tenantId,
  items,
  setItems,
  onBack,
  onContinue,
  onDirty,
  onSaved,
  registerSave,
  locale,
}: DailyInspirationStepProps) {
  const { t } = createTranslator(locale);
  const [state, setState] = useState<SaveDailyInspirationState>(initialState);
  const [pending, setPending] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  function update(id: string, patch: Partial<EditableInspirationItem>) {
    onDirty();
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function move(id: string, direction: -1 | 1) {
    onDirty();
    setItems((list) => {
      const index = list.findIndex((it) => it.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  function handleAdd() {
    const item = blankInspiration();
    setItems((list) => [...list, item]);
    persistNewItemStub(tenantId, DAILY_INSPIRATION_KEY, item.id, items.length);
    onDirty();
    setEditId(item.id);
  }

  function handleRemove(id: string) {
    setItems((list) => list.filter((it) => it.id !== id));
    persistItemRemoval(tenantId, id);
    if (editId === id) setEditId(null);
  }

  async function handleSave(): Promise<boolean> {
    const formData = new FormData();
    formData.set("locale", locale);
    formData.set("tenantId", tenantId);
    formData.set(
      "items",
      JSON.stringify(items.map(({ id, label, text, enabled }) => ({ id, label, text, enabled })))
    );
    const ids = items.map((i) => i.id);
    setPending(true);
    const result = await enqueueItemsOp(ids, () => saveDailyInspiration(initialState, formData));
    setPending(false);
    setState(result);
    // A failed save must NOT clear the guard - the edits are still only in memory.
    if (result.error) return false;
    onSaved();
    return true;
  }

  useRegisteredSave(registerSave, handleSave);

  const editing = editId ? (items.find((i) => i.id === editId) ?? null) : null;
  const hasVisible = items.some((i) => i.enabled && i.text.trim());

  return (
    <div className="max-w-2xl">
      <StudioHeading>{t("flow", "inspirationStepTitle")}</StudioHeading>
      <StudioIntro>{t("flow", "inspirationStepBody")}</StudioIntro>

      {!hasVisible && (
        <p className="text-[12px] mb-4" style={{ color: GUEST_BASE_PALETTE.dusk }} data-testid="inspiration-fallback-note">
          {t("flow", "inspirationFallbackNote")}
        </p>
      )}

      <ul className="space-y-2 mb-4" data-testid="inspiration-list">
        {items.map((item, i) => {
          const isEditing = editId === item.id;
          return (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-2xl p-4 border bg-white transition-all"
              style={{
                borderColor: isEditing ? `${GUEST_BASE_PALETTE.forest}4d` : `${GUEST_BASE_PALETTE.sand}80`,
                opacity: item.enabled ? 1 : 0.55,
              }}
              data-testid="inspiration-row"
            >
              <div className={STUDIO_REORDER_COLUMN_CLASS}>
                <button type="button" onClick={() => move(item.id, -1)} disabled={i === 0} aria-label={t("studio", "moveUp")} className={STUDIO_REORDER_BUTTON_CLASS} style={{ color: GUEST_BASE_PALETTE.mist }}>
                  ▲
                </button>
                <button type="button" onClick={() => move(item.id, 1)} disabled={i === items.length - 1} aria-label={t("studio", "moveDown")} className={STUDIO_REORDER_BUTTON_CLASS} style={{ color: GUEST_BASE_PALETTE.mist }}>
                  ▼
                </button>
              </div>
              <p className="flex-1 min-w-0 text-[13px] font-medium break-words" style={{ color: GUEST_BASE_PALETTE.forest }} dir="auto">
                {summary(item.text) || t("flow", "untitledInspiration")}
              </p>
              {!item.enabled && (
                <span className="text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wide font-medium flex-shrink-0" style={{ background: `${GUEST_BASE_PALETTE.sand}80`, color: GUEST_BASE_PALETTE.dusk }}>
                  {t("common", "disabled")}
                </span>
              )}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setEditId(isEditing ? null : item.id)}
                  aria-expanded={isEditing}
                  className={`text-[11px] px-2.5 rounded-lg border ${STUDIO_HIT_ROW_CLASS}`}
                  style={{ color: GUEST_BASE_PALETTE.forest, borderColor: "rgba(45,74,62,0.2)" }}
                >
                  {t("common", "edit")}
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(item.id)}
                  className={`text-[11px] px-2.5 rounded-lg border ${STUDIO_HIT_ROW_CLASS}`}
                  style={{ color: GUEST_BASE_PALETTE.mist, borderColor: `${GUEST_BASE_PALETTE.sand}80` }}
                >
                  {t("common", "remove")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {items.length === 0 && (
        <div className="mb-4">
          <EmptyState title={t("flow", "noInspirationYet")} body={t("flow", "noInspirationBody")} />
        </div>
      )}

      <button
        type="button"
        onClick={handleAdd}
        className="w-full border-2 border-dashed rounded-2xl py-3 min-h-11 text-[12px] font-medium transition-all mb-4"
        style={{ borderColor: `${GUEST_BASE_PALETTE.sand}99`, color: GUEST_BASE_PALETTE.mist }}
      >
        + {t("flow", "addInspiration")}
      </button>

      {editing && (
        <div className="rounded-2xl border p-5" style={{ background: GUEST_BASE_PALETTE.parchmentDeep, borderColor: "rgba(45,74,62,0.15)" }}>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[14px] font-semibold" style={{ color: GUEST_BASE_PALETTE.forest }}>
              {t("flow", "editInspiration")}
            </h4>
            <button type="button" onClick={() => setEditId(null)} className={`text-[11px] ${STUDIO_HIT_ROW_CLASS}`} style={{ color: GUEST_BASE_PALETTE.mist }}>
              {t("common", "done")}
            </button>
          </div>
          <div className="space-y-3">
            <StudioField label={t("flow", "inspirationTextLabel")}>
              <textarea
                value={editing.text}
                onChange={(e) => update(editing.id, { text: e.target.value })}
                placeholder={t("flow", "inspirationTextPlaceholder")}
                rows={4}
                maxLength={1000}
                className={`${STUDIO_INPUT_CLASS} resize-none`}
                dir="auto"
              />
            </StudioField>
            <StudioField label={t("flow", "inspirationLabelLabel")}>
              <input
                value={editing.label}
                onChange={(e) => update(editing.id, { label: e.target.value })}
                placeholder={t("flow", "inspirationLabelPlaceholder")}
                maxLength={160}
                className={STUDIO_INPUT_CLASS}
                dir="auto"
              />
            </StudioField>
            <label className="flex items-center gap-2 min-h-11 text-[12px]" style={{ color: GUEST_BASE_PALETTE.dusk }}>
              <input type="checkbox" checked={editing.enabled} onChange={(e) => update(editing.id, { enabled: e.target.checked })} />
              {t("studio", "visibleToGuests")}
            </label>
          </div>
        </div>
      )}

      {state.error && (
        <p className="text-sm text-red-700 mt-4" role="alert">
          {state.error}
        </p>
      )}

      <div className="mt-8 flex flex-wrap gap-3 items-center">
        <button type="button" onClick={onBack} className="rounded-full border border-idw-forest/20 text-idw-forest text-sm font-semibold uppercase tracking-wide px-6 py-3">
          {t("common", "back")}
        </button>
        <button type="button" disabled={pending} onClick={handleSave} className="rounded-full bg-idw-forest text-idw-parchment text-sm font-semibold uppercase tracking-wide px-6 py-3 disabled:opacity-60">
          {pending ? t("common", "savingNow") : t("studio", "saveSection", { section: t("flow", "moduleDailyInspiration") })}
        </button>
        <button type="button" onClick={onContinue} className="text-xs font-semibold uppercase tracking-wide text-idw-forest/50 hover:text-idw-forest relative after:content-[''] after:absolute after:-inset-x-2 after:top-1/2 after:-translate-y-1/2 after:h-11">
          {t("common", "next")} <ForwardArrow />
        </button>
      </div>
    </div>
  );
}
