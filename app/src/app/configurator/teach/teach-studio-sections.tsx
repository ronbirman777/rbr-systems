"use client";

/* eslint-disable @next/next/no-img-element */
import { useMemo, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { listTimezones } from "@/lib/timezone";
import { normalizeSlug, checkSlugLocally } from "@/lib/slug";
import { MEDIA_BUCKET } from "@/lib/media/path";
import { SOCIAL_PLATFORMS, SOCIAL_PLATFORM_LABEL, type SocialPlatform } from "@/lib/modules/socialLinks";
import { checkSlugAvailability, reserveSlug } from "@/app/configurator/retreat/actions";
import { publishTeachSpace } from "./actions";
import {
  AUDIO_ALLOWED_TYPES,
  AVAILABILITY_METHODS,
  CONTACT_METHODS,
  DAILY_INSPIRATION_MAX_LENGTH,
  DAILY_INSPIRATION_MAX_QUOTES,
  MAX_AUDIO_BYTES,
  REGISTRATION_METHODS,
  TEACH_AUDIO_FOLDER_KEY,
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
} from "@/lib/teach/schemas";
import {
  CORNERS_LABEL,
  DIVIDER_LABEL,
  HERO_LABEL,
  OVERLAY_LABEL,
  QUOTE_LABEL,
  SPACING_LABEL,
  TEACH_PRESETS,
  TEXTURE_LABEL,
  TYPOGRAPHY_LABEL,
} from "@/lib/teach/style";
import {
  CONTACT_METHOD_LABEL,
  DEFAULT_CLASS_WHATSAPP_TEMPLATE,
  DEFAULT_PRIVATE_WHATSAPP_TEMPLATE,
  REGISTRATION_METHOD_LABEL,
  TEMPLATE_VARIABLES,
  buildRegistrationCta,
  classTemplateValues,
  formatShortDate,
  renderTemplate,
} from "@/lib/teach/links";
import { WEEKDAY_LABELS, describeAvailability, formatDuration, sortClasses } from "@/lib/teach/schedule";
import type { StudioApi, SectionKey } from "./teach-studio";
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
} from "./studio-fields";

type Props = { api: StudioApi };

// ---------------------------------------------------------------------------
// Shared section chrome
// ---------------------------------------------------------------------------

function SectionHeader({ eyebrow, title, intro }: { eyebrow: string; title: string; intro: string }) {
  return (
    <header className="flex flex-col gap-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A7B4F]">{eyebrow}</p>
      <h1 className="text-[30px] leading-tight text-[#192B21]" style={{ fontFamily: "var(--font-fraunces), serif" }}>
        {title}
      </h1>
      <p className="text-[13.5px] text-[#6F6C66] leading-relaxed max-w-[62ch]">{intro}</p>
    </header>
  );
}

