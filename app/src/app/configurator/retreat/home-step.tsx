"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { ArrivalInfo } from "@/lib/modules/arrival";
import {
  listToText,
  normalizeLegacyList,
  textToList,
  type RetreatProfile,
} from "@/lib/modules/retreatProfile";
import { GUEST_BASE_PALETTE } from "@/lib/theme/tokens";
import { STUDIO_INPUT_CLASS, StudioLabel, StudioSectionSub, StudioHeading, StudioIntro, ForwardArrow } from "./studio-ui";
import { saveRetreatProfile, type SaveRetreatProfileState } from "./actions";
import { useRegisteredSave, type StudioSectionEditorProps } from "./studioSection";
import { createTranslator } from "@/lib/i18n";

const initialState: SaveRetreatProfileState = { error: null };

export type HomeStepProps = {
  tenantId: string;
  profile: RetreatProfile;
  setProfile: Dispatch<SetStateAction<RetreatProfile>>;
  /** Read-only here: the legacy source this step may seed itself from. */
  arrivalInfo: ArrivalInfo;
  onBack: () => void;
  onContinue: () => void;
} & StudioSectionEditorProps;

/**
 * Retreat Home - the retreat's own description (TASK 029, P3).
 *
 * THE LEGACY SEEDING, which is the only subtle thing in this file.
 *
 * `whatToBring` and `welcome` used to live in Arrival Information, and
 * some Spaces filled them in. D3 says there must not be two independent
 * editors for one piece of content, and that nothing may be migrated
 * behind the organizer's back. Both at once means exactly this:
 *
 *   - if the canonical field is empty and the legacy one is not, this
 *     editor OPENS showing the legacy text, with a notice saying where
 *     it came from;
 *   - nothing is written until the organizer presses Save. Until then
 *     the legacy row is the only copy, and the Guest App still reads it
 *     through retreatWhatToBring()/retreatWelcome();
 *   - after Save the canonical copy wins, and the legacy value is left
 *     exactly where it is. Nothing deletes it.
 *
 * The seeding happens once per mount, in a ref rather than state, so a
 * re-render cannot re-seed over an edit the organizer has since made -
 * including clearing the field, which must stay cleared.
 */
