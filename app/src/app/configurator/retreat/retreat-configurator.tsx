"use client";

import { useActionState, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { GuestApp } from "@/components/guest-app";
import { InnerDweSMark } from "@/components/brand/wordmark";
import { ModuleItemPhotoField } from "@/components/module-item-photo-field";
import { persistNewItemStub, persistItemRemoval, enqueueItemsOp } from "@/lib/modules/persistItem";
import { persistNewScheduleItemStub, persistScheduleItemRemoval } from "@/lib/modules/persistSchedule";
import { MealsStep } from "./meals-step";
import { TreatmentsStep } from "./treatments-step";
import { FacilitiesStep } from "./facilities-step";
import { ArrivalStep } from "./arrival-step";
import { FaqStep } from "./faq-step";
import { CustomPagesStep } from "./custom-pages-step";
import { StayConnectedStep } from "./stay-connected-step";
import { ShareSpaceStep, type ShareSpaceStatus } from "./share-space-step";
import type { GuestAccessSettings } from "./guestAccessActions";
import { FeaturedStep } from "./featured-step";
import type { FeaturedSubmission } from "./featuredActions";
import { useStudioDirtyState } from "./useStudioDirtyState";
import { STUDIO_MODULE_SECTIONS, type StudioModuleSection, type StudioSectionEditorProps } from "./studioSection";
import { UnsavedChangesDialog } from "./unsaved-changes-dialog";
import { BrandImageField } from "./brand-image-field";
import { PALETTES, GUEST_BASE_PALETTE, BRAND_COLOR_PRESETS, type AtmosphereKey, type PaletteKey } from "@/lib/theme/tokens";
import { safeTextColor, meetsAA } from "@/lib/theme/contrast";
import { STUDIO_INPUT_CLASS, StudioLabel, StudioSectionSub } from "./studio-ui";
import type { EditableScheduleItem } from "@/lib/schedule/types";
import type { EditableFacilitator } from "@/lib/modules/facilitator";
import type { EditableMeal } from "@/lib/modules/meal";
import type { EditableTreatment } from "@/lib/modules/treatment";
import type { EditableFacility } from "@/lib/modules/facility";
import type { ArrivalInfo } from "@/lib/modules/arrival";
import type { EditableFaqItem } from "@/lib/modules/faq";
import type { EditableCustomPage } from "@/lib/modules/customPage";
import type { StayConnected } from "@/lib/modules/stayConnected";
import { SOCIAL_PLATFORMS, SOCIAL_PLATFORM_LABEL, type SocialPlatform } from "@/lib/modules/socialLinks";
import { IMPLEMENTED_OPTIONAL_MODULES, OPTIONAL_MODULES, type OptionalModuleKey } from "@/lib/modules/catalog";
import { todayInTimezone, currentTimeInTimezone, listTimezones, DEFAULT_TIMEZONE } from "@/lib/timezone";
import { normalizeSlug, checkSlugLocally } from "@/lib/slug";
import {
  saveDraft,
  saveSchedule,
  saveModules,
  saveFacilitators,
  publishSpace,
  checkSlugAvailability,
  reserveSlug,
  type SaveDraftState,
  type SaveScheduleState,
  type SaveModulesState,
  type SaveFacilitatorsState,
  type PublishState,
  type SlugCheckState,
  type ReserveSlugState,
} from "./actions";

export type RetreatConfiguratorProps = {
  initialTenantId: string | null;
  initialName: string;
  initialSlug: string | null;
  initialStep?: StepKey;
  initialTimezone: string;
  initialPalette: PaletteKey;
  initialAtmosphere: AtmosphereKey;
  initialCustomPrimary: string | null;
  initialCustomSecondary: string | null;
  initialCustomNavigation: string | null;
  initialCustomText: string | null;
  initialHeroImageRef: string | null;
  initialHeroImageUrl: string | null;
  initialSpaceImageRef: string | null;
  initialSpaceImageUrl: string | null;
  initialLogoRef: string | null;
  initialLogoUrl: string | null;
  initialSchedule: EditableScheduleItem[];
  initialFacilitators: EditableFacilitator[];
  initialMeals: EditableMeal[];
  initialTreatments: EditableTreatment[];
  initialFacilities: EditableFacility[];
  initialArrivalInfo: ArrivalInfo;
  initialFaq: EditableFaqItem[];
  initialCustomPages: EditableCustomPage[];
  initialStayConnected: StayConnected;
  initialEnabledModules: OptionalModuleKey[];
  initialPublishedAt: string | null;
  initialIsPubliclyAvailable: boolean;
  publishedHeroImageUrl: string | null;
  initialGuestAccessSettings: GuestAccessSettings;
  initialFeaturedSubmission: FeaturedSubmission;
};

const draftInitialState: SaveDraftState = { error: null, tenantId: null };
const scheduleInitialState: SaveScheduleState = { error: null };
const modulesInitialState: SaveModulesState = { error: null };
const facilitatorsInitialState: SaveFacilitatorsState = { error: null };
const publishInitialState: PublishState = { error: null, publishedAt: null };
const slugCheckInitialState: SlugCheckState = { status: "idle", slug: "", error: null };
const reserveSlugInitialState: ReserveSlugState = { error: null, slug: null, tenantId: null };

function blankScheduleItem(): EditableScheduleItem {
  return {
    id: crypto.randomUUID(),
    date: new Date().toISOString().slice(0, 10),
    startTime: "09:00",
    endTime: null,
    title: "",
    facilitator: null,
    location: null,
    description: null,
    category: null,
  };
}

function blankFacilitator(): EditableFacilitator {
  return {
    id: crypto.randomUUID(),
    name: "",
    role: null,
    bio: null,
    imageRef: null,
    imageUrl: null,
    specialties: [],
    socialLinks: [],
    imagePosition: null,
  };
}

/**
 * Deliberately the simplest possible focal-point control - click where the
 * subject should be, no drag, no crop rectangle, no editor. Draft-side
 * only: persists to module_items.metadata (no migration - see
 * facilitator.ts's imagePosition comment), and already reflects instantly
 * in every preview that reads live `facilitators` state (the sidebar Draft
 * Preview and this same card), matching the same instant-preview pattern
 * as the brand color pickers. Does NOT yet reach the published guest app -
 * publish_space() would need a small update to copy this through; see the
 * Final Product Polish report for the proposed (not-yet-applied) change.
 */
function FacilitatorFocalPointPicker({
  imageUrl,
  position,
  onChange,
}: {
  imageUrl: string;
  position: { x: number; y: number } | null;
  onChange: (position: { x: number; y: number } | null) => void;
}) {
  const x = position?.x ?? 50;
  const y = position?.y ?? 15; // matches the "center top" default this replaces

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const nextX = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const nextY = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    onChange({ x: Math.min(100, Math.max(0, nextX)), y: Math.min(100, Math.max(0, nextY)) });
  }

  return (
    <div className="mt-3">
      <p className="text-[11px] mb-1.5" style={{ color: GUEST_BASE_PALETTE.mist }}>
        Click the photo to keep the subject in frame when it&apos;s cropped.
      </p>
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") e.currentTarget.click();
        }}
        className="relative w-full aspect-[13/10] max-w-[200px] rounded-xl overflow-hidden cursor-crosshair border"
        style={{ borderColor: `${GUEST_BASE_PALETTE.sand}66` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" className="w-full h-full object-cover" style={{ objectPosition: `${x}% ${y}%` }} />
        <div
          className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow-md -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{ left: `${x}%`, top: `${y}%`, background: GUEST_BASE_PALETTE.forest }}
        />
      </div>
      {position && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="mt-1.5 text-[11px] underline"
          style={{ color: GUEST_BASE_PALETTE.mist }}
        >
          Reset to default
        </button>
      )}
    </div>
  );
}

type StepKey =
  | "identity"
  | "brand"
  | "modules"
  | "schedule"
  | "facilitators"
  | "meals"
  | "treatments"
  | "facilities"
  | "arrivalInfo"
  | "faq"
  | "customPages"
  | "stayConnected"
  | "publish"
  | "share"
  | "featured";

const STEP_LABELS: Record<Exclude<StepKey, "identity" | "brand" | "modules" | "publish" | "share" | "featured">, string> = {
  schedule: "Schedule",
  facilitators: "Facilitators",
  meals: "Meals",
  treatments: "Treatments",
  facilities: "Facilities",
  arrivalInfo: "Arrival Info",
  faq: "FAQ",
  customPages: "Custom Pages",
  stayConnected: "Stay Connected",
};

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * Product Completion phase - shared Primary/Accent color picker: the 8
 * curated presets (BRAND_COLOR_PRESETS) plus a free custom-hex input,
 * ported from the Figma Make source's BrandScreen (colorPresets +
 * "Custom hex" input). Both Primary and Accent render this exact same
 * control - only the bound value/onChange differ.
 */