function SaveBar({ api, section }: { api: StudioApi; section: SectionKey }) {
  const dirty = api.isDirty(section);
  return (
    <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-white/95 backdrop-blur border border-[#E2DACD] shadow-md">
      <span className="text-[12.5px] text-[#6F6C66]" role="status">
        {api.saving === section ? "Saving…" : dirty ? "You have unsaved changes" : "Everything here is saved"}
      </span>
      <StudioButton onClick={() => api.save(section)} disabled={!dirty || api.saving !== null}>
        Save changes
      </StudioButton>
    </div>
  );
}

const newId = () => crypto.randomUUID();

/** Intl's list omits "UTC" (the platform default) - make sure the current value is always selectable. */
function withTimezone(list: string[], current: string | null): string[] {
  const out = list.includes("UTC") ? list : ["UTC", ...list];
  return current && !out.includes(current) ? [current, ...out] : out;
}
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
  editor: (item: EditableTeachItem<K>, update: (patch: Partial<EditableTeachItem<K>>) => void, index: number) => ReactNode;
  reorder?: boolean;
  order?: (items: EditableTeachItem<K>[]) => EditableTeachItem<K>[];
  max?: number;
}) {
  const items = api.items[moduleKey] as EditableTeachItem<K>[];
  const shown = order ? order(items) : items;
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = (id: string, patch: Partial<EditableTeachItem<K>>) =>
    api.setItems(moduleKey, items.map((it) => (it.id === id ? { ...it, ...patch } : it)), section);
  const move = (id: string, dir: -1 | 1) => {
    const i = items.findIndex((it) => it.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    api.setItems(moduleKey, next, section);
  };
  const add = () => {
    const item = {
      id: newId(),
      title: "",
      subtitle: null,
      description: null,
      imageRef: null,
      imageUrl: null,
      externalLink: null,
      metadata: blankTeachMetadata(moduleKey, api.todayIso),
    } as EditableTeachItem<K>;
    api.setItems(moduleKey, [...items, item], section);
    setOpen(item.id);
  };
  const remove = async (id: string) => {
    if (!window.confirm("Remove this item? This can't be undone.")) return;
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
          <div key={item.id} className={`rounded-xl border ${isOpen ? "border-[#9A7B4F]/60 bg-[#FBF8F2]" : "border-[#E2DACD] bg-white"}`} data-testid={`item-${moduleKey}`}>
            <div className="flex items-center gap-3 p-3">
              {s.thumb !== undefined ? (
                s.thumb ? (
                  <img src={s.thumb} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0" />
                ) : (
                  <span className="w-11 h-11 rounded-lg bg-[#F1E9DC] shrink-0" aria-hidden="true" />
                )
              ) : null}
              <button type="button" onClick={() => setOpen(isOpen ? null : item.id)} aria-expanded={isOpen} className="flex-1 min-w-0 text-left min-h-11">
                <span className="block text-[14px] font-semibold text-[#192B21] truncate">{s.title || "Untitled"}</span>
                <span className="block text-[11.5px] text-[#8C8A84] truncate">{s.sub}</span>
              </button>
              {reorder && !order ? (
                <span className="flex">
                  <button type="button" onClick={() => move(item.id, -1)} aria-label="Move up" className="w-9 h-9 rounded-lg text-[#6F6C66] hover:bg-black/5" disabled={index === 0}>
                    ↑
                  </button>
                  <button type="button" onClick={() => move(item.id, 1)} aria-label="Move down" className="w-9 h-9 rounded-lg text-[#6F6C66] hover:bg-black/5" disabled={index === items.length - 1}>
                    ↓
                  </button>
                </span>
              ) : null}
              <button type="button" onClick={() => setOpen(isOpen ? null : item.id)} aria-label={isOpen ? "Collapse" : "Edit"} className="w-9 h-9 rounded-lg text-[#6F6C66] hover:bg-black/5">
                {isOpen ? "▴" : "▾"}
              </button>
            </div>
            {isOpen ? (
              <div className="px-3 sm:px-4 pb-4 flex flex-col gap-4 border-t border-[#E2DACD] pt-4">
                {editor(item, (patch) => update(item.id, patch), index)}
                <div className="flex justify-end">
                  <StudioButton kind="danger" onClick={() => remove(item.id)} disabled={busy === item.id}>
                    {busy === item.id ? "Removing…" : "Remove"}
                  </StudioButton>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
      {error ? <p className="text-[12px] text-[#8F3B3B]" role="alert">{error}</p> : null}
      <div>
        <StudioButton kind="soft" onClick={add} disabled={max !== undefined && items.length >= max}>
          + {addLabel}
        </StudioButton>
        {max !== undefined ? <Hint>{`${items.length} of ${max} used`}</Hint> : null}
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
  update: (patch: Partial<EditableTeachItem<K>>) => void;
  label: string;
  previewClassName?: string;
  hint?: string;
}) {
  const meta = item.metadata as { imagePosition?: { x: number; y: number } | null };
  return (
    <ImageField
      label={label}
      imageUrl={api.mediaUrl(item.imageRef)}
      focal={meta.imagePosition ?? null}
      previewClassName={previewClassName}
      hint={hint}
      onFocal={(f) => update({ metadata: { ...item.metadata, imagePosition: f } })}
      onUpload={async (file) => {
        const res = await api.uploadItemImage(moduleKey, item, index, file);
        if (res.error || !res.ref) return res.error ?? "Upload failed.";
        update({ imageRef: res.ref, metadata: { ...item.metadata, imagePosition: null } });
        api.markDirty(section);
        return null;
      }}
      onRemove={async () => {
        const err = await api.removeItemImage(moduleKey, item);
        if (err) return err;
        update({ imageRef: null, imageUrl: null, metadata: { ...item.metadata, imagePosition: null } });
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
  onChange: (v: { imageRef: string | null; imagePosition: { x: number; y: number } | null }) => void;
  label: string;
  previewClassName?: string;
}) {
  return (
    <ImageField
      label={label}
      imageUrl={api.mediaUrl(value.imageRef)}
      focal={value.imagePosition}
      previewClassName={previewClassName}
      onFocal={(f) => onChange({ ...value, imagePosition: f })}
      onUpload={async (file) => {
        const res = await api.uploadSettingsImage(settingsKey, slot, file);
        if (res.error || !res.ref) return res.error ?? "Upload failed.";
        onChange({ imageRef: res.ref, imagePosition: null });
        return null;
      }}
      onRemove={async () => {
        if (value.imageRef) {
          const err = await api.removeDraftMedia(value.imageRef);
          if (err) return err;
        }
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
  const profile = api.settings.teachProfile;
  const di = api.settings.dailyInspiration;
  const timezones = useMemo(() => withTimezone(listTimezones(), api.timezone), [api.timezone]);
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
          ? "Use 3–63 lowercase letters, numbers or hyphens."
          : check.status === "reserved"
            ? "That address is reserved."
            : check.status === "unavailable"
              ? "That address is already taken."
              : (check.error ?? "Couldn't check that address.")
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
      setSlugStatus(`Reserved — your guests will find you at ${res.slug}.innerdwes.com`);
    }
  }

  const quotes = di.quotes;
  const setQuotes = (next: string[]) => api.updateSetting("dailyInspiration", { quotes: next }, "identity");

  return (
    <>
      <SectionHeader eyebrow="My teaching space" title="Identity" intro="Your name, how you describe your teaching, and where guests find you." />
      <Card title="Who you are" description="Shown at the top of your Guest App Home and on About Me.">
        <Grid>
          <TextField label="My name" value={api.name} onChange={api.setName} maxLength={80} placeholder="Maya Levin" />
          <TextField
            label="Teacher type"
            value={str(profile.teacherType)}
            onChange={(v) => api.updateSetting("teachProfile", { teacherType: nul(v) }, "identity")}
            maxLength={80}
            placeholder="Yoga & Breathwork Teacher"
            hint="Free text — e.g. Yoga Teacher, Sound Healer, Pilates Teacher, Coach."
          />
        </Grid>
        <Grid>
          <SelectField label="Time zone" value={api.timezone} onChange={api.setTimezone} options={timezones.map((t) => ({ value: t, label: t }))} hint="Class times and “today” always use this time zone." />
          <div>
            <Label htmlFor="tt-slug">Guest address</Label>
            <div className="flex gap-2">
              <div className="relative flex-1 min-w-0">
                <input id="tt-slug" value={slugInput} onChange={(e) => setSlugInput(e.target.value)} placeholder="maya" className={`${INPUT} pr-32`} />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] text-[#8C8A84] pointer-events-none">.innerdwes.com</span>
              </div>
              <StudioButton kind="outline" onClick={checkAndReserve} disabled={slugBusy || !normalized || normalized === api.slug || local !== "ok"}>
                {slugBusy ? "…" : "Reserve"}
              </StudioButton>
            </div>
            <Hint>
              {slugStatus ??
                (api.slug
                  ? `Current address: ${api.slug}.innerdwes.com`
                  : local === "invalid"
                    ? "Use 3–63 lowercase letters, numbers or hyphens."
                    : local === "reserved"
                      ? "That address is reserved."
                      : "Reserve your public address.")}
            </Hint>
          </div>
        </Grid>
      </Card>
      <Card title="Primary image" description="Your main hero photo. It crops beautifully into the arched window, portrait circle or full-bleed layouts — set the focal point so your face always stays in frame.">
        <ImageField
          label="Hero image"
          imageUrl={api.mediaUrl(api.heroImageRef)}
          focal={profile.heroImagePosition}
          previewClassName="w-[150px] h-[190px] rounded-t-full rounded-b-2xl"
          onFocal={(f) => api.updateSetting("teachProfile", { heroImagePosition: f }, "identity")}
          onUpload={api.uploadHero}
          onRemove={api.removeHero}
          hint="JPG, PNG or WebP up to 8 MB. Replacing the photo resets the focal point to center."
        />
      </Card>
      <Card title="Daily Inspiration" description="Short quotes or sentences. Guests see one each day on Home — the same one for everyone that day, rotating through your list.">
        <ol className="flex flex-col gap-2">
          {quotes.map((q, i) => (
            <li key={i} className="flex items-center gap-2">
              <input
                value={q}
                maxLength={DAILY_INSPIRATION_MAX_LENGTH}
                onChange={(e) => setQuotes(quotes.map((x, j) => (j === i ? e.target.value : x)))}
                aria-label={`Quote ${i + 1}`}
                className={`${INPUT} italic`}
                style={{ fontFamily: "var(--font-fraunces), serif" }}
              />
              <button type="button" aria-label={`Remove quote ${i + 1}`} onClick={() => setQuotes(quotes.filter((_, j) => j !== i))} className="w-10 h-10 rounded-lg text-[#8C8A84] hover:bg-black/5 shrink-0">
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
            placeholder="Move slowly enough to hear what your body is saying."
            aria-label="New quote"
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
            Add
          </StudioButton>
        </div>
        <Hint>{`${quotes.length} of ${DAILY_INSPIRATION_MAX_QUOTES} quotes · up to ${DAILY_INSPIRATION_MAX_LENGTH} characters each`}</Hint>
        <Toggle
          checked={di.useFallback}
          onChange={(v) => api.updateSetting("dailyInspiration", { useFallback: v }, "identity")}
          label="Use the InnerDweS collection when my list is empty"
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
  const style = api.settings.teachStyle;
  const set = (patch: Partial<typeof style>) => api.updateSetting("teachStyle", patch, "brand");
  const [advanced, setAdvanced] = useState(Boolean(api.colors.navigation || api.colors.text));
  const opt = <T extends string>(keys: readonly T[], labels: Record<T, string>) => keys.map((k) => ({ value: k, label: labels[k] }));
  return (
    <>
      <SectionHeader eyebrow="My teaching space" title="Brand" intro="Colours and a few carefully chosen style options. Every combination stays readable and works on phones and desktops." />
      <Card title="Colour palette" description="Start from a preset or build your own. Presets are optional.">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5" role="radiogroup" aria-label="Palette presets">
          {TEACH_PRESETS.map((p) => {
            const selected = style.preset === p.key;
            return (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  api.setColors({ ...api.colors, primary: p.primary, accent: p.accent });
                  set({ preset: p.key, background: p.background });
                }}
                className="flex flex-col gap-2 p-3 rounded-xl text-left"
                style={{ background: p.background, border: selected ? "2px solid #192B21" : "1px solid #E2DACD" }}
              >
                <span className="flex gap-1.5">
                  <span className="w-6 h-6 rounded-full" style={{ background: p.primary }} />
                  <span className="w-6 h-6 rounded-full" style={{ background: p.accent }} />
                </span>
                <span className="text-[13px] font-semibold" style={{ color: p.primary }}>
                  {p.label}
                </span>
              </button>
            );
          })}
        </div>
        <Grid>
          <ColorField
            label="Primary colour"
            value={api.colors.primary}
            checkWhiteText
            swatches={TEACH_PRESETS.map((p) => ({ label: p.label, hex: p.primary }))}
            onChange={(hex) => {
              api.setColors({ ...api.colors, primary: hex });
              set({ preset: "custom" });
            }}
            hint="Buttons, active navigation and highlights."
          />
          <ColorField
            label="Accent colour"
            value={api.colors.accent}
            swatches={TEACH_PRESETS.map((p) => ({ label: p.label, hex: p.accent }))}
            onChange={(hex) => {
              api.setColors({ ...api.colors, accent: hex });
              set({ preset: "custom" });
            }}
            hint="Dividers, soft backgrounds and details."
          />
        </Grid>
        <ColorField label="Background tint" value={style.background ?? "#F5F0E8"} onChange={(hex) => set({ background: hex, preset: "custom" })} hint="The calm base behind everything. Keep it light." />
        <Toggle checked={advanced} onChange={(v) => {
          setAdvanced(v);
          if (!v) api.setColors({ ...api.colors, navigation: null, text: null });
        }} label="Fine-tune navigation and text colours" description="Optional — by default both follow your primary colour." />
        {advanced ? (
          <Grid>
            <ColorField label="Navigation colour" value={api.colors.navigation ?? api.colors.primary} onChange={(hex) => api.setColors({ ...api.colors, navigation: hex })} />
            <ColorField label="Text colour" value={api.colors.text ?? api.colors.primary} onChange={(hex) => api.setColors({ ...api.colors, text: hex })} />
          </Grid>
        ) : null}
      </Card>
      <Card title="Look & feel" description="Controlled options — never a page builder. Each one is tuned to stay premium and readable.">
        {(
          [
            ["Typography pairing", "typography", opt(TEACH_TYPOGRAPHY, TYPOGRAPHY_LABEL)],
            ["Card corners", "corners", opt(TEACH_CORNERS, CORNERS_LABEL)],
            ["Hero layout", "heroLayout", opt(TEACH_HERO_LAYOUTS, HERO_LABEL)],
            ["Quote style", "quoteStyle", opt(TEACH_QUOTE_STYLES, QUOTE_LABEL)],
            ["Image overlay", "overlay", opt(TEACH_OVERLAYS, OVERLAY_LABEL)],
            ["Section spacing", "spacing", opt(TEACH_SPACING, SPACING_LABEL)],
            ["Background texture", "texture", opt(TEACH_TEXTURES, TEXTURE_LABEL)],
            ["Dividers", "dividers", opt(TEACH_DIVIDERS, DIVIDER_LABEL)],
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
        <Toggle checked={style.organicShapes} onChange={(v) => set({ organicShapes: v })} label="Organic background shapes" description="Soft, blurred shapes behind the top of each page." />
      </Card>
      <SaveBar api={api} section="brand" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

export function HomeSection({ api }: Props) {
  const p = api.settings.teachProfile;
  const hs = p.homeSections;
  const setHs = (patch: Partial<typeof hs>) => api.updateSetting("teachProfile", { homeSections: { ...hs, ...patch } }, "home");
  return (
    <>
      <SectionHeader eyebrow="My teaching space" title="Home" intro="The first thing guests see. It should answer: who you are, what you teach today and how to join." />
      <Card title="Greeting" description="Optional lines around your name. Leave empty for none.">
        <Grid>
          <TextField label="Greeting" value={str(p.greeting)} onChange={(v) => api.updateSetting("teachProfile", { greeting: nul(v) }, "home")} maxLength={140} placeholder="Welcome — I’m glad you’re here." />
          <TextField label="Location line" value={str(p.locationLine)} onChange={(v) => api.updateSetting("teachProfile", { locationLine: nul(v) }, "home")} maxLength={140} placeholder="Tel Aviv · classes in Hebrew & English" />
        </Grid>
      </Card>
      <Card title="Home sections" description="Your hero (image, name, teacher type) is always first.">
        <Toggle checked={hs.quote} onChange={(v) => setHs({ quote: v })} label="Daily Inspiration" description="One quote per day from your list." />
        <Toggle checked={hs.today} onChange={(v) => setHs({ today: v })} label="Today’s classes" description="Expandable class cards; shows your next class when today is empty." />
        <Toggle checked={hs.private} onChange={(v) => setHs({ private: v })} label="Private sessions this week" description="A teaser that opens Schedule → Private sessions." />
        <Toggle checked={hs.library} onChange={(v) => setHs({ library: v })} label="From my library" description="Your latest reading and audio." />
        <Toggle checked={hs.contact} onChange={(v) => setHs({ contact: v })} label="Contact shortcut" description="A single “Get in touch” button under your hero." />
      </Card>
      <SaveBar api={api} section="home" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

const REG_VALUE_LABEL: Record<RegistrationMethod, string> = {
  whatsapp: "WhatsApp number",
  website: "Registration page URL",
  instagram: "Instagram handle or URL",
  facebook: "Facebook event or page URL",
  email: "Email address",
  bookingLink: "Booking link",
  venueLink: "",
};

function TemplateEditor({ value, onChange, fallback, previewValues }: { value: string | null; onChange: (v: string | null) => void; fallback: string; previewValues: Parameters<typeof renderTemplate>[1] }) {
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
      <Label htmlFor="tt-template">Message template</Label>
      <textarea id="tt-template" ref={ref} value={current} rows={3} maxLength={600} onChange={(e) => onChange(e.target.value)} className={`${INPUT} leading-relaxed`} />
      <div className="flex flex-wrap gap-1.5" aria-label="Insert a variable">
        {TEMPLATE_VARIABLES.map((v) => (
          <button key={v} type="button" onClick={() => insert(v)} className="px-2 min-h-8 rounded-md bg-[#F1E9DC] text-[11.5px] font-medium text-[#9A7B4F]">
            {`{{${v}}}`}
          </button>
        ))}
        {value !== null ? (
          <button type="button" onClick={() => onChange(null)} className="px-2 min-h-8 text-[11.5px] underline text-[#6F6C66]">
            Use default
          </button>
        ) : null}
      </div>
      <p className="text-[12px] px-3 py-2 rounded-lg bg-[#EAF1EA] text-[#3F6A4C]" data-testid="template-preview">
        Preview: “{renderTemplate(current, previewValues)}”
      </p>
    </div>
  );
}

function ClassEditor({ api, item, update, index }: { api: StudioApi; item: EditableTeachItem<"teachClasses">; update: (p: Partial<EditableTeachItem<"teachClasses">>) => void; index: number }) {
  const m = item.metadata;
  const setM = (patch: Partial<typeof m>) => update({ metadata: { ...m, ...patch } });
  const reg = m.registration;
  const setReg = (patch: Partial<typeof reg>) => setM({ registration: { ...reg, ...patch } });
  const venue = m.venue;
  const setVenue = (patch: Partial<typeof venue>) => setM({ venue: { ...venue, ...patch } });
  const cta = buildRegistrationCta(api.name, item.title || "Class", m);
  const timezones = useMemo(() => withTimezone(listTimezones(), m.timezone), [m.timezone]);
  return (
    <>
      <Grid>
        <TextField label="Title" value={item.title} onChange={(v) => update({ title: v })} maxLength={160} placeholder="Morning Slow Flow" />
        <TextField label="Class type" value={str(item.subtitle)} onChange={(v) => update({ subtitle: nul(v) })} maxLength={80} placeholder="Vinyasa · All levels" hint="Free text." />
      </Grid>
      <TextArea label="Description" value={str(item.description)} onChange={(v) => update({ description: nul(v) })} rows={3} />
      <ItemImage api={api} moduleKey="teachClasses" section="schedule" item={item} index={index} update={update} label="Class image · shown on the Home class card" previewClassName="w-[96px] h-[112px] rounded-xl" />
      <Grid cols={3}>
        <TextField label="Start date" type="date" value={m.startDate} onChange={(v) => v && setM({ startDate: v })} />
        <TextField label="Start time" type="time" value={m.startTime} onChange={(v) => v && setM({ startTime: v })} />
        <TextField label="End time" type="time" value={str(m.endTime)} onChange={(v) => setM({ endTime: v || null })} />
      </Grid>
      <Grid>
        <TextField label="End date (multi-day only)" type="date" value={str(m.endDate)} onChange={(v) => setM({ endDate: v || null })} hint="Leave empty for a single-day class." />
        <SelectField
          label="Time zone"
          value={m.timezone ?? ""}
          onChange={(v) => setM({ timezone: v || null })}
          options={[{ value: "", label: `Space default (${api.timezone})` }, ...timezones.map((t) => ({ value: t, label: t }))]}
        />
      </Grid>
      <Grid cols={3}>
        <TextField label="Location" value={str(m.location)} onChange={(v) => setM({ location: nul(v) })} placeholder="Olive Tree Studio · Tel Aviv" />
        <TextField label="Price" value={str(m.price)} onChange={(v) => setM({ price: nul(v) })} placeholder="₪65 · 5-class card ₪280" />
        <TextField
          label="Max participants"
          inputMode="numeric"
          value={m.maxParticipants ? String(m.maxParticipants) : ""}
          onChange={(v) => {
            const n = parseInt(v.replace(/\D/g, ""), 10);
            setM({ maxParticipants: Number.isFinite(n) && n > 0 ? n : null });
          }}
        />
      </Grid>
      <TextArea label="How to get there" value={str(m.howToGetThere)} onChange={(v) => setM({ howToGetThere: nul(v) })} rows={2} />
      <div className="flex flex-col gap-4 p-4 rounded-xl border border-[#E2DACD] bg-white">
        <h3 className="text-[16px] text-[#192B21]" style={{ fontFamily: "var(--font-fraunces), serif" }}>
          Registration
        </h3>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Registration method">
          <button type="button" role="radio" aria-checked={reg.method === null} onClick={() => setReg({ method: null })} className={`px-3 min-h-9 rounded-full text-[12px] font-semibold ${reg.method === null ? "bg-[#192B21] text-white" : "border border-[#E2DACD] text-[#192B21]"}`}>
            None
          </button>
          {REGISTRATION_METHODS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={reg.method === k} onClick={() => setReg({ method: k })} className={`px-3 min-h-9 rounded-full text-[12px] font-semibold ${reg.method === k ? "bg-[#192B21] text-white" : "border border-[#E2DACD] text-[#192B21]"}`}>
              {REGISTRATION_METHOD_LABEL[k]}
            </button>
          ))}
        </div>
        {reg.method && reg.method !== "venueLink" ? (
          <Grid>
            <TextField
              label={REG_VALUE_LABEL[reg.method]}
              value={str(reg.value)}
              onChange={(v) => setReg({ value: nul(v) })}
              inputMode={reg.method === "whatsapp" ? "tel" : reg.method === "email" ? "email" : "url"}
              placeholder={reg.method === "whatsapp" ? "+972 50 000 0000" : ""}
              hint={reg.method === "whatsapp" ? "International format with country code." : undefined}
            />
            <TextField label="Button label (optional)" value={str(reg.buttonLabel)} onChange={(v) => setReg({ buttonLabel: nul(v) })} maxLength={60} placeholder={cta?.label ?? ""} />
          </Grid>
        ) : null}
        {reg.method === "venueLink" ? <Hint>Uses the host venue’s booking URL (or website) from the venue details below.</Hint> : null}
        {reg.method === "whatsapp" || reg.method === "email" ? (
          <TemplateEditor
            value={reg.whatsappTemplate}
            onChange={(v) => setReg({ whatsappTemplate: v })}
            fallback={DEFAULT_CLASS_WHATSAPP_TEMPLATE}
            previewValues={classTemplateValues(api.name || "Your name", item.title || "Class", m)}
          />
        ) : null}
        {reg.method ? (
          cta ? (
            <p className="text-[12px] text-[#3F6A4C]">✓ Guests will see “{cta.label}”.</p>
          ) : (
            <p className="text-[12px] text-[#A8643C]" role="alert">
              This method isn’t complete yet — guests won’t see a join button until it is.
            </p>
          )
        ) : null}
        <TextArea label="How to register (shown to guests)" value={str(m.howToRegister)} onChange={(v) => setM({ howToRegister: nul(v) })} rows={2} placeholder="Message me on WhatsApp to save your mat — I reply within a few hours." />
      </div>
      <div className="flex flex-col gap-4 p-4 rounded-xl border border-[#E2DACD] bg-white">
        <Toggle checked={venue.enabled} onChange={(v) => setVenue({ enabled: v })} label="Hosted by a studio or venue" description="Only the fields you fill in are shown to guests." />
        {venue.enabled ? (
          <>
            <Grid>
              <TextField label="Venue name" value={str(venue.name)} onChange={(v) => setVenue({ name: nul(v) })} />
              <TextField label="Website" value={str(venue.website)} onChange={(v) => setVenue({ website: nul(v) })} inputMode="url" />
            </Grid>
            <Grid>
              <TextField label="Instagram" value={str(venue.instagram)} onChange={(v) => setVenue({ instagram: nul(v) })} />
              <TextField label="Facebook" value={str(venue.facebook)} onChange={(v) => setVenue({ facebook: nul(v) })} inputMode="url" />
            </Grid>
            <Grid cols={3}>
              <TextField label="Email" value={str(venue.email)} onChange={(v) => setVenue({ email: nul(v) })} inputMode="email" />
              <TextField label="Booking URL" value={str(venue.bookingUrl)} onChange={(v) => setVenue({ bookingUrl: nul(v) })} inputMode="url" />
              <TextField label="Map / location URL" value={str(venue.mapUrl)} onChange={(v) => setVenue({ mapUrl: nul(v) })} inputMode="url" />
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
          Duplicate class
        </StudioButton>
        <Hint>The copy starts without an image.</Hint>
      </div>
    </>
  );
}

function AvailabilityEditor({ item, update }: { item: EditableTeachItem<"teachAvailability">; update: (p: Partial<EditableTeachItem<"teachAvailability">>) => void }) {
  const m = item.metadata;
  const setM = (patch: Partial<typeof m>) => update({ metadata: { ...m, ...patch } });
  const toggleMethod = (k: (typeof AVAILABILITY_METHODS)[number]) => setM({ methods: m.methods.includes(k) ? m.methods.filter((x) => x !== k) : [...m.methods, k] });
  return (
    <>
      <Toggle checked={m.enabled} onChange={(v) => setM({ enabled: v })} label="Visible to guests" />
      <Grid>
        <TextField label="Label" value={item.title} onChange={(v) => update({ title: v })} placeholder="Available for private session" maxLength={120} />
        <SelectField label="Repeats" value={m.repeat} onChange={(v) => setM({ repeat: v })} options={[{ value: "weekly", label: "Every week" }, { value: "once", label: "One date only" }]} />
      </Grid>
      <Grid cols={3}>
        {m.repeat === "weekly" ? (
          <SelectField label="Day" value={String(m.weekday ?? 2)} onChange={(v) => setM({ weekday: Number(v) })} options={WEEKDAY_LABELS.map((d, i) => ({ value: String(i), label: d }))} />
        ) : (
          <TextField label="Date" type="date" value={str(m.date)} onChange={(v) => setM({ date: v || null })} />
        )}
        <TextField label="From" type="time" value={m.from} onChange={(v) => v && setM({ from: v })} />
        <TextField label="To" type="time" value={m.to} onChange={(v) => v && setM({ to: v })} />
      </Grid>
      <TextArea label="Note for guests" value={str(item.description)} onChange={(v) => update({ description: nul(v) })} rows={2} placeholder="One-to-one yoga, breathwork or a home-practice plan. At my studio or online." />
      <div className="flex flex-col gap-2">
        <Label>How guests reach you</Label>
        <div className="flex flex-wrap gap-1.5">
          {AVAILABILITY_METHODS.map((k) => (
            <button key={k} type="button" aria-pressed={m.methods.includes(k)} onClick={() => toggleMethod(k)} className={`px-3 min-h-9 rounded-full text-[12px] font-semibold ${m.methods.includes(k) ? "bg-[#192B21] text-white" : "border border-[#E2DACD] text-[#192B21]"}`}>
              {k === "bookingLink" ? "Booking link" : k === "whatsapp" ? "WhatsApp" : k === "email" ? "Email" : "Website"}
            </button>
          ))}
        </div>
        <Hint>WhatsApp and email use your details from How to Contact Me — set them once, reused everywhere.</Hint>
      </div>
      {m.methods.includes("bookingLink") ? <TextField label="Booking link" value={str(m.bookingUrl)} onChange={(v) => setM({ bookingUrl: nul(v) })} inputMode="url" hint="Leave empty to use the booking URL from How to Contact Me." /> : null}
      {m.methods.includes("whatsapp") ? (
        <TemplateEditor
          value={m.whatsappTemplate}
          onChange={(v) => setM({ whatsappTemplate: v })}
          fallback={DEFAULT_PRIVATE_WHATSAPP_TEMPLATE}
          previewValues={{ teacher_name: "Maya", date: formatShortDate(m.date ?? new Date().toISOString().slice(0, 10)), start_time: m.from, end_time: m.to }}
        />
      ) : null}
    </>
  );
}

export function ScheduleSection({ api }: Props) {
  const [mode, setMode] = useState<"classes" | "private">("classes");
  return (
    <>
      <SectionHeader eyebrow="Teaching" title="Schedule" intro="Group classes and private availability. Guests always find Schedule in the bottom navigation, and the two are clearly separated." />
      <Segmented label="Schedule type" value={mode} onChange={setMode} options={[{ value: "classes", label: "Classes" }, { value: "private", label: "Private availability" }]} />
      {mode === "classes" ? (
        <Card title="Classes" description={`Listed by date and time in ${api.timezone}.`}>
          <ItemList
            api={api}
            moduleKey="teachClasses"
            section="schedule"
            addLabel="Add class"
            emptyText="No classes yet — add your first one."
            order={(items) => sortClasses(items)}
            summary={(c) => ({
              title: c.title,
              sub: `${formatShortDate(c.metadata.startDate)} · ${c.metadata.startTime}${c.metadata.endTime ? `–${c.metadata.endTime}` : ""}${c.subtitle ? ` · ${c.subtitle}` : ""}`,
              thumb: api.mediaUrl(c.imageRef),
            })}
            editor={(item, update, index) => <ClassEditor api={api} item={item} update={update} index={index} />}
          />
        </Card>
      ) : (
        <Card title="Private availability" description="Publish time windows when you’re open for one-to-one sessions. Not a booking engine — guests contact you the way you choose.">
          <ItemList
            api={api}
            moduleKey="teachAvailability"
            section="schedule"
            addLabel="Add time window"
            emptyText="No private windows yet."
            summary={(a) => ({ title: a.title || "Available for private session", sub: `${describeAvailability(a.metadata)}${a.metadata.enabled ? "" : " · hidden"}` })}
            editor={(item, update) => <AvailabilityEditor item={item} update={update} />}
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
      <SectionHeader eyebrow="Teaching" title="About Me" intro="Your story, told well. Everything is optional — empty fields never appear to guests." />
      <Card title="Profile">
        <SettingsImage api={api} settingsKey="teachAbout" slot="profile" value={a.profile} onChange={(v) => set({ profile: v })} label="Profile image · circle crop" previewClassName="w-[120px] h-[120px] rounded-full" />
        <TextArea label="About me" value={str(a.about)} onChange={(v) => set({ about: nul(v) })} rows={5} maxLength={4000} />
        <Grid>
          <TextField
            label="Teaching since (year)"
            inputMode="numeric"
            value={a.teachingSince ? String(a.teachingSince) : ""}
            onChange={(v) => {
              const n = parseInt(v.replace(/\D/g, "").slice(0, 4), 10);
              set({ teachingSince: Number.isFinite(n) && n >= 1940 && n <= 2100 ? n : null });
            }}
            hint="Guests see “Teaching since 2014 · 11 years”."
          />
          <TextField
            label="Styles I teach"
            value={stylesText}
            onChange={(v) => {
              setStylesText(v);
              set({ styles: v.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20) });
            }}
            hint="Comma-separated, e.g. Vinyasa, Yin, Pranayama."
          />
        </Grid>
        <TextArea label="Teaching philosophy" value={str(a.philosophy)} onChange={(v) => set({ philosophy: nul(v) })} rows={2} maxLength={700} />
      </Card>
      <Card title="Social & direct links" description="Shown as icons under your name. Uses the shared InnerDweS social links.">
        <Grid>
          {SOCIAL_PLATFORMS.map((p) => (
            <TextField key={p} label={SOCIAL_PLATFORM_LABEL[p]} value={linkFor(p)} onChange={(v) => setLink(p, v)} inputMode="url" placeholder="https://" />
          ))}
          <TextField label="WhatsApp" value={str(a.whatsapp)} onChange={(v) => set({ whatsapp: nul(v) })} inputMode="tel" placeholder="+972 50 000 0000" />
          <TextField label="Email" value={str(a.email)} onChange={(v) => set({ email: nul(v) })} inputMode="email" />
        </Grid>
      </Card>
      <Card title="Gallery" description="Photos of your classes and practice. Each keeps its own focal point.">
        <ItemList
          api={api}
          moduleKey="teachGallery"
          section="about"
          addLabel="Add photo"
          emptyText="No photos yet."
          max={12}
          summary={(g) => ({ title: g.title || "Photo", sub: g.imageRef ? "Image set" : "No image yet", thumb: api.mediaUrl(g.imageRef) })}
          editor={(item, update, index) => (
            <>
              <ItemImage api={api} moduleKey="teachGallery" section="about" item={item} index={index} update={update} label="Photo" />
              <TextField label="Caption (optional, used as alt text)" value={item.title} onChange={(v) => update({ title: v })} maxLength={120} />
            </>
          )}
        />
      </Card>
      <Card title="Training, qualifications & certificates" description="Shown as clean cards. Optionally attach an image of the certificate.">
        <ItemList
          api={api}
          moduleKey="teachCertificates"
          section="about"
          addLabel="Add certificate"
          emptyText="No certificates yet."
          summary={(c) => ({ title: c.title, sub: [c.subtitle, c.metadata.year].filter(Boolean).join(" · ") })}
          editor={(item, update, index) => (
            <>
              <Grid>
                <TextField label="Title" value={item.title} onChange={(v) => update({ title: v })} placeholder="500-hr Advanced Yoga Teacher Training" />
                <TextField label="Issuer" value={str(item.subtitle)} onChange={(v) => update({ subtitle: nul(v) })} placeholder="Yoga Alliance RYT-500" />
              </Grid>
              <Grid>
                <TextField label="Year" value={str(item.metadata.year)} onChange={(v) => update({ metadata: { ...item.metadata, year: nul(v) } })} maxLength={12} />
                <TextField label="Details (optional)" value={str(item.description)} onChange={(v) => update({ description: nul(v) })} placeholder="120 hours · Rishikesh" />
              </Grid>
              <ItemImage api={api} moduleKey="teachCertificates" section="about" item={item} index={index} update={update} label="Certificate image (optional)" />
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

const MODULE_INFO: Record<TeachExploreModule, { label: string; desc: string; defaultTitle: string; defaultSubtitle: string }> = {
  teachReadings: { label: "My Readings", desc: "Your writing and external articles.", defaultTitle: "My Readings", defaultSubtitle: "Reflections & articles" },
  teachAudio: { label: "My Audio", desc: "Guided practices guests can play.", defaultTitle: "My Audio", defaultSubtitle: "Practices to listen to" },
  teachContact: { label: "How to Contact Me", desc: "A polished contact destination.", defaultTitle: "Contact", defaultSubtitle: "How to reach me" },
  customPages: { label: "Custom Pages", desc: "Workshops, retreats, policies — each page is its own card.", defaultTitle: "", defaultSubtitle: "" },
};

const FALLBACK_SWATCHES = ["#5B7A6E", "#2D4A3E", "#7E6A57", "#A9553A", "#6A4C6B", "#2F5D7C"];

export function ModulesSection({ api }: Props) {
  const cards = api.settings.teachExplore.cards;
  const setCard = (k: "teachReadings" | "teachAudio" | "teachContact", patch: Partial<ExploreCard>) => {
    const current: ExploreCard = cards[k] ?? { title: null, subtitle: null, imageRef: null, imagePosition: null, fallbackColor: null };
    api.updateSetting("teachExplore", { cards: { ...cards, [k]: { ...current, ...patch } } }, "modules");
  };
  return (
    <>
      <SectionHeader eyebrow="Explore library" title="Modules" intro="A curated library for teachers. Turn modules on, and give each Explore card a title and an optional cover image." />
      {(Object.keys(MODULE_INFO) as TeachExploreModule[]).map((k) => {
        const on = api.enabledExplore.includes(k);
        const info = MODULE_INFO[k];
        const card = k === "customPages" ? null : cards[k];
        return (
          <Card key={k} title={info.label} description={info.desc}>
            <Toggle checked={on} onChange={(v) => api.setEnabledExplore(v ? [...api.enabledExplore, k] : api.enabledExplore.filter((x) => x !== k))} label={on ? "Shown in Explore" : "Hidden"} />
            {on && k !== "customPages" ? (
              <>
                <Grid>
                  <TextField label="Card title" value={str(card?.title)} onChange={(v) => setCard(k, { title: nul(v) })} placeholder={info.defaultTitle} maxLength={60} />
                  <TextField label="Subtitle (optional)" value={str(card?.subtitle)} onChange={(v) => setCard(k, { subtitle: nul(v) })} placeholder={info.defaultSubtitle} maxLength={90} />
                </Grid>
                <SettingsImage
                  api={api}
                  settingsKey="teachExplore"
                  slot={k}
                  value={{ imageRef: card?.imageRef ?? null, imagePosition: card?.imagePosition ?? null }}
                  onChange={(v) => setCard(k, v)}
                  label="Card cover image"
                  previewClassName="w-[180px] h-[110px] rounded-xl"
                />
                <div className="flex flex-col gap-2">
                  <Label>Fallback colour (used when there’s no cover image)</Label>
                  <div className="flex flex-wrap gap-2">
                    {FALLBACK_SWATCHES.map((h) => (
                      <button key={h} type="button" aria-label={`Fallback ${h}`} aria-pressed={card?.fallbackColor === h} onClick={() => setCard(k, { fallbackColor: h })} className="w-8 h-8 rounded-full" style={{ background: h, outline: card?.fallbackColor === h ? "2px solid #192B21" : "none", outlineOffset: 2 }} />
                    ))}
                    <button type="button" onClick={() => setCard(k, { fallbackColor: null })} className="text-[12px] underline text-[#6F6C66] min-h-8">
                      Theme default
                    </button>
                  </div>
                </div>
              </>
            ) : null}
            {on && k === "customPages" ? <Hint>Edit pages, their covers and fallback colours in Custom Pages.</Hint> : null}
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

const READING_CATEGORIES = ["Yoga Philosophy", "Meditation", "Personal Reflections", "Breathwork", "Mindfulness", "Teaching", "Movement"];
const AUDIO_CATEGORIES = ["Guided Meditation", "Breathwork", "Yoga Nidra", "Morning Practice", "Sleep", "Mantra", "Talks"];

function CategoryField({ value, onChange, options, id }: { value: string | null; onChange: (v: string | null) => void; options: string[]; id: string }) {
  return (
    <div>
      <Label htmlFor={id}>Category</Label>
      <input id={id} list={`${id}-list`} value={str(value)} onChange={(e) => onChange(nul(e.target.value))} maxLength={60} className={INPUT} placeholder="Choose or type your own" />
      <datalist id={`${id}-list`}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </div>
  );
}

export function ReadingsSection({ api }: Props) {
  return (
    <>
      <SectionHeader eyebrow="Explore library" title="My Readings" intro="An editorial library for your writing and the articles you want to share. Not a CMS — just what a teacher needs." />
      {!api.enabledExplore.includes("teachReadings") ? <ModuleOffNotice api={api} /> : null}
      <Card title="Readings" description="Newest first for guests. Use the arrows to pin a reading higher.">
        <ItemList
          api={api}
          moduleKey="teachReadings"
          section="readings"
          addLabel="Add reading"
          emptyText="No readings yet."
          summary={(r) => ({ title: r.title, sub: [r.metadata.category, r.metadata.date ? formatShortDate(r.metadata.date) : null, r.externalLink ? "external link" : null].filter(Boolean).join(" · "), thumb: api.mediaUrl(r.imageRef) })}
          editor={(item, update, index) => (
            <>
              <Grid>
                <TextField label="Title" value={item.title} onChange={(v) => update({ title: v })} maxLength={160} />
                <CategoryField id={`cat-${item.id}`} value={item.metadata.category} onChange={(v) => update({ metadata: { ...item.metadata, category: v } })} options={READING_CATEGORIES} />
              </Grid>
              <ItemImage api={api} moduleKey="teachReadings" section="readings" item={item} index={index} update={update} label="Primary image" previewClassName="w-[160px] h-[100px] rounded-xl" />
              <TextArea label="Short excerpt" value={str(item.metadata.excerpt)} onChange={(v) => update({ metadata: { ...item.metadata, excerpt: nul(v) } })} rows={2} maxLength={500} />
              <TextArea label="Body" value={str(item.description)} onChange={(v) => update({ description: nul(v) })} rows={8} hint="Blank line = new paragraph. Also: - lists, > quotes, **bold**, *italic*, [link](https://…)." />
              <Grid cols={3}>
                <TextField label="Author" value={str(item.metadata.author)} onChange={(v) => update({ metadata: { ...item.metadata, author: nul(v) } })} placeholder={api.name} />
                <TextField label="Date" type="date" value={str(item.metadata.date)} onChange={(v) => update({ metadata: { ...item.metadata, date: v || null } })} />
                <TextField label="External article URL" value={str(item.externalLink)} onChange={(v) => update({ externalLink: nul(v) })} inputMode="url" hint="Optional — adds “Read the full article ↗”." />
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
  return (
    <p className="text-[12.5px] px-4 py-3 rounded-xl bg-[#F6E9DF] text-[#8A5230]">
      This module is currently hidden from guests.{" "}
      <button type="button" className="underline font-semibold" onClick={() => api.goTo("modules")}>
        Turn it on in Modules
      </button>
      .
    </p>
  );
}

// ---------------------------------------------------------------------------
// My Audio
// ---------------------------------------------------------------------------

function detectDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (v: number | null) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? Math.round(audio.duration) : null);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}

function AudioFileField({ api, item, update }: { api: StudioApi; item: EditableTeachItem<"teachAudio">; update: (p: Partial<EditableTeachItem<"teachAudio">>) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = item.metadata.audioRef;
  const src = api.mediaUrl(ref);

  async function handle(file: File) {
    setError(null);
    const ext = AUDIO_ALLOWED_TYPES[file.type];
    if (!ext) return setError("Please upload an MP3, M4A, AAC, WAV or OGG audio file.");
    if (file.size > MAX_AUDIO_BYTES) return setError("Audio must be under 100 MB.");
    setBusy("Uploading…");
    const duration = await detectDuration(file);
    const path = `${api.tenantId}/${TEACH_AUDIO_FOLDER_KEY}/${item.id}/draft.${ext}`;
    // Uploaded straight from the browser through the member's own session:
    // the tenant-media bucket RLS (0006) only admits paths under this
    // tenant's id, and the server re-validates the ref on save.
    const supabase = createClient();
    const { error: upErr } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setBusy(null);
      return setError(upErr.message);
    }
    if (ref && ref !== path) await api.removeDraftMedia(ref);
    const { data: signed } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, 3600);
    api.setMediaUrl(path, signed?.signedUrl ?? null);
    update({ metadata: { ...item.metadata, audioRef: path, durationSeconds: duration } });
    setBusy(null);
  }

  return (
    <div className="flex flex-col gap-2 p-4 rounded-xl border border-[#E2DACD] bg-white">
      <Label>Audio file</Label>
      {ref ? (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-[#192B21]">
            {ref.split("/").pop()} · {formatDuration(item.metadata.durationSeconds) ?? "duration unknown"}
          </p>
          {src ? <audio controls preload="none" src={src} className="w-full" /> : null}
        </div>
      ) : (
        <p className="text-[12.5px] text-[#8C8A84]">No audio uploaded yet.</p>
      )}
      <div className="flex gap-2">
        <StudioButton kind="outline" onClick={() => inputRef.current?.click()} disabled={busy !== null}>
          {busy ?? (ref ? "Replace audio" : "Upload audio")}
        </StudioButton>
        {ref ? (
          <StudioButton
            kind="outline"
            disabled={busy !== null}
            onClick={async () => {
              setBusy("Removing…");
              const err = await api.removeDraftMedia(ref);
              setBusy(null);
              if (err) setError(err);
              else update({ metadata: { ...item.metadata, audioRef: null, durationSeconds: null } });
            }}
          >
            Remove
          </StudioButton>
        ) : null}
      </div>
      <Hint>MP3, M4A, AAC, WAV or OGG · up to 100 MB. Duration is detected automatically.</Hint>
      {error ? <p className="text-[12px] text-[#8F3B3B]" role="alert">{error}</p> : null}
      <input
        ref={inputRef}
        type="file"
        accept={Object.keys(AUDIO_ALLOWED_TYPES).join(",")}
        className="hidden"
        aria-label="Audio file"
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
  return (
    <>
      <SectionHeader eyebrow="Explore library" title="My Audio" intro="Upload practices guests can play right inside your app. No playlists, downloads or favourites in this version — just a calm, simple player." />
      {!api.enabledExplore.includes("teachAudio") ? <ModuleOffNotice api={api} /> : null}
      <Card title="Audio library">
        <ItemList
          api={api}
          moduleKey="teachAudio"
          section="audio"
          addLabel="Add audio"
          emptyText="No audio yet."
          summary={(t) => ({ title: t.title, sub: [t.metadata.category, formatDuration(t.metadata.durationSeconds), t.metadata.audioRef ? null : "no file yet"].filter(Boolean).join(" · "), thumb: api.mediaUrl(t.imageRef) })}
          editor={(item, update, index) => (
            <>
              <Grid>
                <TextField label="Title" value={item.title} onChange={(v) => update({ title: v })} maxLength={160} />
                <CategoryField id={`acat-${item.id}`} value={item.metadata.category} onChange={(v) => update({ metadata: { ...item.metadata, category: v } })} options={AUDIO_CATEGORIES} />
              </Grid>
              <AudioFileField api={api} item={item} update={update} />
              <ItemImage api={api} moduleKey="teachAudio" section="audio" item={item} index={index} update={update} label="Cover image" previewClassName="w-[110px] h-[110px] rounded-xl" />
              <TextArea label="Description" value={str(item.description)} onChange={(v) => update({ description: nul(v) })} rows={3} maxLength={2000} />
              <TextArea label="Teacher note (optional)" value={str(item.metadata.teacherNote)} onChange={(v) => update({ metadata: { ...item.metadata, teacherNote: nul(v) } })} rows={2} maxLength={800} />
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
      <SectionHeader eyebrow="Explore library" title="How to Contact Me" intro="A polished contact destination — not a raw list of links. Your WhatsApp and email here are also used by private availability." />
      {!api.enabledExplore.includes("teachContact") ? <ModuleOffNotice api={api} /> : null}
      <Card title="Contact methods" description="Only filled-in, switched-on methods appear to guests.">
        {CONTACT_METHODS.map((k) => (
          <div key={k} className="grid sm:grid-cols-[1fr_auto] gap-2 items-end">
            <TextField label={CONTACT_METHOD_LABEL[k]} value={str(c.methods[k])} onChange={(v) => setMethod(k, v)} placeholder={CONTACT_PLACEHOLDER[k]} inputMode={k === "email" ? "email" : k === "whatsapp" || k === "phone" ? "tel" : "url"} />
            <Toggle checked={c.enabled.includes(k)} onChange={(v) => toggle(k, v)} label="Show" />
          </div>
        ))}
        <Grid>
          <SelectField
            label="Primary button"
            value={(c.primary ?? "") as ContactMethod | ""}
            onChange={(v) => set({ primary: (v || null) as ContactMethod | null })}
            options={[{ value: "" as const, label: "None" }, ...CONTACT_METHODS.map((k) => ({ value: k, label: CONTACT_METHOD_LABEL[k] }))]}
          />
          <TextField label="Button label" value={str(c.buttonLabel)} onChange={(v) => set({ buttonLabel: nul(v) })} placeholder="Message me on WhatsApp" maxLength={60} />
        </Grid>
      </Card>
      <Card title="Location" description="Optional. A calm address card that opens your map link.">
        <Grid>
          <TextField label="Location name" value={str(c.locationName)} onChange={(v) => set({ locationName: nul(v) })} placeholder="Olive Tree Studio" />
          <TextField label="Map / location URL" value={str(c.mapUrl)} onChange={(v) => set({ mapUrl: nul(v) })} inputMode="url" />
        </Grid>
        <TextField label="Studio address" value={str(c.address)} onChange={(v) => set({ address: nul(v) })} />
      </Card>
      <Card title="Page presentation">
        <Grid>
          <TextField label="Title" value={str(c.title)} onChange={(v) => set({ title: nul(v) })} placeholder="Let’s connect" maxLength={80} />
          <TextField label="Intro" value={str(c.intro)} onChange={(v) => set({ intro: nul(v) })} maxLength={500} />
        </Grid>
        <SettingsImage api={api} settingsKey="teachContact" slot="cover" value={c.cover} onChange={(v) => set({ cover: v })} label="Cover image (optional)" previewClassName="w-[180px] h-[100px] rounded-xl" />
        <Hint>Contact form: not included in this version — InnerDweS has no shared form/email delivery system yet.</Hint>
      </Card>
      <SaveBar api={api} section="contact" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Custom pages (shared module, Teach presentation)
// ---------------------------------------------------------------------------

export function CustomPagesSection({ api }: Props) {
  return (
    <>
      <SectionHeader eyebrow="Explore library" title="Custom Pages" intro="Anything else guests should know — workshops, retreats, policies. Uses the shared InnerDweS Custom Pages module." />
      {!api.enabledExplore.includes("customPages") ? <ModuleOffNotice api={api} /> : null}
      <Card title="Pages">
        <ItemList
          api={api}
          moduleKey="customPages"
          section="pages"
          addLabel="Add page"
          emptyText="No pages yet."
          max={api.customPagesLimit}
          summary={(p) => ({ title: p.title, sub: `${p.subtitle ?? "Custom page"}${p.metadata.enabled ? "" : " · hidden"}`, thumb: api.mediaUrl(p.imageRef) })}
          editor={(item, update, index) => (
            <>
              <Toggle checked={item.metadata.enabled} onChange={(v) => update({ metadata: { ...item.metadata, enabled: v } })} label="Visible to guests" />
              <Grid>
                <TextField label="Title" value={item.title} onChange={(v) => update({ title: v })} maxLength={160} />
                <TextField label="Eyebrow / subtitle (optional)" value={str(item.subtitle)} onChange={(v) => update({ subtitle: nul(v) })} maxLength={90} />
              </Grid>
              <ItemImage api={api} moduleKey="customPages" section="pages" item={item} index={index} update={update} label="Cover image" previewClassName="w-[180px] h-[110px] rounded-xl" />
              <div className="flex flex-col gap-2">
                <Label>Fallback colour (card without image)</Label>
                <div className="flex flex-wrap gap-2">
                  {FALLBACK_SWATCHES.map((h) => (
                    <button key={h} type="button" aria-label={`Fallback ${h}`} aria-pressed={item.metadata.fallbackColor === h} onClick={() => update({ metadata: { ...item.metadata, fallbackColor: h } })} className="w-8 h-8 rounded-full" style={{ background: h, outline: item.metadata.fallbackColor === h ? "2px solid #192B21" : "none", outlineOffset: 2 }} />
                  ))}
                </div>
              </div>
              <TextArea label="Content" value={str(item.description)} onChange={(v) => update({ description: nul(v) })} rows={8} hint="Blank line = new paragraph. Also: - lists, > quotes, **bold**, *italic*, [link](https://…). No raw HTML." />
              <Grid>
                <TextField label="Button label (optional)" value={str(item.metadata.buttonLabel)} onChange={(v) => update({ metadata: { ...item.metadata, buttonLabel: nul(v) } })} maxLength={60} />
                <TextField label="Button link" value={str(item.metadata.buttonUrl)} onChange={(v) => update({ metadata: { ...item.metadata, buttonUrl: nul(v) } })} inputMode="url" />
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
// Preview & Publish
// ---------------------------------------------------------------------------

export function PublishSection({ api, preview }: Props & { preview: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const noRegistration = api.items.teachClasses.filter((c) => !buildRegistrationCta(api.name, c.title, c.metadata));
  const checks: { ok: boolean; text: string; blocking?: boolean }[] = [
    { ok: Boolean(api.name.trim()), text: "Your name is set", blocking: true },
    { ok: api.canPublish, text: api.canPublish ? `Active access (${api.accessLabel})` : "This Space needs active access before it can be published", blocking: true },
    { ok: Boolean(api.slug), text: api.slug ? `Guest address: ${api.slug}.innerdwes.com` : "No guest address reserved yet — guests can still open the /g/ link" },
    { ok: Boolean(api.heroImageRef), text: api.heroImageRef ? "Primary image set" : "No primary image yet" },
    { ok: api.items.teachClasses.length > 0, text: `${api.items.teachClasses.length} classes · ${api.items.teachAvailability.length} private windows` },
    { ok: noRegistration.length === 0, text: noRegistration.length === 0 ? "Every class has a registration method" : `${noRegistration.length} class(es) have no working registration method — no join button will show` },
  ];
  const blocked = checks.some((c) => c.blocking && !c.ok);
  const liveHref = api.slug ? `/s/${api.slug}` : `/g/${api.tenantId}`;

  async function publish() {
    setBusy(true);
    setMessage(null);
    const saveErr = await api.saveAll();
    if (saveErr) {
      setBusy(false);
      setMessage({ ok: false, text: `Couldn’t save first: ${saveErr}` });
      return;
    }
    const res = await publishTeachSpace(api.tenantId);
    setBusy(false);
    if (res.error) setMessage({ ok: false, text: res.error });
    else {
      api.setPublishedAt(res.publishedAt);
      setMessage({ ok: true, text: "Published — your guests see this version now." });
    }
  }

  return (
    <>
      <SectionHeader eyebrow="Publishing" title="Preview & Publish" intro="Publishing uses the same shared InnerDweS snapshot, media and guest-access rules as every Space. Guests only ever see what you publish." />
      <Card title="Ready to publish?">
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
            {busy ? "Publishing…" : api.publishedAt ? "Republish" : "Publish now"}
          </StudioButton>
          {api.publishedAt ? (
            <a href={liveHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center min-h-10 px-4 rounded-full border border-[#192B21]/20 text-[12.5px] font-semibold text-[#192B21]">
              Open live app ↗
            </a>
          ) : null}
        </div>
        {message ? (
          <p role={message.ok ? "status" : "alert"} className={`text-[13px] ${message.ok ? "text-[#3F6A4C]" : "text-[#8F3B3B]"}`}>
            {message.text}
          </p>
        ) : null}
        <Hint>{api.publishedAt ? `Last published ${api.publishedAt.slice(0, 16).replace("T", " ")} UTC` : "Not published yet."}</Hint>
      </Card>
      <Card title="Draft preview" description="The real Guest App with your current draft. Mobile layout below; the live app switches to a two-column layout on wide screens.">
        <div className="mx-auto w-full max-w-[380px] h-[720px] rounded-[36px] overflow-hidden border-[6px] border-[#D9D1C3]">{preview}</div>
      </Card>
    </>
  );
}
