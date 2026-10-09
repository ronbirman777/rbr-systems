"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { timezoneOptions, timezoneSelectValue } from "@/lib/timezone";
import { computeClassTimes, resolveLocalTime } from "@/lib/teach/classTime";
import { recurrenceProblem, recurrenceSummary, repeatPresetOf, validExceptions, validRule, weekdayOfDate, type RepeatPreset } from "@/lib/teach/recurrenceText";
import { dstConflicts, upcomingOccurrenceDates, type DstConflict } from "@/lib/teach/recurrence";
import { normalizeSlug, checkSlugLocally } from "@/lib/slug";
import { MEDIA_BUCKET } from "@/lib/media/path";
import { detectAudioDuration, uploadAudioDraftObject } from "@/lib/media/audioUpload";
import { audioFileProblem } from "@/lib/media/audio";
import { SOCIAL_PLATFORMS, socialPlatformLabel, type SocialPlatform } from "@/lib/modules/socialLinks";
import { checkSlugAvailability, reserveSlug } from "@/app/(site)/configurator/retreat/actions";
import { publishTeachSpace, saveTeachDirectoryListing } from "./actions";
import { PublicLinkCard } from "@/components/studio/public-link-card";
import { QrCodeCard } from "@/components/studio/qr-code-card";
import { ShareCardPanel } from "@/components/studio/share-card-panel";
import { SpaceCountryCard } from "@/components/studio/space-country-card";
import { SpaceLanguageCard } from "@/components/studio/space-language-card";
import { BrandContrastFeedback } from "@/components/studio/brand-contrast-feedback";
import { GUEST_BASE_PALETTE } from "@/lib/theme/tokens";
import { ClassWhatsAppQr } from "@/components/studio/class-whatsapp-qr";
import { publicSpaceUrl, guestAppPath } from "@/lib/studio/publicLink";
import {
  AUDIO_ALLOWED_TYPES,
  AVAILABILITY_METHODS,
  CONTACT_METHODS,
  DAILY_INSPIRATION_MAX_LENGTH,
  DAILY_INSPIRATION_MAX_QUOTES,
  REGISTRATION_METHODS,
  TEACH_CORNERS,
  TEACH_DIVIDERS,
  TEACH_HERO_LAYOUTS,
  TEACH_OVERLAYS,
  TEACH_QUOTE_STYLES,
  TEACH_SPACING,
  TEACH_TEXTURES,
  TEACH_TYPOGRAPHY,
  blankTeachMetadata,
  type ContactMethod,
  type EditableTeachItem,
  type ExploreCard,
  type RegistrationMethod,
  type TeachEditableItemKey,
  type TeachExploreModule,
  type ClassMetadata,
  type OccurrenceException,
  type Recurrence,
  type RecurrenceFreq,
  RECURRENCE_MAX_COUNT,
  RECURRENCE_MAX_INTERVAL,
} from "@/lib/teach/schemas";
import { styleLabels } from "@/lib/teach/style";
import {
  TEMPLATE_VARIABLES,
  buildRegistrationCta,
  buildRetreatRegistrationCta,
  classTemplateValues,
  contactMethodLabel,
  defaultClassWhatsappTemplate,
  defaultPrivateWhatsappTemplate,
  registrationMethodLabel,
  renderTemplate,
} from "@/lib/teach/links";
import { EXPLORE_MODULE_EMPTY_HINT, exploreModuleStatus } from "@/lib/teach/moduleVisibility";
import { weekdayLabels, describeAvailability, sortClasses } from "@/lib/teach/schedule";
import { formatDuration } from "@/lib/modules/duration";
import { getBrandPresets, presetColorUpdate } from "@/lib/brand/presets";
import type { StudioApi, SectionKey } from "./teach-studio";
import { audioAttached, audioDetached, imageRemoved, imageUploaded, moveItemById, patchExploreCard, patchItemById, patchSlot, type Patch } from "./studioStateUpdates";
import { SectionHeader } from "@/components/studio/section-header";
import { CollapsibleItemRow } from "@/components/studio/collapsible-item-row";
import { createTranslator, translate, type Locale, type TranslationKey } from "@/lib/i18n";
import { formatShortDateLocalized, shortWeekdayName } from "@/lib/i18n/datetime";
import { retreatDateSummary, formatRetreatPrice } from "@/lib/teach/retreats";
import { formatPublishedAtUtc } from "@/lib/studio/status";
import { PRESET_LABEL } from "@/lib/brand/presetLabels";
import {
  Card,
  ColorField,
  Hint,
  ImageField,
  Label,
  Segmented,
  SelectField,
  StudioButton,
  TextArea,
  TextField,
  Toggle,
  INPUT,
} from "@/components/studio/studio-fields";

type Props = { api: StudioApi };

// ---------------------------------------------------------------------------
// Shared section chrome
// ---------------------------------------------------------------------------

