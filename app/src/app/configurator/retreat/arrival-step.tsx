"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { ArrivalInfo } from "@/lib/modules/arrival";
import { EmptyState } from "@/components/studio/empty-state";
import { STUDIO_INPUT_CLASS, StudioLabel, StudioSectionSub, StudioHeading, StudioIntro } from "./studio-ui";
import { saveArrivalInfo, type SaveArrivalInfoState } from "./actions";
import { useRegisteredSave, type StudioSectionEditorProps } from "./studioSection";

import { createTranslator } from "@/lib/i18n";
import { ForwardArrow } from "./studio-ui";
const initialState: SaveArrivalInfoState = { error: null };

export type ArrivalStepProps = {
  tenantId: string;
  info: ArrivalInfo;
  setInfo: Dispatch<SetStateAction<ArrivalInfo>>;
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
      <StudioLabel>{label}</StudioLabel>
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
export function ArrivalStep({ tenantId, info, setInfo, onBack, onContinue, onDirty, onSaved, registerSave, locale }: ArrivalStepProps) {
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
        Everything guests need before and on arrival. Clear, calm information makes a big difference to first
        impressions.
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
      <div className="grid grid-cols-2 gap-4">
        <Field label={t("flow", "checkIn")} value={info.checkInTime} onChange={(v) => set("checkInTime", v)} placeholder="e.g. 14:00" />
        <Field label={t("flow", "checkOut")} value={info.checkOutTime} onChange={(v) => set("checkOutTime", v)} placeholder="e.g. 11:00" />
        <div className="col-span-2">
          <Field
            label={t("flow", "welcomeMessageOptional")}
            value={info.welcomeMessage}
            onChange={(v) => set("welcomeMessage", v)}
            textarea
            placeholder={t("flow", "welcomeMessagePlaceholder")}
          />
        </div>
      </div>

      <StudioSectionSub>{t("common", "location")}</StudioSectionSub>
      <div className="space-y-4">
        <Field label={t("common", "address")} value={info.address} onChange={(v) => set("address", v)} textarea placeholder={"147 Moo 4, Ban Tai\nKo Samui, Surat Thani 84320"} />
        <Field label={t("flow", "mapsLinkOptional")} value={info.mapUrl} onChange={(v) => set("mapUrl", v)} placeholder="https://maps.apple.com/..." />
      </div>

      <StudioSectionSub>{t("flow", "preparingForArrival")}</StudioSectionSub>
      <div className="space-y-4">
        <Field label={t("flow", "gettingHere")} value={info.transportationInfo} onChange={(v) => set("transportationInfo", v)} textarea rows={3} placeholder={t("flow", "gettingHerePlaceholder")} />
        <Field label={t("flow", "onArrival")} value={info.arrivalInstructions} onChange={(v) => set("arrivalInstructions", v)} textarea placeholder={t("flow", "onArrivalPlaceholder")} />
        <Field label={t("flow", "whatToBring")} value={info.whatToBring} onChange={(v) => set("whatToBring", v)} textarea rows={3} placeholder={t("flow", "whatToBringPlaceholder")} />
        <Field label={t("flow", "importantNotes")} value={info.importantNotes} onChange={(v) => set("importantNotes", v)} textarea rows={3} placeholder={t("flow", "importantNotesPlaceholder")} />
      </div>

      <StudioSectionSub>{t("common", "contact")}</StudioSectionSub>
      <div className="grid grid-cols-3 gap-4">
        <Field label={t("flow", "contactName")} value={info.contactName} onChange={(v) => set("contactName", v)} placeholder={t("flow", "contactNamePlaceholder")} />
        <Field label={t("flow", "phoneNumber")} value={info.contactPhone} onChange={(v) => set("contactPhone", v)} placeholder="+66 77 123 456" />
        <Field label={t("flow", "whatsappNumber")} value={info.contactWhatsapp} onChange={(v) => set("contactWhatsapp", v)} placeholder="+66 87 123 456" />
      </div>

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
