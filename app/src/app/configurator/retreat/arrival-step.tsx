"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { ArrivalInfo } from "@/lib/modules/arrival";
import { EmptyState } from "@/components/studio/empty-state";
import { STUDIO_INPUT_CLASS, StudioField, StudioLabel, StudioSectionSub, StudioHeading, StudioIntro } from "./studio-ui";
import { saveArrivalInfo, type SaveArrivalInfoState } from "./actions";
import { useRegisteredSave, type StudioSectionEditorProps } from "./studioSection";

import { createTranslator, type Locale } from "@/lib/i18n";
import { GUEST_BASE_PALETTE } from "@/lib/theme/tokens";
import { ForwardArrow } from "./studio-ui";
const initialState: SaveArrivalInfoState = { error: null };

export type ArrivalStepProps = {
  tenantId: string;
  info: ArrivalInfo;
  setInfo: Dispatch<SetStateAction<ArrivalInfo>>;
  /** TASK 029 (decision B): takes the organizer to the canonical editor
   * for the two fields this step no longer edits. */
  onOpenHome: () => void;
  onBack: () => void;
  onContinue: () => void;
} & StudioSectionEditorProps;

function Field({
  label,
  value,
  onChange,
  placeholder,
  textarea,
  rows = 2,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
  textarea?: boolean;
  rows?: number;
}) {
  return (
    <div>
      <StudioField label={label}>
        {textarea ? (
          <textarea
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            placeholder={placeholder}
            rows={rows}
            className={`${STUDIO_INPUT_CLASS} resize-none`}
          />
        ) : (
          <input value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} placeholder={placeholder} className={STUDIO_INPUT_CLASS} />
        )}
      </StudioField>
    </div>
  );
}

/**
 * TASK 029 (decision B): the two fields that moved to Retreat Home.
 *
 * This is deliberately NOT an input. Welcome and What to Bring are now
 * owned by Retreat Home, and showing a second editable copy here is
 * exactly the "two independent editors for one piece of content" D3
 * forbids - an organizer would have no way to know which one a guest
 * sees.
 *
 * What it does instead: say where the field lives now, show whatever
 * this Space already has stored (read-only, so nothing looks lost), and
 * link to the editor that owns it. The stored value is NOT deleted and
 * NOT migrated - the Guest App still reads it as the fallback until the
 * organizer saves a canonical one, which is what makes this safe to ship
 * to Spaces that filled these in years ago.
 */
function MovedToHome({
  label,
  legacyValue,
  onOpenHome,
  locale,
}: {
  label: string;
  legacyValue: string | null;
  onOpenHome: () => void;
  locale: Locale;
}) {
  const { t } = createTranslator(locale);
  return (
    <div
      className="rounded-xl border px-3.5 py-3"
      style={{ background: `${GUEST_BASE_PALETTE.sand}1f`, borderColor: `${GUEST_BASE_PALETTE.sand}99` }}
    >
      <StudioLabel>{label}</StudioLabel>
      <p className="text-[12px] leading-relaxed" style={{ color: GUEST_BASE_PALETTE.forest }}>
        {t("flow", "managedInRetreatHomeBody")}
      </p>
      {legacyValue ? (
        <p
          dir="auto"
          className="text-[12.5px] mt-2 whitespace-pre-line rounded-lg bg-white/70 px-3 py-2"
          style={{ color: GUEST_BASE_PALETTE.dusk }}
        >
          {legacyValue}
        </p>
      ) : null}
      <button
        type="button"
        onClick={onOpenHome}
        className="mt-2.5 text-[11px] font-semibold uppercase tracking-wide underline"
        style={{ color: GUEST_BASE_PALETTE.forest }}
      >
        {t("flow", "openRetreatHome")}
      </button>
    </div>
  );
}

/**
 * Studio Completion pass - ported from the Figma Make source's
 * ArrivalEditorScreen: grouped sections (Arrival Basics / Location /
 * Preparing for Arrival / Contact) instead of one flat stack of fields.
 * Still a single structured form persisting to module_settings, exactly
 * as before - purely a visual restyle.
 */