function SaveBar({ api, section }: { api: StudioApi; section: SectionKey }) {
  const { t } = createTranslator(api.locale);
  const dirty = api.isDirty(section);
  return (
    <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-white/95 backdrop-blur border border-[#E2DACD] shadow-md">
      <span className="text-[12.5px] text-[#6F6C66]" role="status">
        {api.saving === section ? t("common", "savingNow") : dirty ? t("studio", "unsavedChangesShort") : t("studio", "allChangesSaved")}
      </span>
      <StudioButton onClick={() => api.save(section)} disabled={!dirty || api.saving !== null}>
        {t("studio", "saveChanges")}
      </StudioButton>
    </div>
  );
}

const newId = () => crypto.randomUUID();

const str = (v: string | null | undefined) => v ?? "";
const nul = (v: string) => (v.trim() ? v : null);

/**
 * Generic list editor for module_items-backed content: collapsible rows,
 * add, reorder, delete (delete persists immediately via deleteTeachItem,
 * like Time to Flow's item removal).
 */
function ItemList<K extends TeachEditableItemKey>({
  api,
  moduleKey,
  section,
  addLabel,
  emptyText,
  summary,
  editor,
  reorder = true,
  order,
  max,
}: {
  api: StudioApi;
  moduleKey: K;
  section: SectionKey;
  addLabel: string;
  emptyText: string;
  summary: (item: EditableTeachItem<K>) => { title: string; sub: string; thumb?: string | null };
  editor: (item: EditableTeachItem<K>, update: (patch: Patch<EditableTeachItem<K>>) => void, index: number) => ReactNode;
  reorder?: boolean;
  order?: (items: EditableTeachItem<K>[]) => EditableTeachItem<K>[];
  max?: number;
}) {
  const { t } = createTranslator(api.locale);
  const items = api.items[moduleKey] as EditableTeachItem<K>[];
  const shown = order ? order(items) : items;
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Always merges into the latest list (functional update): late async
  // completions must not write back a render-time snapshot of the list.
  const update = (id: string, patch: Patch<EditableTeachItem<K>>) =>
    api.setItems(moduleKey, (prev) => patchItemById(prev, id, patch), section);
  const move = (id: string, dir: -1 | 1) => api.setItems(moduleKey, (prev) => moveItemById(prev, id, dir), section);
  const add = () => {
    const item = {
      id: newId(),
      title: "",
      subtitle: null,
      description: null,
      imageRef: null,
      imageUrl: null,
      externalLink: null,
      metadata: blankTeachMetadata(moduleKey, api.todayIso, api.timezone),
    } as EditableTeachItem<K>;
    api.setItems(moduleKey, [...items, item], section);
    setOpen(item.id);
  };
  const remove = async (id: string) => {
    if (!window.confirm(t("studio", "removeConfirm"))) return;
    setBusy(id);
    const err = await api.removeItem(moduleKey, id);
    setBusy(null);
    setError(err);
  };

  return (
    <div className="flex flex-col gap-2.5">
      {shown.length === 0 ? <p className="text-[13px] text-[#8C8A84] px-1">{emptyText}</p> : null}
      {shown.map((item) => {
        const s = summary(item);
        const isOpen = open === item.id;
        const index = items.findIndex((i) => i.id === item.id);
        return (
          <CollapsibleItemRow
            key={item.id}
            locale={api.locale}
            testId={`item-${moduleKey}`}
            title={s.title}
            sub={s.sub}
            thumb={s.thumb}
            open={isOpen}
            onToggle={() => setOpen(isOpen ? null : item.id)}
            move={
              reorder && !order
                ? {
                    up: () => move(item.id, -1),
                    down: () => move(item.id, 1),
                    upDisabled: index === 0,
                    downDisabled: index === items.length - 1,
                  }
                : undefined
            }
            onRemove={() => remove(item.id)}
            removing={busy === item.id}
          >
            {editor(item, (patch) => update(item.id, patch), index)}
          </CollapsibleItemRow>
        );
      })}
      {error ? <p className="text-[12px] text-[#8F3B3B]" role="alert">{error}</p> : null}
      <div>
        <StudioButton kind="soft" onClick={add} disabled={max !== undefined && items.length >= max}>
          + {addLabel}
        </StudioButton>
        {max !== undefined ? <Hint>{t("studio", "usedOfMax", { used: items.length, max })}</Hint> : null}
      </div>
    </div>
  );
}

/** Image control bound to a module_items row (shared upload action + focal point in metadata). */
function ItemImage<K extends TeachEditableItemKey>({
  api,
  moduleKey,
  section,
  item,
  index,
  update,
  label,
  previewClassName,
  hint,
}: {
  api: StudioApi;
  moduleKey: K;
  section: SectionKey;
  item: EditableTeachItem<K>;
  index: number;
  update: (patch: Patch<EditableTeachItem<K>>) => void;
  label: string;
  previewClassName?: string;
  hint?: string;
}) {
  const { t } = createTranslator(api.locale);
  const meta = item.metadata as { imagePosition?: { x: number; y: number } | null };
  return (
    <ImageField
      locale={api.locale}
      label={label}
      imageUrl={api.mediaUrl(item.imageRef)}
      focal={meta.imagePosition ?? null}
      previewClassName={previewClassName}
      hint={hint}
      onFocal={(f) => update((cur) => ({ metadata: { ...cur.metadata, imagePosition: f } }))}
      onUpload={async (file) => {
        const res = await api.uploadItemImage(moduleKey, item, index, file);
        if (res.error || !res.ref) return res.error ?? t("studio", "uploadFailed");
        const ref = res.ref;
        // Touch only the image fields of this item, against the latest state.
        update(imageUploaded<EditableTeachItem<K>>(ref));
        api.markDirty(section);
        return null;
      }}
      onRemove={async () => {
        const err = await api.removeItemImage(moduleKey, item);
        if (err) return err;
        update(imageRemoved<EditableTeachItem<K>>());
        return null;
      }}
    />
  );
}

/** Image control bound to a settings slot (About profile, Contact cover, Explore cards). */
function SettingsImage({
  api,
  settingsKey,
  slot,
  value,
  onChange,
  label,
  previewClassName,
}: {
  api: StudioApi;
  settingsKey: "teachAbout" | "teachContact" | "teachExplore";
  slot: string;
  value: { imageRef: string | null; imagePosition: { x: number; y: number } | null };
  onChange: (v: { imageRef?: string | null; imagePosition: { x: number; y: number } | null }) => void;
  label: string;
  previewClassName?: string;
}) {
  const { t } = createTranslator(api.locale);
  return (
    <ImageField
      locale={api.locale}
      label={label}
      imageUrl={api.mediaUrl(value.imageRef)}
      focal={value.imagePosition}
      previewClassName={previewClassName}
      onFocal={(f) => onChange({ imagePosition: f })}
      onUpload={async (file) => {
        const res = await api.uploadSettingsImage(settingsKey, slot, file);
        if (res.error || !res.ref) return res.error ?? t("studio", "uploadFailed");
        onChange({ imageRef: res.ref, imagePosition: null });
        return null;
      }}
      onRemove={async () => {
        // Form state only: the saved row keeps pointing at the object until
        // Save succeeds, and saveTeachSettings removes it afterwards.
        onChange({ imageRef: null, imagePosition: null });
        return null;
      }}
    />
  );
}

function Grid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 }) {
  return <div className={`grid gap-4 ${cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export function IdentitySection({ api }: Props) {
  const { t } = createTranslator(api.locale);
  const profile = api.settings.teachProfile;
  const di = api.settings.dailyInspiration;
  const timezones = useMemo(() => timezoneOptions(api.timezone), [api.timezone]);
  const [slugInput, setSlugInput] = useState(api.slug ?? "");
  const [slugStatus, setSlugStatus] = useState<string | null>(null);
  const [slugBusy, setSlugBusy] = useState(false);
  const [quoteDraft, setQuoteDraft] = useState("");

  const local = slugInput ? checkSlugLocally(slugInput) : null;
  const normalized = normalizeSlug(slugInput);

  async function checkAndReserve() {
    setSlugBusy(true);
    setSlugStatus(null);
    const fd = new FormData();
    fd.set("slug", normalized);
    const check = await checkSlugAvailability({ status: "idle", slug: "", error: null }, fd);
    if (check.status !== "available") {
      setSlugBusy(false);
      setSlugStatus(
        check.status === "invalid"
          ? t("studio", "addressRulesShort")
          : check.status === "reserved"
            ? t("studio", "addressReserved")
            : check.status === "unavailable"
              ? t("studio", "addressTaken")
              : (check.error ?? t("studio", "addressCheckFailed"))
      );
      return;
    }
    const rf = new FormData();
    rf.set("tenantId", api.tenantId);
    rf.set("name", api.name);
    rf.set("timezone", api.timezone);
    rf.set("slug", normalized);
    const res = await reserveSlug({ error: null, slug: null, tenantId: null }, rf);
    setSlugBusy(false);
    if (res.error) setSlugStatus(res.error);
    else {
      api.setSlug(res.slug);
      setSlugStatus(t("studio", "addressReservedAt", { address: `${res.slug}.innerdwes.com` }));
    }
  }

  const quotes = di.quotes;
  const setQuotes = (next: string[]) => api.updateSetting("dailyInspiration", { quotes: next }, "identity");

  return (
    <>
      <SectionHeader eyebrow={t("teach", "identityEyebrow")} title={t("teach", "sectionIdentity")} intro={t("teach", "identityBody")} />
      <SpaceCountryCard tenantId={api.tenantId} locale={api.locale} />
      <SpaceLanguageCard tenantId={api.tenantId} uiLocale={api.locale} onChange={api.setLocale} />
      <Card title={t("teach", "whoYouAre")} description={t("teach", "whoYouAreBody")}>
        <Grid>
          <TextField label={t("teach", "myName")} value={api.name} onChange={api.setName} maxLength={80} placeholder={t("teach", "myNamePlaceholder")} />
          <TextField
            label={t("teach", "teacherType")}
            value={str(profile.teacherType)}
            onChange={(v) => api.updateSetting("teachProfile", { teacherType: nul(v) }, "identity")}
            maxLength={80}
            placeholder={t("teach", "teacherTypePlaceholder")}
            hint={t("teach", "teacherTypeHint")}
          />
        </Grid>
        <Grid>
          <SelectField label={t("teach", "timeZone")} value={timezoneSelectValue(api.timezone)} onChange={api.setTimezone} options={timezones.map((t) => ({ value: t, label: t }))} hint={t("teach", "timeZoneHint")} />
          <div>
            <Label htmlFor="tt-slug">{t("flow", "guestAddress")}</Label>
            <div className="flex gap-2">
              <div className="relative flex-1 min-w-0">
                <input id="tt-slug" value={slugInput} onChange={(e) => setSlugInput(e.target.value)} placeholder="maya" className={`${INPUT} pr-32`} />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] text-[#8C8A84] pointer-events-none">.innerdwes.com</span>
              </div>
              <StudioButton kind="outline" onClick={checkAndReserve} disabled={slugBusy || !normalized || normalized === api.slug || local !== "ok"}>
                {slugBusy ? "…" : t("studio", "reserve")}
              </StudioButton>
            </div>
            <Hint>
              {slugStatus ??
                (api.slug
                  ? t("studio", "currentAddressIs", { address: `${api.slug}.innerdwes.com` })
                  : local === "invalid"
                    ? t("studio", "addressRulesShort")
                    : local === "reserved"
                      ? t("studio", "addressReserved")
                      : t("studio", "reserveYourAddress"))}
            </Hint>
          </div>
        </Grid>
      </Card>
      <Card title={t("teach", "primaryImage")} description={t("teach", "primaryImageBody")}>
        <ImageField
          locale={api.locale}
          label={t("teach", "heroImage")}
          imageUrl={api.mediaUrl(api.heroImageRef)}
          focal={profile.heroImagePosition}
          previewClassName="w-[150px] h-[190px] rounded-t-full rounded-b-2xl"
          onFocal={(f) => api.updateSetting("teachProfile", { heroImagePosition: f }, "identity")}
          onUpload={api.uploadHero}
          onRemove={api.removeHero}
          hint={t("teach", "heroImageFormats")}
        />
      </Card>
      <Card title={t("teach", "dailyInspiration")} description={t("teach", "dailyInspirationBody")}>
        <ol className="flex flex-col gap-2">
          {quotes.map((q, i) => (
            <li key={i} className="flex items-center gap-2">
              <input
                value={q}
                maxLength={DAILY_INSPIRATION_MAX_LENGTH}
                onChange={(e) => setQuotes(quotes.map((x, j) => (j === i ? e.target.value : x)))}
                aria-label={t("teach", "quoteN", { index: i + 1 })}
                className={`${INPUT} italic`}
                style={{ fontFamily: "var(--font-fraunces), serif" }}
              />
              <button type="button" aria-label={t("teach", "removeQuoteN", { index: i + 1 })} onClick={() => setQuotes(quotes.filter((_, j) => j !== i))} className="w-10 h-10 rounded-lg text-[#8C8A84] hover:bg-black/5 shrink-0">
                ✕
              </button>
            </li>
          ))}
        </ol>
        <div className="flex gap-2">
          <input
            value={quoteDraft}
            maxLength={DAILY_INSPIRATION_MAX_LENGTH}
            onChange={(e) => setQuoteDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && quoteDraft.trim()) {
                e.preventDefault();
                setQuotes([...quotes, quoteDraft.trim()]);
                setQuoteDraft("");
              }
            }}
            placeholder={t("teach", "quotePlaceholder")}
            aria-label={t("teach", "newQuote")}
            className={INPUT}
          />
          <StudioButton
            kind="soft"
            disabled={!quoteDraft.trim() || quotes.length >= DAILY_INSPIRATION_MAX_QUOTES}
            onClick={() => {
              setQuotes([...quotes, quoteDraft.trim()]);
              setQuoteDraft("");
            }}
          >
            {t("common", "add")}
          </StudioButton>
        </div>
        <Hint>
          {t("teach", "quotesCounter", {
            count: quotes.length,
            max: DAILY_INSPIRATION_MAX_QUOTES,
            chars: DAILY_INSPIRATION_MAX_LENGTH,
          })}
        </Hint>
        <Toggle
          checked={di.useFallback}
          onChange={(v) => api.updateSetting("dailyInspiration", { useFallback: v }, "identity")}
          label={t("teach", "useInnerDwesQuotes")}
        />
      </Card>
      <SaveBar api={api} section="identity" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Brand
// ---------------------------------------------------------------------------

export function BrandSection({ api }: Props) {
  const { t } = createTranslator(api.locale);
  const styleLabel = styleLabels(api.locale);
  const style = api.settings.teachStyle;
  const set = (patch: Partial<typeof style>) => api.updateSetting("teachStyle", patch, "brand");
  const [advanced, setAdvanced] = useState(Boolean(api.colors.navigation || api.colors.text));
  const presets = getBrandPresets("teach");
  const customSelected = !presets.some((p) => p.key === style.preset);
  const opt = <T extends string>(keys: readonly T[], labels: Record<T, string>) => keys.map((k) => ({ value: k, label: labels[k] }));
  return (
    <>
      <SectionHeader eyebrow={t("teach", "identityEyebrow")} title={t("teach", "sectionBrand")} intro={t("teach", "brandBody")} />
      <Card title={t("studio", "colourPalette")} description={t("teach", "palettePresetsBody")}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5" role="radiogroup" aria-label={t("studio", "palettePresets")} data-testid="brand-presets">
          {presets.map((p) => {
            const selected = style.preset === p.key;
            return (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  const next = presetColorUpdate("teach", p);
                  api.setColors({ primary: next.primary, accent: next.accent, navigation: next.navigation, text: next.text });
                  setAdvanced(true);
                  set({ preset: p.key, background: next.surface });
                }}
                className="flex flex-col gap-2 p-3 rounded-xl text-left"
                style={{ background: p.surface, border: selected ? "2px solid #192B21" : "1px solid #E2DACD" }}
              >
                <span className="flex gap-1.5">
                  <span className="w-6 h-6 rounded-full" style={{ background: p.primary }} />
                  <span className="w-6 h-6 rounded-full" style={{ background: p.accent }} />
                </span>
                <span className="text-[13px] font-semibold" style={{ color: p.text }}>
                  {t("studio", PRESET_LABEL[p.key])}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={customSelected}
            onClick={() => set({ preset: "custom" })}
            className="flex flex-col gap-2 p-3 rounded-xl text-left bg-white"
            style={{ border: customSelected ? "2px solid #192B21" : "1px dashed #CFC4B4" }}
          >
            <span className="flex gap-1.5">
              <span className="w-6 h-6 rounded-full" style={{ background: api.colors.primary }} />
              <span className="w-6 h-6 rounded-full" style={{ background: api.colors.accent }} />
            </span>
            <span className="text-[13px] font-semibold text-[#192B21]">{t("teach", "customColours")}</span>
          </button>
        </div>
        {/* Shared with Flow - the same component grades both products, so
            "is this readable" has one answer across InnerDweS. */}
        <BrandContrastFeedback
          locale={api.locale}
          primary={api.colors.primary}
          accent={api.colors.accent}
          navigation={api.colors.navigation ?? api.colors.primary}
          text={api.colors.text ?? api.colors.primary}
          surface={style.background ?? GUEST_BASE_PALETTE.parchment}
        />
        <Grid>
          <ColorField
            locale={api.locale}
            label={t("studio", "primaryColour")}
            value={api.colors.primary}
            checkWhiteText
            swatches={presets.map((p) => ({ label: t("studio", PRESET_LABEL[p.key]), hex: p.primary }))}
            onChange={(hex) => {
              api.setColors({ ...api.colors, primary: hex });
              set({ preset: "custom" });
            }}
            hint={t("teach", "primaryColourHelpTeach")}
          />
          <ColorField
            locale={api.locale}
            label={t("studio", "accentColour")}
            value={api.colors.accent}
            swatches={presets.map((p) => ({ label: t("studio", PRESET_LABEL[p.key]), hex: p.accent }))}
            onChange={(hex) => {
              api.setColors({ ...api.colors, accent: hex });
              set({ preset: "custom" });
            }}
            hint={t("teach", "accentColourHelpTeach")}
          />
        </Grid>
        <ColorField locale={api.locale} label={t("studio", "backgroundTint")} value={style.background ?? "#F5F0E8"} onChange={(hex) => set({ background: hex, preset: "custom" })} hint={t("teach", "backgroundTintHelpTeach")} />
        <Toggle checked={advanced} onChange={(v) => {
          setAdvanced(v);
          if (!v) api.setColors({ ...api.colors, navigation: null, text: null });
        }} label={t("teach", "fineTuneColours")} description={t("teach", "fineTuneColoursBody")} />
        {advanced ? (
          <Grid>
            <ColorField locale={api.locale} label={t("studio", "navigationColour")} value={api.colors.navigation ?? api.colors.primary} onChange={(hex) => {
              api.setColors({ ...api.colors, navigation: hex });
              set({ preset: "custom" });
            }} />
            <ColorField locale={api.locale} label={t("studio", "textColour")} value={api.colors.text ?? api.colors.primary} onChange={(hex) => {
              api.setColors({ ...api.colors, text: hex });
              set({ preset: "custom" });
            }} />
          </Grid>
        ) : null}
      </Card>
      <Card title={t("studio", "lookAndFeel")} description={t("teach", "lookAndFeelBody")}>
        {(
          [
            [t("teach", "typographyPairing"), "typography", opt(TEACH_TYPOGRAPHY, styleLabel.typography)],
            [t("teach", "cardCorners"), "corners", opt(TEACH_CORNERS, styleLabel.corners)],
            [t("teach", "heroLayout"), "heroLayout", opt(TEACH_HERO_LAYOUTS, styleLabel.hero)],
            [t("teach", "quoteStyle"), "quoteStyle", opt(TEACH_QUOTE_STYLES, styleLabel.quote)],
            [t("teach", "imageOverlay"), "overlay", opt(TEACH_OVERLAYS, styleLabel.overlay)],
            [t("teach", "sectionSpacing"), "spacing", opt(TEACH_SPACING, styleLabel.spacing)],
            [t("teach", "backgroundTexture"), "texture", opt(TEACH_TEXTURES, styleLabel.texture)],
            [t("teach", "dividers"), "dividers", opt(TEACH_DIVIDERS, styleLabel.dividers)],
          ] as const
        ).map(([label, key, options]) => (
          <div key={key} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-[13.5px] font-medium text-[#192B21]">{label}</span>
            <Segmented
              label={label}
              value={style[key] as string}
              options={options as readonly { value: string; label: string }[]}
              onChange={(v) => set({ [key]: v } as Partial<typeof style>)}
            />
          </div>
        ))}
        <Toggle checked={style.organicShapes} onChange={(v) => set({ organicShapes: v })} label={t("teach", "organicShapes")} description={t("teach", "organicShapesBody")} />
      </Card>
      <SaveBar api={api} section="brand" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

export function HomeSection({ api }: Props) {
  const { t } = createTranslator(api.locale);
  const p = api.settings.teachProfile;
  const hs = p.homeSections;
  const setHs = (patch: Partial<typeof hs>) => api.updateSetting("teachProfile", { homeSections: { ...hs, ...patch } }, "home");
  return (
    <>
      <SectionHeader eyebrow={t("teach", "identityEyebrow")} title={t("teach", "navHome")} intro={t("teach", "homeBody")} />
      <Card title={t("teach", "greeting")} description={t("teach", "greetingBody")}>
        <Grid>
          <TextField label={t("teach", "greeting")} value={str(p.greeting)} onChange={(v) => api.updateSetting("teachProfile", { greeting: nul(v) }, "home")} maxLength={140} placeholder={t("teach", "greetingPlaceholder")} />
          <TextField label={t("teach", "locationLine")} value={str(p.locationLine)} onChange={(v) => api.updateSetting("teachProfile", { locationLine: nul(v) }, "home")} maxLength={140} placeholder={t("teach", "locationLinePlaceholder")} />
        </Grid>
      </Card>
      <Card title={t("teach", "homeSections")} description={t("teach", "homeSectionsBody")}>
        <Toggle checked={hs.quote} onChange={(v) => setHs({ quote: v })} label={t("teach", "dailyInspiration")} description={t("teach", "homeQuoteBody")} />
        <Toggle checked={hs.today} onChange={(v) => setHs({ today: v })} label={t("teach", "todaysClasses")} description={t("teach", "homeTodayBody")} />
        <Toggle checked={hs.private} onChange={(v) => setHs({ private: v })} label={t("teach", "privateThisWeek")} description={t("teach", "homePrivateBody")} />
        <Toggle checked={hs.library} onChange={(v) => setHs({ library: v })} label={t("teach", "fromMyLibrary")} description={t("teach", "fromMyLibraryBody")} />
        <Toggle checked={hs.contact} onChange={(v) => setHs({ contact: v })} label={t("teach", "contactShortcut")} description={t("teach", "contactShortcutBody")} />
      </Card>
      <SaveBar api={api} section="home" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

/** Translation keys; venueLink shows no value field of its own. */
const REG_VALUE_LABEL_KEY: Record<RegistrationMethod, TranslationKey<"teach"> | null> = {
  whatsapp: "whatsappNumber",
  website: "registrationPageUrl",
  instagram: "instagramHandleOrUrl",
  facebook: "facebookEventOrPage",
  email: "emailAddress",
  bookingLink: "bookingLink",
  venueLink: null,
};

function TemplateEditor({ value, onChange, fallback, previewValues, locale }: { value: string | null; onChange: (v: string | null) => void; fallback: string; previewValues: Parameters<typeof renderTemplate>[1]; locale: Locale }) {
  const { t } = createTranslator(locale);
  const ref = useRef<HTMLTextAreaElement>(null);
  const current = value ?? fallback;
  const insert = (v: string) => {
    const el = ref.current;
    const token = `{{${v}}}`;
    if (!el) return onChange(current + token);
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    onChange(current.slice(0, start) + token + current.slice(end));
  };
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="tt-template">{t("teach", "messageTemplate")}</Label>
      <textarea id="tt-template" ref={ref} value={current} rows={3} maxLength={600} onChange={(e) => onChange(e.target.value)} className={`${INPUT} leading-relaxed`} />
      <div className="flex flex-wrap gap-1.5" aria-label={t("teach", "insertVariable")}>
        {TEMPLATE_VARIABLES.map((v) => (
          <button key={v} type="button" onClick={() => insert(v)} className="px-2 min-h-8 rounded-md bg-[#F1E9DC] text-[11.5px] font-medium text-[#9A7B4F]">
            {`{{${v}}}`}
          </button>
        ))}
        {value !== null ? (
          <button type="button" onClick={() => onChange(null)} className="px-2 min-h-8 text-[11.5px] underline text-[#6F6C66]">
            {t("teach", "useDefault")}
          </button>
        ) : null}
      </div>
      <p className="text-[12px] px-3 py-2 rounded-lg bg-[#EAF1EA] text-[#3F6A4C]" data-testid="template-preview">
        Preview: “{renderTemplate(current, previewValues)}”
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recurring classes: the Repeat block of the Class editor. Edits one series
// (the class row); the guest app expands it into dated occurrences. The
// Studio never shows raw RRULE text.
// ---------------------------------------------------------------------------

/** Translation keys; the stored VALUE stays the canonical English enum. */
const REPEAT_OPTIONS: { value: RepeatPreset; labelKey: "repeatNone" | "repeatDaily" | "repeatWeekly" | "repeatMonthly" | "repeatCustom" }[] = [
  { value: "none", labelKey: "repeatNone" },
  { value: "daily", labelKey: "repeatDaily" },
  { value: "weekly", labelKey: "repeatWeekly" },
  { value: "monthly", labelKey: "repeatMonthly" },
  { value: "custom", labelKey: "repeatCustom" },
];
const UNIT_OPTIONS: { value: RecurrenceFreq; labelKey: "unitDays" | "unitWeeks" | "unitMonths" }[] = [
  { value: "daily", labelKey: "unitDays" },
  { value: "weekly", labelKey: "unitWeeks" },
  { value: "monthly", labelKey: "unitMonths" },
];
const END_OPTIONS: { value: "never" | "until" | "count"; labelKey: "endsNever" | "endsOnDate" | "endsAfter" }[] = [
  { value: "never", labelKey: "endsNever" },
  { value: "until", labelKey: "endsOnDate" },
  { value: "count", labelKey: "endsAfter" },
];

function RecurrenceEditor({ api, meta, setM }: { api: StudioApi; meta: ClassMetadata; setM: (patch: Partial<ClassMetadata>) => void }) {
  const { t } = createTranslator(api.locale);
  const rule = validRule(meta);
  const problem = recurrenceProblem(meta);
  const exceptions = validExceptions(meta);
  // Kept locally so "Custom" stays selected while its interval is still 1.
  const [preset, setPreset] = useState<RepeatPreset>(repeatPresetOf(rule));
  const [moving, setMoving] = useState<string | null>(null);
  const tz = meta.timezone ?? api.timezone;
  const startWeekday = weekdayOfDate(meta.startDate);

  const setRule = (patch: Partial<Recurrence>) => {
    const base: Recurrence = rule ?? { freq: "weekly", interval: 1, byWeekday: [startWeekday], end: { type: "never" } };
    setM({ recurrence: { ...base, ...patch } });
  };
  const choosePreset = (p: RepeatPreset) => {
    setPreset(p);
    if (p === "none") return setM({ recurrence: null });
    const end = rule?.end ?? { type: "never" as const };
    if (p === "custom") {
      const freq = rule?.freq ?? "weekly";
      return setM({ recurrence: { freq, interval: Math.max(2, rule?.interval ?? 1), byWeekday: freq === "weekly" ? (rule?.byWeekday.length ? rule.byWeekday : [startWeekday]) : [], end } });
    }
    setM({ recurrence: { freq: p, interval: 1, byWeekday: p === "weekly" ? (rule?.byWeekday.length ? rule.byWeekday : [startWeekday]) : [], end } });
  };
  const toggleDay = (d: number) => {
    if (!rule) return;
    const days = rule.byWeekday.length ? rule.byWeekday : [startWeekday];
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b);
    if (next.length > 0) setRule({ byWeekday: next });
  };
  // Per-date changes are only editable while the stored changes are valid.
  const setException = (date: string, patch: Partial<OccurrenceException> | null) => {
    if (problem?.exceptions) return;
    const next = { ...exceptions };
    if (patch === null) delete next[date];
    else {
      const blank: OccurrenceException = { cancelled: false, startDate: null, startTime: null, endTime: null, location: null };
      next[date] = { ...blank, ...(next[date] ?? {}), ...patch };
    }
    setM({ exceptions: next });
  };

  const today = api.todayIso;
  const fromDate = meta.startDate > today ? meta.startDate : today;
  // Both helpers return [] for a missing or malformed rule.
  const upcoming = useMemo(() => upcomingOccurrenceDates(meta, fromDate, 8), [meta, fromDate]);
  const conflicts = useMemo(() => dstConflicts(meta, fromDate, addDaysIso(fromDate, 366), tz), [meta, fromDate, tz]);
  const conflictDates = new Set(conflicts.map((c) => c.originalDate));
  const cancelledCount = Object.values(exceptions).filter((e) => e.cancelled).length;

  return (
    <div className="flex flex-col gap-4 p-4 rounded-xl border border-[#E2DACD] bg-white" data-testid="recurrence-editor">
      <h3 className="text-[16px] text-[#192B21]" style={{ fontFamily: "var(--font-fraunces), serif" }}>
        {t("teach", "repeat")}
      </h3>

      {problem?.recurrence ? (
        <div className="flex flex-col gap-3 p-3 rounded-lg bg-[#F6E3E0] text-[#7A2E2E]" role="alert" data-testid="recurrence-repair">
          <p className="text-[13px] font-semibold">{t("teach", "repeatDamaged")}</p>
          <p className="text-[12.5px]">
            {t("teach", "repeatDamagedBody")}
          </p>
          <div className="flex flex-wrap gap-2">
            <StudioButton kind="outline" onClick={() => { setPreset("weekly"); setM({ recurrence: { freq: "weekly", interval: 1, byWeekday: [startWeekday], end: { type: "never" } } }); }}>
              {t("teach", "setUpRepeatAgain")}
            </StudioButton>
            <StudioButton kind="outline" onClick={() => { setPreset("none"); setM({ recurrence: null }); }}>
              {t("teach", "makeOneOff")}
            </StudioButton>
          </div>
        </div>
      ) : null}
      {problem?.exceptions ? (
        <div className="flex flex-col gap-3 p-3 rounded-lg bg-[#F6E3E0] text-[#7A2E2E]" role="alert" data-testid="recurrence-exceptions-repair">
          <p className="text-[13px] font-semibold">{t("teach", "exceptionsDamaged")}</p>
          <p className="text-[12.5px]">{t("teach", "exceptionsDamagedBody")}</p>
          <div>
            <StudioButton kind="outline" onClick={() => setM({ exceptions: {} })}>
              {t("teach", "clearDamagedDates")}
            </StudioButton>
          </div>
        </div>
      ) : null}

      {!problem?.recurrence ? (
        <Grid>
          <SelectField label={t("teach", "repeat")} value={preset} onChange={choosePreset} options={REPEAT_OPTIONS.map((o) => ({ value: o.value, label: t("teach", o.labelKey) }))} />
          {rule && preset === "custom" ? (
            <div className="grid grid-cols-[96px_1fr] gap-2 items-end">
              <TextField
                label={t("teach", "repeatEvery")}
                inputMode="numeric"
                value={String(rule.interval)}
                onChange={(v) => {
                  const n = parseInt(v.replace(/\D/g, ""), 10);
                  setRule({ interval: Number.isFinite(n) ? Math.min(RECURRENCE_MAX_INTERVAL, Math.max(1, n)) : 1 });
                }}
              />
              <SelectField
                label={t("teach", "unit")}
                value={rule.freq}
                onChange={(f) => setRule({ freq: f, byWeekday: f === "weekly" ? (rule.byWeekday.length ? rule.byWeekday : [startWeekday]) : [] })}
                options={UNIT_OPTIONS.map((o) => ({ value: o.value, label: t("teach", o.labelKey) }))}
              />
            </div>
          ) : null}
        </Grid>
      ) : null}

      {rule?.freq === "weekly" ? (
        <div className="flex flex-col gap-1.5">
          <Label>{t("teach", "repeatOn")}</Label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("teach", "repeatOn")}>
            {[0, 1, 2, 3, 4, 5, 6].map((d) => {
              const label = shortWeekdayName(d, api.locale);
              const on = (rule.byWeekday.length ? rule.byWeekday : [startWeekday]).includes(d);
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDay(d)}
                  className={`min-w-11 min-h-10 px-2.5 rounded-full text-[12.5px] font-semibold ${on ? "bg-[#192B21] text-white" : "border border-[#E2DACD] text-[#192B21]"}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {rule ? (
        <div className="flex flex-col gap-2">
          <Label>{t("teach", "ends")}</Label>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("teach", "ends")}>
            {END_OPTIONS.map(({ value: k, labelKey }) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={rule.end.type === k}
                onClick={() => setRule({ end: k === "never" ? { type: "never" } : k === "until" ? { type: "until", until: rule.end.type === "until" ? rule.end.until : addDaysIso(meta.startDate, 90) } : { type: "count", count: rule.end.type === "count" ? rule.end.count : 10 } })}
                className={`px-3 min-h-9 rounded-full text-[12px] font-semibold ${rule.end.type === k ? "bg-[#192B21] text-white" : "border border-[#E2DACD] text-[#192B21]"}`}
              >
                {t("teach", labelKey)}
              </button>
            ))}
          </div>
          {rule.end.type === "until" ? (
            <div className="max-w-[240px]">
              <TextField label={t("teach", "lastDate")} type="date" value={rule.end.until} onChange={(v) => v && setRule({ end: { type: "until", until: v } })} />
            </div>
          ) : null}
          {rule.end.type === "count" ? (
            <div className="max-w-[240px]">
              <TextField
                label={t("teach", "numberOfClasses")}
                inputMode="numeric"
                value={String(rule.end.count)}
                onChange={(v) => {
                  const n = parseInt(v.replace(/\D/g, ""), 10);
                  setRule({ end: { type: "count", count: Number.isFinite(n) ? Math.min(RECURRENCE_MAX_COUNT, Math.max(1, n)) : 1 } });
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {rule ? (
        <>
          <p className="text-[13px] font-semibold px-3 py-2 rounded-lg bg-[#EAF1EA] text-[#3F6A4C]" data-testid="recurrence-summary">
            {recurrenceSummary(rule, meta.startDate)}
          </p>
          <Hint>{t("teach", "seriesNote")}</Hint>

          {conflicts.map((c) => (
            <DstConflictRow
              locale={api.locale}
              key={`${c.originalDate}-${c.field}`}
              conflict={c}
              timeZone={tz}
              meta={meta}
              moving={moving === c.originalDate}
              onMove={() => setMoving(moving === c.originalDate ? null : c.originalDate)}
              onCancel={() => setException(c.originalDate, { cancelled: true })}
              onApply={(startTime, endTime) => {
                setException(c.originalDate, { startTime, endTime });
                setMoving(null);
              }}
              editable={!problem?.exceptions}
            />
          ))}

          <div className="flex flex-col gap-1.5" data-testid="recurrence-upcoming">
            <Label>{t("teach", "upcomingDates")}</Label>
            <ul className="flex flex-col divide-y divide-[#EFE8DC] rounded-lg border border-[#E2DACD]">
              {upcoming.map((d) => {
                const ex = exceptions[d];
                const cancelled = Boolean(ex?.cancelled);
                const changed = !cancelled && Boolean(ex && (ex.startDate || ex.startTime || ex.endTime || ex.location));
                const blocked = conflictDates.has(d);
                const shownDate = ex?.startDate ?? d;
                const shownTime = ex?.startTime ?? meta.startTime;
                return (
                  <li key={d} className="flex items-center justify-between gap-3 px-3 min-h-11">
                    <span className="text-[13px] flex flex-wrap items-center gap-x-2 min-w-0">
                      <span className={`whitespace-nowrap ${cancelled ? "line-through text-[#8C8A84]" : "text-[#192B21]"}`}>
                        {formatShortDateLocalized(shownDate, api.locale)} · {shownTime}
                      </span>
                      {cancelled ? <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8F3B3B]">{t("teach", "statusCancelled")}</span> : null}
                      {changed ? <span className="text-[11px] font-semibold uppercase tracking-wider text-[#3F6A4C]">{t("teach", "statusChanged")}</span> : null}
                      {blocked ? <span className="text-[11px] font-semibold uppercase tracking-wider text-[#7A5418]">{t("teach", "needsAttention")}</span> : null}
                    </span>
                    {problem?.exceptions ? null : cancelled || changed ? (
                      <button type="button" onClick={() => setException(d, null)} className="shrink-0 text-[12px] font-semibold min-h-9 px-2 text-[#8F3B3B]" aria-label={t("teach", "restoreClassOn", { date: formatShortDateLocalized(d, api.locale) })}>
                        {t("teach", "restore")}
                      </button>
                    ) : (
                      <button type="button" onClick={() => setException(d, { cancelled: true })} className="shrink-0 text-[12px] font-semibold min-h-9 px-2 text-[#8F3B3B]" aria-label={t("teach", "cancelClassOn", { date: formatShortDateLocalized(d, api.locale) })}>
                        {t("common", "cancel")}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {cancelledCount > 0 ? <Hint>{cancelledCount === 1 ? "1 date is cancelled" : `${cancelledCount} dates are cancelled`}. Guests won’t see cancelled dates.</Hint> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

/** One occurrence whose local time doesn't exist (DST gap): never auto-moved; the teacher moves or cancels it. */
function DstConflictRow({
  conflict,
  locale,
  timeZone,
  meta,
  moving,
  onMove,
  onCancel,
  onApply,
  editable,
}: {
  conflict: DstConflict;
  locale: Locale;
  timeZone: string;
  meta: ClassMetadata;
  moving: boolean;
  onMove: () => void;
  onCancel: () => void;
  onApply: (startTime: string, endTime: string | null) => void;
  editable: boolean;
}) {
  const { t } = createTranslator(locale);
  const ex = validExceptions(meta)[conflict.originalDate];
  const [start, setStart] = useState(ex?.startTime ?? meta.startTime);
  const [end, setEnd] = useState(ex?.endTime ?? meta.endTime ?? "");
  const [error, setError] = useState<string | null>(null);
  const apply = () => {
    const date = ex?.startDate ?? conflict.originalDate;
    const s = resolveLocalTime(date, start, timeZone);
    const e = end ? resolveLocalTime(date, end, timeZone) : null;
    if (!s.ok || (e && !e.ok)) return setError(t("teach", "timeDoesNotExist", { date: formatShortDateLocalized(date, locale), timeZone }));
    if (e && e.ok && s.ok && e.instant <= s.instant) return setError(t("teach", "mustEndAfterStart"));
    setError(null);
    onApply(start, end || null);
  };
  return (
    <div className="flex flex-col gap-2 px-3 py-2.5 rounded-lg bg-[#FBF1DC] text-[#5E3F0E]" role="status" data-testid="recurrence-dst-conflict">
      <p className="text-[12.5px]">
        <strong>
          {formatShortDateLocalized(conflict.date, locale)} {conflict.date.slice(0, 4)} · {conflict.time}
        </strong>{" "}
        doesn’t exist in {timeZone} — the clocks go forward that night{conflict.field === "end" ? " (this is the class’s end time)" : ""}. This date isn’t shown to guests until you move or cancel it.
      </p>
      {editable ? (
        <div className="flex flex-wrap gap-2">
          <StudioButton kind="outline" onClick={onMove}>
            {moving ? t("common", "close") : t("teach", "moveThisDate")}
          </StudioButton>
          <StudioButton kind="outline" onClick={onCancel}>
            {t("teach", "cancelThisDate")}
          </StudioButton>
        </div>
      ) : null}
      {moving ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-[150px]">
            <TextField label={t("teach", "newStartTime")} type="time" value={start} onChange={(v) => v && setStart(v)} />
          </div>
          <div className="w-[150px]">
            <TextField label={t("teach", "newEndTime")} type="time" value={end} onChange={setEnd} />
          </div>
          <StudioButton kind="primary" onClick={apply}>
            {t("teach", "applyToThisDateOnly")}
          </StudioButton>
          {error ? (
            <p className="w-full text-[12px] text-[#8F3B3B]" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Studio class-list line; flags damaged repeat data and unresolved DST-gap dates. */
function classListSummary(m: ClassMetadata, subtitle: string | null, todayIso: string, tz: string, locale: Locale): string {
  const time = `${m.startTime}${m.endTime ? `–${m.endTime}` : ""}${subtitle ? ` · ${subtitle}` : ""}`;
  const problem = recurrenceProblem(m);
  if (problem) return `${translate(locale, "teach", "repeatNeedsRepairShort")} · ${time}`;
  const rule = validRule(m);
  if (!rule) return `${formatShortDateLocalized(m.startDate, locale)} · ${time}`;
  const from = m.startDate > todayIso ? m.startDate : todayIso;
  const n = new Set(dstConflicts(m, from, addDaysIso(from, 366), tz).map((c) => c.originalDate)).size;
  const attention = n
    ? ` · ⚠ ${
        n === 1 ? translate(locale, "teach", "dateNeedsAttention") : translate(locale, "teach", "datesNeedAttention", { count: n })
      } ${translate(locale, "teach", "attentionSuffix")}`
    : "";
  return `${recurrenceSummary(rule, m.startDate, { withEnd: false, locale })} · ${time}${attention}`;
}

function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function ClassEditor({ api, item, update, index }: { api: StudioApi; item: EditableTeachItem<"teachClasses">; update: (p: Patch<EditableTeachItem<"teachClasses">>) => void; index: number }) {
  const { t } = createTranslator(api.locale);
  const m = item.metadata;
  const setM = (patch: Partial<typeof m>) => update((cur) => ({ metadata: { ...cur.metadata, ...patch } }));
  const reg = m.registration;
  const setReg = (patch: Partial<typeof reg>) => setM({ registration: { ...reg, ...patch } });
  const venue = m.venue;
  const setVenue = (patch: Partial<typeof venue>) => setM({ venue: { ...venue, ...patch } });
  const cta = buildRegistrationCta(api.name, item.title || t("teach", "classLabel"), m);
  const timezones = useMemo(() => {
    const options = timezoneOptions(api.timezone);
    const own = timezoneSelectValue(m.timezone);
    return m.timezone && !options.includes(own) ? [...options, own] : options;
  }, [m.timezone, api.timezone]);
  // Live check of the canonical time model (the server re-checks on save).
  const times = useMemo(() => computeClassTimes(m, api.timezone), [m, api.timezone]);
  const timeIssues = times.ok ? times.warnings : times.issues;
  return (
    <>
      <Grid>
        <TextField label={t("common", "title")} value={item.title} onChange={(v) => update({ title: v })} maxLength={160} placeholder={t("teach", "classTitlePlaceholder")} />
        <TextField label={t("teach", "classType")} value={str(item.subtitle)} onChange={(v) => update({ subtitle: nul(v) })} maxLength={80} placeholder={t("teach", "classTypePlaceholder")} hint={t("teach", "freeText")} />
      </Grid>
      <TextArea label={t("common", "description")} value={str(item.description)} onChange={(v) => update({ description: nul(v) })} rows={3} />
      <ItemImage api={api} moduleKey="teachClasses" section="schedule" item={item} index={index} update={update} label={t("teach", "classImageHint")} previewClassName="w-[96px] h-[112px] rounded-xl" />
      <Grid cols={3}>
        <TextField label={t("teach", "startDate")} type="date" value={m.startDate} onChange={(v) => v && setM({ startDate: v })} />
        <TextField label={t("common", "startTime")} type="time" value={m.startTime} onChange={(v) => v && setM({ startTime: v })} />
        <TextField label={t("common", "endTime")} type="time" value={str(m.endTime)} onChange={(v) => setM({ endTime: v || null })} />
      </Grid>
      <Grid>
        <TextField label={t("teach", "endDateMultiDay")} type="date" value={str(m.endDate)} onChange={(v) => setM({ endDate: v || null })} hint={t("teach", "endDateHint")} />
        <SelectField
          label={t("teach", "timeZone")}
          value={timezoneSelectValue(m.timezone ?? api.timezone)}
          onChange={(v) => setM({ timezone: v })}
          options={timezones.map((t) => ({ value: t, label: t }))}
          hint={m.timezone && timezoneSelectValue(m.timezone) !== timezoneSelectValue(api.timezone) ? t("teach", "differsFromSpaceTz", { timezone: api.timezone }) : t("teach", "classTimeZoneHint")}
        />
      </Grid>
      {timeIssues.map((t) => (
        <p
          key={`${t.field}-${t.message}`}
          role={t.kind === "error" ? "alert" : "status"}
          data-testid={t.kind === "error" ? "class-time-error" : "class-time-warning"}
          className={`text-[12.5px] px-3 py-2 rounded-lg ${t.kind === "error" ? "bg-[#F6E3E0] text-[#8F3B3B]" : "bg-[#FBF1DC] text-[#7A5418]"}`}
        >
          {t.message}
        </p>
      ))}
      <RecurrenceEditor api={api} meta={m} setM={setM} />
      <Grid cols={3}>
        <TextField label={t("common", "location")} value={str(m.location)} onChange={(v) => setM({ location: nul(v) })} placeholder={t("teach", "classLocationPlaceholder")} />
        <TextField label={t("teach", "price")} value={str(m.price)} onChange={(v) => setM({ price: nul(v) })} placeholder={t("teach", "classPricePlaceholder")} />
        <TextField
          label={t("teach", "maxParticipantsLabel")}
          inputMode="numeric"
          value={m.maxParticipants ? String(m.maxParticipants) : ""}
          onChange={(v) => {
            const n = parseInt(v.replace(/\D/g, ""), 10);
            setM({ maxParticipants: Number.isFinite(n) && n > 0 ? n : null });
          }}
        />
      </Grid>
      <TextArea label={t("teach", "howToGetThere")} value={str(m.howToGetThere)} onChange={(v) => setM({ howToGetThere: nul(v) })} rows={2} />
      <div className="flex flex-col gap-4 p-4 rounded-xl border border-[#E2DACD] bg-white">
        <h3 className="text-[16px] text-[#192B21]" style={{ fontFamily: "var(--font-fraunces), serif" }}>
          {t("teach", "registration")}
        </h3>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("teach", "registrationMethod")}>
          <button type="button" role="radio" aria-checked={reg.method === null} onClick={() => setReg({ method: null })} className={`px-3 min-h-9 rounded-full text-[12px] font-semibold ${reg.method === null ? "bg-[#192B21] text-white" : "border border-[#E2DACD] text-[#192B21]"}`}>
            {t("common", "none")}
          </button>
          {REGISTRATION_METHODS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={reg.method === k} onClick={() => setReg({ method: k })} className={`px-3 min-h-9 rounded-full text-[12px] font-semibold ${reg.method === k ? "bg-[#192B21] text-white" : "border border-[#E2DACD] text-[#192B21]"}`}>
              {registrationMethodLabel(api.locale)[k]}
            </button>
          ))}
        </div>
        {reg.method && reg.method !== "venueLink" ? (
          <Grid>
            <TextField
              label={t("teach", REG_VALUE_LABEL_KEY[reg.method] ?? "bookingLink")}
              value={str(reg.value)}
              onChange={(v) => setReg({ value: nul(v) })}
              inputMode={reg.method === "whatsapp" ? "tel" : reg.method === "email" ? "email" : "url"}
              placeholder={reg.method === "whatsapp" ? "+972 50 000 0000" : ""}
              hint={reg.method === "whatsapp" ? t("teach", "internationalFormat") : undefined}
            />
            <TextField label={t("teach", "buttonLabelOptional")} value={str(reg.buttonLabel)} onChange={(v) => setReg({ buttonLabel: nul(v) })} maxLength={60} placeholder={cta?.label ?? ""} />
          </Grid>
        ) : null}
        {reg.method === "venueLink" ? <Hint>{t("teach", "usesVenueBookingUrl")}</Hint> : null}
        {reg.method === "whatsapp" || reg.method === "email" ? (
          <TemplateEditor
            locale={api.locale}
            value={reg.whatsappTemplate}
            onChange={(v) => setReg({ whatsappTemplate: v })}
            fallback={defaultClassWhatsappTemplate(api.locale)}
            previewValues={classTemplateValues(api.name || t("teach", "yourName"), item.title || t("teach", "classLabel"), m)}
          />
        ) : null}
        {reg.method === "whatsapp" && cta ? <ClassWhatsAppQr tenantId={api.tenantId} classId={item.id} locale={api.locale} /> : null}
        {reg.method ? (
          cta ? (
            <p className="text-[12px] text-[#3F6A4C]">✓ Guests will see “{cta.label}”.</p>
          ) : (
            <p className="text-[12px] text-[#A8643C]" role="alert">
              {t("teach", "methodIncomplete")}
            </p>
          )
        ) : null}
        <TextArea label={t("teach", "howToRegisterShown")} value={str(m.howToRegister)} onChange={(v) => setM({ howToRegister: nul(v) })} rows={2} placeholder={t("teach", "howToRegisterPlaceholder")} />
      </div>
      <div className="flex flex-col gap-4 p-4 rounded-xl border border-[#E2DACD] bg-white">
        <Toggle checked={venue.enabled} onChange={(v) => setVenue({ enabled: v })} label={t("teach", "hostedByVenue")} description={t("teach", "hostedByVenueBody")} />
        {venue.enabled ? (
          <>
            <Grid>
              <TextField label={t("teach", "venueName")} value={str(venue.name)} onChange={(v) => setVenue({ name: nul(v) })} />
              <TextField label={t("common", "website")} value={str(venue.website)} onChange={(v) => setVenue({ website: nul(v) })} inputMode="url" />
            </Grid>
            <Grid>
              <TextField label="Instagram" value={str(venue.instagram)} onChange={(v) => setVenue({ instagram: nul(v) })} />
              <TextField label="Facebook" value={str(venue.facebook)} onChange={(v) => setVenue({ facebook: nul(v) })} inputMode="url" />
            </Grid>
            <Grid cols={3}>
              <TextField label={t("common", "email")} value={str(venue.email)} onChange={(v) => setVenue({ email: nul(v) })} inputMode="email" />
              <TextField label={t("teach", "bookingUrl")} value={str(venue.bookingUrl)} onChange={(v) => setVenue({ bookingUrl: nul(v) })} inputMode="url" />
              <TextField label={t("teach", "mapUrl")} value={str(venue.mapUrl)} onChange={(v) => setVenue({ mapUrl: nul(v) })} inputMode="url" />
            </Grid>
          </>
        ) : null}
      </div>
      <div>
        <StudioButton
          kind="outline"
          onClick={() => {
            const copy = { ...item, id: crypto.randomUUID(), imageRef: null, imageUrl: null, title: `${item.title} (copy)`, metadata: { ...m, imagePosition: null } };
            api.setItems("teachClasses", [...api.items.teachClasses, copy], "schedule");
          }}
        >
          {t("teach", "duplicateClass")}
        </StudioButton>
        <Hint>{t("teach", "duplicateNoImage")}</Hint>
      </div>
    </>
  );
}

function AvailabilityEditor({ item, update, locale }: { item: EditableTeachItem<"teachAvailability">; update: (p: Patch<EditableTeachItem<"teachAvailability">>) => void; locale: Locale }) {
  const { t } = createTranslator(locale);
  const m = item.metadata;
  const setM = (patch: Partial<typeof m>) => update((cur) => ({ metadata: { ...cur.metadata, ...patch } }));
  const toggleMethod = (k: (typeof AVAILABILITY_METHODS)[number]) => setM({ methods: m.methods.includes(k) ? m.methods.filter((x) => x !== k) : [...m.methods, k] });
  return (
    <>
      <Toggle checked={m.enabled} onChange={(v) => setM({ enabled: v })} label={t("studio", "visibleToGuests")} />
      <Grid>
        <TextField label={t("common", "label")} value={item.title} onChange={(v) => update({ title: v })} placeholder={t("teach", "availableForPrivate")} maxLength={120} />
        <SelectField label={t("teach", "repeats")} value={m.repeat} onChange={(v) => setM({ repeat: v })} options={[{ value: "weekly", label: t("teach", "everyWeekOption") }, { value: "once", label: t("teach", "oneDateOnly") }]} />
      </Grid>
      <Grid cols={3}>
        {m.repeat === "weekly" ? (
          <SelectField label={t("teach", "day")} value={String(m.weekday ?? 2)} onChange={(v) => setM({ weekday: Number(v) })} options={weekdayLabels(locale).map((d, i) => ({ value: String(i), label: d }))} />
        ) : (
          <TextField label={t("common", "date")} type="date" value={str(m.date)} onChange={(v) => setM({ date: v || null })} />
        )}
        <TextField label={t("teach", "fromLabel")} type="time" value={m.from} onChange={(v) => v && setM({ from: v })} />
        <TextField label={t("teach", "toLabel")} type="time" value={m.to} onChange={(v) => v && setM({ to: v })} />
      </Grid>
      <TextArea label={t("teach", "noteForGuests")} value={str(item.description)} onChange={(v) => update({ description: nul(v) })} rows={2} placeholder={t("teach", "noteForGuestsPlaceholder")} />
      <div className="flex flex-col gap-2">
        <Label>{t("teach", "howGuestsReachYou")}</Label>
        <div className="flex flex-wrap gap-1.5">
          {AVAILABILITY_METHODS.map((k) => (
            <button key={k} type="button" aria-pressed={m.methods.includes(k)} onClick={() => toggleMethod(k)} className={`px-3 min-h-9 rounded-full text-[12px] font-semibold ${m.methods.includes(k) ? "bg-[#192B21] text-white" : "border border-[#E2DACD] text-[#192B21]"}`}>
              {k === "bookingLink" ? t("teach", "bookingLink") : k === "whatsapp" ? "WhatsApp" : k === "email" ? t("common", "email") : t("common", "website")}
            </button>
          ))}
        </div>
        <Hint>{t("teach", "sharedContactNote")}</Hint>
      </div>
      {m.methods.includes("bookingLink") ? <TextField label={t("teach", "bookingLink")} value={str(m.bookingUrl)} onChange={(v) => setM({ bookingUrl: nul(v) })} inputMode="url" hint={t("teach", "leaveEmptyForContactBooking")} /> : null}
      {m.methods.includes("whatsapp") ? (
        <TemplateEditor
          locale={locale}
          value={m.whatsappTemplate}
          onChange={(v) => setM({ whatsappTemplate: v })}
          fallback={defaultPrivateWhatsappTemplate(locale)}
          previewValues={{ teacher_name: t("teach", "maya"), date: formatShortDateLocalized(m.date ?? new Date().toISOString().slice(0, 10), locale), start_time: m.from, end_time: m.to }}
        />
      ) : null}
    </>
  );
}

export function ScheduleSection({ api }: Props) {
  const { t } = createTranslator(api.locale);
  const [mode, setMode] = useState<"classes" | "private">("classes");
  const classes = api.items.teachClasses;
  const otherZoneClasses = classes.filter((c) => (c.metadata.timezone ?? api.timezone) !== api.timezone).length;
  const applyZoneToClasses = () =>
    api.setItems(
      "teachClasses",
      classes.map((c) => ({ ...c, metadata: { ...c.metadata, timezone: api.timezone } })),
      "schedule"
    );
  return (
    <>
      <SectionHeader eyebrow={t("teach", "teaching")} title={t("teach", "navSchedule")} intro={t("teach", "scheduleBody")} />
      <Segmented label={t("teach", "scheduleType")} value={mode} onChange={setMode} options={[{ value: "classes", label: t("teach", "classesTab") }, { value: "private", label: t("teach", "privateAvailability") }]} />
      {mode === "classes" ? (
        <Card title={t("teach", "classesTab")} description={t("teach", "listedByDate", { timezone: api.timezone })}>
          {otherZoneClasses > 0 ? (
            <div className="flex flex-wrap items-center gap-3 px-3 py-2.5 rounded-lg bg-[#F4EFE6]" data-testid="apply-zone-to-classes">
              <p className="text-[12.5px] text-[#4A4843] flex-1 min-w-[200px]">
                {otherZoneClasses === 1
                  ? t("teach", "oneClassOtherZone")
                  : t("teach", "manyClassesOtherZone", { count: otherZoneClasses })}
              </p>
              <StudioButton kind="outline" onClick={applyZoneToClasses}>
                {t("teach", "useTimezoneForAll", { timezone: api.timezone })}
              </StudioButton>
            </div>
          ) : null}
          <ItemList
            api={api}
            moduleKey="teachClasses"
            section="schedule"
            addLabel={t("teach", "addClass")}
            emptyText={t("teach", "noClassesYet")}
            order={(items) => sortClasses(items)}
            summary={(c) => ({
              title: c.title,
              sub: classListSummary(c.metadata, c.subtitle, api.todayIso, c.metadata.timezone ?? api.timezone, api.locale),
              thumb: api.mediaUrl(c.imageRef),
            })}
            editor={(item, update, index) => <ClassEditor api={api} item={item} update={update} index={index} />}
          />
        </Card>
      ) : (
        <Card title={t("teach", "privateAvailability")} description={t("teach", "availabilityBody")}>
          <ItemList
            api={api}
            moduleKey="teachAvailability"
            section="schedule"
            addLabel={t("teach", "addTimeWindow")}
            emptyText={t("teach", "noWindowsYet")}
            summary={(a) => ({ title: a.title || t("teach", "availabilityLabelPlaceholder"), sub: `${describeAvailability(a.metadata)}${a.metadata.enabled ? "" : " · hidden"}` })}
            editor={(item, update) => <AvailabilityEditor item={item} update={update} locale={api.locale} />}
          />
        </Card>
      )}
      <SaveBar api={api} section="schedule" />
    </>
  );
}

// ---------------------------------------------------------------------------
// About Me
// ---------------------------------------------------------------------------

export function AboutSection({ api }: Props) {
  const { t } = createTranslator(api.locale);
  const a = api.settings.teachAbout;
  const set = (patch: Partial<typeof a>) => api.updateSetting("teachAbout", patch, "about");
  const [stylesText, setStylesText] = useState(a.styles.join(", "));
  const linkFor = (p: SocialPlatform) => a.socialLinks.find((l) => l.platform === p)?.url ?? "";
  const setLink = (p: SocialPlatform, url: string) => {
    const others = a.socialLinks.filter((l) => l.platform !== p);
    set({ socialLinks: url.trim() ? [...others, { platform: p, url: url.trim() }] : others });
  };
  return (
    <>
      <SectionHeader eyebrow={t("teach", "teaching")} title={t("teach", "navAbout")} intro={t("teach", "aboutMeBody")} />
      <Card title={t("teach", "aboutMeTab")} description={t("teach", "aboutMeTabBody")}>
        <Toggle checked={a.showTab} onChange={(v) => set({ showTab: v })} label={a.showTab ? t("teach", "shownInNavigation") : t("teach", "hiddenFromNavigation")} description={t("teach", "aboutMeToggleHint")} />
      </Card>
      <Card title={t("teach", "profile")} description={t("teach", "profileBody")}>
        <SettingsImage api={api} settingsKey="teachAbout" slot="profile" value={a.profile} onChange={(v) => api.updateSetting("teachAbout", (latest) => patchSlot(latest, "profile", v), "about")} label={t("teach", "profileImageHint")} previewClassName="w-[120px] h-[120px] rounded-full" />
        <Grid>
          <TextField
            label={t("teach", "teachingSinceYear")}
            inputMode="numeric"
            value={a.teachingSince ? String(a.teachingSince) : ""}
            onChange={(v) => {
              const n = parseInt(v.replace(/\D/g, "").slice(0, 4), 10);
              set({ teachingSince: Number.isFinite(n) && n >= 1940 && n <= 2100 ? n : null });
            }}
            hint={t("teach", "teachingSinceExample")}
          />
          <TextField
            label={t("teach", "stylesITeach")}
            value={stylesText}
            onChange={(v) => {
              setStylesText(v);
              set({ styles: v.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20) });
            }}
            hint={t("teach", "stylesCommaHint")}
          />
        </Grid>
      </Card>
      <Card title={t("teach", "yourStory")} description={t("teach", "yourStoryBody")}>
        <TextArea label={t("teach", "teachingPhilosophy")} value={str(a.philosophy)} onChange={(v) => set({ philosophy: nul(v) })} rows={2} maxLength={700} />
        <TextArea label={t("teach", "aboutMe")} value={str(a.about)} onChange={(v) => set({ about: nul(v) })} rows={5} maxLength={4000} />
      </Card>
      <Card title={t("teach", "socialAndDirectLinks")} description={t("teach", "socialLinksBody")}>
        <Grid>
          {SOCIAL_PLATFORMS.map((p) => (
            <TextField key={p} label={socialPlatformLabel(api.locale)[p]} value={linkFor(p)} onChange={(v) => setLink(p, v)} inputMode="url" placeholder="https://" />
          ))}
          <TextField label={t("flow", "whatsapp")} value={str(a.whatsapp)} onChange={(v) => set({ whatsapp: nul(v) })} inputMode="tel" placeholder="+972 50 000 0000" />
          <TextField label={t("common", "email")} value={str(a.email)} onChange={(v) => set({ email: nul(v) })} inputMode="email" />
        </Grid>
      </Card>
      <Card title={t("common", "gallery")} description={t("teach", "galleryBody")}>
        <ItemList
          api={api}
          moduleKey="teachGallery"
          section="about"
          addLabel={t("teach", "addPhoto")}
          emptyText={t("teach", "noPhotosYet")}
          max={12}
          summary={(g) => ({
            title: g.title || t("common", "photo"),
            sub: g.imageRef ? t("teach", "imageSet") : t("teach", "noImageYet"),
            thumb: api.mediaUrl(g.imageRef),
          })}
          editor={(item, update, index) => (
            <>
              <ItemImage api={api} moduleKey="teachGallery" section="about" item={item} index={index} update={update} label={t("common", "photo")} />
              <TextField label={t("teach", "captionAltText")} value={item.title} onChange={(v) => update({ title: v })} maxLength={120} />
            </>
          )}
        />
      </Card>
      <Card title={t("teach", "trainingAndCerts")} description={t("teach", "certsBody")}>
        <ItemList
          api={api}
          moduleKey="teachCertificates"
          section="about"
          addLabel={t("teach", "addCertificate")}
          emptyText={t("teach", "noCertificatesYet")}
          summary={(c) => ({ title: c.title, sub: [c.subtitle, c.metadata.year].filter(Boolean).join(" · ") })}
          editor={(item, update, index) => (
            <>
              <Grid>
                <TextField label={t("common", "title")} value={item.title} onChange={(v) => update({ title: v })} placeholder={t("teach", "certTitlePlaceholder")} />
                <TextField label={t("teach", "issuer")} value={str(item.subtitle)} onChange={(v) => update({ subtitle: nul(v) })} placeholder={t("teach", "issuerPlaceholder")} />
              </Grid>
              <Grid>
                <TextField label={t("teach", "year")} value={str(item.metadata.year)} onChange={(v) => update((cur) => ({ metadata: { ...cur.metadata, year: nul(v) } }))} maxLength={12} />
                <TextField label={t("teach", "detailsOptional")} value={str(item.description)} onChange={(v) => update({ description: nul(v) })} placeholder={t("teach", "certDetailsPlaceholder")} />
              </Grid>
              <ItemImage api={api} moduleKey="teachCertificates" section="about" item={item} index={index} update={update} label={t("teach", "certImageOptional")} />
            </>
          )}
        />
      </Card>
      <SaveBar api={api} section="about" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Explore modules
// ---------------------------------------------------------------------------

/**
 * Translation keys for each Explore module's Studio copy.
 *
 * `defaultTitleKey`/`defaultSubtitleKey` are the card title a guest sees
 * when the teacher has not written their own, so they follow the Space
 * language too; customPages has none, because its cards are the
 * teacher's own pages.
 */
const MODULE_INFO: Record<
  TeachExploreModule,
  {
    labelKey: TranslationKey<"teach">;
    descKey: TranslationKey<"teach">;
    defaultTitleKey: TranslationKey<"teach"> | null;
    defaultSubtitleKey: TranslationKey<"teach"> | null;
  }
> = {
  teachReadings: { labelKey: "myReadings", descKey: "myReadingsBody", defaultTitleKey: "myReadings", defaultSubtitleKey: "readingsEyebrow" },
  teachAudio: { labelKey: "exploreAudio", descKey: "myAudioBody", defaultTitleKey: "exploreAudio", defaultSubtitleKey: "audioEyebrow" },
  teachContact: { labelKey: "howToContactMeTitle", descKey: "contactDestinationBody", defaultTitleKey: "contactCardTitle", defaultSubtitleKey: "howToReachMe" },
  customPages: { labelKey: "customPagesTitle", descKey: "customPagesBody", defaultTitleKey: null, defaultSubtitleKey: null },
  // Like Custom Pages, the card is derived from the retreats themselves (the first retreat's cover),
  // so there is no per-module card title/cover to configure.
  teachRetreats: { labelKey: "myRetreats", descKey: "myRetreatsBody", defaultTitleKey: null, defaultSubtitleKey: null },
};

const FALLBACK_SWATCHES = ["#5B7A6E", "#2D4A3E", "#7E6A57", "#A9553A", "#6A4C6B", "#2F5D7C"];

export function ModulesSection({ api }: Props) {
  const { t } = createTranslator(api.locale);
  const cards = api.settings.teachExplore.cards;
  const setCard = (k: "teachReadings" | "teachAudio" | "teachContact", patch: Partial<ExploreCard>) => {
    // Computed from the latest teachExplore slice so a late upload only changes this card's image fields.
    api.updateSetting("teachExplore", (latest) => ({ cards: patchExploreCard(latest.cards, k, patch) }), "modules");
  };
  const statusInput = {
    enabledExplore: api.enabledExplore,
    readings: api.items.teachReadings,
    audio: api.items.teachAudio,
    customPages: api.items.customPages.filter((p) => p.metadata.enabled),
    retreats: api.items.teachRetreats.filter((r) => r.metadata.enabled),
    settings: api.settings,
  };
  return (
    <>
      <SectionHeader eyebrow={t("teach", "exploreLibrary")} title={t("studio", "navModules")} intro={t("teach", "modulesBody")} />
      {(Object.keys(MODULE_INFO) as TeachExploreModule[]).map((k) => {
        const on = api.enabledExplore.includes(k);
        const info = MODULE_INFO[k];
        const hasOwnCard = k !== "customPages" && k !== "teachRetreats";
        const card = hasOwnCard ? cards[k] : null;
        return (
          <Card key={k} title={t("teach", info.labelKey)} description={t("teach", info.descKey)}>
            <Toggle checked={on} onChange={(v) => api.setEnabledExplore(v ? [...api.enabledExplore, k] : api.enabledExplore.filter((x) => x !== k))} label={on ? t("teach", "shownInExplore") : t("teach", "hiddenLabel")} />
            {exploreModuleStatus(statusInput, k) === "empty" ? <Hint>{EXPLORE_MODULE_EMPTY_HINT[k]}</Hint> : null}
            {on && hasOwnCard ? (
              <>
                <Grid>
                  <TextField label={t("teach", "cardTitle")} value={str(card?.title)} onChange={(v) => setCard(k, { title: nul(v) })} placeholder={info.defaultTitleKey ? t("teach", info.defaultTitleKey) : ""} maxLength={60} />
                  <TextField label={t("teach", "subtitleOptional")} value={str(card?.subtitle)} onChange={(v) => setCard(k, { subtitle: nul(v) })} placeholder={info.defaultSubtitleKey ? t("teach", info.defaultSubtitleKey) : ""} maxLength={90} />
                </Grid>
                <SettingsImage
                  api={api}
                  settingsKey="teachExplore"
                  slot={k}
                  value={{ imageRef: card?.imageRef ?? null, imagePosition: card?.imagePosition ?? null }}
                  onChange={(v) => setCard(k, v)}
                  label={t("teach", "cardCoverImage")}
                  previewClassName="w-[180px] h-[110px] rounded-xl"
                />
                <div className="flex flex-col gap-2">
                  <Label>{t("teach", "fallbackColourNoCover")}</Label>
                  <div className="flex flex-wrap gap-2">
                    {FALLBACK_SWATCHES.map((h) => (
                      <button key={h} type="button" aria-label={t("teach", "fallbackN", { index: h })} aria-pressed={card?.fallbackColor === h} onClick={() => setCard(k, { fallbackColor: h })} className="w-8 h-8 rounded-full" style={{ background: h, outline: card?.fallbackColor === h ? "2px solid #192B21" : "none", outlineOffset: 2 }} />
                    ))}
                    <button type="button" onClick={() => setCard(k, { fallbackColor: null })} className="text-[12px] underline text-[#6F6C66] min-h-8">
                      {t("teach", "themeDefault")}
                    </button>
                  </div>
                </div>
              </>
            ) : null}
            {on && k === "customPages" ? <Hint>{t("teach", "editPagesInCustomPages")}</Hint> : null}
            {on && k === "teachRetreats" ? <Hint>{t("teach", "editRetreatsInMyRetreats")}</Hint> : null}
          </Card>
        );
      })}
      <SaveBar api={api} section="modules" />
    </>
  );
}

// ---------------------------------------------------------------------------
// My Readings
// ---------------------------------------------------------------------------

/**
 * Category SUGGESTIONS, offered in the Space's language.
 *
 * Unlike Flow's fixed session categories, these are a datalist the
 * teacher may accept or overtype - whatever they choose becomes their own
 * content, so offering it in their language is right, and nothing here is
 * matched against a stored value.
 */
const READING_CATEGORY_KEYS = ["catYogaPhilosophy", "catMeditationR", "catPersonalReflections", "catBreathworkR", "catMindfulness", "teaching", "catMovement"] as const;
const AUDIO_CATEGORY_KEYS = ["catGuidedMeditation", "catBreathworkR", "catYogaNidra", "catMorningPractice", "catSleep", "catMantra", "catTalks"] as const;

function CategoryField({ value, onChange, options, id, locale }: { value: string | null; onChange: (v: string | null) => void; options: readonly string[]; id: string; locale: Locale }) {
  const { t } = createTranslator(locale);
  return (
    <div>
      <Label htmlFor={id}>{t("common", "category")}</Label>
      <input id={id} list={`${id}-list`} value={str(value)} onChange={(e) => onChange(nul(e.target.value))} maxLength={60} className={INPUT} placeholder={t("teach", "chooseOrTypeOwn")} />
      <datalist id={`${id}-list`}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </div>
  );
}

export function ReadingsSection({ api }: Props) {
  const { t } = createTranslator(api.locale);
  return (
    <>
      <SectionHeader eyebrow={t("teach", "exploreLibrary")} title={t("teach", "exploreReadings")} intro={t("teach", "readingsBody")} />
      {!api.enabledExplore.includes("teachReadings") ? <ModuleOffNotice api={api} /> : null}
      <Card title={t("teach", "readings")} description={t("teach", "readingsOrderHint")}>
        <ItemList
          api={api}
          moduleKey="teachReadings"
          section="readings"
          addLabel={t("teach", "addReading")}
          emptyText={t("teach", "noReadingsYet")}
          summary={(r) => ({ title: r.title, sub: [r.metadata.category, r.metadata.date ? formatShortDateLocalized(r.metadata.date, api.locale) : null, r.externalLink ? "external link" : null].filter(Boolean).join(" · "), thumb: api.mediaUrl(r.imageRef) })}
          editor={(item, update, index) => (
            <>
              <Grid>
                <TextField label={t("common", "title")} value={item.title} onChange={(v) => update({ title: v })} maxLength={160} />
                <CategoryField locale={api.locale} id={`cat-${item.id}`} value={item.metadata.category} onChange={(v) => update((cur) => ({ metadata: { ...cur.metadata, category: v } }))} options={READING_CATEGORY_KEYS.map((k) => t("teach", k))} />
              </Grid>
              <ItemImage api={api} moduleKey="teachReadings" section="readings" item={item} index={index} update={update} label={t("teach", "primaryImage")} previewClassName="w-[160px] h-[100px] rounded-xl" />
              <TextArea label={t("teach", "shortExcerpt")} value={str(item.metadata.excerpt)} onChange={(v) => update((cur) => ({ metadata: { ...cur.metadata, excerpt: nul(v) } }))} rows={2} maxLength={500} />
              <TextArea label={t("teach", "body")} value={str(item.description)} onChange={(v) => update({ description: nul(v) })} rows={8} hint={t("teach", "markdownHint")} />
              <Grid cols={3}>
                <TextField label={t("teach", "author")} value={str(item.metadata.author)} onChange={(v) => update((cur) => ({ metadata: { ...cur.metadata, author: nul(v) } }))} placeholder={api.name} />
                <TextField label={t("common", "date")} type="date" value={str(item.metadata.date)} onChange={(v) => update((cur) => ({ metadata: { ...cur.metadata, date: v || null } }))} />
                <TextField label={t("teach", "externalArticleUrl")} value={str(item.externalLink)} onChange={(v) => update({ externalLink: nul(v) })} inputMode="url" hint={t("teach", "externalArticleHint")} />
              </Grid>
            </>
          )}
        />
      </Card>
      <SaveBar api={api} section="readings" />
    </>
  );
}

function ModuleOffNotice({ api }: Props) {
  const { t } = createTranslator(api.locale);
  return (
    <p className="text-[12.5px] px-4 py-3 rounded-xl bg-[#F6E9DF] text-[#8A5230]">
      This module is currently hidden from guests.{" "}
      <button type="button" className="underline font-semibold" onClick={() => api.goTo("modules")}>
        {t("teach", "turnOnInModules")}
      </button>
      .
    </p>
  );
}

// ---------------------------------------------------------------------------
// My Audio
// ---------------------------------------------------------------------------

function AudioFileField({ api, item, update, index }: { api: StudioApi; item: EditableTeachItem<"teachAudio">; update: (p: Patch<EditableTeachItem<"teachAudio">>) => void; index: number }) {
  const { t } = createTranslator(api.locale);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = item.metadata.audioRef;
  const src = api.mediaUrl(ref);

  async function handle(file: File) {
    setError(null);
    // Shared rule, product-specific wording: see audioFileProblem().
    const problem = audioFileProblem(file);
    if (problem === "unsupportedType") return setError(t("studio", "unsupportedAudio"));
    if (problem === "tooLarge") return setError(t("teach", "audioTooLarge100"));
    setBusy(t("common", "uploading"));
    const duration = await detectAudioDuration(file);
    // Ownership at upload: the server makes sure this item's row exists
    // before any bytes land, and hands back a brand-new versioned path.
    const prep = await api.prepareAudioUpload(item, index, file.type, file.size);
    if (prep.error || !prep.path) {
      setBusy(null);
      return setError(prep.error ?? t("studio", "uploadFailed"));
    }
    const path = prep.path;
    // Uploaded straight from the browser through the member's own session:
    // the tenant-media bucket RLS (0006) only admits paths under this
    // tenant's id, and attachTeachAudio re-validates the ref and the stored object server-side.
    const supabase = createClient();
    const { error: upErr } = await uploadAudioDraftObject(supabase, path, file);
    if (upErr) {
      setBusy(null);
      return setError(upErr);
    }
    const attachErr = await api.attachAudio(item.id, path, duration);
    if (attachErr) {
      setBusy(null);
      return setError(attachErr);
    }
    const { data: signed } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, 3600);
    api.setMediaUrl(path, signed?.signedUrl ?? null);
    update(audioAttached<EditableTeachItem<"teachAudio">>(path, duration));
    setBusy(null);
  }

  return (
    <div className="flex flex-col gap-2 p-4 rounded-xl border border-[#E2DACD] bg-white">
      <Label>{t("teach", "audioFile")}</Label>
      {ref ? (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-[#192B21]">
            {ref.split("/").pop()} · {formatDuration(item.metadata.durationSeconds) ?? "duration unknown"}
          </p>
          {src ? <audio controls preload="none" src={src} className="w-full" /> : null}
        </div>
      ) : (
        <p className="text-[12.5px] text-[#8C8A84]">{t("teach", "noAudioUploadedYet")}</p>
      )}
      <div className="flex gap-2">
        <StudioButton kind="outline" onClick={() => inputRef.current?.click()} disabled={busy !== null}>
          {busy ?? (ref ? t("teach", "replaceAudio") : t("teach", "uploadAudio"))}
        </StudioButton>
        {ref ? (
          <StudioButton
            kind="outline"
            disabled={busy !== null}
            onClick={async () => {
              setBusy(t("common", "removing"));
              const err = await api.detachAudio(item.id);
              setBusy(null);
              if (err) setError(err);
              else update(audioDetached<EditableTeachItem<"teachAudio">>());
            }}
          >
            {t("common", "remove")}
          </StudioButton>
        ) : null}
      </div>
      <Hint>{t("teach", "audioFormats")}</Hint>
      {error ? <p className="text-[12px] text-[#8F3B3B]" role="alert">{error}</p> : null}
      <input
        ref={inputRef}
        type="file"
        accept={Object.keys(AUDIO_ALLOWED_TYPES).join(",")}
        className="hidden"
        aria-label={t("teach", "audioFile")}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void handle(f);
        }}
      />
    </div>
  );
}

export function AudioSection({ api }: Props) {
  const { t } = createTranslator(api.locale);
  return (
    <>
      <SectionHeader eyebrow={t("teach", "exploreLibrary")} title={t("teach", "exploreAudio")} intro={t("teach", "audioBody")} />
      {!api.enabledExplore.includes("teachAudio") ? <ModuleOffNotice api={api} /> : null}
      <Card title={t("teach", "audioLibrary")}>
        <ItemList
          api={api}
          moduleKey="teachAudio"
          section="audio"
          addLabel={t("teach", "addAudio")}
          emptyText={t("teach", "noAudioYetStudio")}
          summary={(t) => ({ title: t.title, sub: [t.metadata.category, formatDuration(t.metadata.durationSeconds), t.metadata.audioRef ? null : "no file yet"].filter(Boolean).join(" · "), thumb: api.mediaUrl(t.imageRef) })}
          editor={(item, update, index) => (
            <>
              <Grid>
                <TextField label={t("common", "title")} value={item.title} onChange={(v) => update({ title: v })} maxLength={160} />
                <CategoryField locale={api.locale} id={`acat-${item.id}`} value={item.metadata.category} onChange={(v) => update((cur) => ({ metadata: { ...cur.metadata, category: v } }))} options={AUDIO_CATEGORY_KEYS.map((k) => t("teach", k))} />
              </Grid>
              <AudioFileField api={api} item={item} update={update} index={index} />
              <ItemImage api={api} moduleKey="teachAudio" section="audio" item={item} index={index} update={update} label={t("studio", "coverImage")} previewClassName="w-[110px] h-[110px] rounded-xl" />
              <TextArea label={t("common", "description")} value={str(item.description)} onChange={(v) => update({ description: nul(v) })} rows={3} maxLength={2000} />
              <TextArea label={t("teach", "teacherNoteOptional")} value={str(item.metadata.teacherNote)} onChange={(v) => update((cur) => ({ metadata: { ...cur.metadata, teacherNote: nul(v) } }))} rows={2} maxLength={800} />
            </>
          )}
        />
      </Card>
      <SaveBar api={api} section="audio" />
    </>
  );
}

// ---------------------------------------------------------------------------
// How to Contact Me
// ---------------------------------------------------------------------------

const CONTACT_PLACEHOLDER: Record<ContactMethod, string> = {
  whatsapp: "+972 50 000 0000",
  phone: "+972 50 000 0000",
  email: "hello@example.com",
  instagram: "@yourhandle",
  facebook: "facebook.com/yourpage",
  website: "yourwebsite.com",
  telegram: "@yourhandle",
  bookingUrl: "calendly.com/you",
};

export function ContactSection({ api }: Props) {
  const { t } = createTranslator(api.locale);
  const c = api.settings.teachContact;
  const set = (patch: Partial<typeof c>) => api.updateSetting("teachContact", patch, "contact");
  const setMethod = (k: ContactMethod, v: string) => {
    const value = nul(v);
    const enabled = value ? (c.enabled.includes(k) ? c.enabled : [...c.enabled, k]) : c.enabled.filter((x) => x !== k);
    set({ methods: { ...c.methods, [k]: value }, enabled });
  };
  const toggle = (k: ContactMethod, on: boolean) => set({ enabled: on ? [...c.enabled, k] : c.enabled.filter((x) => x !== k) });
  return (
    <>
      <SectionHeader eyebrow={t("teach", "exploreLibrary")} title={t("teach", "howToContactMeTitle")} intro={t("teach", "contactSectionBody")} />
      {!api.enabledExplore.includes("teachContact") ? <ModuleOffNotice api={api} /> : null}
      <Card title={t("teach", "contactMethods")} description={t("teach", "contactMethodsBody")}>
        {CONTACT_METHODS.map((k) => (
          <div key={k} className="grid sm:grid-cols-[1fr_auto] gap-2 items-end">
            <TextField label={contactMethodLabel(api.locale)[k]} value={str(c.methods[k])} onChange={(v) => setMethod(k, v)} placeholder={CONTACT_PLACEHOLDER[k]} inputMode={k === "email" ? "email" : k === "whatsapp" || k === "phone" ? "tel" : "url"} />
            <Toggle checked={c.enabled.includes(k)} onChange={(v) => toggle(k, v)} label={t("common", "show")} />
          </div>
        ))}
        <Grid>
          <SelectField
            label={t("teach", "primaryButton")}
            value={(c.primary ?? "") as ContactMethod | ""}
            onChange={(v) => set({ primary: (v || null) as ContactMethod | null })}
            options={[{ value: "" as const, label: t("common", "none") }, ...CONTACT_METHODS.map((k) => ({ value: k, label: contactMethodLabel(api.locale)[k] }))]}
          />
          <TextField label={t("teach", "buttonLabel")} value={str(c.buttonLabel)} onChange={(v) => set({ buttonLabel: nul(v) })} placeholder={t("teach", "contactButtonPlaceholder")} maxLength={60} />
        </Grid>
      </Card>
      <Card title={t("common", "location")} description={t("teach", "addressCardHint")}>
        <Grid>
          <TextField label={t("teach", "locationName")} value={str(c.locationName)} onChange={(v) => set({ locationName: nul(v) })} placeholder={t("teach", "locationNamePlaceholder")} />
          <TextField label={t("teach", "mapUrl")} value={str(c.mapUrl)} onChange={(v) => set({ mapUrl: nul(v) })} inputMode="url" />
        </Grid>
        <TextField label={t("teach", "studioAddress")} value={str(c.address)} onChange={(v) => set({ address: nul(v) })} />
      </Card>
      <Card title={t("teach", "pagePresentation")}>
        <Grid>
          <TextField label={t("common", "title")} value={str(c.title)} onChange={(v) => set({ title: nul(v) })} placeholder={t("teach", "letsConnect")} maxLength={80} />
          <TextField label={t("teach", "intro")} value={str(c.intro)} onChange={(v) => set({ intro: nul(v) })} maxLength={500} />
        </Grid>
        <SettingsImage api={api} settingsKey="teachContact" slot="cover" value={c.cover} onChange={(v) => api.updateSetting("teachContact", (latest) => patchSlot(latest, "cover", v), "contact")} label={t("teach", "coverImageOptional")} previewClassName="w-[180px] h-[100px] rounded-xl" />
        <Hint>{t("teach", "noContactFormNote")}</Hint>
      </Card>
      <SaveBar api={api} section="contact" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Custom pages (shared module, Teach presentation)
// ---------------------------------------------------------------------------

export function CustomPagesSection({ api }: Props) {
  const { t } = createTranslator(api.locale);
  return (
    <>
      <SectionHeader eyebrow={t("teach", "exploreLibrary")} title={t("teach", "customPagesTitle")} intro={t("teach", "customPagesSectionBody")} />
      {!api.enabledExplore.includes("customPages") ? <ModuleOffNotice api={api} /> : null}
      <Card title={t("teach", "pages")}>
        <ItemList
          api={api}
          moduleKey="customPages"
          section="pages"
          addLabel={t("teach", "addPage")}
          emptyText={t("teach", "noPagesYet")}
          max={api.customPagesLimit}
          summary={(p) => ({ title: p.title, sub: `${p.subtitle ?? t("teach", "customPage")}${p.metadata.enabled ? "" : " · hidden"}`, thumb: api.mediaUrl(p.imageRef) })}
          editor={(item, update, index) => (
            <>
              <Toggle checked={item.metadata.enabled} onChange={(v) => update((cur) => ({ metadata: { ...cur.metadata, enabled: v } }))} label={t("studio", "visibleToGuests")} />
              <Grid>
                <TextField label={t("common", "title")} value={item.title} onChange={(v) => update({ title: v })} maxLength={160} />
                <TextField label={t("teach", "eyebrowOptional")} value={str(item.subtitle)} onChange={(v) => update({ subtitle: nul(v) })} maxLength={90} />
              </Grid>
              <ItemImage api={api} moduleKey="customPages" section="pages" item={item} index={index} update={update} label={t("studio", "coverImage")} previewClassName="w-[180px] h-[110px] rounded-xl" />
              <div className="flex flex-col gap-2">
                <Label>{t("teach", "fallbackColourCard")}</Label>
                <div className="flex flex-wrap gap-2">
                  {FALLBACK_SWATCHES.map((h) => (
                    <button key={h} type="button" aria-label={t("teach", "fallbackN", { index: h })} aria-pressed={item.metadata.fallbackColor === h} onClick={() => update((cur) => ({ metadata: { ...cur.metadata, fallbackColor: h } }))} className="w-8 h-8 rounded-full" style={{ background: h, outline: item.metadata.fallbackColor === h ? "2px solid #192B21" : "none", outlineOffset: 2 }} />
                  ))}
                </div>
              </div>
              <TextArea label={t("common", "content")} value={str(item.description)} onChange={(v) => update({ description: nul(v) })} rows={8} hint={t("teach", "markdownHintNoHtml")} />
              <Grid>
                <TextField label={t("teach", "buttonLabelOptional")} value={str(item.metadata.buttonLabel)} onChange={(v) => update((cur) => ({ metadata: { ...cur.metadata, buttonLabel: nul(v) } }))} maxLength={60} />
                <TextField label={t("teach", "buttonLink")} value={str(item.metadata.buttonUrl)} onChange={(v) => update((cur) => ({ metadata: { ...cur.metadata, buttonUrl: nul(v) } }))} inputMode="url" />
              </Grid>
            </>
          )}
        />
      </Card>
      <SaveBar api={api} section="pages" />
    </>
  );
}

// ---------------------------------------------------------------------------
// My Retreats (TASK 031)
// ---------------------------------------------------------------------------

/**
 * The price box keeps its own text so typing "1250." or "1250,5" is never
 * rewritten under the teacher's fingers; only a valid amount is pushed into
 * the item (an invalid one leaves the last good value and says so).
 */
function RetreatPriceField({ locale, price, onChange }: { locale: Locale; price: number | null; onChange: (v: number | null) => void }) {
  const { t } = createTranslator(locale);
  const [text, setText] = useState(price === null ? "" : String(price));
  const [bad, setBad] = useState(false);
  return (
    <TextField
      label={t("teach", "price")}
      value={text}
      inputMode="decimal"
      dir="ltr"
      placeholder="700"
      hint={bad ? <span role="alert">{t("teach", "retreatPriceInvalid")}</span> : t("teach", "retreatPriceHint")}
      onChange={(v) => {
        setText(v);
        const cleaned = v.trim().replace(",", ".");
        if (!cleaned) {
          setBad(false);
          return onChange(null);
        }
        const n = Number(cleaned);
        if (/^\d+(\.\d{1,2})?$/.test(cleaned) && Number.isFinite(n)) {
          setBad(false);
          onChange(n);
        } else setBad(true);
      }}
    />
  );
}

export function RetreatEditor({ api, item, update, index }: { api: StudioApi; item: EditableTeachItem<"teachRetreats">; update: (p: Patch<EditableTeachItem<"teachRetreats">>) => void; index: number }) {
  const { t } = createTranslator(api.locale);
  const m = item.metadata;
  const setM = (patch: Partial<typeof m>) => update((cur) => ({ metadata: { ...cur.metadata, ...patch } }));
  const reg = m.registration;
  const setReg = (patch: Partial<typeof reg>) => setM({ registration: { ...reg, ...patch } });
  const cta = buildRetreatRegistrationCta(reg, item.title || t("teach", "myRetreats"), api.name, api.locale);
  const methods = REGISTRATION_METHODS.filter((k) => k !== "venueLink");
  const orderProblem = Boolean(m.startDate && m.endDate && m.endDate < m.startDate);
  return (
    <>
      <Toggle checked={m.enabled} onChange={(v) => setM({ enabled: v })} label={t("studio", "visibleToGuests")} />
      <TextField label={t("teach", "retreatName")} value={item.title} onChange={(v) => update({ title: v })} maxLength={160} placeholder={t("teach", "retreatNamePlaceholder")} dir="auto" />
      <TextArea label={t("teach", "retreatShortDescription")} value={str(item.description)} onChange={(v) => update({ description: nul(v) })} rows={3} maxLength={600} hint={t("teach", "retreatShortDescriptionHint")} dir="auto" />
      <ItemImage api={api} moduleKey="teachRetreats" section="retreats" item={item} index={index} update={update} label={t("studio", "coverImage")} previewClassName="w-[180px] h-[110px] rounded-xl" />
      <Grid>
        <TextField label={t("common", "location")} value={str(m.location)} onChange={(v) => setM({ location: nul(v) })} maxLength={160} placeholder={t("teach", "retreatLocationPlaceholder")} dir="auto" />
        <TextField label={t("teach", "retreatDuration")} value={str(m.durationLabel)} onChange={(v) => setM({ durationLabel: nul(v) })} maxLength={60} placeholder={t("teach", "retreatDurationPlaceholder")} dir="auto" />
      </Grid>
      <Grid>
        <TextField label={t("teach", "startDate")} type="date" value={str(m.startDate)} onChange={(v) => setM({ startDate: v || null })} />
        <TextField label={t("teach", "retreatEndDate")} type="date" value={str(m.endDate)} onChange={(v) => setM({ endDate: v || null })} hint={t("teach", "retreatDatesHint")} />
      </Grid>
      {orderProblem ? (
        <p role="alert" className="text-[12.5px] px-3 py-2 rounded-lg bg-[#F6E3E0] text-[#8F3B3B]">
          {t("teach", "retreatDateOrderWarning")}
        </p>
      ) : null}
      <Grid>
        <RetreatPriceField key={item.id} locale={api.locale} price={m.price} onChange={(v) => setM({ price: v })} />
        <TextField label={t("teach", "retreatCurrency")} value={str(m.currency)} onChange={(v) => setM({ currency: v.trim() ? v.trim().toUpperCase().slice(0, 3) : null })} maxLength={3} placeholder={t("teach", "retreatCurrencyPlaceholder")} dir="ltr" />
      </Grid>
      <div className="flex flex-col gap-4 p-4 rounded-xl border border-[#E2DACD] bg-white">
        <h3 className="text-[16px] text-[#192B21]" style={{ fontFamily: "var(--font-fraunces), serif" }}>
          {t("teach", "registration")}
        </h3>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("teach", "registrationMethod")}>
          <button type="button" role="radio" aria-checked={reg.method === null} onClick={() => setReg({ method: null })} className={`px-3 min-h-11 rounded-full text-[12px] font-semibold ${reg.method === null ? "bg-[#192B21] text-white" : "border border-[#E2DACD] text-[#192B21]"}`}>
            {t("common", "none")}
          </button>
          {methods.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={reg.method === k} onClick={() => setReg({ method: k })} className={`px-3 min-h-11 rounded-full text-[12px] font-semibold ${reg.method === k ? "bg-[#192B21] text-white" : "border border-[#E2DACD] text-[#192B21]"}`}>
              {registrationMethodLabel(api.locale)[k]}
            </button>
          ))}
        </div>
        {reg.method ? (
          <Grid>
            <TextField
              label={t("teach", REG_VALUE_LABEL_KEY[reg.method] ?? "bookingLink")}
              value={str(reg.value)}
              onChange={(v) => setReg({ value: nul(v) })}
              inputMode={reg.method === "whatsapp" ? "tel" : reg.method === "email" ? "email" : "url"}
              dir="ltr"
              placeholder={reg.method === "whatsapp" ? "+972 50 000 0000" : ""}
              hint={reg.method === "whatsapp" ? t("teach", "internationalFormat") : undefined}
            />
            <TextField label={t("teach", "buttonLabelOptional")} value={str(reg.buttonLabel)} onChange={(v) => setReg({ buttonLabel: nul(v) })} maxLength={60} placeholder={cta?.label ?? ""} dir="auto" />
          </Grid>
        ) : null}
        {reg.method === "whatsapp" || reg.method === "email" ? (
          <TemplateEditor
            locale={api.locale}
            value={reg.whatsappTemplate}
            onChange={(v) => setReg({ whatsappTemplate: v })}
            fallback={translate(api.locale, "teach", "retreatWhatsappTemplate")}
            previewValues={{ teacher_name: api.name || t("teach", "yourName"), class_name: item.title || t("teach", "myRetreats") }}
          />
        ) : null}
        {reg.method ? (
          cta ? (
            <p className="text-[12px] text-[#3F6A4C]">✓ {t("teach", "retreatRegistrationPreview", { label: cta.label })}</p>
          ) : (
            <p className="text-[12px] text-[#A8643C]" role="alert">
              {t("teach", "methodIncomplete")}
            </p>
          )
        ) : null}
      </div>
      <TextField label={t("teach", "retreatFlowLink")} value={str(m.flowGuestUrl)} onChange={(v) => setM({ flowGuestUrl: nul(v) })} maxLength={300} inputMode="url" dir="ltr" placeholder={t("teach", "retreatFlowLinkPlaceholder")} hint={t("teach", "retreatFlowLinkHint")} />
    </>
  );
}

export function RetreatsSection({ api }: Props) {
  const { t } = createTranslator(api.locale);
  return (
    <>
      <SectionHeader eyebrow={t("teach", "exploreLibrary")} title={t("teach", "myRetreats")} intro={t("teach", "myRetreatsBody")} />
      {!api.enabledExplore.includes("teachRetreats") ? <ModuleOffNotice api={api} /> : null}
      <Card title={t("teach", "myRetreats")}>
        <ItemList
          api={api}
          moduleKey="teachRetreats"
          section="retreats"
          addLabel={t("teach", "addRetreat")}
          emptyText={t("teach", "noRetreatsYet")}
          summary={(r) => ({
            title: r.title,
            sub: [r.metadata.location, retreatDateSummary(r.metadata, api.locale), formatRetreatPrice(r.metadata, api.locale), r.metadata.enabled ? null : t("common", "disabled")].filter(Boolean).join(" · "),
            thumb: api.mediaUrl(r.imageRef),
          })}
          editor={(item, update, index) => <RetreatEditor api={api} item={item} update={update} index={index} />}
        />
      </Card>
      <SaveBar api={api} section="retreats" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Preview & Publish
// ---------------------------------------------------------------------------

export function PublishSection({ api, preview }: Props & { preview: ReactNode }) {
  const { t } = createTranslator(api.locale);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const noRegistration = api.items.teachClasses.filter((c) => !buildRegistrationCta(api.name, c.title, c.metadata));
  const checks: { ok: boolean; text: string; blocking?: boolean }[] = [
    { ok: Boolean(api.name.trim()), text: t("teach", "readinessNameSet"), blocking: true },
    { ok: api.canPublish, text: api.canPublish ? t("teach", "readinessAccess", { plan: api.accessLabel }) : t("teach", "readinessNoAccess"), blocking: true },
    { ok: Boolean(api.slug), text: api.slug ? t("teach", "readinessAddress", { address: `${api.slug}.innerdwes.com` }) : t("teach", "readinessNoAddress") },
    { ok: Boolean(api.heroImageRef), text: api.heroImageRef ? t("teach", "readinessImageSet") : t("teach", "readinessNoImage") },
    { ok: api.items.teachClasses.length > 0, text: t("teach", "readinessClassesWindows", { classes: api.items.teachClasses.length, windows: api.items.teachAvailability.length }) },
    { ok: noRegistration.length === 0, text: noRegistration.length === 0 ? t("teach", "readinessRegistration") : t("teach", "readinessNoRegistration", { count: noRegistration.length }) },
  ];
  const blocked = checks.some((c) => c.blocking && !c.ok);

  async function publish() {
    setBusy(true);
    setMessage(null);
    const saveErr = await api.saveAll();
    if (saveErr) {
      setBusy(false);
      setMessage({ ok: false, text: t("teach", "saveFirstFailed", { reason: saveErr }) });
      return;
    }
    const res = await publishTeachSpace(api.tenantId, api.locale);
    setBusy(false);
    if (res.error) setMessage({ ok: false, text: res.error });
    else {
      api.setPublishedAt(res.publishedAt);
      setMessage({ ok: true, text: t("teach", "publishedNow") });
    }
  }

  return (
    <>
      <SectionHeader eyebrow={t("teach", "publishingEyebrow")} title={t("teach", "previewAndPublish")} intro={t("teach", "publishBody")} />
      <Card title={t("studio", "readyToPublish")}>
        <ul className="flex flex-col gap-2">
          {checks.map((c) => (
            <li key={c.text} className="flex items-start gap-2.5 text-[13px]">
              <span aria-hidden="true" className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[11px] shrink-0 ${c.ok ? "bg-[#EAF1EA] text-[#4E7A5B]" : "bg-[#F6E9DF] text-[#A8643C]"}`}>
                {c.ok ? "✓" : "!"}
              </span>
              <span className={c.ok ? "text-[#232926]" : "text-[#8A5230]"}>{c.text}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <StudioButton onClick={publish} disabled={busy || blocked}>
            {busy ? t("studio", "publishingNow") : api.publishedAt ? t("studio", "republish") : t("teach", "publishNow")}
          </StudioButton>
        </div>
        {message ? (
          <p role={message.ok ? "status" : "alert"} className={`text-[13px] ${message.ok ? "text-[#3F6A4C]" : "text-[#8F3B3B]"}`}>
            {message.text}
          </p>
        ) : null}
        <Hint>{api.publishedAt
            ? t("studio", "lastPublished", { timestamp: formatPublishedAtUtc(api.publishedAt) ?? "" })
            : t("teach", "notPublishedYet")}</Hint>
      </Card>
      <Card title={t("teach", "shareYourGuestApp")} description={t("teach", "shareGuestAppBody")}>
        <PublicLinkCard
          locale={api.locale}
          url={publicSpaceUrl(api.tenantId, api.slug)}
          openHref={guestAppPath(api.tenantId, api.slug)}
          published={Boolean(api.publishedAt)}
          shareName={api.name}
          shareRole={api.settings.teachProfile.teacherType}
        />
        <QrCodeCard tenantId={api.tenantId} slug={api.slug} published={Boolean(api.publishedAt)} locale={api.locale} />
        <ShareCardPanel tenantId={api.tenantId} slug={api.slug} published={Boolean(api.publishedAt)} locale={api.locale} />
      </Card>
      <DirectoryOptInCard tenantId={api.tenantId} initialListed={api.directoryListed} locale={api.locale} />
      <Card title={t("teach", "draftPreview")} description={t("teach", "draftPreviewBody")}>
        <div className="mx-auto w-full max-w-[380px] h-[720px] rounded-[36px] overflow-hidden border-[6px] border-[#D9D1C3]">{preview}</div>
      </Card>
    </>
  );
}

/** Explicit opt-in (default OFF) for the future public Teachers directory / InnerDweS promotion. Saves on toggle; private to the owner. */
export function DirectoryOptInCard({ tenantId, initialListed, locale }: { tenantId: string; initialListed: boolean; locale: Locale }) {
  const { t } = createTranslator(locale);
  const [listed, setListed] = useState(initialListed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !listed;
    setBusy(true);
    setError(null);
    setListed(next);
    const res = await saveTeachDirectoryListing(tenantId, next, locale);
    setBusy(false);
    if (res.error) {
      setListed(!next);
      setError(res.error);
    }
  }

  return (
    <Card title={t("teach", "listMeOnInnerDwes")} description={t("teach", "directoryBody")}>
      <div className="flex items-center gap-3" data-testid="directory-opt-in">
        <button
          type="button"
          role="switch"
          aria-checked={listed}
          aria-label={t("teach", "listMeOnInnerDwes")}
          onClick={toggle}
          disabled={busy}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${listed ? "bg-[#192B21]" : "bg-[#D9D1C3]"}`}
        >
          <span aria-hidden="true" className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${listed ? "translate-x-6" : "translate-x-1"}`} />
        </button>
        <span className="text-[13px] text-[#232926]">{listed ? t("teach", "yesListMe") : t("teach", "notListed")}</span>
      </div>
      {error ? (
        <p role="alert" className="text-[13px] text-[#8F3B3B]">
          {error}
        </p>
      ) : null}
      <Hint>{t("teach", "directoryChangeAnytime")}</Hint>
    </Card>
  );
}
