/**
 * Data-driven product entitlements. The BASE bundle lives on the plan row
 * (billing_plans.entitlements); nothing here hard-codes an allowance. Mirrors
 * space_audio_entitlements() in migration 0038 (parity pinned by tests).
 *
 * Metering is Space/resource level only - these numbers never imply listener
 * identity, IP, user-agent or cross-Space tracking.
 */
export type PlanEntitlementBundle = {
  audio: { libraryMinutes: number; maxRecordingMinutes: number; listeningMinutesPerMonth: number };
  addons?: {
    audio_pack?: { priceMinor: number; currency: string; libraryMinutes: number; listeningMinutesPerMonth: number };
  };
};

export type AudioEntitlements = {
  libraryMinutes: number;
  /** NEVER increased by add-ons. */
  maxRecordingMinutes: number;
  listeningMinutesPerMonth: number;
};

export function computeAudioEntitlements(bundle: PlanEntitlementBundle, audioPackQuantity = 0): AudioEntitlements {
  if (!Number.isInteger(audioPackQuantity) || audioPackQuantity < 0) throw new Error("add-on quantity must be a non-negative integer");
  const pack = bundle.addons?.audio_pack;
  if (audioPackQuantity > 0 && !pack) throw new Error("plan has no audio add-on");
  return {
    libraryMinutes: bundle.audio.libraryMinutes + audioPackQuantity * (pack?.libraryMinutes ?? 0),
    maxRecordingMinutes: bundle.audio.maxRecordingMinutes,
    listeningMinutesPerMonth: bundle.audio.listeningMinutesPerMonth + audioPackQuantity * (pack?.listeningMinutesPerMonth ?? 0),
  };
}