export function ArrivalStep({
  tenantId,
  info,
  setInfo,
  onOpenHome,
  onBack,
  onContinue,
  onDirty,
  onSaved,
  registerSave,
  locale,
}: ArrivalStepProps) {
  const { t } = createTranslator(locale);
  const [state, setState] = useState<SaveArrivalInfoState>(initialState);
  const [pending, setPending] = useState(false);

  function set<K extends keyof ArrivalInfo>(key: K, value: ArrivalInfo[K]) {
    onDirty();
    setInfo((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(): Promise<boolean> {
    const formData = new FormData();
    formData.set("locale", locale);
    formData.set("tenantId", tenantId);
    formData.set("data", JSON.stringify(info));
    setPending(true);
    const result = await saveArrivalInfo(initialState, formData);
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

  return (
    <div className="max-w-xl">
      <StudioHeading>{t("flow", "arrivalStepTitle")}</StudioHeading>
      <StudioIntro>
        {t("flow", "arrivalStepBody")}
      </StudioIntro>

      {Object.values(info).every((v) => !v) && (
        <div className="mb-6">
          <EmptyState
            title={t("flow", "noArrivalInfoYet")}
            body={t("flow", "noArrivalInfoBody")}
          />
        </div>
      )}

      <StudioSectionSub first>{t("flow", "arrivalBasics")}</StudioSectionSub>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t("flow", "checkIn")} value={info.checkInTime} onChange={(v) => set("checkInTime", v)} placeholder="e.g. 14:00" />
        <Field label={t("flow", "checkOut")} value={info.checkOutTime} onChange={(v) => set("checkOutTime", v)} placeholder="e.g. 11:00" />
        <div className="col-span-2">
          <MovedToHome
            label={t("flow", "welcomeMessageOptional")}
            legacyValue={info.welcomeMessage}
            onOpenHome={onOpenHome}
            locale={locale}
          />
        </div>
      </div>

      <StudioSectionSub>{t("common", "location")}</StudioSectionSub>
      <div className="space-y-4">
        <Field label={t("common", "address")} value={info.address} onChange={(v) => set("address", v)} textarea placeholder={t("flow", "addressPlaceholder")} />
        <Field label={t("flow", "mapsLinkOptional")} value={info.mapUrl} onChange={(v) => set("mapUrl", v)} placeholder="https://maps.apple.com/..." />
      </div>

      <StudioSectionSub>{t("flow", "preparingForArrival")}</StudioSectionSub>
      <div className="space-y-4">
        <Field label={t("flow", "gettingHere")} value={info.transportationInfo} onChange={(v) => set("transportationInfo", v)} textarea rows={3} placeholder={t("flow", "gettingHerePlaceholder")} />
        <Field label={t("flow", "onArrival")} value={info.arrivalInstructions} onChange={(v) => set("arrivalInstructions", v)} textarea placeholder={t("flow", "onArrivalPlaceholder")} />
        <MovedToHome
          label={t("flow", "whatToBring")}
          legacyValue={info.whatToBring}
          onOpenHome={onOpenHome}
          locale={locale}
        />
        <Field label={t("flow", "importantNotes")} value={info.importantNotes} onChange={(v) => set("importantNotes", v)} textarea rows={3} placeholder={t("flow", "importantNotesPlaceholder")} />
      </div>

      <StudioSectionSub>{t("common", "contact")}</StudioSectionSub>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label={t("flow", "contactName")} value={info.contactName} onChange={(v) => set("contactName", v)} placeholder={t("flow", "contactNamePlaceholder")} />
        <Field label={t("flow", "phoneNumber")} value={info.contactPhone} onChange={(v) => set("contactPhone", v)} placeholder="+66 77 123 456" />
        <Field label={t("flow", "whatsappNumber")} value={info.contactWhatsapp} onChange={(v) => set("contactWhatsapp", v)} placeholder="+66 87 123 456" />
      </div>

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
          {pending ? t("common", "savingNow") : t("studio", "saveSection", { section: t("flow", "moduleArrivalInfo") })}
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
