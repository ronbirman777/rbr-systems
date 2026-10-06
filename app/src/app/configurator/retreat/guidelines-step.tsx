"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { persistNewItemStub, persistItemRemoval, enqueueItemsOp } from "@/lib/modules/persistItem";
import { GUIDELINES_KEY, type EditableGuideline } from "@/lib/modules/guideline";
import { GUEST_BASE_PALETTE } from "@/lib/theme/tokens";
import { STUDIO_INPUT_CLASS, StudioLabel, StudioHeading, StudioIntro, ForwardArrow } from "./studio-ui";
import { EmptyState } from "@/components/studio/empty-state";
import { saveGuidelines, type SaveGuidelinesState } from "./actions";
import { useRegisteredSave, type StudioSectionEditorProps } from "./studioSection";
import { createTranslator } from "@/lib/i18n";

const initialState: SaveGuidelinesState = { error: null };

export function blankGuideline(): EditableGuideline {
  return { id: crypto.randomUUID(), title: "", description: null };
}

export type GuidelinesStepProps = {
  tenantId: string;
  guidelines: EditableGuideline[];
  setGuidelines: Dispatch<SetStateAction<EditableGuideline[]>>;
  onBack: () => void;
  onContinue: () => void;
} & StudioSectionEditorProps;

/**
 * Guidelines (TASK 029, P5).
 *
 * Deliberately the plainest editor in the Studio: a reorderable list of
 * a heading and a paragraph, with no photo, no enable toggle per item and
 * no metadata. House rules are short, ordered and few - anything more
 * would be a Custom Page, which already exists.
 *
 * Reorder is the stored order: `sort_order` is assigned from the array
 * index on save, exactly like every other list module here.
 */
export function GuidelinesStep({
  tenantId,
  guidelines,
  setGuidelines,
  onBack,
  onContinue,
  onDirty,
  onSaved,
  registerSave,
  locale,
}: GuidelinesStepProps) {
  const { t } = createTranslator(locale);
  const [state, setState] = useState<SaveGuidelinesState>(initialState);
  const [pending, setPending] = useState(false);

  function update(id: string, patch: Partial<EditableGuideline>) {
    onDirty();
    setGuidelines((items) => items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function handleAdd() {
    const item = blankGuideline();
    setGuidelines((items) => [...items, item]);
    persistNewItemStub(tenantId, GUIDELINES_KEY, item.id, guidelines.length);
    onDirty();
  }

  function handleRemove(id: string) {
    setGuidelines((items) => items.filter((it) => it.id !== id));
    persistItemRemoval(tenantId, id);
  }

  function move(id: string, delta: -1 | 1) {
    onDirty();
    setGuidelines((items) => {
      const i = items.findIndex((it) => it.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= items.length) return items;
      const next = [...items];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }

  async function handleSave(): Promise<boolean> {
    const formData = new FormData();
    formData.set("locale", locale);
    formData.set("tenantId", tenantId);
    formData.set(
      "items",
      JSON.stringify(guidelines.map(({ id, title, description }) => ({ id, title, description })))
    );
    const ids = guidelines.map((g) => g.id);
    setPending(true);
    const result = await enqueueItemsOp(ids, () => saveGuidelines(initialState, formData));
    setPending(false);
    setState(result);
    // A failed save must NOT clear the guard - see every sibling editor.
    if (result.error) return false;
    onSaved();
    return true;
  }

  useRegisteredSave(registerSave, handleSave);

  return (
    <div className="max-w-2xl">
      <StudioHeading>{t("flow", "guidelinesStepTitle")}</StudioHeading>
      <StudioIntro>{t("flow", "guidelinesStepBody")}</StudioIntro>

      {guidelines.length === 0 && (
        <div className="mb-4">
          <EmptyState title={t("flow", "noGuidelinesYet")} body={t("flow", "noGuidelinesBody")} />
        </div>
      )}

      <div className="space-y-3 mb-4">
        {guidelines.map((g, i) => (
          <div
            key={g.id}
            className="rounded-2xl border bg-white p-4"
            style={{ borderColor: `${GUEST_BASE_PALETTE.sand}80` }}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 space-y-3 min-w-0">
                <div>
                  <StudioLabel>{t("common", "title")}</StudioLabel>
                  <input
                    aria-label={t("common", "title")}
                    value={g.title}
                    onChange={(e) => update(g.id, { title: e.target.value })}
                    placeholder={t("flow", "guidelineTitlePlaceholder")}
                    maxLength={160}
                    className={STUDIO_INPUT_CLASS}
                    dir="auto"
                  />
                </div>
                <div>
                  <StudioLabel>{t("common", "description")}</StudioLabel>
                  <textarea
                    aria-label={t("common", "description")}
                    value={g.description ?? ""}
                    onChange={(e) => update(g.id, { description: e.target.value || null })}
                    placeholder={t("flow", "guidelineDescriptionPlaceholder")}
                    rows={2}
                    maxLength={2000}
                    className={`${STUDIO_INPUT_CLASS} resize-none`}
                    dir="auto"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => move(g.id, -1)}
                  disabled={i === 0}
                  aria-label={t("studio", "moveUp")}
                  className="w-9 h-9 rounded-lg border text-[13px] disabled:opacity-30"
                  style={{ color: GUEST_BASE_PALETTE.forest, borderColor: `${GUEST_BASE_PALETTE.sand}80` }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(g.id, 1)}
                  disabled={i === guidelines.length - 1}
                  aria-label={t("studio", "moveDown")}
                  className="w-9 h-9 rounded-lg border text-[13px] disabled:opacity-30"
                  style={{ color: GUEST_BASE_PALETTE.forest, borderColor: `${GUEST_BASE_PALETTE.sand}80` }}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(g.id)}
                  className="w-9 h-9 rounded-lg border text-[11px]"
                  style={{ color: GUEST_BASE_PALETTE.mist, borderColor: `${GUEST_BASE_PALETTE.sand}80` }}
                >
                  ✕<span className="sr-only">{t("common", "remove")}</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleAdd}
        className="w-full border-2 border-dashed rounded-2xl py-3 text-[12px] font-medium transition-all mb-4"
        style={{ borderColor: `${GUEST_BASE_PALETTE.sand}99`, color: GUEST_BASE_PALETTE.mist }}
      >
        + {t("flow", "addGuideline")}
      </button>

      {state.error && (
        <p className="text-sm text-red-700 mt-4" role="alert">
          {state.error}
        </p>
      )}

      <div className="mt-8 flex flex-wrap gap-3 items-center">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-idw-forest/20 text-idw-forest text-sm font-semibold uppercase tracking-wide px-6 py-3"
        >
          {t("common", "back")}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="rounded-full bg-idw-forest text-idw-parchment text-sm font-semibold uppercase tracking-wide px-6 py-3 disabled:opacity-60"
        >
          {pending ? t("common", "savingNow") : t("studio", "saveSection", { section: t("flow", "guidelines") })}
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="text-xs font-semibold uppercase tracking-wide text-idw-forest/50 hover:text-idw-forest"
        >
          {t("common", "next")} <ForwardArrow />
        </button>
      </div>
    </div>
  );
}