function ColorPicker({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (hex: string) => void }) {
  const [draft, setDraft] = useState(value);
  const isValid = HEX_PATTERN.test(draft);

  function commit(hex: string) {
    setDraft(hex);
    if (HEX_PATTERN.test(hex)) onChange(hex);
  }

  return (
    <div>
      <StudioSectionSub first={label === "Primary Color"}>{label}</StudioSectionSub>
      <p className="text-[11px] -mt-2 mb-3" style={{ color: GUEST_BASE_PALETTE.mist }}>
        {hint}
      </p>
      <div className="grid grid-cols-4 gap-2 mb-3">
        {BRAND_COLOR_PRESETS.map((c) => (
          <button
            key={c.hex}
            type="button"
            onClick={() => commit(c.hex)}
            className="flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all"
            style={{ background: value.toLowerCase() === c.hex.toLowerCase() ? `${GUEST_BASE_PALETTE.forest}14` : "transparent" }}
          >
            <span
              className="w-8 h-8 rounded-lg shadow-sm"
              style={{ background: c.hex, outline: value.toLowerCase() === c.hex.toLowerCase() ? `2px solid ${GUEST_BASE_PALETTE.forest}66` : "none", outlineOffset: 2 }}
            />
            <span className="text-[10px] font-medium" style={{ color: GUEST_BASE_PALETTE.dusk }}>
              {c.label}
            </span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 border" style={{ borderColor: `${GUEST_BASE_PALETTE.sand}99`, background: "white" }}>
        <span className="w-5 h-5 rounded-md shadow-sm flex-shrink-0" style={{ background: isValid ? draft : "transparent" }} />
        <input
          value={draft}
          onChange={(e) => commit(e.target.value)}
          className="flex-1 text-[13px] outline-none font-mono"
          style={{ color: GUEST_BASE_PALETTE.forest }}
        />
        <span className="text-[10px]" style={{ color: GUEST_BASE_PALETTE.mist }}>
          Custom hex
        </span>
      </div>
    </div>
  );
}

const MODULE_META: Record<OptionalModuleKey, { icon: string; description: string }> = {
  schedule: { icon: "📅", description: "Your retreat program and daily sessions." },
  facilitators: { icon: "👥", description: "Introduce the people guiding the experience." },
  meals: { icon: "🌿", description: "Share meal times, menus and dietary information." },
  treatments: { icon: "✦", description: "Present available healing and bodywork experiences." },
  facilities: { icon: "⌂", description: "Help guests discover the spaces around them." },
  arrivalInfo: { icon: "→", description: "Everything guests need before they arrive." },
  dailyInspiration: { icon: "☾", description: "One inspirational sentence, shown each day on Today." },
  faq: { icon: "?", description: "Answer common questions guests ask before and during their stay." },
  customPages: { icon: "▤", description: "Add your own pages - What to Bring, Guidelines, anything you need." },
  stayConnected: { icon: "@", description: "Share your Instagram, website and other social links." },
  resources: { icon: "◇", description: "Not yet available." },
  audio: { icon: "◇", description: "Not yet available." },
  announcements: { icon: "◇", description: "Not yet available." },
};

const SCHEDULE_CATEGORIES = ["Yoga", "Meditation", "Breathwork", "Sound", "Meal", "Community", "Other"];

const STUDIO_CATEGORY_CHIP: Record<string, { background: string; color: string }> = {
  Meditation: { background: `${GUEST_BASE_PALETTE.sagePale}99`, color: GUEST_BASE_PALETTE.forest },
  Yoga: { background: "rgba(45,74,62,0.1)", color: GUEST_BASE_PALETTE.forest },
  Breathwork: { background: `${GUEST_BASE_PALETTE.clayPale}4d`, color: GUEST_BASE_PALETTE.clay },
  Meal: { background: `${GUEST_BASE_PALETTE.sand}80`, color: GUEST_BASE_PALETTE.dusk },
  Sound: { background: `${GUEST_BASE_PALETTE.clayPale}4d`, color: GUEST_BASE_PALETTE.clay },
  Community: { background: "rgba(45,74,62,0.1)", color: GUEST_BASE_PALETTE.forest },
};
const STUDIO_DEFAULT_CHIP = { background: `${GUEST_BASE_PALETTE.sand}80`, color: GUEST_BASE_PALETTE.dusk };

function studioDayStrip(dateIso: string): { weekday: string; day: string } {
  const d = new Date(`${dateIso}T00:00:00`);
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase(),
    day: d.toLocaleDateString(undefined, { day: "numeric" }),
  };
}

/**
 * Studio Completion pass - ported from the Figma Make source's
 * ScheduleEditorScreen: a day strip (here driven by the real distinct
 * dates already present in the schedule, not a hardcoded week) plus a
 * session list that expands into an inline edit panel on demand, instead
 * of every field always being visible at once. Same underlying state/
 * persistence (schedule/setSchedule/updateScheduleItem, the per-item
 * persistScheduleItemRemoval/persistNewScheduleItemStub queue, and
 * handleSaveSchedule's bulk save) as before - purely a visual/interaction
 * restyle, not a data-model change. Category/End time/Notes are exposed
 * here for the first time even though the underlying fields already
 * existed on EditableScheduleItem - closing a real editor gap, not
 * inventing a new one.
 */
function ScheduleEditor({
  schedule,
  setSchedule,
  updateScheduleItem,
  tenantId,
  scheduleState,
  schedulePending,
  handleSaveSchedule,
  goToStep,
}: {
  schedule: EditableScheduleItem[];
  setSchedule: Dispatch<SetStateAction<EditableScheduleItem[]>>;
  updateScheduleItem: (id: string, patch: Partial<EditableScheduleItem>) => void;
  tenantId: string;
  scheduleState: SaveScheduleState;
  schedulePending: boolean;
  handleSaveSchedule: () => void;
  goToStep: (delta: 1 | -1) => void;
}) {
  const dates = useMemo(() => Array.from(new Set(schedule.map((s) => s.date))).sort(), [schedule]);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  const currentDate = activeDate && dates.includes(activeDate) ? activeDate : (dates[0] ?? null);
  const dayItems = currentDate
    ? schedule.filter((s) => s.date === currentDate).sort((a, b) => a.startTime.localeCompare(b.startTime))
    : [];
  const editing = editId ? (schedule.find((s) => s.id === editId) ?? null) : null;

  function closePanel() {
    setEditId(null);
  }

  function handleAdd() {
    const item = blankScheduleItem();
    if (currentDate) item.date = currentDate;
    setSchedule((items) => [...items, item]);
    persistNewScheduleItemStub(tenantId, item.id, item.date, item.startTime);
    setActiveDate(item.date);
    setEditId(item.id);
  }

  function handleRemove(id: string) {
    setSchedule((items) => items.filter((it) => it.id !== id));
    persistScheduleItemRemoval(tenantId, id);
    if (editId === id) closePanel();
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-[20px] mb-1" style={{ fontFamily: "var(--font-dm-serif-display), serif", color: GUEST_BASE_PALETTE.forest }}>
        Build your schedule
      </h1>
      <p className="text-[13px] leading-relaxed mb-6" style={{ color: GUEST_BASE_PALETTE.dusk }}>
        Add and arrange sessions for each day of your retreat. Your guests see this on the Schedule screen.
      </p>

      {dates.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 mb-6">
          {dates.map((date) => {
            const active = currentDate === date;
            const { weekday, day } = studioDayStrip(date);
            return (
              <button
                key={date}
                type="button"
                onClick={() => setActiveDate(date)}
                className="flex-shrink-0 flex flex-col items-center justify-center w-[52px] h-[64px] rounded-2xl transition-all border"
                style={{
                  background: active ? GUEST_BASE_PALETTE.forest : "white",
                  borderColor: active ? GUEST_BASE_PALETTE.forest : `${GUEST_BASE_PALETTE.sand}99`,
                  boxShadow: active ? "0 4px 14px rgba(45,74,62,0.22)" : "none",
                }}
              >
                <span
                  className="text-[9px] tracking-widest uppercase font-semibold"
                  style={{ color: active ? GUEST_BASE_PALETTE.sage : GUEST_BASE_PALETTE.mist }}
                >
                  {weekday}
                </span>
                <span
                  className="text-[20px] leading-none mt-0.5 font-light"
                  style={{ fontFamily: "var(--font-dm-serif-display), serif", color: active ? "white" : GUEST_BASE_PALETTE.forest }}
                >
                  {day}
                </span>
                {active && <div className="w-1 h-1 rounded-full mt-1" style={{ background: GUEST_BASE_PALETTE.clay }} />}
              </button>
            );
          })}
        </div>
      )}

      <div className="space-y-2 mb-3">
        {dayItems.map((item) => {
          const chip = item.category ? (STUDIO_CATEGORY_CHIP[item.category] ?? STUDIO_DEFAULT_CHIP) : null;
          const isEditing = editId === item.id;
          return (
            <div
              key={item.id}
              className="group flex items-center gap-4 rounded-2xl p-4 border transition-all"
              style={{
                background: "white",
                borderColor: isEditing ? `${GUEST_BASE_PALETTE.forest}4d` : `${GUEST_BASE_PALETTE.sand}80`,
                boxShadow: isEditing ? "0 1px 3px rgba(45,74,62,0.08)" : "none",
              }}
            >
              <span className="text-[12px] font-medium tabular-nums w-10 flex-shrink-0" style={{ color: GUEST_BASE_PALETTE.mist }}>
                {item.startTime}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate" style={{ color: GUEST_BASE_PALETTE.forest }}>
                  {item.title || "Untitled session"}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: GUEST_BASE_PALETTE.mist }}>
                  {item.facilitator ? `${item.facilitator} · ` : ""}
                  {item.location}
                </p>
              </div>
              {chip && (
                <span
                  className="text-[9px] px-2 py-0.5 rounded-full tracking-widest font-medium uppercase flex-shrink-0"
                  style={{ background: chip.background, color: chip.color }}
                >
                  {item.category}
                </span>
              )}
              <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setEditId(isEditing ? null : item.id)}
                  className="text-[11px] px-2.5 py-1 rounded-lg border transition-colors"
                  style={{ color: GUEST_BASE_PALETTE.forest, borderColor: "rgba(45,74,62,0.2)" }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(item.id)}
                  className="text-[11px] px-2.5 py-1 rounded-lg border transition-colors"
                  style={{ color: GUEST_BASE_PALETTE.mist, borderColor: `${GUEST_BASE_PALETTE.sand}80` }}
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}
        {currentDate === null && (
          <p className="text-[13px]" style={{ color: GUEST_BASE_PALETTE.mist }}>
            No sessions yet - add your first one below.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={handleAdd}
        className="w-full border-2 border-dashed rounded-2xl py-3 text-[12px] font-medium transition-all mb-4"
        style={{ borderColor: `${GUEST_BASE_PALETTE.sand}99`, color: GUEST_BASE_PALETTE.mist }}
      >
        + Add Session
      </button>

      {editing && (
        <div className="rounded-2xl border p-5" style={{ background: GUEST_BASE_PALETTE.parchmentDeep, borderColor: "rgba(45,74,62,0.15)" }}>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[14px] font-semibold" style={{ color: GUEST_BASE_PALETTE.forest }}>
              Edit Session
            </h4>
            <button type="button" onClick={closePanel} className="text-[11px]" style={{ color: GUEST_BASE_PALETTE.mist }}>
              Done
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <StudioLabel>Start time</StudioLabel>
              <input
                type="time"
                value={editing.startTime}
                onChange={(e) => updateScheduleItem(editing.id, { startTime: e.target.value })}
                className={STUDIO_INPUT_CLASS}
              />
            </div>
            <div>
              <StudioLabel>End time (optional)</StudioLabel>
              <input
                type="time"
                value={editing.endTime ?? ""}
                onChange={(e) => updateScheduleItem(editing.id, { endTime: e.target.value || null })}
                className={STUDIO_INPUT_CLASS}
              />
            </div>
            <div className="col-span-2">
              <StudioLabel>Session title</StudioLabel>
              <input
                value={editing.title}
                onChange={(e) => updateScheduleItem(editing.id, { title: e.target.value })}
                placeholder="e.g. Morning Yoga Flow"
                className={STUDIO_INPUT_CLASS}
              />
            </div>
            <div>
              <StudioLabel>Facilitator</StudioLabel>
              <input
                value={editing.facilitator ?? ""}
                onChange={(e) => updateScheduleItem(editing.id, { facilitator: e.target.value || null })}
                placeholder="e.g. Maya Cohen"
                className={STUDIO_INPUT_CLASS}
              />
            </div>
            <div>
              <StudioLabel>Location</StudioLabel>
              <input
                value={editing.location ?? ""}
                onChange={(e) => updateScheduleItem(editing.id, { location: e.target.value || null })}
                placeholder="e.g. Yoga Shala"
                className={STUDIO_INPUT_CLASS}
              />
            </div>
            <div>
              <StudioLabel>Date</StudioLabel>
              <input
                type="date"
                value={editing.date}
                onChange={(e) => {
                  updateScheduleItem(editing.id, { date: e.target.value });
                  setActiveDate(e.target.value);
                }}
                className={STUDIO_INPUT_CLASS}
              />
            </div>
            <div>
              <StudioLabel>Category</StudioLabel>
              <select
                value={editing.category ?? ""}
                onChange={(e) => updateScheduleItem(editing.id, { category: e.target.value || null })}
                className={STUDIO_INPUT_CLASS}
              >
                <option value="">None</option>
                {SCHEDULE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <StudioLabel>Notes (optional)</StudioLabel>
              <input
                value={editing.description ?? ""}
                onChange={(e) => updateScheduleItem(editing.id, { description: e.target.value || null })}
                placeholder="Extra information for guests"
                className={STUDIO_INPUT_CLASS}
              />
            </div>
          </div>
        </div>
      )}

      {scheduleState.error && (
        <p className="text-sm text-red-700 mt-4" role="alert">
          {scheduleState.error}
        </p>
      )}

      <div className="mt-8 flex gap-3 items-center">
        <button
          type="button"
          onClick={() => goToStep(-1)}
          className="rounded-full border border-idw-forest/20 text-idw-forest text-sm font-semibold uppercase tracking-wide px-6 py-3"
        >
          Back
        </button>
        <button
          type="button"
          disabled={schedulePending}
          onClick={handleSaveSchedule}
          className="rounded-full bg-idw-forest text-idw-parchment text-sm font-semibold uppercase tracking-wide px-6 py-3 disabled:opacity-60"
        >
          {schedulePending ? "Saving…" : "Save Schedule"}
        </button>
        <button
          type="button"
          onClick={() => goToStep(1)}
          className="text-xs font-semibold uppercase tracking-wide text-idw-forest/50 hover:text-idw-forest"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

/**
 * Studio Completion pass - ported from the Figma Make source's
 * TeamEditorScreen: a 3-col photo grid (hover-reveal Edit/Remove) plus a
 * details panel that opens below for whichever facilitator is being
 * edited or newly added, instead of every facilitator's full form always
 * being open at once. Same underlying state/persistence (facilitators/
 * setFacilitators/updateFacilitator, persistItemRemoval/
 * persistNewItemStub, handleSaveFacilitators) as before - the actual
 * photo upload control is still ModuleItemPhotoField, unchanged, just
 * repositioned into this new layout.
 */
function TeamEditor({
  facilitators,
  setFacilitators,
  updateFacilitator,
  tenantId,
  facilitatorsState,
  facilitatorsPending,
  handleSaveFacilitators,
  goToStep,
}: {
  facilitators: EditableFacilitator[];
  setFacilitators: Dispatch<SetStateAction<EditableFacilitator[]>>;
  updateFacilitator: (id: string, patch: Partial<EditableFacilitator>) => void;
  tenantId: string;
  facilitatorsState: SaveFacilitatorsState;
  facilitatorsPending: boolean;
  handleSaveFacilitators: () => void;
  goToStep: (delta: 1 | -1) => void;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const editing = editId ? (facilitators.find((f) => f.id === editId) ?? null) : null;

  function handleAdd() {
    const item = blankFacilitator();
    setFacilitators((items) => [...items, item]);
    persistNewItemStub(tenantId, "facilitators", item.id, facilitators.length);
    setEditId(item.id);
  }

  function handleRemove(id: string) {
    setFacilitators((items) => items.filter((it) => it.id !== id));
    persistItemRemoval(tenantId, id);
    if (editId === id) setEditId(null);
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-[20px] mb-1" style={{ fontFamily: "var(--font-dm-serif-display), serif", color: GUEST_BASE_PALETTE.forest }}>
        Add your facilitators
      </h1>
      <p className="text-[13px] leading-relaxed mb-8" style={{ color: GUEST_BASE_PALETTE.dusk }}>
        Your team appears on the Team screen. Photos are especially important here - upload the best you have.
      </p>

      <div className="grid grid-cols-3 gap-4 mb-4">
        {facilitators.map((f, i) => {
          const isEditing = editId === f.id;
          return (
            <div
              key={f.id}
              className="group rounded-2xl overflow-hidden border transition-all"
              style={{
                borderColor: isEditing ? `${GUEST_BASE_PALETTE.forest}4d` : `${GUEST_BASE_PALETTE.sand}66`,
                boxShadow: isEditing ? "0 4px 14px rgba(45,74,62,0.16)" : "0 1px 3px rgba(45,74,62,0.06)",
              }}
            >
              <div className="relative h-[140px]" style={{ background: GUEST_BASE_PALETTE.parchmentDeep }}>
                {f.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={f.imageUrl}
                    alt={f.name}
                    className="w-full h-full object-cover"
                    style={{ objectPosition: f.imagePosition ? `${f.imagePosition.x}% ${f.imagePosition.y}%` : "center top" }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[11px]" style={{ color: GUEST_BASE_PALETTE.mist }}>
                    No photo yet
                  </div>
                )}
                <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(45,74,62,0.6), transparent)" }} />
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-white text-[13px] font-medium leading-tight" style={{ fontFamily: "var(--font-dm-serif-display), serif" }}>
                    {f.name || "Unnamed"}
                  </p>
                </div>
              </div>
              <div className="bg-white p-3">
                <p className="text-[10px] leading-snug truncate" style={{ color: GUEST_BASE_PALETTE.mist }}>
                  {f.role || "No role set"}
                </p>
                <div className="flex gap-1.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => setEditId(isEditing ? null : f.id)}
                    className="flex-1 text-[10px] py-1 rounded-lg border transition-colors"
                    style={{ color: GUEST_BASE_PALETTE.forest, borderColor: "rgba(45,74,62,0.2)" }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(f.id)}
                    className="flex-1 text-[10px] py-1 rounded-lg border transition-colors"
                    style={{ color: GUEST_BASE_PALETTE.mist, borderColor: `${GUEST_BASE_PALETTE.sand}80` }}
                  >
                    Remove
                  </button>
                </div>
              </div>
              {isEditing && (
                <div className="px-3 pb-3">
                  <ModuleItemPhotoField
                    tenantId={tenantId}
                    moduleKey="facilitators"
                    itemId={f.id}
                    title={f.name}
                    subtitle={f.role}
                    description={f.bio}
                    sortOrder={i}
                    imageRef={f.imageRef}
                    imageUrl={f.imageUrl}
                    onChange={(patch) => updateFacilitator(f.id, patch)}
                    previewAspect="13/10"
                    previewPosition={f.imagePosition ? `${f.imagePosition.x}% ${f.imagePosition.y}%` : "center top"}
                    ratioHint="Recommended: portrait or square photo, about 13:10 once cropped - we anchor to the top, so keep faces near the upper frame."
                  />
                  {f.imageUrl && (
                    <FacilitatorFocalPointPicker
                      imageUrl={f.imageUrl}
                      position={f.imagePosition}
                      onChange={(imagePosition) => updateFacilitator(f.id, { imagePosition })}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={handleAdd}
          className="rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 h-[205px] transition-all"
          style={{ borderColor: `${GUEST_BASE_PALETTE.sand}99`, color: GUEST_BASE_PALETTE.mist }}
        >
          <div className="w-8 h-8 rounded-full border-2 flex items-center justify-center" style={{ borderColor: `${GUEST_BASE_PALETTE.sand}b3` }}>
            +
          </div>
          <span className="text-[11px] font-medium">Add Facilitator</span>
        </button>
      </div>

      {editing && (
        <div className="rounded-2xl border p-5" style={{ background: GUEST_BASE_PALETTE.parchmentDeep, borderColor: "rgba(45,74,62,0.15)" }}>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[14px] font-semibold" style={{ color: GUEST_BASE_PALETTE.forest }}>
              Editing {editing.name || "facilitator"}
            </h4>
            <button type="button" onClick={() => setEditId(null)} className="text-[11px]" style={{ color: GUEST_BASE_PALETTE.mist }}>
              Done
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <StudioLabel>Full name</StudioLabel>
              <input
                value={editing.name}
                onChange={(e) => updateFacilitator(editing.id, { name: e.target.value })}
                placeholder="e.g. Maya Cohen"
                className={STUDIO_INPUT_CLASS}
              />
            </div>
            <div>
              <StudioLabel>Role</StudioLabel>
              <input
                value={editing.role ?? ""}
                onChange={(e) => updateFacilitator(editing.id, { role: e.target.value || null })}
                placeholder="e.g. Yoga & Breathwork Facilitator"
                className={STUDIO_INPUT_CLASS}
              />
            </div>
            <div>
              <StudioLabel>Short biography</StudioLabel>
              <textarea
                value={editing.bio ?? ""}
                onChange={(e) => updateFacilitator(editing.id, { bio: e.target.value || null })}
                placeholder="A few sentences about this facilitator…"
                rows={3}
                className={`${STUDIO_INPUT_CLASS} resize-none`}
              />
            </div>
            <div>
              <StudioLabel>Specialties (comma-separated)</StudioLabel>
              <input
                defaultValue={editing.specialties.join(", ")}
                onBlur={(e) =>
                  updateFacilitator(editing.id, {
                    specialties: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Vinyasa Flow, Pranayama, Breathwork"
                className={STUDIO_INPUT_CLASS}
              />
            </div>
            <div>
              <StudioLabel>Social links (optional)</StudioLabel>
              <div className="space-y-2">
                {editing.socialLinks.map((link, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={link.platform}
                      onChange={(e) =>
                        updateFacilitator(editing.id, {
                          socialLinks: editing.socialLinks.map((l, li) => (li === i ? { ...l, platform: e.target.value as SocialPlatform } : l)),
                        })
                      }
                      className={`${STUDIO_INPUT_CLASS} w-32 flex-shrink-0`}
                    >
                      {SOCIAL_PLATFORMS.map((p) => (
                        <option key={p} value={p}>
                          {SOCIAL_PLATFORM_LABEL[p]}
                        </option>
                      ))}
                    </select>
                    <input
                      value={link.url}
                      onChange={(e) =>
                        updateFacilitator(editing.id, {
                          socialLinks: editing.socialLinks.map((l, li) => (li === i ? { ...l, url: e.target.value } : l)),
                        })
                      }
                      placeholder="https://..."
                      className={`${STUDIO_INPUT_CLASS} flex-1`}
                    />
                    <button
                      type="button"
                      onClick={() => updateFacilitator(editing.id, { socialLinks: editing.socialLinks.filter((_, li) => li !== i) })}
                      className="text-[11px] px-2 py-1.5 rounded-lg border flex-shrink-0"
                      style={{ color: GUEST_BASE_PALETTE.mist, borderColor: `${GUEST_BASE_PALETTE.sand}80` }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {editing.socialLinks.length < SOCIAL_PLATFORMS.length && (
                  <button
                    type="button"
                    onClick={() => {
                      const used = new Set(editing.socialLinks.map((l) => l.platform));
                      const next = SOCIAL_PLATFORMS.find((p) => !used.has(p)) ?? SOCIAL_PLATFORMS[0];
                      updateFacilitator(editing.id, { socialLinks: [...editing.socialLinks, { platform: next, url: "" }] });
                    }}
                    className="text-[11px] font-medium"
                    style={{ color: GUEST_BASE_PALETTE.forest }}
                  >
                    + Add social link
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {facilitatorsState.error && (
        <p className="text-sm text-red-700 mt-4" role="alert">
          {facilitatorsState.error}
        </p>
      )}

      <div className="mt-8 flex gap-3 items-center">
        <button
          type="button"
          onClick={() => goToStep(-1)}
          className="rounded-full border border-idw-forest/20 text-idw-forest text-sm font-semibold uppercase tracking-wide px-6 py-3"
        >
          Back
        </button>
        <button
          type="button"
          disabled={facilitatorsPending}
          onClick={handleSaveFacilitators}
          className="rounded-full bg-idw-forest text-idw-parchment text-sm font-semibold uppercase tracking-wide px-6 py-3 disabled:opacity-60"
        >
          {facilitatorsPending ? "Saving…" : "Save Facilitators"}
        </button>
        <button
          type="button"
          onClick={() => goToStep(1)}
          className="text-xs font-semibold uppercase tracking-wide text-idw-forest/50 hover:text-idw-forest"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

export function RetreatConfigurator({
  initialTenantId,
  initialName,
  initialSlug,
  initialStep,
  initialTimezone,
  initialPalette,
  initialAtmosphere,
  initialCustomPrimary,
  initialCustomSecondary,
  initialCustomNavigation,
  initialCustomText,
  initialHeroImageRef,
  initialHeroImageUrl,
  initialSpaceImageRef,
  initialSpaceImageUrl,
  initialLogoRef,
  initialLogoUrl,
  initialSchedule,
  initialFacilitators,
  initialMeals,
  initialTreatments,
  initialFacilities,
  initialArrivalInfo,
  initialFaq,
  initialCustomPages,
  initialStayConnected,
  initialEnabledModules,
  initialPublishedAt,
  initialIsPubliclyAvailable,
  publishedHeroImageUrl,
  initialGuestAccessSettings,
  initialFeaturedSubmission,
}: RetreatConfiguratorProps) {
  const router = useRouter();
  const [step, setStep] = useState<StepKey>(initialStep ?? "identity");
  const [name, setName] = useState(initialName);
  const [timezone, setTimezone] = useState(initialTimezone || DEFAULT_TIMEZONE);
  // palette is now purely the fallback source for Primary/Accent (see
  // customPrimary/customSecondary below) - no UI writes to it directly
  // anymore, matching the approved Brand experience (8 presets + custom
  // hex, not a palette picker).
  const [palette] = useState<PaletteKey>(initialPalette);
  // The App Style / Atmosphere picker is no longer organizer-facing (Visual
  // Fidelity Phase 1) - existing tenants keep whatever value they already
  // saved (no migration, no data change), new tenants get this fixed
  // default matching the approved Figma base design.
  const [atmosphere] = useState<AtmosphereKey>(initialAtmosphere);
  // Product Completion / Final Brand Controls phases: Primary, Accent,
  // Navigation/Tabs and Text are all independent optional overrides on
  // top of palette, not the palette picker itself - palette stays as the
  // fallback source only, never touched by this UI going forward. All
  // four persist to their own brand_configs column (custom_primary,
  // custom_secondary, custom_navigation, custom_text - see migrations
  // 0001/0014/0015) and are fully live for instant Draft Preview
  // regardless of Save, since preview only ever depends on this client
  // state.
  const [customPrimary, setCustomPrimary] = useState<string | null>(initialCustomPrimary);
  const [customSecondary, setCustomSecondary] = useState<string | null>(initialCustomSecondary);
  const [customNavigation, setCustomNavigation] = useState<string | null>(initialCustomNavigation);
  const [customText, setCustomText] = useState<string | null>(initialCustomText);
  const effectivePrimary = customPrimary ?? PALETTES[palette].primary;
  const effectiveSecondary = customSecondary ?? PALETTES[palette].secondary;
  const effectiveNavigation = customNavigation ?? effectivePrimary;
  const effectiveText = customText ?? effectivePrimary;
  const readabilityTextColor = safeTextColor(effectivePrimary);
  const readabilityPasses = meetsAA(effectivePrimary, readabilityTextColor);
  // App Text Color is drawn directly on the app's own light background,
  // not a solid brand-colored surface - checked against that, not against
  // effectivePrimary. The Guest App itself never renders this raw color
  // unsafely (deriveAccessibleForeground auto-darkens it if needed - see
  // contrast.ts), so this is purely an organizer-facing heads-up, not the
  // only thing standing between an unsafe pick and illegible text.
  const textReadabilityPasses = meetsAA(GUEST_BASE_PALETTE.parchment, effectiveText);
  const [heroImageRef, setHeroImageRef] = useState<string | null>(initialHeroImageRef);
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(initialHeroImageUrl);
  const [spaceImageRef, setSpaceImageRef] = useState<string | null>(initialSpaceImageRef);
  const [spaceImageUrl, setSpaceImageUrl] = useState<string | null>(initialSpaceImageUrl);
  const [logoRef, setLogoRef] = useState<string | null>(initialLogoRef);
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [enabledModules, setEnabledModules] = useState<Set<OptionalModuleKey>>(
    new Set(initialEnabledModules)
  );
  const [schedule, setSchedule] = useState<EditableScheduleItem[]>(initialSchedule);
  const [facilitators, setFacilitators] = useState<EditableFacilitator[]>(initialFacilitators);
  const [meals, setMeals] = useState<EditableMeal[]>(initialMeals);
  const [treatments, setTreatments] = useState<EditableTreatment[]>(initialTreatments);
  const [facilities, setFacilities] = useState<EditableFacility[]>(initialFacilities);
  const [arrivalInfo, setArrivalInfo] = useState<ArrivalInfo>(initialArrivalInfo);
  const [faq, setFaq] = useState<EditableFaqItem[]>(initialFaq);
  const [customPages, setCustomPages] = useState<EditableCustomPage[]>(initialCustomPages);
  const [stayConnected, setStayConnected] = useState(initialStayConnected.links);

  const [draftState, draftAction, draftPending] = useActionState(saveDraft, {
    ...draftInitialState,
    tenantId: initialTenantId,
  });
  const [modulesState, modulesFormAction, modulesPending] = useActionState(saveModules, modulesInitialState);
  const dirty = useStudioDirtyState();

  // markClean fires exactly when draftPending/modulesPending transitions
  // true -> false with no error - i.e. the moment a Save Draft/Save
  // Modules submit (via the real form, not the dialog's Save & Continue
  // path) finishes successfully. Depending only on the pending flag
  // itself (not on draftState/modulesState) means this never re-fires
  // for an unrelated render and never clears a NEW edit made after a
  // prior save completed.
  useEffect(() => {
    if (!draftPending && draftState.error === null) dirty.markClean("identityAndBrand");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftPending]);
  useEffect(() => {
    if (!modulesPending && modulesState.error === null) dirty.markClean("modules");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modulesPending]);
  const [scheduleState, setScheduleState] = useState<SaveScheduleState>(scheduleInitialState);
  const [schedulePending, setSchedulePending] = useState(false);
  const [facilitatorsState, setFacilitatorsState] = useState<SaveFacilitatorsState>(facilitatorsInitialState);
  const [facilitatorsPending, setFacilitatorsPending] = useState(false);

  async function handleSaveSchedule() {
    const formData = new FormData();
    formData.set("tenantId", tenantId ?? "");
    formData.set("items", JSON.stringify(schedule));
    const ids = schedule.map((s) => s.id);
    setSchedulePending(true);
    // Queued behind every currently-in-flight write for these items (a
    // stub create) so Save is always applied after anything already
    // requested for them, and becomes the new queue position so a Remove
    // clicked right after this Save correctly waits for it - see
    // enqueueItemsOp in persistItem.ts.
    const result = await enqueueItemsOp(ids, () => saveSchedule(scheduleInitialState, formData));
    setSchedulePending(false);
    setScheduleState(result);
    if (!result.error) dirty.markClean("schedule");
    return !result.error;
  }

  async function handleSaveFacilitators() {
    const formData = new FormData();
    formData.set("tenantId", tenantId ?? "");
    // socialLinks/specialties MUST be included here - this is the client
    // half of the metadata round-trip fix. Leaving them out would make
    // facilitatorSchema.safeParse fail server-side (both fields are
    // required, if empty, arrays), not silently drop them - but the
    // correct fix is to always send the full current object, matching
    // what [tenantId]/page.tsx loaded on this page's initial render.
    formData.set(
      "items",
      JSON.stringify(
        facilitators.map(({ id, name, role, bio, imageRef, socialLinks, specialties, imagePosition }) => ({
          id,
          name,
          role,
          bio,
          imageRef,
          socialLinks,
          specialties,
          imagePosition,
        }))
      )
    );
    const ids = facilitators.map((f) => f.id);
    setFacilitatorsPending(true);
    const result = await enqueueItemsOp(ids, () => saveFacilitators(facilitatorsInitialState, formData));
    setFacilitatorsPending(false);
    setFacilitatorsState(result);
    if (!result.error) dirty.markClean("facilitators");
    return !result.error;
  }

  const [publishState, publishFormAction, publishPending] = useActionState(publishSpace, {
    ...publishInitialState,
    publishedAt: initialPublishedAt,
  });

  const [slugInput, setSlugInput] = useState(initialSlug ?? "");
  const [slugCheckState, setSlugCheckState] = useState<SlugCheckState>(slugCheckInitialState);
  const [slugCheckPending, setSlugCheckPending] = useState(false);
  const [reserveState, setReserveState] = useState<ReserveSlugState>({
    ...reserveSlugInitialState,
    slug: initialSlug,
  });
  const [reservePending, setReservePending] = useState(false);

  const tenantId = reserveState.tenantId ?? draftState.tenantId ?? initialTenantId;
  const currentPublishedAt = publishState.publishedAt ?? initialPublishedAt;
  const currentSlug = reserveState.slug ?? initialSlug;

  // Distribution phase - Share Your Space status. isPubliclyAvailable is
  // the same commercial-access authority the guest routes themselves
  // gate on (isSpacePubliclyAvailable), read once at page load - good
  // enough for this status badge without adding a live-refetch here.
  const shareStatus: ShareSpaceStatus = !currentPublishedAt ? "draft" : initialIsPubliclyAvailable ? "live" : "inactive";

  // Post-Publish Share Moment - true only for the very first publish in
  // this session (initialPublishedAt was null at page load, and a
  // publish just succeeded), never again once dismissed - so a
  // Republish never re-triggers it.
  const [firstPublishMomentDismissed, setFirstPublishMomentDismissed] = useState(false);
  const showFirstPublishMoment = !initialPublishedAt && !!publishState.publishedAt && !firstPublishMomentDismissed;
  const localSlugStatus = checkSlugLocally(slugInput);

  async function handleCheckSlug() {
    const formData = new FormData();
    formData.set("slug", slugInput);
    setSlugCheckPending(true);
    const result = await checkSlugAvailability(slugCheckInitialState, formData);
    setSlugCheckPending(false);
    setSlugCheckState(result);
  }

  async function handleReserveSlug() {
    const formData = new FormData();
    formData.set("tenantId", tenantId ?? "");
    formData.set("name", name);
    formData.set("timezone", timezone);
    formData.set("slug", slugInput);
    setReservePending(true);
    const result = await reserveSlug(reserveSlugInitialState, formData);
    setReservePending(false);
    setReserveState(result);
    if (result.tenantId && !tenantId) {
      // A brand-new tenant was just created by reserving its address before
      // any other Save happened - swap the URL to the resume link the same
      // way saveDraft's own first save implicitly does, so a refresh (or
      // the "resume this draft later" link below) keeps working.
      router.replace(`/configurator/retreat/${result.tenantId}`);
    }
  }


  function toggleModule(key: OptionalModuleKey) {
    setEnabledModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    dirty.markDirty("modules");
  }

  // Distribution phase - Unsaved Changes guard. Covers the sections
  // whose state lives directly in this file and that are genuinely
  // staged-until-Save (Identity+Brand share one save action; Modules;
  // Schedule; Facilitators) - NOT the sections that already persist
  // immediately (brand image upload/remove, module-item photo upload/
  // remove, add/remove item), which never call markDirty at all, per
  // "do not fake dirty state around an already-persisted action". The
  // The seven per-file module editors (Meals/Treatments/Facilities/FAQ/
  // Custom Pages/Stay Connected/Arrival Info) are now wired into this same
  // guard through the shared studioSection.ts contract: each marks its own
  // section dirty on a meaningful edit, clears it only after a save that
  // actually succeeded, and registers its save here so "Save and continue"
  // below can run it.
  /** Each mounted module editor publishes its own save here (see
   * useRegisteredSave). A ref, not state: registering must never trigger a
   * re-render of this tree, and the map is only read inside an event
   * handler. */
  const moduleSaversRef = useRef(new Map<StudioModuleSection, () => Promise<boolean>>());

  /** Stable per-section props. markDirty/markClean are useCallback-stable,
   * so these identities never change - the child's registration effect runs
   * once per mount instead of on every render. */
  const { markDirty, markClean } = dirty;
  const moduleSectionProps = useMemo(() => {
    const entries = STUDIO_MODULE_SECTIONS.map((section) => [
      section,
      {
        onDirty: () => markDirty(section),
        onSaved: () => markClean(section),
        registerSave: (save: (() => Promise<boolean>) | null) => {
          if (save) moduleSaversRef.current.set(section, save);
          else moduleSaversRef.current.delete(section);
        },
      } satisfies StudioSectionEditorProps,
    ]);
    return Object.fromEntries(entries) as Record<StudioModuleSection, StudioSectionEditorProps>;
  }, [markDirty, markClean]);

  async function saveAllDirtySections(): Promise<boolean> {
    let allSucceeded = true;

    if (dirty.dirtySections.has("identityAndBrand")) {
      const fd = new FormData();
      fd.set("tenantId", tenantId ?? "");
      fd.set("name", name);
      fd.set("timezone", timezone);
      fd.set("palette", palette);
      fd.set("atmosphere", atmosphere);
      fd.set("customPrimary", customPrimary ?? "");
      fd.set("customSecondary", customSecondary ?? "");
      fd.set("customNavigation", customNavigation ?? "");
      fd.set("customText", customText ?? "");
      const result = await saveDraft(draftInitialState, fd);
      if (result.error) allSucceeded = false;
      else dirty.markClean("identityAndBrand");
    }

    if (dirty.dirtySections.has("modules")) {
      const fd = new FormData();
      fd.set("tenantId", tenantId ?? "");
      IMPLEMENTED_OPTIONAL_MODULES.forEach((key) => fd.set(`module_${key}`, enabledModules.has(key) ? "on" : "off"));
      const result = await saveModules(modulesInitialState, fd);
      if (result.error) allSucceeded = false;
      else dirty.markClean("modules");
    }

    if (dirty.dirtySections.has("schedule")) {
      const succeeded = await handleSaveSchedule();
      if (!succeeded) allSucceeded = false;
    }

    if (dirty.dirtySections.has("facilitators")) {
      const succeeded = await handleSaveFacilitators();
      if (!succeeded) allSucceeded = false;
    }

    // The per-file module editors. Each registered its own save while
    // mounted; the editor clears its own dirty flag on success, so nothing
    // is marked clean here.
    for (const section of STUDIO_MODULE_SECTIONS) {
      if (!dirty.dirtySections.has(section)) continue;
      const save = moduleSaversRef.current.get(section);
      if (!save) {
        // The owning editor isn't mounted, so its unsaved edits cannot be
        // persisted from here - never report success and silently drop them.
        allSucceeded = false;
        continue;
      }
      const succeeded = await save();
      if (!succeeded) allSucceeded = false;
    }

    return allSucceeded;
  }

  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);

  /** Every in-Studio navigation (sidebar, mobile drawer, prev/next) goes
   * through this instead of calling setStep directly - if anything is
   * dirty, the action is deferred behind the Unsaved Changes dialog. */
  function attemptNavigate(action: () => void) {
    if (dirty.isDirtyAnywhere) {
      setPendingNavigation(() => action);
    } else {
      action();
    }
  }

  useEffect(() => {
    if (!dirty.isDirtyAnywhere) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty.isDirtyAnywhere]);

  const steps = useMemo(() => {
    const list: { key: StepKey; label: string }[] = [
      { key: "identity", label: "Identity" },
      { key: "brand", label: "Brand" },
      { key: "modules", label: "Modules" },
    ];
    (Object.keys(STEP_LABELS) as (keyof typeof STEP_LABELS)[]).forEach((key) => {
      if (enabledModules.has(key)) list.push({ key, label: STEP_LABELS[key] });
    });
    list.push({ key: "publish", label: "Publish" });
    return list;
  }, [enabledModules]);

  /** Visual Fidelity Phase 1: grouped sidebar sections, matching the
   * approved Creator Workspace's "My Space" / "Content" structure - a
   * view over the same `steps` list above, not a second source of step
   * order (goToStep's prev/next still walks the full `steps` list
   * unchanged, Publish included, so its own "Back" button keeps working
   * exactly as before). Publish itself is rendered separately, as its
   * own pinned sidebar action below, not inside either group. */
  const sidebarGroups = useMemo(
    () => [
      { label: "My Space", items: steps.filter((s) => s.key === "identity" || s.key === "brand" || s.key === "modules") },
      {
        label: "Content",
        items: steps.filter((s) => s.key !== "identity" && s.key !== "brand" && s.key !== "modules" && s.key !== "publish"),
      },
    ],
    [steps]
  );

  /** Generic prev/next navigation over the current step list - this is
   * what lets the configurator scale to any number of enabled optional
   * modules without a hardcoded chain of "if enabled X, go to X, else Y". */
  function goToStep(delta: 1 | -1) {
    const idx = steps.findIndex((s) => s.key === step);
    const next = steps[idx + delta];
    if (next) attemptNavigate(() => setStep(next.key));
  }

  function updateScheduleItem(id: string, patch: Partial<EditableScheduleItem>) {
    setSchedule((items) => items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    dirty.markDirty("schedule");
  }
  function updateFacilitator(id: string, patch: Partial<EditableFacilitator>) {
    setFacilitators((items) => items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    dirty.markDirty("facilitators");
  }

  const todayIso = todayInTimezone(timezone);

  // Mobile Studio Navigation - below `lg` the desktop sidebar (aside,
  // `hidden lg:flex`) has no replacement at all today, leaving no way to
  // switch sections on a phone. This drawer is that replacement: same
  // `steps`/`sidebarGroups` data the desktop sidebar already renders, no
  // second source of navigation.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  function mobileNavigate(next: StepKey) {
    setMobileNavOpen(false);
    attemptNavigate(() => setStep(next));
  }

  return (
    <>
      {/* Mobile Studio Navigation - the desktop sidebar below is
          `hidden lg:flex`, so below that breakpoint this topbar + drawer
          is the only way to switch sections. */}
      <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-idw-forest/10 bg-white">
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open Studio menu"
          aria-expanded={mobileNavOpen}
          className="w-9 h-9 flex flex-col items-center justify-center gap-1 rounded-lg -ml-1"
        >
          <span className="w-5 h-0.5 bg-idw-forest rounded-full" />
          <span className="w-5 h-0.5 bg-idw-forest rounded-full" />
          <span className="w-5 h-0.5 bg-idw-forest rounded-full" />
        </button>
        <InnerDweSMark size={20} />
        <span className="ml-auto text-xs font-semibold text-idw-forest/60 truncate max-w-[45%]">
          {steps.find((s) => s.key === step)?.label ??
            (step === "share" ? "Share Your Space" : step === "featured" ? "Featured on InnerDweS" : "")}
        </span>
      </div>

      {mobileNavOpen && (
        <div className="lg:hidden fixed inset-0 z-[100] flex" role="dialog" aria-modal="true" aria-label="Studio menu">
          <div
            className="absolute inset-0"
            style={{ background: "rgba(27,46,36,0.45)" }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setMobileNavOpen(false);
            }}
          />
          <div className="relative w-[280px] max-w-[80vw] h-full bg-white flex flex-col overflow-hidden shadow-2xl">
            {/* Scrollable nav region - independent from the pinned footer
                below, so a long section list never pushes the global
                actions out of view (see the matching desktop `aside`
                comment for why this two-region split, not a `flex-1`
                spacer inside one scroll container, is the real fix). */}
            <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-7">
              <div className="flex items-center justify-between mb-8">
                <InnerDweSMark size={24} />
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Close Studio menu"
                  className="text-idw-forest/50 text-xl leading-none px-1"
                >
                  ×
                </button>
              </div>
              {sidebarGroups.map((group) => (
                <div key={group.label} className="mb-6">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-idw-forest/40 mb-2">
                    {group.label}
                  </div>
                  <ol className="flex flex-col gap-1">
                    {group.items.map((s) => (
                      <li key={s.key}>
                        <button
                          type="button"
                          onClick={() => mobileNavigate(s.key)}
                          className={`w-full text-left px-3 py-2.5 rounded-lg text-sm ${
                            step === s.key ? "bg-idw-forest text-idw-parchment" : "text-idw-forest/70"
                          }`}
                        >
                          {s.label}
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>

            {/* Pinned footer - global Space-level actions, always visible
                regardless of section list length or which section is
                selected. */}
            <div className="px-6 pb-7 pt-3 shrink-0">
              <button
                type="button"
                onClick={() => mobileNavigate("publish")}
                className={`w-full px-3 py-2.5 rounded-xl text-sm font-medium ${
                  step === "publish" ? "bg-idw-forest text-idw-parchment" : "bg-idw-clay/10 text-idw-clay-text border border-idw-clay/25"
                }`}
              >
                Preview &amp; Publish
              </button>
              {tenantId && (
                <button
                  type="button"
                  onClick={() => mobileNavigate("share")}
                  className={`w-full mt-2 px-3 py-2.5 rounded-xl text-sm font-medium ${
                    step === "share" ? "bg-idw-forest text-idw-parchment" : "text-idw-forest/70"
                  }`}
                >
                  Share Your Space
                </button>
              )}
              {tenantId && (
                <button
                  type="button"
                  onClick={() => mobileNavigate("featured")}
                  className={`w-full mt-2 px-3 py-2.5 rounded-xl text-sm font-medium ${
                    step === "featured" ? "bg-idw-forest text-idw-parchment" : "text-idw-forest/70"
                  }`}
                >
                  Featured on InnerDweS
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div
        className={`grid gap-0 flex-1 min-h-0 ${
          step === "publish" || step === "share" || step === "featured"
            ? "lg:grid-cols-[280px_1fr]"
            : "lg:grid-cols-[280px_1fr_360px]"
        }`}
      >
      {/* LEFT: setup progress - Visual Fidelity Phase 1: grouped into
          "My Space" / "Content" sections and a pinned Publish action,
          matching the approved Creator Workspace's sidebar structure.
          Numbered-circle step indicators are kept as-is (already a
          working, clear affordance) rather than replaced with Figma's
          completion-dot concept, which would need new per-step
          "is this complete" logic this batch doesn't add. */}
      <aside className="border-r border-idw-forest/10 bg-white hidden lg:flex lg:flex-col overflow-hidden">
        {/* Scrollable nav region, independent from the pinned footer below.
            Previously the nav list and the global actions shared one
            `overflow-y-auto` container with a `flex-1` spacer between
            them - relying on that spacer to push the footer to the
            bottom only works when the *sibling* grid column's content
            height cooperates, which isn't guaranteed for every section
            (Arrival Info's long form was the case that broke it). A
            dedicated scroll region + a `shrink-0` footer outside it
            pins the global actions structurally, regardless of section
            content or nav-list length. */}
        <div className="flex-1 min-h-0 overflow-y-auto px-7 pt-9">
          <InnerDweSMark size={26} className="mb-10" />
          {sidebarGroups.map((group) => (
            <div key={group.label} className="mb-6">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-idw-forest/40 mb-2">
                {group.label}
              </div>
              <ol className="flex flex-col gap-1">
                {group.items.map((s) => {
                  const i = steps.findIndex((x) => x.key === s.key);
                  return (
                    <li key={s.key}>
                      <button
                        type="button"
                        onClick={() => attemptNavigate(() => setStep(s.key))}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-3 ${
                          step === s.key ? "bg-idw-forest text-idw-parchment" : "text-idw-forest/70 hover:bg-idw-forest/5"
                        }`}
                      >
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                            step === s.key ? "bg-idw-parchment text-idw-forest" : "bg-idw-forest/10"
                          }`}
                        >
                          {i + 1}
                        </span>
                        {s.label}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>

        {/* Pinned footer - global Space-level actions (Preview & Publish,
            Share Your Space, Featured on InnerDweS). Structurally outside
            the scroll region above, so it stays visible at the bottom of
            the sidebar for all 12 Studio sections, not just the ones
            whose content happens to be tall enough. */}
        <div className="px-7 pb-9 pt-3 shrink-0">
          {tenantId && currentSlug && (
            <div className="mb-4 text-xs text-idw-forest/50">{currentSlug}.innerdwes.com</div>
          )}

          <button
            type="button"
            onClick={() => attemptNavigate(() => setStep("publish"))}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              step === "publish"
                ? "bg-idw-forest text-idw-parchment"
                : "bg-idw-clay/10 text-idw-clay-text border border-idw-clay/25 hover:bg-idw-clay/15"
            }`}
          >
            <span>Preview &amp; Publish</span>
            {step !== "publish" && !currentPublishedAt && (
              <span className="w-1.5 h-1.5 rounded-full bg-idw-clay shrink-0" aria-hidden="true" />
            )}
          </button>
          {tenantId && (
            <button
              type="button"
              onClick={() => attemptNavigate(() => setStep("share"))}
              className={`w-full mt-2 flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                step === "share" ? "bg-idw-forest text-idw-parchment" : "text-idw-forest/70 hover:bg-idw-forest/5"
              }`}
            >
              <span>Share Your Space</span>
            </button>
          )}
          {tenantId && (
            <button
              type="button"
              onClick={() => attemptNavigate(() => setStep("featured"))}
              className={`w-full mt-2 flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                step === "featured" ? "bg-idw-forest text-idw-parchment" : "text-idw-forest/70 hover:bg-idw-forest/5"
              }`}
            >
              <span>Featured on InnerDweS</span>
            </button>
          )}
          {currentPublishedAt && (
            <a
              href={currentSlug ? `/s/${currentSlug}` : `/g/${tenantId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block mt-3 text-xs text-idw-forest/60 underline text-center"
            >
              View live guest app →
            </a>
          )}
        </div>
      </aside>

      {/* CENTER: configuration */}
      <section className="px-6 py-12 sm:px-12 overflow-y-auto">
        {step === "identity" && (
          <form action={draftAction} className="max-w-xl">
            <input type="hidden" name="tenantId" value={tenantId ?? ""} />
            <input type="hidden" name="name" value={name} />
            <input type="hidden" name="timezone" value={timezone} />
            <h1 className="text-[20px] mb-1" style={{ fontFamily: "var(--font-dm-serif-display), serif", color: GUEST_BASE_PALETTE.forest }}>
              Tell us about your retreat
            </h1>
            <p className="text-[13px] leading-relaxed mb-7" style={{ color: GUEST_BASE_PALETTE.dusk }}>
              This information appears throughout your guest experience and helps guests feel oriented and welcomed.
            </p>

            <StudioSectionSub first>Retreat Details</StudioSectionSub>
            <div className="space-y-4">
              <div>
                <StudioLabel>Retreat Name</StudioLabel>
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    dirty.markDirty("identityAndBrand");
                  }}
                  placeholder="e.g. Wonderland Healing Center"
                  className={STUDIO_INPUT_CLASS}
                />
              </div>
              <div>
                <StudioLabel>Timezone</StudioLabel>
                <p className="text-[11px] mb-1.5 -mt-1" style={{ color: GUEST_BASE_PALETTE.mist }}>
                  Schedule times and &quot;today&quot; are based on this, not the guest&apos;s device.
                </p>
                <select
                  value={timezone}
                  onChange={(e) => {
                    setTimezone(e.target.value);
                    dirty.markDirty("identityAndBrand");
                  }}
                  className={STUDIO_INPUT_CLASS}
                >
                  {listTimezones().map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <StudioSectionSub>Guest Address</StudioSectionSub>
            <p className="text-[11px] -mt-2 mb-3" style={{ color: GUEST_BASE_PALETTE.mist }}>
              This is where guests will find your Space once it&apos;s live. You can reserve it now and keep building
              - it won&apos;t go anywhere.
            </p>
            <div
              className="flex items-center rounded-xl border border-[#D4C5A9]/70 overflow-hidden focus-within:ring-2 focus-within:ring-[#2D4A3E]/15"
              style={{ background: "white" }}
            >
              <input
                value={slugInput}
                onChange={(e) => {
                  setSlugInput(normalizeSlug(e.target.value));
                  setSlugCheckState(slugCheckInitialState);
                }}
                placeholder="samadhi"
                className="flex-1 min-w-0 px-3.5 py-2.5 text-[13px] outline-none"
                style={{ color: GUEST_BASE_PALETTE.forest }}
              />
              <span className="pr-3.5 text-[13px] whitespace-nowrap" style={{ color: GUEST_BASE_PALETTE.mist }}>
                .innerdwes.com
              </span>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleCheckSlug}
                disabled={slugCheckPending || !slugInput || localSlugStatus !== "ok"}
                className="text-[11px] font-semibold uppercase tracking-wide underline disabled:opacity-40"
                style={{ color: GUEST_BASE_PALETTE.forest }}
              >
                {slugCheckPending ? "Checking…" : "Check availability"}
              </button>
              <span className="text-[11px]" style={{ color: GUEST_BASE_PALETTE.mist }}>
                {slugInput.length === 0
                  ? null
                  : currentSlug === slugInput
                    ? "This is your Space's current address."
                    : localSlugStatus === "invalid"
                      ? "Use lowercase letters, numbers and hyphens only (3-63 characters)."
                      : localSlugStatus === "reserved"
                        ? "That address is reserved."
                        : slugCheckState.slug === slugInput
                          ? slugCheckState.status === "available"
                            ? "Available."
                            : slugCheckState.status === "unavailable"
                              ? "That address is already taken."
                              : slugCheckState.error
                          : null}
              </span>
            </div>

            {slugCheckState.status === "available" &&
              slugCheckState.slug === slugInput &&
              currentSlug !== slugInput && (
                <button
                  type="button"
                  onClick={handleReserveSlug}
                  disabled={reservePending}
                  className="mt-3 rounded-full border text-[11px] font-semibold uppercase tracking-wide px-5 py-2.5 disabled:opacity-50"
                  style={{ borderColor: GUEST_BASE_PALETTE.forest, color: GUEST_BASE_PALETTE.forest }}
                >
                  {reservePending ? "Reserving…" : "Reserve this address"}
                </button>
              )}
            {reserveState.error && (
              <p className="text-sm text-red-700 mt-2" role="alert">
                {reserveState.error}
              </p>
            )}
            {reserveState.slug && reserveState.slug === slugInput && !reserveState.error && (
              <p className="text-xs mt-2" style={{ color: GUEST_BASE_PALETTE.sage }}>
                Reserved successfully.
              </p>
            )}

            <StudioSectionSub>Retreat Logo</StudioSectionSub>
            {tenantId ? (
              <div className="max-w-[200px]">
                <BrandImageField
                  tenantId={tenantId}
                  kind="logo"
                  label="Upload logo"
                  hint="SVG, PNG · transparent background preferred"
                  imageRef={logoRef}
                  imageUrl={logoUrl}
                  onChange={(patch) => {
                    setLogoRef(patch.imageRef);
                    setLogoUrl(patch.imageUrl);
                  }}
                />
              </div>
            ) : (
              <p className="text-[12px]" style={{ color: GUEST_BASE_PALETTE.mist }}>
                Save your Identity first to unlock the logo upload.
              </p>
            )}

            <StudioSectionSub>Space Image</StudioSectionSub>
            <p className="text-[11px] -mt-2 mb-3" style={{ color: GUEST_BASE_PALETTE.mist }}>
              Represents this Space itself - shown to you in My Spaces, separate from the Today Hero photo guests see.
            </p>
            {tenantId ? (
              <BrandImageField
                tenantId={tenantId}
                kind="space"
                label="Upload Space image"
                hint="JPG, PNG, WebP"
                imageRef={spaceImageRef}
                imageUrl={spaceImageUrl}
                onChange={(patch) => {
                  setSpaceImageRef(patch.imageRef);
                  setSpaceImageUrl(patch.imageUrl);
                }}
              />
            ) : (
              <p className="text-[12px]" style={{ color: GUEST_BASE_PALETTE.mist }}>
                Save your Identity first to unlock the Space image upload.
              </p>
            )}

            <button
              type="button"
              onClick={() => setStep("brand")}
              className="mt-8 rounded-xl text-[13px] font-medium px-4 py-2.5 transition-colors"
              style={{ background: GUEST_BASE_PALETTE.forest, color: "white" }}
            >
              Continue to Brand
            </button>
          </form>
        )}

        {step === "brand" && (
          <form action={draftAction} className="max-w-xl">
            <input type="hidden" name="tenantId" value={tenantId ?? ""} />
            <input type="hidden" name="name" value={name} />
            <input type="hidden" name="timezone" value={timezone} />
            <input type="hidden" name="palette" value={palette} />
            <input type="hidden" name="atmosphere" value={atmosphere} />
            <input type="hidden" name="customPrimary" value={customPrimary ?? ""} />
            <input type="hidden" name="customSecondary" value={customSecondary ?? ""} />
            <input type="hidden" name="customNavigation" value={customNavigation ?? ""} />
            <input type="hidden" name="customText" value={customText ?? ""} />
            <h1 className="text-[20px] mb-1" style={{ fontFamily: "var(--font-dm-serif-display), serif", color: GUEST_BASE_PALETTE.forest }}>
              Brand your experience
            </h1>
            <p className="text-[13px] leading-relaxed mb-7" style={{ color: GUEST_BASE_PALETTE.dusk }}>
              Choose colors that reflect your retreat&apos;s energy. InnerDweS ensures they work beautifully across
              your entire guest application.
            </p>

            <ColorPicker
              label="Primary Color"
              hint="Used for key actions, navigation highlights and immersive moments."
              value={effectivePrimary}
              onChange={(hex) => {
                setCustomPrimary(hex);
                dirty.markDirty("identityAndBrand");
              }}
            />
            <ColorPicker
              label="Accent Color"
              hint="Used for live indicators, tags and warm highlights."
              value={effectiveSecondary}
              onChange={(hex) => {
                setCustomSecondary(hex);
                dirty.markDirty("identityAndBrand");
              }}
            />
            <ColorPicker
              label="Navigation / Tabs Color"
              hint="Used for the bottom navigation's active tab, and other tab-like selections (e.g. Schedule's day picker)."
              value={effectiveNavigation}
              onChange={(hex) => {
                setCustomNavigation(hex);
                dirty.markDirty("identityAndBrand");
              }}
            />
            <ColorPicker
              label="App Text Color"
              hint="Used for headings, session titles and quote text."
              value={effectiveText}
              onChange={(hex) => {
                setCustomText(hex);
                dirty.markDirty("identityAndBrand");
              }}
            />

            <StudioSectionSub>Hero Photography</StudioSectionSub>
            <p className="text-[11px] -mt-2 mb-3" style={{ color: GUEST_BASE_PALETTE.mist }}>
              The main image guests see on the Today screen.
            </p>
            {tenantId ? (
              <BrandImageField
                tenantId={tenantId}
                kind="hero"
                label="Upload hero photo"
                hint="JPG, PNG, WebP · min 1600px wide recommended"
                imageRef={heroImageRef}
                imageUrl={heroImageUrl}
                onChange={(patch) => {
                  setHeroImageRef(patch.imageRef);
                  setHeroImageUrl(patch.imageUrl);
                }}
              />
            ) : (
              <p className="text-[12px]" style={{ color: GUEST_BASE_PALETTE.mist }}>
                Save your Identity first to unlock photo uploads.
              </p>
            )}

            <StudioSectionSub>Readability Check</StudioSectionSub>
            <div className="rounded-2xl border p-4 flex items-center gap-4" style={{ borderColor: `${GUEST_BASE_PALETTE.sand}99`, background: "white" }}>
              <span
                className="w-10 h-10 rounded-xl flex items-center justify-center text-[13px] font-semibold shrink-0"
                style={{ background: effectivePrimary, color: readabilityTextColor }}
              >
                Aa
              </span>
              <div className="flex-1">
                <p className="text-[12px] font-medium" style={{ color: GUEST_BASE_PALETTE.forest }}>
                  {readabilityPasses ? "Contrast looks good" : "Contrast may be too low"}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: GUEST_BASE_PALETTE.mist }}>
                  {readabilityTextColor === "#FBF9F5" ? "White" : "Dark"} text on this color{" "}
                  {readabilityPasses ? "meets" : "may not meet"} accessibility standards.
                </p>
              </div>
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: readabilityPasses ? GUEST_BASE_PALETTE.sage : GUEST_BASE_PALETTE.clay }} />
            </div>

            {!textReadabilityPasses && (
              <div
                className="rounded-2xl border p-3.5 mt-3 flex items-center gap-3"
                style={{ borderColor: `${GUEST_BASE_PALETTE.clay}66`, background: `${GUEST_BASE_PALETTE.clayPale}22` }}
                role="alert"
              >
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: GUEST_BASE_PALETTE.clay }} />
                <p className="text-[11px] leading-relaxed" style={{ color: GUEST_BASE_PALETTE.dusk }}>
                  Your App Text Color may be too light to read comfortably on its own - we&apos;ll automatically
                  darken it where needed so guest-facing text always stays legible.
                </p>
              </div>
            )}

            {draftState.error && (
              <p className="text-sm text-red-700 mt-4" role="alert">
                {draftState.error}
              </p>
            )}

            <div className="mt-8 flex gap-3">
              <button
                type="button"
                onClick={() => setStep("identity")}
                className="rounded-full border border-idw-forest/20 text-idw-forest text-sm font-semibold uppercase tracking-wide px-6 py-3"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={draftPending}
                className="rounded-full bg-idw-forest text-idw-parchment text-sm font-semibold uppercase tracking-wide px-6 py-3 disabled:opacity-60"
              >
                {draftPending ? "Saving…" : "Save Draft"}
              </button>
              {tenantId && (
                <button
                  type="button"
                  onClick={() => setStep("modules")}
                  className="text-xs font-semibold uppercase tracking-wide text-idw-forest/50 hover:text-idw-forest"
                >
                  Continue to Modules →
                </button>
              )}
            </div>
          </form>
        )}

        {step === "modules" && tenantId && (
          <form action={modulesFormAction} className="max-w-xl">
            <input type="hidden" name="tenantId" value={tenantId} />
            {IMPLEMENTED_OPTIONAL_MODULES.map((key) => (
              <input key={key} type="hidden" name={`module_${key}`} value={enabledModules.has(key) ? "on" : "off"} />
            ))}
            <h1 className="text-[20px] mb-1" style={{ fontFamily: "var(--font-dm-serif-display), serif", color: GUEST_BASE_PALETTE.forest }}>
              Choose what your guests can access
            </h1>
            <p className="text-[13px] leading-relaxed mb-8" style={{ color: GUEST_BASE_PALETTE.dusk }}>
              Enable the experiences that are part of your retreat. Disabled modules won&apos;t appear in the guest
              app. You can change this any time.
            </p>

            <div className="space-y-2.5">
              {IMPLEMENTED_OPTIONAL_MODULES.map((key) => {
                const on = enabledModules.has(key);
                const meta = MODULE_META[key];
                return (
                  <div
                    key={key}
                    className="flex items-center gap-4 rounded-2xl p-4 border transition-all"
                    style={{
                      background: on ? "white" : GUEST_BASE_PALETTE.parchmentDeep,
                      borderColor: on ? `${GUEST_BASE_PALETTE.sand}99` : `${GUEST_BASE_PALETTE.sand}66`,
                      boxShadow: on ? "0 1px 3px rgba(45,74,62,0.06)" : "none",
                      opacity: on ? 1 : 0.65,
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg"
                      style={{ background: on ? "rgba(45,74,62,0.1)" : `${GUEST_BASE_PALETTE.sand}66` }}
                    >
                      {meta.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium" style={{ color: on ? GUEST_BASE_PALETTE.forest : GUEST_BASE_PALETTE.dusk }}>
                        {OPTIONAL_MODULES[key].label}
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: GUEST_BASE_PALETTE.mist }}>
                        {meta.description}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleModule(key)}
                      aria-label={`Toggle ${OPTIONAL_MODULES[key].label}`}
                      className="w-10 h-6 rounded-full transition-all relative flex-shrink-0"
                      style={{ background: on ? GUEST_BASE_PALETTE.forest : `${GUEST_BASE_PALETTE.sand}cc` }}
                    >
                      <div
                        className="w-4 h-4 rounded-full bg-white shadow-sm absolute top-1 transition-all duration-200"
                        style={{ left: on ? "20px" : "4px" }}
                      />
                    </button>
                  </div>
                );
              })}
            </div>

            <div
              className="mt-6 rounded-2xl p-4 border"
              style={{ background: `${GUEST_BASE_PALETTE.sagePale}33`, borderColor: `${GUEST_BASE_PALETTE.sage}55` }}
            >
              <p className="text-[12px] font-medium mb-1" style={{ color: GUEST_BASE_PALETTE.forest }}>
                Today is always included
              </p>
              <p className="text-[12px] leading-relaxed" style={{ color: GUEST_BASE_PALETTE.dusk }}>
                The Today screen is the core of your guest experience and cannot be disabled. It automatically draws
                from your enabled modules.
              </p>
            </div>

            {modulesState.error && (
              <p className="text-sm text-red-700 mt-4" role="alert">
                {modulesState.error}
              </p>
            )}

            <div className="mt-8 flex gap-3 items-center">
              <button
                type="button"
                onClick={() => setStep("brand")}
                className="rounded-full border border-idw-forest/20 text-idw-forest text-sm font-semibold uppercase tracking-wide px-6 py-3"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={modulesPending}
                className="rounded-full bg-idw-forest text-idw-parchment text-sm font-semibold uppercase tracking-wide px-6 py-3 disabled:opacity-60"
              >
                {modulesPending ? "Saving…" : "Save Modules"}
              </button>
              <button
                type="button"
                onClick={() => goToStep(1)}
                className="text-xs font-semibold uppercase tracking-wide text-idw-forest/50 hover:text-idw-forest"
              >
                Continue →
              </button>
            </div>
          </form>
        )}

        {step === "schedule" && tenantId && (
          <ScheduleEditor
            schedule={schedule}
            setSchedule={setSchedule}
            updateScheduleItem={updateScheduleItem}
            tenantId={tenantId}
            scheduleState={scheduleState}
            schedulePending={schedulePending}
            handleSaveSchedule={handleSaveSchedule}
            goToStep={goToStep}
          />
        )}

        {step === "facilitators" && tenantId && (
          <TeamEditor
            facilitators={facilitators}
            setFacilitators={setFacilitators}
            updateFacilitator={updateFacilitator}
            tenantId={tenantId}
            facilitatorsState={facilitatorsState}
            facilitatorsPending={facilitatorsPending}
            handleSaveFacilitators={handleSaveFacilitators}
            goToStep={goToStep}
          />
        )}

        {step === "meals" && tenantId && (
          <MealsStep
            tenantId={tenantId}
            meals={meals}
            setMeals={setMeals}
            onBack={() => goToStep(-1)}
            onContinue={() => goToStep(1)}
            {...moduleSectionProps.meals}
          />
        )}

        {step === "treatments" && tenantId && (
          <TreatmentsStep
            tenantId={tenantId}
            treatments={treatments}
            setTreatments={setTreatments}
            onBack={() => goToStep(-1)}
            onContinue={() => goToStep(1)}
            {...moduleSectionProps.treatments}
          />
        )}

        {step === "facilities" && tenantId && (
          <FacilitiesStep
            tenantId={tenantId}
            facilities={facilities}
            setFacilities={setFacilities}
            onBack={() => goToStep(-1)}
            onContinue={() => goToStep(1)}
            {...moduleSectionProps.facilities}
          />
        )}

        {step === "arrivalInfo" && tenantId && (
          <ArrivalStep
            tenantId={tenantId}
            info={arrivalInfo}
            setInfo={setArrivalInfo}
            onBack={() => goToStep(-1)}
            onContinue={() => goToStep(1)}
            {...moduleSectionProps.arrival}
          />
        )}

        {step === "faq" && tenantId && (
          <FaqStep
            tenantId={tenantId}
            faq={faq}
            setFaq={setFaq}
            onBack={() => goToStep(-1)}
            onContinue={() => goToStep(1)}
            {...moduleSectionProps.faq}
          />
        )}

        {step === "customPages" && tenantId && (
          <CustomPagesStep
            tenantId={tenantId}
            customPages={customPages}
            setCustomPages={setCustomPages}
            onBack={() => goToStep(-1)}
            onContinue={() => goToStep(1)}
            {...moduleSectionProps.customPages}
          />
        )}

        {step === "stayConnected" && tenantId && (
          <StayConnectedStep
            tenantId={tenantId}
            links={stayConnected}
            setLinks={setStayConnected}
            onBack={() => goToStep(-1)}
            onContinue={() => goToStep(1)}
            {...moduleSectionProps.stayConnected}
          />
        )}

        {step === "publish" && tenantId && (
          <div className="max-w-4xl">
            <h1 className="text-[28px] font-normal text-idw-forest" style={{ fontFamily: "var(--font-dm-serif-display), serif" }}>
              Preview &amp; Publish
            </h1>
            <p className="text-sm text-idw-forest/60 mt-1 leading-relaxed max-w-md">
              Review your changes and publish when you&apos;re ready. Your live guest app only updates when you
              choose to publish.
            </p>

            {showFirstPublishMoment && (
              <div className="mt-6 rounded-2xl border border-idw-sage/40 bg-idw-sage/10 p-5 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-semibold text-idw-forest">Your Guest App is live</p>
                  <p className="text-xs text-idw-forest/60 mt-0.5">Guests can open it right now.</p>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={currentSlug ? `/s/${currentSlug}` : `/g/${tenantId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold uppercase tracking-wide px-4 py-2 rounded-full border border-idw-forest/20 text-idw-forest"
                  >
                    View Guest App
                  </a>
                  <button
                    type="button"
                    onClick={() => setStep("share")}
                    className="text-xs font-semibold uppercase tracking-wide px-4 py-2 rounded-full bg-idw-forest text-idw-parchment"
                  >
                    Share Your Space
                  </button>
                  <button
                    type="button"
                    onClick={() => setFirstPublishMomentDismissed(true)}
                    aria-label="Dismiss"
                    className="text-idw-forest/40 text-lg leading-none px-1"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}

            <div className="mt-8 grid lg:grid-cols-2 gap-8 items-start">
              {/* Left: status + actions */}
              <form action={publishFormAction}>
                <input type="hidden" name="tenantId" value={tenantId} />

                <div
                  className={`rounded-2xl p-5 border ${
                    currentPublishedAt ? "bg-idw-sage/10 border-idw-sage/30" : "bg-idw-clay/8 border-idw-clay/25"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-2 h-2 rounded-full ${currentPublishedAt ? "bg-idw-sage" : "bg-idw-clay"}`} />
                    <span
                      className={`text-xs font-semibold ${currentPublishedAt ? "text-idw-forest" : "text-idw-clay-text"}`}
                    >
                      {currentPublishedAt ? "Live" : "Not published yet"}
                    </span>
                  </div>
                  <p className="text-idw-forest/70 text-xs leading-relaxed">
                    {currentPublishedAt
                      ? `Last published ${new Date(currentPublishedAt).toLocaleString()}. Guests won't see further edits until you republish.`
                      : "Nothing is visible to guests until you publish."}
                  </p>
                </div>

                <div className="mt-4 rounded-2xl border border-idw-forest/12 p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-idw-forest/40">Public address</div>
                  <div className="text-sm text-idw-forest mt-1">
                    {currentSlug ? (
                      `${currentSlug}.innerdwes.com`
                    ) : (
                      <button type="button" onClick={() => setStep("identity")} className="underline">
                        Choose one in Identity →
                      </button>
                    )}
                  </div>
                </div>

                {publishState.error && (
                  <p className="text-sm text-red-700 mt-4" role="alert">
                    {publishState.error}
                  </p>
                )}

                <div className="mt-6 flex flex-col gap-2.5">
                  <button
                    type="submit"
                    disabled={publishPending}
                    className="w-full rounded-2xl bg-idw-forest text-idw-parchment text-sm font-semibold py-3.5 disabled:opacity-60 shadow-sm flex items-center justify-center gap-2"
                  >
                    {publishPending && (
                      <span
                        className="w-3.5 h-3.5 rounded-full border-2 border-idw-parchment/30 border-t-idw-parchment animate-spin shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    {publishPending
                      ? // Publishing several media items copies each one through a
                        // short chain of real Storage round-trips (download,
                        // upload, list, sometimes remove - see
                        // copyDraftToPublished) - a few seconds is genuine
                        // network time, not a hang. The spinner is here so that
                        // time reads as "working", not "stuck", since the
                        // button previously just showed static unchanging text
                        // for however long that took.
                        "Publishing…"
                      : currentPublishedAt
                        ? "Publish Changes"
                        : "Publish"}
                  </button>
                  <button
                    type="button"
                    onClick={() => goToStep(-1)}
                    className="w-full rounded-2xl border border-idw-forest/20 text-idw-forest text-sm font-medium py-3"
                  >
                    Back
                  </button>
                  {currentPublishedAt && (
                    <a
                      href={currentSlug ? `/s/${currentSlug}` : `/g/${tenantId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full text-center rounded-2xl border border-idw-forest/20 text-idw-forest text-sm font-medium py-3"
                    >
                      View Live App ↗
                    </a>
                  )}
                </div>
              </form>

              {/* Right: large draft preview - the sidebar preview is
                  hidden on this step (see the grid below) so this is the
                  only preview visible, matching the approved Publish
                  screen's own embedded, larger phone. */}
              <div className="flex justify-center lg:justify-start">
                <div
                  className="w-[220px] h-[440px] rounded-[24px] overflow-hidden shadow-2xl"
                  style={{ border: `3px solid ${GUEST_BASE_PALETTE.forest}`, background: GUEST_BASE_PALETTE.parchment }}
                >
                  <GuestApp
                    tenantName={name}
                    brand={{
                      name,
                      logoRef,
                      palette,
                      customPrimary,
                      customSecondary,
                      customNavigation,
                      customText,
                      atmosphere,
                      imageStyle: "rounded",
                    }}
                    heroImageUrl={heroImageUrl}
                    logoUrl={logoUrl}
                    todayIso={todayIso}
                    nowTime={currentTimeInTimezone(timezone)}
                    enabledModules={Array.from(enabledModules)}
                    schedule={schedule}
                    facilitators={facilitators.map((f) => ({ ...f, imageUrl: f.imageUrl ?? null }))}
                    meals={meals.map((m) => ({ ...m, imageUrl: m.imageUrl ?? null }))}
                    treatments={treatments.map((t) => ({ ...t, imageUrl: t.imageUrl ?? null }))}
                    facilities={facilities.map((f) => ({ ...f, imageUrl: f.imageUrl ?? null }))}
                    arrivalInfo={arrivalInfo}
                    faq={faq.filter((f) => f.enabled)}
                    customPages={customPages.filter((p) => p.enabled).map((p) => ({ ...p, imageUrl: p.imageUrl ?? null }))}
                    stayConnected={{ links: stayConnected }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {step === "share" && tenantId && (
          <ShareSpaceStep
            tenantId={tenantId}
            name={name}
            slug={currentSlug}
            spaceImageUrl={spaceImageUrl}
            logoUrl={logoUrl}
            heroImageUrl={publishedHeroImageUrl}
            initialGuestAccessSettings={initialGuestAccessSettings}
            primaryHex={effectivePrimary}
            secondaryHex={effectiveSecondary}
            status={shareStatus}
          />
        )}

        {step === "featured" && tenantId && (
          <FeaturedStep
            tenantId={tenantId}
            name={name}
            spaceImageUrl={spaceImageUrl}
            initialSubmission={initialFeaturedSubmission}
          />
        )}
      </section>

      {/* RIGHT: live preview - Visual Fidelity Phase 1: frame proportions,
          border and radius now match the approved GuestPreviewPane exactly
          (390:780 aspect ratio, preserved at every breakpoint below rather
          than fixed pixel dimensions - see the batch report for why).
          Hidden on the Publish step - that step embeds its own larger
          preview instead, matching the approved design (the sidebar and
          Publish-screen previews are never both on screen at once).
          Hidden below `lg` entirely (Mobile Studio Navigation) - a
          390px-wide screen has no room to stack a full phone mockup
          into the content flow underneath the section being edited;
          the "Resume this draft later" link it also carries isn't
          reachable there either, so nothing mobile-only is lost. */}
      {step !== "publish" && step !== "share" && step !== "featured" && (
      <aside className="hidden lg:flex bg-idw-forest px-8 py-12 flex-col items-center">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-idw-parchment/50">
          Draft Preview
        </div>
        <div className="text-[11px] text-idw-parchment/35 mt-1">What your guests will see once published</div>
        <div
          className="mt-7 w-[260px] h-[520px] rounded-[24px] lg:w-[220px] lg:h-[440px] lg:rounded-[20px] overflow-hidden shadow-2xl"
          style={{ border: `3px solid ${GUEST_BASE_PALETTE.forest}`, background: GUEST_BASE_PALETTE.parchment }}
        >
          <GuestApp
            tenantName={name}
            brand={{
              name,
              logoRef,
              palette,
              customPrimary,
              customSecondary,
              customNavigation,
              customText,
              atmosphere,
              imageStyle: "rounded",
            }}
            heroImageUrl={heroImageUrl}
            logoUrl={logoUrl}
            todayIso={todayIso}
            nowTime={currentTimeInTimezone(timezone)}
            enabledModules={Array.from(enabledModules)}
            schedule={schedule}
            facilitators={facilitators.map((f) => ({ ...f, imageUrl: f.imageUrl ?? null }))}
            meals={meals.map((m) => ({ ...m, imageUrl: m.imageUrl ?? null }))}
            treatments={treatments.map((t) => ({ ...t, imageUrl: t.imageUrl ?? null }))}
            facilities={facilities.map((f) => ({ ...f, imageUrl: f.imageUrl ?? null }))}
            arrivalInfo={arrivalInfo}
            faq={faq.filter((f) => f.enabled)}
            customPages={customPages.filter((p) => p.enabled).map((p) => ({ ...p, imageUrl: p.imageUrl ?? null }))}
            stayConnected={{ links: stayConnected }}
          />
        </div>
        {tenantId && (
          <button
            type="button"
            onClick={() => router.push(`/configurator/retreat/${tenantId}`)}
            className="mt-6 text-xs text-idw-parchment/60 underline"
          >
            Resume this draft later at this link
          </button>
        )}
      </aside>
      )}
      </div>

      <UnsavedChangesDialog
        open={pendingNavigation !== null}
        onSaveAndContinue={async () => {
          const succeeded = await saveAllDirtySections();
          if (succeeded && pendingNavigation) {
            const action = pendingNavigation;
            setPendingNavigation(null);
            action();
          }
          return succeeded;
        }}
        onLeaveWithoutSaving={() => {
          // Discard: the caller's own local state (name/timezone/colors/
          // enabledModules/schedule/facilitators) simply stays as-is in
          // memory, but every dirty flag clears and the deferred
          // navigation proceeds - since this component tree doesn't
          // unmount on an in-Studio step change, a later Save from
          // within the same session would otherwise still send the
          // abandoned edits, so the flags must genuinely clear here even
          // though the values themselves aren't reverted.
          dirty.dirtySections.forEach((section) => dirty.markClean(section));
          const action = pendingNavigation;
          setPendingNavigation(null);
          action?.();
        }}
        onCancel={() => setPendingNavigation(null)}
      />
    </>
  );
}
