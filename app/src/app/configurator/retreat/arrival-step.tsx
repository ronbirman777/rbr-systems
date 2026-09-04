"use client";

import { useActionState, type Dispatch, type SetStateAction } from "react";
import type { ArrivalInfo } from "@/lib/modules/arrival";
import { saveArrivalInfo, type SaveArrivalInfoState } from "./actions";

const initialState: SaveArrivalInfoState = { error: null };

export type ArrivalStepProps = {
  tenantId: string;
  info: ArrivalInfo;
  setInfo: Dispatch<SetStateAction<ArrivalInfo>>;
  onBack: () => void;
  onContinue: () => void;
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  textarea,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
  textarea?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wide text-idw-forest/70">{label}</span>
      {textarea ? (
        <textarea
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder={placeholder}
          rows={3}
          className="mt-1 w-full rounded-lg border border-idw-forest/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-idw-sage resize-none"
        />
      ) : (
        <input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder={placeholder}
          className="mt-1 w-full rounded-lg border border-idw-forest/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-idw-sage"
        />
      )}
    </label>
  );
}

/**
 * Arrival Information's editor - a single structured form, not a list.
 * Persists to module_settings (a singleton per tenant+module_key), the
 * first real use of that table by any editor.
 */
export function ArrivalStep({ tenantId, info, setInfo, onBack, onContinue }: ArrivalStepProps) {
  const [state, formAction, pending] = useActionState(saveArrivalInfo, initialState);

  function set<K extends keyof ArrivalInfo>(key: K, value: ArrivalInfo[K]) {
    setInfo((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form action={formAction} className="max-w-lg">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="data" value={JSON.stringify(info)} />
      <h1 className="font-ui text-[26px] tracking-[-0.01em] text-idw-forest">Arrival Information</h1>
      <p className="text-sm text-idw-forest/60 mt-1">Everything a guest needs before they get here.</p>

      <div className="mt-8 flex flex-col gap-5">
        <Field label="Welcome message" value={info.welcomeMessage} onChange={(v) => set("welcomeMessage", v)} textarea placeholder="A warm first line guests see on arrival." />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Check-in time" value={info.checkInTime} onChange={(v) => set("checkInTime", v)} placeholder="e.g. 3:00 PM" />
          <Field label="Check-out time" value={info.checkOutTime} onChange={(v) => set("checkOutTime", v)} placeholder="e.g. 11:00 AM" />
        </div>
        <Field label="Address" value={info.address} onChange={(v) => set("address", v)} textarea />
        <Field label="Map link" value={info.mapUrl} onChange={(v) => set("mapUrl", v)} placeholder="https://maps.google.com/..." />
        <Field label="Transportation" value={info.transportationInfo} onChange={(v) => set("transportationInfo", v)} textarea placeholder="Airport transfers, taxis, parking..." />
        <Field label="Arrival instructions" value={info.arrivalInstructions} onChange={(v) => set("arrivalInstructions", v)} textarea />
        <Field label="What to bring" value={info.whatToBring} onChange={(v) => set("whatToBring", v)} textarea />
        <Field label="Important notes" value={info.importantNotes} onChange={(v) => set("importantNotes", v)} textarea />
        <div className="grid grid-cols-3 gap-4">
          <Field label="Contact name" value={info.contactName} onChange={(v) => set("contactName", v)} />
          <Field label="Contact phone" value={info.contactPhone} onChange={(v) => set("contactPhone", v)} placeholder="+1..." />
          <Field label="WhatsApp" value={info.contactWhatsapp} onChange={(v) => set("contactWhatsapp", v)} placeholder="+1..." />
        </div>
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
          type="submit"
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
    </form>
  );
}
