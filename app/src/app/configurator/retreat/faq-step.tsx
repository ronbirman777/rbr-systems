"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { persistNewItemStub, persistItemRemoval, enqueueItemsOp } from "@/lib/modules/persistItem";
import type { EditableFaqItem } from "@/lib/modules/faq";
import { GUEST_BASE_PALETTE } from "@/lib/theme/tokens";
import { STUDIO_HIT_ROW_CLASS, STUDIO_HIT_SQUARE_CLASS, STUDIO_INPUT_CLASS, StudioField, StudioHeading, StudioIntro } from "./studio-ui";
import { EmptyState } from "@/components/studio/empty-state";
import { saveFaq, type SaveFaqState } from "./actions";
import { useRegisteredSave, type StudioSectionEditorProps } from "./studioSection";

import { createTranslator } from "@/lib/i18n";
import { ForwardArrow } from "./studio-ui";
const initialState: SaveFaqState = { error: null };

export function blankFaqItem(): EditableFaqItem {
  return { id: crypto.randomUUID(), question: "", answer: null, enabled: true };
}

export type FaqStepProps = {
  tenantId: string;
  faq: EditableFaqItem[];
  setFaq: Dispatch<SetStateAction<EditableFaqItem[]>>;
  onBack: () => void;
  onContinue: () => void;
} & StudioSectionEditorProps;

/**
 * Same list + expand-to-edit-panel pattern as every other module_items
 * editor this batch. metadata.enabled is the one thing unique to FAQ/
 * Custom Pages - a visible toggle in the list AND in the edit panel, both
 * writing to the same client-held item, so it round-trips through Save
 * exactly like every other field (see saveFaq's own comment).
 */
