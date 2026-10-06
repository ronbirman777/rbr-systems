"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { ModuleItemPhotoField } from "@/components/module-item-photo-field";
import { FocalPointPicker } from "@/components/focal-point-picker";
import { objectPositionStyle } from "@/lib/modules/imagePosition";
import { persistNewItemStub, persistItemRemoval, enqueueItemsOp } from "@/lib/modules/persistItem";
import { MEAL_TYPES, type EditableMeal, type MealType, mealTypeLabel } from "@/lib/modules/meal";
import { GUEST_BASE_PALETTE } from "@/lib/theme/tokens";
import { STUDIO_INPUT_CLASS, StudioLabel, StudioHeading, StudioIntro } from "./studio-ui";
import { EmptyState } from "@/components/studio/empty-state";
import { saveMeals, saveModuleIntros, type SaveMealsState } from "./actions";
import { pruneModuleIntros, type ModuleIntros } from "@/lib/modules/moduleIntro";
import { useRegisteredSave, type StudioSectionEditorProps } from "./studioSection";

import { createTranslator } from "@/lib/i18n";
import { ForwardArrow } from "./studio-ui";
const initialState: SaveMealsState = { error: null };

export function blankMeal(): EditableMeal {
  return {
    id: crypto.randomUUID(),
    name: "",
    mealType: "breakfast",
    startTime: "08:00",
    endTime: null,
    description: null,
    imageRef: null,
    imageUrl: null,
    dietaryTags: [],
    location: null,
    imagePosition: null,
  };
}

export type MealsStepProps = {
  tenantId: string;
  meals: EditableMeal[];
  setMeals: Dispatch<SetStateAction<EditableMeal[]>>;
  /**
   * TASK 029 (P3A): the module-level introduction. It is NOT a property
   * of any one meal, so it is not in `meals` - it lives in the generic
   * `moduleIntros` settings object, which is why this prop is the whole
   * record rather than a single string. Facilities or Treatments getting
   * an introduction later needs no new prop here and no migration.
   */
  moduleIntros: ModuleIntros;
  setModuleIntros: Dispatch<SetStateAction<ModuleIntros>>;
  onBack: () => void;
  onContinue: () => void;
} & StudioSectionEditorProps;

/**
 * Studio Completion pass - ported from the Figma Make source's
 * MealsEditorScreen, explicitly documented there as the reused pattern
 * for Treatments and Facilities too (see treatments-step.tsx,
 * facilities-step.tsx - same list-with-thumbnail + expand-to-edit-panel
 * structure, same field set adapted per module). Same underlying state/
 * persistence (meals/setMeals/update, persistItemRemoval/
 * persistNewItemStub, saveMeals via enqueueItemsOp) as before - a visual/
 * interaction restyle, not a data-model change.
 */