export function HomeStep({
  tenantId,
  profile,
  setProfile,
  arrivalInfo,
  onBack,
  onContinue,
  onDirty,
  onSaved,
  registerSave,
  locale,
}: HomeStepProps) {
  const { t } = createTranslator(locale);
  const [state, setState] = useState<SaveRetreatProfileState>(initialState);
  const [pending, setPending] = useState(false);

  const legacyBring = normalizeLegacyList(arrivalInfo.whatToBring);
  const legacyWelcome = arrivalInfo.welcomeMessage?.trim() ?? "";

  /**
   * Whether the organizer has typed in the seeded field yet.
   *
   * This flag is load-bearing, and leaving it out is a real bug rather
   * than an untidiness: without it, "show the legacy value whenever the
   * canonical one is empty" means that CLEARING a seeded field
   * immediately re-fills it from the legacy value, and the organizer
   * cannot empty it at all. Once touched, the canonical value is shown
   * however empty it is.
   */
  const [touchedBring, setTouchedBring] = useState(false);
  const [touchedWelcome, setTouchedWelcome] = useState(false);

  const showLegacyBring = !touchedBring && profile.whatToBring.length === 0 && legacyBring.length > 0;
  const showLegacyWelcome = !touchedWelcome && !profile.welcome?.trim() && legacyWelcome.length > 0;

  const bringText = showLegacyBring ? listToText(legacyBring) : listToText(profile.whatToBring);
  const welcomeText = showLegacyWelcome ? legacyWelcome : (profile.welcome ?? "");

  function set<K extends keyof RetreatProfile>(key: K, value: RetreatProfile[K]) {
    onDirty();
    setProfile((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(): Promise<boolean> {
    const formData = new FormData();
    formData.set("locale", locale);
    formData.set("tenantId", tenantId);
    // A seeded-but-untouched field is saved as what the organizer can
    // see, not as the empty canonical value behind it - otherwise
    // pressing Save would appear to lose the text on screen.
    formData.set(
      "data",
      JSON.stringify({
        ...profile,
        welcome: showLegacyWelcome ? legacyWelcome : (profile.welcome ?? null),
        whatToBring: showLegacyBring ? legacyBring : profile.whatToBring,
      })
    );
    setPending(true);
    const result = await saveRetreatProfile(initialState, formData);
    setPending(false);
    setState(result);
    // A failed save must NOT clear the guard - the edits are still only
    // in memory, so the section stays dirty and the Unsaved Changes
    // dialog keeps protecting them.
    if (result.error) return false;
    onSaved();
    return true;
  }

  useRegisteredSave(registerSave, handleSave);

  return (
    <div className="max-w-xl">
      <StudioHeading>{t("flow", "homeStepTitle")}</StudioHeading>
      <StudioIntro>{t("flow", "homeStepBody")}</StudioIntro>

      <StudioSectionSub first>{t("flow", "retreatDetails")}</StudioSectionSub>
      <div className="space-y-4">
        <div>
          <StudioLabel>{t("flow", "tagline")}</StudioLabel>
          <input
            value={profile.tagline ?? ""}
            onChange={(e) => set("tagline", e.target.value || null)}
            placeholder={t("flow", "taglinePlaceholder")}
            maxLength={160}
            className={STUDIO_INPUT_CLASS}
            dir="auto"
          />
        </div>
        <div>
          <StudioLabel>{t("flow", "shortDescription")}</StudioLabel>
          <textarea
            value={profile.shortDescription ?? ""}
            onChange={(e) => set("shortDescription", e.target.value || null)}
            placeholder={t("flow", "shortDescriptionPlaceholder")}
            rows={2}
            maxLength={400}
            className={`${STUDIO_INPUT_CLASS} resize-none`}
            dir="auto"
          />
        </div>
        <div>
          <StudioLabel>{t("flow", "retreatAbout")}</StudioLabel>
          <textarea
            value={profile.longDescription ?? ""}
            onChange={(e) => set("longDescription", e.target.value || null)}
            placeholder={t("flow", "fullDescriptionPlaceholder")}
            rows={6}
            maxLength={6000}
            className={`${STUDIO_INPUT_CLASS} resize-none`}
            dir="auto"
          />
        </div>
      </div>

      <StudioSectionSub>{t("flow", "welcome")}</StudioSectionSub>
      <div>
        <StudioLabel>{t("flow", "welcomeMessageOptional")}</StudioLabel>
        <textarea
          value={welcomeText}
          onChange={(e) => {
            setTouchedWelcome(true);
            set("welcome", e.target.value || null);
          }}
          placeholder={t("flow", "welcomeMessagePlaceholder")}
          rows={3}
          maxLength={1200}
          className={`${STUDIO_INPUT_CLASS} resize-none`}
          dir="auto"
        />
        {showLegacyWelcome && <LegacyNotice>{t("flow", "seededFromArrival")}</LegacyNotice>}
      </div>

      <StudioSectionSub>{t("flow", "preparingForArrival")}</StudioSectionSub>
      <div className="space-y-4">
        <div>
          <StudioLabel>{t("flow", "whatToBring")}</StudioLabel>
          <textarea
            value={bringText}
            onChange={(e) => {
              setTouchedBring(true);
              set("whatToBring", textToList(e.target.value));
            }}
            placeholder={t("flow", "whatToBringPlaceholder")}
            rows={4}
            maxLength={2000}
            className={`${STUDIO_INPUT_CLASS} resize-none`}
            dir="auto"
          />
          <Hint>{t("flow", "onePerLine")}</Hint>
          {showLegacyBring && <LegacyNotice>{t("flow", "seededFromArrival")}</LegacyNotice>}
        </div>
        <div>
          <StudioLabel>{t("flow", "whatToExpect")}</StudioLabel>
          <textarea
            value={listToText(profile.whatToExpect)}
            onChange={(e) => set("whatToExpect", textToList(e.target.value))}
            placeholder={t("flow", "whatToExpectPlaceholder")}
            rows={4}
            maxLength={2000}
            className={`${STUDIO_INPUT_CLASS} resize-none`}
            dir="auto"
          />
          <Hint>{t("flow", "onePerLine")}</Hint>
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
          {t("common", "back")}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="rounded-full bg-idw-forest text-idw-parchment text-sm font-semibold uppercase tracking-wide px-6 py-3 disabled:opacity-60"
        >
          {pending ? t("common", "savingNow") : t("studio", "saveSection", { section: t("flow", "homeStepTitle") })}
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

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] mt-1.5" style={{ color: GUEST_BASE_PALETTE.mist }}>
      {children}
    </p>
  );
}

/** Says where a pre-filled value came from, and that it is not yet saved. */
function LegacyNotice({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[11px] mt-2 rounded-lg px-3 py-2 border"
      style={{
        color: GUEST_BASE_PALETTE.forest,
        background: `${GUEST_BASE_PALETTE.sand}33`,
        borderColor: `${GUEST_BASE_PALETTE.sand}99`,
      }}
      role="note"
    >
      {children}
    </p>
  );
}
