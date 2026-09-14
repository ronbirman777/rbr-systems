"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { ArrivalInfo } from "@/lib/modules/arrival";
import { STUDIO_INPUT_CLASS, StudioLabel, StudioSectionSub, StudioHeading, StudioIntro } from "./studio-ui";
import { saveArrivalInfo, type SaveArrivalInfoState } from "./actions";
import { useRegisteredSave, type StudioSectionEditorProps } from "./studioSection";

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
export function ArrivalStep({ tenantId, info, setInfo, onBack, onContinue, onDirty, onSaved, registerSave }: ArrivalStepProps) {
  const [state, setState] = useState<SaveArrivalInfoState>(initialState);
  const [pending, setPending] = useState(false);

  function set<K extends keyof ArrivalInfo>(key: K, value: ArrivalInfo[K]) {
    onDirty();
    setInfo((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(): Promise<boolean> {
    const formData = new FormData();
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
      <StudioHeading>Prepare arrival information</StudioHeading>
      <StudioIntro>
        Everything guests need before and on arrival. Clear, calm information makes a big difference to first
        impressions.
      </StudioIntro>

      <StudioSectionSub first>Arrival Basics</StudioSectionSub>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Check-in time" value={info.checkInTime} onChange={(v) => set("checkInTime", v)} placeholder="e.g. 14:00" />
        <Field label="Check-out time" value={info.checkOutTime} onChange={(v) => set("checkOutTime", v)} placeholder="e.g. 11:00" />
        <div className="col-span-2">
          <Field
            label="Welcome message (optional)"
            value={info.welcomeMessage}
            onChange={(v) => set("welcomeMessage", v)}
            textarea
            placeholder="A short personal welcome shown on the Arrival screen…"
          />
        </div>
      </div>

      <StudioSectionSub>Location</StudioSectionSub>
      <div className="space-y-4">
        <Field label="Address" value={info.address} onChange={(v) => set("address", v)} textarea placeholder={"147 Moo 4, Ban Tai\nKo Samui, Surat Thani 84320"} />
        <Field label="Maps link (optional)" value={info.mapUrl} onChange={(v) => set("mapUrl", v)} placeholder="https://maps.apple.com/..." />
      </div>

      <StudioSectionSub>Preparing for Arrival</StudioSectionSub>
      <div className="space-y-4">
        <Field label="Getting here" value={info.transportationInfo} onChange={(v) => set("transportationInfo", v)} textarea rows={3} placeholder="Transport options, directions from nearest airport or station…" />
        <Field label="On arrival" value={info.arrivalInstructions} onChange={(v) => set("arrivalInstructions", v)} textarea placeholder="What to do when guests reach the retreat…" />
        <Field label="What to bring" value={info.whatToBring} onChange={(v) => set("whatToBring", v)} textarea rows={3} placeholder="Packing suggestions and essentials…" />
        <Field label="Important notes" value={info.importantNotes} onChange={(v) => set("importantNotes", v)} textarea rows={3} placeholder="House rules, policies, anything guests must know before arriving…" />
      </div>

      <StudioSectionSub>Contact</StudioSectionSub>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Contact name" value={info.contactName} onChange={(v) => set("contactName", v)} placeholder="e.g. Front Desk" />
        <Field label="Phone number" value={info.contactPhone} onChange={(v) => set("contactPhone", v)} placeholder="+66 77 123 456" />
        <Field label="WhatsApp number" value={info.contactWhatsapp} onChange={(v) => set("contactWhatsapp", v)} placeholder="+66 87 123 456" />
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
          Back
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="rounded-full bg-idw-forest text-idw-parchment text-sm font-semibold uppercase tracking-wide px-6 py-3 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save Arrival Info"}
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