export function MealsStep({
  tenantId,
  meals,
  setMeals,
  moduleIntros,
  setModuleIntros,
  onBack,
  onContinue,
  onDirty,
  onSaved,
  registerSave,
  locale,
}: MealsStepProps) {
  const { t } = createTranslator(locale);
  const [state, setState] = useState<SaveMealsState>(initialState);
  const [pending, setPending] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  function update(id: string, patch: Partial<EditableMeal>) {
    onDirty();
    setMeals((items) => items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function handleAdd() {
    const item = blankMeal();
    setMeals((items) => [...items, item]);
    persistNewItemStub(tenantId, "meals", item.id, meals.length);
    setEditId(item.id);
  }

  function handleRemove(id: string) {
    setMeals((items) => items.filter((it) => it.id !== id));
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
        meals.map(({ id, name, mealType, startTime, endTime, description, imageRef, dietaryTags, location, imagePosition }) => ({
          id,
          name,
          mealType,
          startTime,
          endTime,
          description,
          imageRef,
          dietaryTags,
          location,
          imagePosition,
        }))
      )
    );
    const ids = meals.map((m) => m.id);
    setPending(true);
    // The intro is a separate settings row, so it is a separate write.
    // It goes FIRST: if it fails, the items are left untouched and the
    // section stays dirty, rather than half the step appearing to save.
    const introForm = new FormData();
    introForm.set("locale", locale);
    introForm.set("tenantId", tenantId);
    introForm.set("data", JSON.stringify(pruneModuleIntros(moduleIntros)));
    const introResult = await saveModuleIntros({ error: null }, introForm);
    if (introResult.error) {
      setPending(false);
      setState({ error: introResult.error });
      return false;
    }
    // Queued behind every currently-in-flight write for these items (a
    // stub create, an upload) so Save is always applied after anything
    // already requested for them, and becomes the new queue position so a
    // Remove clicked right after this Save correctly waits for it too -
    // see enqueueItemsOp in persistItem.ts.
    const result = await enqueueItemsOp(ids, () => saveMeals(initialState, formData));
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

  const editing = editId ? (meals.find((m) => m.id === editId) ?? null) : null;
  const editIdx = editing ? meals.indexOf(editing) : -1;

  return (
    <div className="max-w-2xl">
      <StudioHeading>{t("flow", "mealsStepTitle")}</StudioHeading>
      <StudioIntro>
        {t("flow", "mealsStepBody")}
      </StudioIntro>

      {/* TASK 029 (P3A) - the module-level introduction, above the list
          because that is where a guest reads it. */}
      <div className="mb-6">
        <StudioLabel>{t("flow", "mealsIntro")}</StudioLabel>
        <textarea
          aria-label={t("flow", "mealsIntro")}
          value={moduleIntros.meals?.intro ?? ""}
          onChange={(e) => {
            onDirty();
            setModuleIntros((prev) => ({ ...prev, meals: { intro: e.target.value || null } }));
          }}
          placeholder={t("flow", "mealsIntroPlaceholder")}
          rows={2}
          maxLength={1200}
          className={`${STUDIO_INPUT_CLASS} resize-none`}
          dir="auto"
        />
        <p className="text-[11px] mt-1.5" style={{ color: GUEST_BASE_PALETTE.mist }}>
          {t("flow", "mealsIntroHint")}
        </p>
      </div>

      <div className="space-y-3 mb-4">
        {meals.map((m) => {
          const isEditing = editId === m.id;
          return (
            <div
              key={m.id}
              className="group flex items-center gap-4 rounded-2xl border overflow-hidden bg-white transition-all"
              style={{
                borderColor: isEditing ? `${GUEST_BASE_PALETTE.forest}4d` : `${GUEST_BASE_PALETTE.sand}80`,
                boxShadow: isEditing ? "0 1px 3px rgba(45,74,62,0.08)" : "none",
              }}
            >
              <div className="w-20 h-20 flex-shrink-0" style={{ background: GUEST_BASE_PALETTE.parchmentDeep }}>
                {m.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.imageUrl}
                    alt={m.name}
                    className="w-full h-full object-cover"
                    style={{ objectPosition: objectPositionStyle(m.imagePosition) }}
                  />
                ) : null}
              </div>
              <div className="flex-1 py-3 min-w-0 pr-3">
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="text-[10px] tracking-widest uppercase font-semibold" style={{ color: GUEST_BASE_PALETTE.mist }}>
                    {m.mealType}
                  </span>
                  <span className="text-[11px] font-medium" style={{ color: GUEST_BASE_PALETTE.clay }}>
                    {m.startTime}
                  </span>
                </div>
                <p className="text-[13px] font-medium truncate" style={{ color: GUEST_BASE_PALETTE.forest }}>
                  {m.name || t("flow", "untitledMeal")}
                </p>
                <p className="text-[11px] mt-0.5 truncate" style={{ color: GUEST_BASE_PALETTE.mist }}>
                  {[m.location, m.dietaryTags.join(", ")].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex flex-col gap-1.5 pr-4 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setEditId(isEditing ? null : m.id)}
                  className="text-[11px] px-2.5 py-1 rounded-lg border transition-colors"
                  style={{ color: GUEST_BASE_PALETTE.forest, borderColor: "rgba(45,74,62,0.2)" }}
                >
                  {t("common", "edit")}
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(m.id)}
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

      {meals.length === 0 && (
        <div className="mb-4">
          <EmptyState title={t("flow", "noMealsYet")} body={t("flow", "noMealsBody")} />
        </div>
      )}

      <button
        type="button"
        onClick={handleAdd}
        className="w-full border-2 border-dashed rounded-2xl py-3 text-[12px] font-medium transition-all mb-4"
        style={{ borderColor: `${GUEST_BASE_PALETTE.sand}99`, color: GUEST_BASE_PALETTE.mist }}
      >
        + {t("flow", "addMeal")}
      </button>

      {editing && (
        <div className="rounded-2xl border p-5" style={{ background: GUEST_BASE_PALETTE.parchmentDeep, borderColor: "rgba(45,74,62,0.15)" }}>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[14px] font-semibold" style={{ color: GUEST_BASE_PALETTE.forest }}>
              {t("studio", "editingItem", { name: editing.name || t("flow", "untitledMeal") })}
            </h4>
            <button type="button" onClick={() => setEditId(null)} className="text-[11px]" style={{ color: GUEST_BASE_PALETTE.mist }}>
              {t("common", "done")}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <ModuleItemPhotoField
                tenantId={tenantId}
                moduleKey="meals"
                itemId={editing.id}
                title={editing.name}
                description={editing.description}
                sortOrder={editIdx}
                imageRef={editing.imageRef}
                imageUrl={editing.imageUrl}
                onChange={(patch) => update(editing.id, { ...patch, imagePosition: null })}
                previewAspect="39/16"
                previewPosition={objectPositionStyle(editing.imagePosition)}
                ratioHint={t("studio", "photoThumbAndBanner")}
              />
              {editing.imageUrl && (
                <FocalPointPicker
                  locale={locale}
                  imageUrl={editing.imageUrl}
                  position={editing.imagePosition}
                  onChange={(imagePosition) => update(editing.id, { imagePosition })}
                  aspect="39/16"
                  label={`${editing.name || t("flow", "sessionMeal")} photo`}
                />
              )}
            </div>
            <div className="col-span-2 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <StudioLabel>{t("flow", "mealType")}</StudioLabel>
                  <select value={editing.mealType} onChange={(e) => update(editing.id, { mealType: e.target.value as MealType })} className={STUDIO_INPUT_CLASS}>
                    {MEAL_TYPES.map((mealType) => (
                      <option key={mealType} value={mealType}>
                        {mealTypeLabel(mealType, locale)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <StudioLabel>{t("common", "time")}</StudioLabel>
                  <input type="time" value={editing.startTime} onChange={(e) => update(editing.id, { startTime: e.target.value })} className={STUDIO_INPUT_CLASS} />
                </div>
              </div>
              <div>
                <StudioLabel>{t("common", "title")}</StudioLabel>
                <input
                  value={editing.name}
                  onChange={(e) => update(editing.id, { name: e.target.value })}
                  placeholder={t("flow", "mealTitlePlaceholder")}
                  className={STUDIO_INPUT_CLASS}
                />
              </div>
              <div>
                <StudioLabel>{t("common", "location")}</StudioLabel>
                <input
                  value={editing.location ?? ""}
                  onChange={(e) => update(editing.id, { location: e.target.value || null })}
                  placeholder={t("flow", "mealLocationPlaceholder")}
                  className={STUDIO_INPUT_CLASS}
                />
              </div>
              <div>
                <StudioLabel>{t("common", "description")}</StudioLabel>
                <textarea
                  value={editing.description ?? ""}
                  onChange={(e) => update(editing.id, { description: e.target.value || null })}
                  placeholder={t("flow", "mealDescriptionPlaceholder")}
                  rows={2}
                  className={`${STUDIO_INPUT_CLASS} resize-none`}
                />
              </div>
              <div>
                <StudioLabel>{t("flow", "dietaryTags")}</StudioLabel>
                <input
                  value={editing.dietaryTags.join(", ")}
                  onChange={(e) =>
                    update(editing.id, {
                      dietaryTags: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder={t("flow", "dietaryTagsPlaceholder")}
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
          disabled={pending}
          onClick={handleSave}
          className="rounded-full bg-idw-forest text-idw-parchment text-sm font-semibold uppercase tracking-wide px-6 py-3 disabled:opacity-60"
        >
          {pending ? t("common", "savingNow") : t("studio", "saveSection", { section: t("flow", "meals") })}
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
