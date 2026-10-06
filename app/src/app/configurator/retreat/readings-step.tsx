"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { ModuleItemPhotoField } from "@/components/module-item-photo-field";
import { FocalPointPicker } from "@/components/focal-point-picker";
import { objectPositionStyle } from "@/lib/modules/imagePosition";
import { persistNewItemStub, persistItemRemoval, enqueueItemsOp } from "@/lib/modules/persistItem";
import { blankFlowReading, FLOW_READINGS_KEY, type EditableFlowReading } from "@/lib/modules/flowLibrary";
import { readingMinutes } from "@/lib/modules/library";
import { GUEST_BASE_PALETTE } from "@/lib/theme/tokens";
import { STUDIO_INPUT_CLASS, StudioLabel, StudioHeading, StudioIntro, ForwardArrow } from "./studio-ui";
import { EmptyState } from "@/components/studio/empty-state";
import { saveReadings, type SaveReadingsState } from "./actions";
import { useRegisteredSave, type StudioSectionEditorProps } from "./studioSection";
import { createTranslator } from "@/lib/i18n";

const initialState: SaveReadingsState = { error: null };

export type ReadingsStepProps = {
  tenantId: string;
  readings: EditableFlowReading[];
  setReadings: Dispatch<SetStateAction<EditableFlowReading[]>>;
  onBack: () => void;
  onContinue: () => void;
} & StudioSectionEditorProps;

/**
 * Flow Readings (TASK 029, P4).
 *
 * The content model is the shared one (lib/modules/library.ts), the same
 * one Time to Teach's readings use - so a reading's excerpt, category,
 * author and date validate identically in both products. What is Flow's
 * is the module key (`readings`) and this editor's own look, which
 * follows the Flow Studio's list-plus-detail pattern rather than Teach's.
 *
 * `description` is the reading itself. An organizer who would rather
 * link out leaves it empty and fills in the link; both at once is also
 * fine, and the Guest detail screen shows the text with the link under
 * it.
 */
