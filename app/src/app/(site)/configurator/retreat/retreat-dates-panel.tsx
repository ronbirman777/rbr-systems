"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { RetreatProfile } from "@/lib/modules/retreatProfile";
import { MAX_RETREAT_RANGE_DAYS, RETREAT_DATES_ERROR_KEY, validateRetreatDates } from "@/lib/schedule/retreatDays";
import { GUEST_BASE_PALETTE } from "@/lib/theme/tokens";
import { createTranslator } from "@/lib/i18n";
import { STUDIO_INPUT_CLASS, StudioField, StudioSectionSub } from "./studio-ui";
import { saveRetreatDates, type SaveRetreatDatesState } from "./actions";
import { useRegisteredSave, type StudioSectionEditorProps } from "./studioSection";
import { planRetreatDatesSave, retreatDatesChanged, retreatDatesDraftFrom, type RetreatDatesDraft } from "./retreatDatesDraft";

export type RetreatDatesPanelProps = {
  tenantId: string;
  /** The Space's IANA timezone - the dates are calendar days in it. */
  timezone: string;
  profile: RetreatProfile;
  setProfile: Dispatch<SetStateAction<RetreatProfile>>;
} & StudioSectionEditorProps;

/**
 * TASK 033 P2 (A1): the retreat's optional start and end date, shown at
 * the top of the Schedule step.
 *
 * Both optional. When both are set the end may not precede the start and
 * the range may span at most MAX_RETREAT_RANGE_DAYS days - enough for any
 * retreat, short enough that the guest's Day Navigator stays usable. The
 * same rule is enforced again by saveRetreatDates() on the server.
 *
 * Saved on its own (not through the Schedule save), into the
 * retreatProfile settings row; on success the parent's profile state is
 * patched so the preview's Day Navigator updates immediately.
 *
 * Unsaved-changes guard (TASK 033 fix 2): wired into the same shared
 * contract as every Studio module editor (section "retreatDates" in
 * studioSection.ts). An edit marks the section dirty; only a successful
 * save clears it; an invalid pair or a server error keeps it dirty, so the
 * Unsaved Changes dialog (step change, sidebar, back) and the browser
 * unload warning both protect the edit. The dirty/save decision itself is
 * the pure planRetreatDatesSave() in retreatDatesDraft.ts.
 */
export function RetreatDatesPanel({
  tenantId,
  timezone,
  profile,
  setProfile,
  onDirty,
  onSaved,
  registerSave,
  locale,
}: RetreatDatesPanelProps) {
  const { t } = createTranslator(locale);
  const [draft, setDraft] = useState<RetreatDatesDraft>(() => retreatDatesDraftFrom(profile));
  /** Mirrors this section's flag in the parent guard: set by an edit,
   * cleared only by a successful save. */
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const { startDate, endDate } = draft;

  const invalid = validateRetreatDates(startDate || null, endDate || null);
  const validationMessage = invalid ? t("flow", RETREAT_DATES_ERROR_KEY[invalid], { max: MAX_RETREAT_RANGE_DAYS }) : null;
  const unchanged = !retreatDatesChanged(draft, profile);
  const errorId = `retreat-dates-error-${tenantId}`;

  function edit(patch: Partial<RetreatDatesDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }));
    setServerError(null);
    setTouched(true);
    onDirty();
  }

  async function handleSave(): Promise<boolean> {
    const plan = planRetreatDatesSave(draft, profile);
    // An invalid pair is never sent and never cleans the section - the
    // message is already on screen and the dialog reports the failure.
    if (plan.kind === "invalid") return false;
    let result: SaveRetreatDatesState = { error: null, startDate: startDate || null, endDate: endDate || null };
    if (plan.kind === "save") {
      const formData = new FormData();
      formData.set("locale", locale);
      formData.set("tenantId", tenantId);
      formData.set("startDate", startDate);
      formData.set("endDate", endDate);
      setPending(true);
      const initial: SaveRetreatDatesState = { error: null, startDate: null, endDate: null };
      result = await saveRetreatDates(initial, formData);
      setPending(false);
    }
    setServerError(result.error);
    if (!result.error) {
      setTouched(false);
      setSavedAt(`${result.startDate ?? ""}|${result.endDate ?? ""}`);
      setProfile((prev) => ({ ...prev, startDate: result.startDate, endDate: result.endDate }));
    }
    if (result.error) return false;
    onSaved();
    return true;
  }

  useRegisteredSave(registerSave, handleSave);

  const message = validationMessage ?? serverError;
  const justSaved = savedAt === `${startDate}|${endDate}` && unchanged;

  return (
    <section
      aria-labelledby={`retreat-dates-title-${tenantId}`}
      className="mb-8 rounded-2xl border p-4"
      style={{ background: "white", borderColor: `${GUEST_BASE_PALETTE.sand}80` }}
    >
      <div id={`retreat-dates-title-${tenantId}`}>
        <StudioSectionSub first>{t("flow", "retreatDatesTitle")}</StudioSectionSub>
      </div>
      <p className="text-[12px] -mt-1 mb-4" style={{ color: GUEST_BASE_PALETTE.mist }}>
        {t("flow", "retreatDatesBody", { timezone })}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <StudioField label={t("flow", "retreatStartDate")}>
            <input
              type="date"
              value={startDate}
              max={endDate || undefined}
              onChange={(e) => edit({ startDate: e.target.value })}
              aria-invalid={invalid ? true : undefined}
              aria-describedby={message ? errorId : undefined}
              className={STUDIO_INPUT_CLASS}
            />
          </StudioField>
        </div>
        <div>
          <StudioField label={t("flow", "retreatEndDate")}>
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => edit({ endDate: e.target.value })}
              aria-invalid={invalid ? true : undefined}
              aria-describedby={message ? errorId : undefined}
              className={STUDIO_INPUT_CLASS}
            />
          </StudioField>
        </div>
      </div>

      {!startDate && !endDate && (
        <p className="text-[11px] mt-2" style={{ color: GUEST_BASE_PALETTE.mist }}>
          {t("flow", "retreatDatesDerived")}
        </p>
      )}

      <p id={errorId} role="alert" className="text-[12px] text-red-700 mt-2 empty:hidden">
        {message ?? ""}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          // Enabled whenever the section is dirty - also after an edit was
          // reverted, so the organizer can clear the unsaved state here.
          disabled={pending || !!invalid || !touched}
          className="rounded-full bg-idw-forest text-idw-parchment text-xs font-semibold uppercase tracking-wide px-5 py-2.5 min-h-11 disabled:opacity-50"
        >
          {pending ? t("common", "savingNow") : t("flow", "retreatDatesSave")}
        </button>
        {(startDate || endDate) && (
          <button
            type="button"
            onClick={() => edit({ startDate: "", endDate: "" })}
            className="text-xs font-semibold uppercase tracking-wide text-idw-forest/60 hover:text-idw-forest min-h-11 px-2"
          >
            {t("flow", "retreatDatesClear")}
          </button>
        )}
        <span role="status" className="text-[12px]" style={{ color: GUEST_BASE_PALETTE.forest }}>
          {justSaved ? t("common", "saved") : ""}
        </span>
      </div>
    </section>
  );
}