export function FaqStep({ tenantId, faq, setFaq, onBack, onContinue, onDirty, onSaved, registerSave, locale }: FaqStepProps) {
  const { t } = createTranslator(locale);
  const [state, setState] = useState<SaveFaqState>(initialState);
  const [pending, setPending] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  function update(id: string, patch: Partial<EditableFaqItem>) {
    onDirty();
    setFaq((items) => items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function move(id: string, direction: -1 | 1) {
    setFaq((items) => {
      const index = items.findIndex((it) => it.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= items.length) return items;
      const next = [...items];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function handleAdd() {
    const item = blankFaqItem();
    setFaq((items) => [...items, item]);
    persistNewItemStub(tenantId, "faq", item.id, faq.length);
    setEditId(item.id);
  }

  function handleRemove(id: string) {
    setFaq((items) => items.filter((it) => it.id !== id));
    persistItemRemoval(tenantId, id);
    if (editId === id) setEditId(null);
  }

  async function handleSave(): Promise<boolean> {
    const formData = new FormData();
    formData.set("locale", locale);
    formData.set("tenantId", tenantId);
    formData.set("items", JSON.stringify(faq));
    const ids = faq.map((f) => f.id);
    setPending(true);
    const result = await enqueueItemsOp(ids, () => saveFaq(initialState, formData));
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

  const editing = editId ? (faq.find((f) => f.id === editId) ?? null) : null;

  return (
    <div className="max-w-2xl">
      <StudioHeading>{t("flow", "faqStepTitle")}</StudioHeading>
      <StudioIntro>{t("flow", "faqStepBody")}</StudioIntro>

      <div className="space-y-2 mb-4">
        {faq.map((item, i) => {
          const isEditing = editId === item.id;
          return (
            <div
              key={item.id}
              className="group flex items-center gap-3 rounded-2xl p-4 border bg-white transition-all"
              style={{
                borderColor: isEditing ? `${GUEST_BASE_PALETTE.forest}4d` : `${GUEST_BASE_PALETTE.sand}80`,
                opacity: item.enabled ? 1 : 0.55,
              }}
            >
              <div className="flex flex-col gap-0.5 flex-shrink-0">
                <button type="button" onClick={() => move(item.id, -1)} disabled={i === 0} className={`text-[10px] disabled:opacity-20 ${STUDIO_HIT_SQUARE_CLASS}`} style={{ color: GUEST_BASE_PALETTE.mist }}>
                  ▲
                </button>
                <button type="button" onClick={() => move(item.id, 1)} disabled={i === faq.length - 1} className={`text-[10px] disabled:opacity-20 ${STUDIO_HIT_SQUARE_CLASS}`} style={{ color: GUEST_BASE_PALETTE.mist }}>
                  ▼
                </button>
              </div>
              <p className="flex-1 min-w-0 text-[13px] font-medium truncate" style={{ color: GUEST_BASE_PALETTE.forest }}>
                {item.question || t("flow", "untitledQuestion")}
              </p>
              {!item.enabled && (
                <span className="text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wide font-medium flex-shrink-0" style={{ background: `${GUEST_BASE_PALETTE.sand}80`, color: GUEST_BASE_PALETTE.dusk }}>
                  {t("common", "disabled")}
                </span>
              )}
              <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button type="button" onClick={() => setEditId(isEditing ? null : item.id)} className="text-[11px] px-2.5 py-1 rounded-lg border" style={{ color: GUEST_BASE_PALETTE.forest, borderColor: "rgba(45,74,62,0.2)" }}>
                  {t("common", "edit")}
                </button>
                <button type="button" onClick={() => handleRemove(item.id)} className="text-[11px] px-2.5 py-1 rounded-lg border" style={{ color: GUEST_BASE_PALETTE.mist, borderColor: `${GUEST_BASE_PALETTE.sand}80` }}>
                  {t("common", "remove")}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {faq.length === 0 && (
        <div className="mb-4">
          <EmptyState title={t("flow", "noQuestionsYet")} body={t("flow", "noQuestionsBody")} />
        </div>
      )}

      <button
        type="button"
        onClick={handleAdd}
        className="w-full border-2 border-dashed rounded-2xl py-3 text-[12px] font-medium transition-all mb-4"
        style={{ borderColor: `${GUEST_BASE_PALETTE.sand}99`, color: GUEST_BASE_PALETTE.mist }}
      >
        + {t("flow", "addQuestion")}
      </button>

      {editing && (
        <div className="rounded-2xl border p-5" style={{ background: GUEST_BASE_PALETTE.parchmentDeep, borderColor: "rgba(45,74,62,0.15)" }}>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[14px] font-semibold" style={{ color: GUEST_BASE_PALETTE.forest }}>
              {t("flow", "editQuestion")}
            </h4>
            <button type="button" onClick={() => setEditId(null)} className={`text-[11px] ${STUDIO_HIT_ROW_CLASS}`} style={{ color: GUEST_BASE_PALETTE.mist }}>
              {t("common", "done")}
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <StudioField label={t("common", "question")}>
                <input value={editing.question} onChange={(e) => update(editing.id, { question: e.target.value })} placeholder={t("flow", "questionPlaceholder")} className={STUDIO_INPUT_CLASS} />
              </StudioField>
            </div>
            <div>
              <StudioField label={t("common", "answer")}>
                <textarea value={editing.answer ?? ""} onChange={(e) => update(editing.id, { answer: e.target.value || null })} rows={3} className={`${STUDIO_INPUT_CLASS} resize-none`} />
              </StudioField>
            </div>
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

      <div className="mt-8 flex gap-3 items-center">
        <button type="button" onClick={onBack} className="rounded-full border border-idw-forest/20 text-idw-forest text-sm font-semibold uppercase tracking-wide px-6 py-3">
          {t("common", "back")}
        </button>
        <button type="button" disabled={pending} onClick={handleSave} className="rounded-full bg-idw-forest text-idw-parchment text-sm font-semibold uppercase tracking-wide px-6 py-3 disabled:opacity-60">
          {pending ? t("common", "savingNow") : t("studio", "saveSection", { section: t("flow", "faq") })}
        </button>
        <button type="button" onClick={onContinue} className="text-xs font-semibold uppercase tracking-wide text-idw-forest/50 hover:text-idw-forest relative after:content-[''] after:absolute after:-inset-x-2 after:top-1/2 after:-translate-y-1/2 after:h-11">
          {t("common", "next")} <ForwardArrow />
        </button>
      </div>
    </div>
  );
}
