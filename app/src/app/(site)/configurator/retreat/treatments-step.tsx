"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { ModuleItemPhotoField } from "@/components/module-item-photo-field";
import { FocalPointPicker } from "@/components/focal-point-picker";
import { objectPositionStyle } from "@/lib/modules/imagePosition";
import { persistNewItemStub, persistItemRemoval, enqueueItemsOp } from "@/lib/modules/persistItem";
import { CHARGE_TYPES, type ChargeType, type EditableTreatment } from "@/lib/modules/treatment";
import { GUEST_BASE_PALETTE } from "@/lib/theme/tokens";
import { STUDIO_HIT_ROW_CLASS, STUDIO_INPUT_CLASS, StudioField, StudioHeading, StudioIntro, StudioLabel } from "./studio-ui";
import { EmptyState } from "@/components/studio/empty-state";
import { saveTreatments, type SaveTreatmentsState } from "./actions";
import { useRegisteredSave, type StudioSectionEditorProps } from "./studioSection";

import { createTranslator } from "@/lib/i18n";
import { ForwardArrow } from "./studio-ui";
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
    imagePosition: null,
    price: null,
    currency: null,
    chargeType: null,
    availability: null,
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
export function TreatmentsStep({ tenantId, treatments, setTreatments, onBack, onContinue, onDirty, onSaved, registerSave, locale }: TreatmentsStepProps) {
  const { t } = createTranslator(locale);
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
    formData.set("locale", locale);
    formData.set("tenantId", tenantId);
    formData.set(
      "items",
      JSON.stringify(
        treatments.map(
          ({
            id,
            name,
            shortDescription,
            description,
            durationMinutes,
            imageRef,
            provider,
            location,
            bookingInfo,
            imagePosition,
            price,
            currency,
            chargeType,
            availability,
          }) => ({
            id,
            name,
            shortDescription,
            description,
            durationMinutes,
            imageRef,
            provider,
            location,
            bookingInfo,
            imagePosition,
            price,
            currency,
            chargeType,
            availability,
          })
        )
      )
    );
    const ids = treatments.map((item) => item.id);
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

  const editing = editId ? (treatments.find((item) => item.id === editId) ?? null) : null;
  const editIdx = editing ? treatments.indexOf(editing) : -1;

  return (
    <div className="max-w-2xl">
      <StudioHeading>{t("flow", "treatmentsAndExtras")}</StudioHeading>
      <StudioIntro>
        {t("flow", "treatmentsStepBody")}
      </StudioIntro>

      <div className="space-y-3 mb-4">
        {treatments.map((item) => {
          const isEditing = editId === item.id;
          return (
            <div
              key={item.id}
              className="group flex items-center gap-4 rounded-2xl border overflow-hidden bg-white transition-all"
              style={{
                borderColor: isEditing ? `${GUEST_BASE_PALETTE.forest}4d` : `${GUEST_BASE_PALETTE.sand}80`,
                boxShadow: isEditing ? "0 1px 3px rgba(45,74,62,0.08)" : "none",
              }}
            >
              <div className="w-20 h-20 flex-shrink-0" style={{ background: GUEST_BASE_PALETTE.parchmentDeep }}>
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-full h-full object-cover"
                    style={{ objectPosition: objectPositionStyle(item.imagePosition) }}
                  />
                ) : null}
              </div>
              <div className="flex-1 py-3 min-w-0 pr-3">
                <div className="flex items-baseline gap-2 mb-0.5">
                  {item.durationMinutes && (
                    <span className="text-[11px] font-medium relative after:content-[''] after:absolute after:-inset-x-2 after:top-1/2 after:-translate-y-1/2 after:h-11" style={{ color: GUEST_BASE_PALETTE.clay }}>
                      {item.durationMinutes} min
                    </span>
                  )}
                </div>
                <p className="text-[13px] font-medium truncate" style={{ color: GUEST_BASE_PALETTE.forest }}>
                  {item.name || t("flow", "untitledTreatment")}
                </p>
                <p className="text-[11px] mt-0.5 truncate" style={{ color: GUEST_BASE_PALETTE.mist }}>
                  {[item.location, item.bookingInfo].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex flex-col gap-1.5 pr-4 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setEditId(isEditing ? null : item.id)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${STUDIO_HIT_ROW_CLASS}`}
                  style={{ color: GUEST_BASE_PALETTE.forest, borderColor: "rgba(45,74,62,0.2)" }}
                >
                  {t("common", "edit")}
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(item.id)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${STUDIO_HIT_ROW_CLASS}`}
                  style={{ color: GUEST_BASE_PALETTE.mist, borderColor: `${GUEST_BASE_PALETTE.sand}80` }}
                >
                  {t("common", "remove")}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {treatments.length === 0 && (
        <div className="mb-4">
          <EmptyState title={t("flow", "noTreatmentsYet")} body={t("flow", "noTreatmentsBody")} />
        </div>
      )}

      <button
        type="button"
        onClick={handleAdd}
        className="w-full border-2 border-dashed rounded-2xl py-3 text-[12px] font-medium transition-all mb-4"
        style={{ borderColor: `${GUEST_BASE_PALETTE.sand}99`, color: GUEST_BASE_PALETTE.mist }}
      >
        + {t("flow", "addTreatment")}
      </button>

      {editing && (
        <div className="rounded-2xl border p-5" style={{ background: GUEST_BASE_PALETTE.parchmentDeep, borderColor: "rgba(45,74,62,0.15)" }}>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[14px] font-semibold" style={{ color: GUEST_BASE_PALETTE.forest }}>
              {t("studio", "editingItem", { name: editing.name || t("flow", "untitledTreatment") })}
            </h4>
            <button type="button" onClick={() => setEditId(null)} className={`text-[11px] ${STUDIO_HIT_ROW_CLASS}`} style={{ color: GUEST_BASE_PALETTE.mist }}>
              {t("common", "done")}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <ModuleItemPhotoField
                locale={locale}
                tenantId={tenantId}
                moduleKey="treatments"
                itemId={editing.id}
                title={editing.name}
                subtitle={editing.shortDescription}
                description={editing.description}
                sortOrder={editIdx}
                imageRef={editing.imageRef}
                imageUrl={editing.imageUrl}
                onChange={(patch) => update(editing.id, { ...patch, imagePosition: null })}
                previewAspect="39/20"
                previewPosition={objectPositionStyle(editing.imagePosition)}
                ratioHint={t("studio", "photoLandscape2to1")}
              />
              {editing.imageUrl && (
                <FocalPointPicker
                  locale={locale}
                  imageUrl={editing.imageUrl}
                  position={editing.imagePosition}
                  onChange={(imagePosition) => update(editing.id, { imagePosition })}
                  aspect="39/20"
                  label={t("studio", "coverImage")}
                />
              )}
            </div>
            <div className="col-span-2 space-y-3">
              <div>
                <StudioField label={t("flow", "treatmentName")}>
                  <input
                    value={editing.name}
                    onChange={(e) => update(editing.id, { name: e.target.value })}
                    placeholder={t("flow", "treatmentNamePlaceholder")}
                    className={STUDIO_INPUT_CLASS}
                  />
                </StudioField>
              </div>
              <div>
                <StudioField label={t("flow", "shortDescription")}>
                  <input
                    value={editing.shortDescription ?? ""}
                    onChange={(e) => update(editing.id, { shortDescription: e.target.value || null })}
                    placeholder={t("flow", "shortDescriptionPlaceholder")}
                    className={STUDIO_INPUT_CLASS}
                  />
                </StudioField>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <StudioField label={t("flow", "durationMinutes")}>
                    <input
                      type="number"
                      min={1}
                      value={editing.durationMinutes ?? ""}
                      onChange={(e) => update(editing.id, { durationMinutes: e.target.value ? Number(e.target.value) : null })}
                      placeholder="90"
                      className={STUDIO_INPUT_CLASS}
                    />
                  </StudioField>
                </div>
                <div>
                  <StudioField label={t("flow", "practitioner")}>
                    <input
                      value={editing.provider ?? ""}
                      onChange={(e) => update(editing.id, { provider: e.target.value || null })}
                      placeholder={t("common", "optional")}
                      className={STUDIO_INPUT_CLASS}
                    />
                  </StudioField>
                </div>
                <div>
                  <StudioField label={t("common", "location")}>
                    <input
                      value={editing.location ?? ""}
                      onChange={(e) => update(editing.id, { location: e.target.value || null })}
                      placeholder={t("flow", "treatmentLocationPlaceholder")}
                      className={STUDIO_INPUT_CLASS}
                    />
                  </StudioField>
                </div>
                <div>
                  <StudioField label={t("flow", "bookingInfo")}>
                    <input
                      value={editing.bookingInfo ?? ""}
                      onChange={(e) => update(editing.id, { bookingInfo: e.target.value || null })}
                      placeholder={t("flow", "bookingInfoPlaceholder")}
                      className={STUDIO_INPUT_CLASS}
                    />
                  </StudioField>
                </div>
              </div>

              {/* TASK 029 (D1) - what it costs and when it can be had.
                  Retreat-item pricing only: nothing here is connected to
                  InnerDweS billing, Stripe or any checkout. */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <StudioLabel>{t("flow", "price")}</StudioLabel>
                  <input
                    aria-label={t("flow", "price")}
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    value={editing.price ?? ""}
                    onChange={(e) => update(editing.id, { price: e.target.value ? Number(e.target.value) : null })}
                    placeholder={t("flow", "pricePlaceholder")}
                    className={STUDIO_INPUT_CLASS}
                  />
                </div>
                <div>
                  <StudioLabel>{t("flow", "currency")}</StudioLabel>
                  <input
                    aria-label={t("flow", "currency")}
                    value={editing.currency ?? ""}
                    onChange={(e) => update(editing.id, { currency: e.target.value.toUpperCase() || null })}
                    placeholder={t("flow", "currencyPlaceholder")}
                    maxLength={8}
                    className={STUDIO_INPUT_CLASS}
                  />
                </div>
                <div>
                  <StudioLabel>{t("flow", "chargeType")}</StudioLabel>
                  <select
                    aria-label={t("flow", "chargeType")}
                    value={editing.chargeType ?? ""}
                    onChange={(e) =>
                      update(editing.id, { chargeType: (e.target.value || null) as ChargeType | null })
                    }
                    className={STUDIO_INPUT_CLASS}
                  >
                    <option value="">{t("flow", "chargeNotSet")}</option>
                    {CHARGE_TYPES.map((value) => (
                      <option key={value} value={value}>
                        {value === "included" ? t("flow", "chargeIncluded") : t("flow", "chargeAdditional")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <StudioLabel>{t("flow", "availability")}</StudioLabel>
                <input
                  aria-label={t("flow", "availability")}
                  value={editing.availability ?? ""}
                  onChange={(e) => update(editing.id, { availability: e.target.value || null })}
                  placeholder={t("flow", "availabilityPlaceholder")}
                  maxLength={200}
                  className={STUDIO_INPUT_CLASS}
                  dir="auto"
                />
              </div>
              <div>
                <StudioField label={t("flow", "fullDescription")}>
                  <textarea
                    value={editing.description ?? ""}
                    onChange={(e) => update(editing.id, { description: e.target.value || null })}
                    placeholder={t("flow", "fullDescriptionPlaceholder")}
                    rows={2}
                    className={`${STUDIO_INPUT_CLASS} resize-none`}
                  />
                </StudioField>
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
          {pending ? t("common", "savingNow") : t("studio", "saveSection", { section: t("flow", "treatments") })}
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="text-xs font-semibold uppercase tracking-wide text-idw-forest/50 hover:text-idw-forest relative after:content-[''] after:absolute after:-inset-x-2 after:top-1/2 after:-translate-y-1/2 after:h-11"
        >
          {t("common", "next")} <ForwardArrow />
        </button>
      </div>
    </div>
  );
}