export function ReadingsStep({
  tenantId,
  readings,
  setReadings,
  onBack,
  onContinue,
  onDirty,
  onSaved,
  registerSave,
  locale,
}: ReadingsStepProps) {
  const { t } = createTranslator(locale);
  const [state, setState] = useState<SaveReadingsState>(initialState);
  const [pending, setPending] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  function update(id: string, patch: Partial<EditableFlowReading>) {
    onDirty();
    setReadings((items) => items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function updateMeta(id: string, patch: Partial<EditableFlowReading["metadata"]>) {
    onDirty();
    setReadings((items) => items.map((it) => (it.id === id ? { ...it, metadata: { ...it.metadata, ...patch } } : it)));
  }

  function handleAdd() {
    const item = blankFlowReading();
    setReadings((items) => [...items, item]);
    persistNewItemStub(tenantId, FLOW_READINGS_KEY, item.id, readings.length);
    setEditId(item.id);
  }

  function handleRemove(id: string) {
    setReadings((items) => items.filter((it) => it.id !== id));
    persistItemRemoval(tenantId, id);
    if (editId === id) setEditId(null);
  }

  async function handleSave(): Promise<boolean> {
    const formData = new FormData();
    formData.set("locale", locale);
    formData.set("tenantId", tenantId);
    formData.set(
      "items",
      JSON.stringify(
        readings.map(({ id, title, subtitle, description, externalLink, metadata }) => ({
          id,
          title,
          subtitle,
          description,
          externalLink,
          metadata,
        }))
      )
    );
    const ids = readings.map((r) => r.id);
    setPending(true);
    const result = await enqueueItemsOp(ids, () => saveReadings(initialState, formData));
    setPending(false);
    setState(result);
    // A failed save must NOT clear the guard.
    if (result.error) return false;
    onSaved();
    return true;
  }

  useRegisteredSave(registerSave, handleSave);

  const editing = editId ? (readings.find((r) => r.id === editId) ?? null) : null;
  const editIdx = editing ? readings.indexOf(editing) : -1;

  return (
    <div className="max-w-2xl">
      <StudioHeading>{t("flow", "readingsStepTitle")}</StudioHeading>
      <StudioIntro>{t("flow", "readingsStepBody")}</StudioIntro>

      <div className="space-y-3 mb-4">
        {readings.map((r) => {
          const isEditing = editId === r.id;
          const mins = readingMinutes(r.description);
          return (
            <div
              key={r.id}
              className="group flex items-center gap-4 rounded-2xl border overflow-hidden bg-white transition-all"
              style={{
                borderColor: isEditing ? `${GUEST_BASE_PALETTE.forest}4d` : `${GUEST_BASE_PALETTE.sand}80`,
                boxShadow: isEditing ? "0 1px 3px rgba(45,74,62,0.08)" : "none",
              }}
            >
              <div className="w-20 h-20 flex-shrink-0" style={{ background: GUEST_BASE_PALETTE.parchmentDeep }}>
                {r.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.imageUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    style={{ objectPosition: objectPositionStyle(r.metadata.imagePosition) }}
                  />
                ) : null}
              </div>
              <div className="flex-1 py-3 min-w-0 pr-3">
                {r.metadata.category && (
                  <span className="text-[11px] font-medium" style={{ color: GUEST_BASE_PALETTE.clay }} dir="auto">
                    {r.metadata.category}
                  </span>
                )}
                <p className="text-[13px] font-medium truncate" style={{ color: GUEST_BASE_PALETTE.forest }} dir="auto">
                  {r.title || t("flow", "untitledReading")}
                </p>
                <p className="text-[11px] mt-0.5 truncate" style={{ color: GUEST_BASE_PALETTE.mist }}>
                  {[
                    r.metadata.author,
                    mins ? t("flow", "minutesRead", { count: mins }) : r.externalLink ? t("flow", "externalArticle") : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="flex flex-col gap-1.5 pr-4 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setEditId(isEditing ? null : r.id)}
                  className="text-[11px] px-2.5 py-1 rounded-lg border transition-colors"
                  style={{ color: GUEST_BASE_PALETTE.forest, borderColor: "rgba(45,74,62,0.2)" }}
                >
                  {t("common", "edit")}
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(r.id)}
                  className="text-[11px] px-2.5 py-1 rounded-lg border transition-colors"
                  style={{ color: GUEST_BASE_PALETTE.mist, borderColor: `${GUEST_BASE_PALETTE.sand}80` }}
                >
                  {t("common", "remove")}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {readings.length === 0 && (
        <div className="mb-4">
          <EmptyState title={t("flow", "noReadingsYet")} body={t("flow", "noReadingsBody")} />
        </div>
      )}

      <button
        type="button"
        onClick={handleAdd}
        className="w-full border-2 border-dashed rounded-2xl py-3 text-[12px] font-medium transition-all mb-4"
        style={{ borderColor: `${GUEST_BASE_PALETTE.sand}99`, color: GUEST_BASE_PALETTE.mist }}
      >
        + {t("flow", "addReading")}
      </button>

      {editing && (
        <div
          className="rounded-2xl border p-5"
          style={{ background: GUEST_BASE_PALETTE.parchmentDeep, borderColor: "rgba(45,74,62,0.15)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[14px] font-semibold" style={{ color: GUEST_BASE_PALETTE.forest }} dir="auto">
              {editing.title || t("flow", "untitledReading")}
            </h4>
            <button type="button" onClick={() => setEditId(null)} className="text-[11px]" style={{ color: GUEST_BASE_PALETTE.mist }}>
              {t("common", "done")}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <ModuleItemPhotoField
                locale={locale}
                tenantId={tenantId}
                moduleKey={FLOW_READINGS_KEY}
                itemId={editing.id}
                title={editing.title}
                subtitle={editing.subtitle}
                description={editing.description}
                sortOrder={editIdx}
                imageRef={editing.imageRef}
                imageUrl={editing.imageUrl}
                onChange={(patch) => {
                  update(editing.id, patch);
                  updateMeta(editing.id, { imagePosition: null });
                }}
                previewAspect="13/10"
                previewPosition={objectPositionStyle(editing.metadata.imagePosition)}
                ratioHint={t("studio", "photoVariableHeight")}
              />
              {editing.imageUrl && (
                <FocalPointPicker
                  locale={locale}
                  imageUrl={editing.imageUrl}
                  position={editing.metadata.imagePosition}
                  onChange={(imagePosition) => updateMeta(editing.id, { imagePosition })}
                  aspect="13/10"
                  label={editing.title || t("flow", "untitledReading")}
                />
              )}
            </div>
            <div className="sm:col-span-2 space-y-3">
              <div>
                <StudioLabel>{t("common", "title")}</StudioLabel>
                <input
                  aria-label={t("common", "title")}
                  value={editing.title}
                  onChange={(e) => update(editing.id, { title: e.target.value })}
                  placeholder={t("flow", "readingTitlePlaceholder")}
                  maxLength={160}
                  className={STUDIO_INPUT_CLASS}
                  dir="auto"
                />
              </div>
              <div>
                <StudioLabel>{t("flow", "excerpt")}</StudioLabel>
                <textarea
                  aria-label={t("flow", "excerpt")}
                  value={editing.metadata.excerpt ?? ""}
                  onChange={(e) => updateMeta(editing.id, { excerpt: e.target.value || null })}
                  placeholder={t("flow", "excerptPlaceholder")}
                  rows={2}
                  maxLength={500}
                  className={`${STUDIO_INPUT_CLASS} resize-none`}
                  dir="auto"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <StudioLabel>{t("flow", "author")}</StudioLabel>
                  <input
                    aria-label={t("flow", "author")}
                    value={editing.metadata.author ?? ""}
                    onChange={(e) => updateMeta(editing.id, { author: e.target.value || null })}
                    placeholder={t("flow", "authorPlaceholder")}
                    maxLength={100}
                    className={STUDIO_INPUT_CLASS}
                    dir="auto"
                  />
                </div>
                <div>
                  <StudioLabel>{t("flow", "category")}</StudioLabel>
                  <input
                    aria-label={t("flow", "category")}
                    value={editing.metadata.category ?? ""}
                    onChange={(e) => updateMeta(editing.id, { category: e.target.value || null })}
                    placeholder={t("flow", "categoryPlaceholder")}
                    maxLength={60}
                    className={STUDIO_INPUT_CLASS}
                    dir="auto"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <StudioLabel>{t("flow", "date")}</StudioLabel>
                  <input
                    aria-label={t("flow", "date")}
                    type="date"
                    value={editing.metadata.date ?? ""}
                    onChange={(e) => updateMeta(editing.id, { date: e.target.value || null })}
                    className={STUDIO_INPUT_CLASS}
                  />
                </div>
                <div>
                  <StudioLabel>{t("flow", "pasteLinkOf", { label: t("flow", "externalArticle") })}</StudioLabel>
                  <input
                    value={editing.externalLink ?? ""}
                    onChange={(e) => update(editing.id, { externalLink: e.target.value || null })}
                    placeholder="https://"
                    maxLength={800}
                    className={STUDIO_INPUT_CLASS}
                  />
                </div>
              </div>
              <div>
                <StudioLabel>{t("flow", "readingBody")}</StudioLabel>
                <textarea
                  aria-label={t("flow", "readingBody")}
                  value={editing.description ?? ""}
                  onChange={(e) => update(editing.id, { description: e.target.value || null })}
                  placeholder={t("flow", "readingBodyPlaceholder")}
                  rows={8}
                  maxLength={20000}
                  className={`${STUDIO_INPUT_CLASS} resize-none`}
                  dir="auto"
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
          {pending ? t("common", "savingNow") : t("studio", "saveSection", { section: t("flow", "readings") })}
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
