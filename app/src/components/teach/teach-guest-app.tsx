"use client";

import { useCallback, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import { getDailyQuoteFrom } from "@/lib/content/dailyQuotes";
import type { TeachGuestData } from "@/lib/teach/guestData";
import type { TeachExploreModule, TeachItem } from "@/lib/teach/schemas";
import { teachStyleVars, textureBackground } from "@/lib/teach/style";
import { TEACH_FONT_VARIABLES } from "@/lib/teach/fonts";
import { safeHttpUrl, whatsappUrl, mailtoUrl, contactEntries, formatShortDate } from "@/lib/teach/links";
import {
  availabilityOn,
  buildScheduleDays,
  classesOn,
  describeAvailability,
  isClassPast,
  nextUpcomingClass,
  teachingSinceLabel,
  WEEKDAY_LABELS,
} from "@/lib/teach/schedule";
import { TeachIcon, type TeachIconName } from "./teach-icons";
import { TeachImage } from "./teach-image";
import { TeachClassCard, TeachAvailabilityCard } from "./teach-class-card";
import {
  AudioListScreen,
  AudioPlayerScreen,
  ContactScreen,
  CustomPageScreen,
  ReadingDetailScreen,
  ReadingsScreen,
  coverStyle,
} from "./teach-library";
import { Chip, DailyQuoteBlock, DisplayHeading, EmptyState, Eyebrow, OrganicShapes, PillButton, PillLink, SectionHeader } from "./teach-ui";

type Tab = "home" | "schedule" | "about" | "explore";
type Page =
  | { kind: "readings" }
  | { kind: "reading"; id: string }
  | { kind: "audio" }
  | { kind: "track"; id: string }
  | { kind: "contact" }
  | { kind: "page"; id: string };

const TABS: { key: Tab; label: string; icon: TeachIconName }[] = [
  { key: "home", label: "Home", icon: "home" },
  { key: "schedule", label: "Schedule", icon: "calendar" },
  { key: "about", label: "About Me", icon: "user" },
  { key: "explore", label: "Explore", icon: "compass" },
];

const SOCIAL_ICON: Record<string, TeachIconName> = {
  instagram: "instagram",
  facebook: "facebook",
  youtube: "youtube",
  tiktok: "tiktok",
  linkedin: "linkedin",
  website: "globe",
};

/** Scoped motion + range styling; everything is disabled under reduced motion. */
const TEACH_CSS = `
.tt-root .no-scrollbar::-webkit-scrollbar{display:none}.tt-root .no-scrollbar{scrollbar-width:none}
@keyframes tt-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes tt-fade{from{opacity:0}to{opacity:1}}
.tt-root .tt-reveal{animation:tt-rise .32s ease-out both}
.tt-root .tt-expand{animation:tt-rise .22s ease-out both}
.tt-root .tt-fade-in{animation:tt-fade .45s ease-out both}
.tt-root .tt-range{accent-color:var(--rbr-primary);height:24px}
@media (prefers-reduced-motion: reduce){.tt-root .tt-reveal,.tt-root .tt-expand,.tt-root .tt-fade-in{animation:none}}
`;

function exploreTitle(data: TeachGuestData, key: "teachReadings" | "teachAudio" | "teachContact", fallback: string) {
  return data.settings.teachExplore.cards[key]?.title ?? fallback;
}

export function TeachGuestApp({
  data,
  embedded = false,
  initialTab = "home",
}: {
  data: TeachGuestData;
  /** Studio preview: fixed-height frame with its own scroll container. */
  embedded?: boolean;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [stack, setStack] = useState<Page[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const page = stack[stack.length - 1] ?? null;
  const style = data.settings.teachStyle;

  const scrollTop = useCallback(() => {
    if (embedded) scrollRef.current?.scrollTo({ top: 0 });
    else window.scrollTo({ top: 0 });
  }, [embedded]);

  const goTab = (t: Tab) => {
    setTab(t);
    setStack([]);
    scrollTop();
  };
  const open = (p: Page) => {
    setStack((s) => [...s, p]);
    scrollTop();
  };
  const back = () => {
    setStack((s) => s.slice(0, -1));
    scrollTop();
  };

  const vars = useMemo(
    () => ({ ...deriveThemeVars(data.brand), ...teachStyleVars(style) }) as CSSProperties,
    [data.brand, style]
  );

  const aboutHasContent = hasAboutContent(data);
  const tabs = TABS.filter((t) => t.key !== "about" || aboutHasContent);

  const url = (ref: string | null | undefined) => (ref ? (data.mediaUrls[ref] ?? null) : null);

  let body: ReactNode;
  if (page?.kind === "readings") body = <ReadingsScreen data={data} onBack={back} onOpen={(id) => open({ kind: "reading", id })} title={exploreTitle(data, "teachReadings", "My Readings")} />;
  else if (page?.kind === "reading") {
    const item = data.readings.find((r) => r.id === page.id);
    body = item ? <ReadingDetailScreen data={data} item={item} onBack={back} /> : null;
  } else if (page?.kind === "audio") body = <AudioListScreen data={data} onBack={back} onOpen={(id) => open({ kind: "track", id })} title={exploreTitle(data, "teachAudio", "My Audio")} />;
  else if (page?.kind === "track") {
    const item = data.audio.find((a) => a.id === page.id);
    body = item ? <AudioPlayerScreen key={item.id} data={data} item={item} onBack={back} /> : null;
  } else if (page?.kind === "contact") body = <ContactScreen data={data} onBack={back} backLabel={tab === "home" ? "Home" : "Explore"} />;
  else if (page?.kind === "page") {
    const item = data.customPages.find((p) => p.id === page.id);
    body = item ? <CustomPageScreen data={data} page={item} onBack={back} /> : null;
  } else if (tab === "schedule") body = <ScheduleScreen data={data} />;
  else if (tab === "about") body = <AboutScreen data={data} url={url} />;
  else if (tab === "explore") body = <ExploreScreen data={data} url={url} open={open} />;
  else body = <HomeScreen data={data} url={url} open={open} goTab={goTab} />;

  return (
    <div
      className={`tt-root ${TEACH_FONT_VARIABLES} @container relative flex flex-col ${embedded ? "h-full" : "min-h-dvh"}`}
      style={{
        ...vars,
        background: "var(--tt-bg)",
        backgroundImage: textureBackground(style.texture),
        color: "var(--rbr-text)",
        fontFamily: "var(--tt-font-body)",
      }}
      data-testid="teach-guest-app"
    >
      <style>{TEACH_CSS}</style>
      <DesktopTopNav data={data} tabs={tabs} tab={tab} onTab={goTab} url={url} />
      <div ref={scrollRef} className={`relative flex-1 ${embedded ? "overflow-y-auto overflow-x-hidden" : ""}`}>
        {style.organicShapes && !page ? <OrganicShapes /> : null}
        <main className="relative w-full mx-auto @4xl:max-w-[1180px] pt-2 @4xl:pt-8 pb-6">{body}</main>
      </div>
      <nav
        aria-label="Main"
        className="@4xl:hidden sticky bottom-0 z-20 flex justify-around px-2 pt-2 pb-[max(env(safe-area-inset-bottom),14px)]"
        style={{ background: "rgb(253 250 244 / 0.96)", borderTop: "1px solid var(--tt-line)", backdropFilter: "blur(10px)" }}
      >
        {tabs.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => goTab(t.key)}
              aria-current={active ? "page" : undefined}
              className="flex flex-col items-center gap-1 min-w-[64px] min-h-11 pt-1"
              style={{ color: active ? "var(--rbr-navigation)" : "var(--rbr-mist)" }}
            >
              <TeachIcon name={t.icon} size={22} strokeWidth={active ? 1.9 : 1.5} />
              <span className="text-[10.5px]" style={{ fontWeight: active ? 600 : 500 }}>
                {t.label}
              </span>
              <span aria-hidden="true" className="w-4 h-0.5 rounded-full" style={{ background: active ? "var(--rbr-navigation)" : "transparent" }} />
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function hasAboutContent(data: TeachGuestData) {
  const a = data.settings.teachAbout;
  return Boolean(
    a.about || a.philosophy || a.styles.length || a.teachingSince || a.socialLinks.length || a.whatsapp || a.email || a.profile.imageRef || data.gallery.length || data.certificates.length
  );
}

function DesktopTopNav({ data, tabs, tab, onTab, url }: { data: TeachGuestData; tabs: typeof TABS; tab: Tab; onTab: (t: Tab) => void; url: (r: string | null) => string | null }) {
  const contact = contactEntries(data.settings.teachContact);
  const primary = contact.find((e) => e.method === data.settings.teachContact.primary) ?? contact[0] ?? null;
  return (
    <header className="hidden @4xl:flex sticky top-0 z-20 items-center justify-between px-12 py-4" style={{ background: "rgb(253 250 244 / 0.95)", borderBottom: "1px solid var(--tt-line)", backdropFilter: "blur(10px)" }}>
      <button type="button" onClick={() => onTab("home")} className="flex items-center gap-3">
        <TeachImage src={url(data.settings.teachAbout.profile.imageRef) ?? url(data.heroImageRef)} focal={data.settings.teachAbout.profile.imagePosition ?? data.settings.teachProfile.heroImagePosition} alt="" fallbackLabel={data.teacherName} className="w-9 h-9 rounded-full" />
        <span className="text-[22px]" style={{ fontFamily: "var(--tt-font-display)" }}>
          {data.teacherName}
        </span>
      </button>
      <nav aria-label="Main" className="flex items-center gap-7">
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => onTab(t.key)} aria-current={t.key === tab ? "page" : undefined} className="flex flex-col items-center gap-1 text-[14px] min-h-11 justify-center" style={{ color: t.key === tab ? "var(--rbr-navigation)" : "var(--rbr-text-muted)", fontWeight: t.key === tab ? 600 : 500 }}>
            {t.label}
            <span className="w-4 h-0.5 rounded-full" style={{ background: t.key === tab ? "var(--rbr-navigation)" : "transparent" }} />
          </button>
        ))}
        {primary ? (
          <PillLink href={primary.href} className="!min-h-10 !px-4">
            Contact
          </PillLink>
        ) : null}
      </nav>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

function Hero({ data, url }: { data: TeachGuestData; url: (r: string | null) => string | null }) {
  const p = data.settings.teachProfile;
  const layout = data.settings.teachStyle.heroLayout;
  const src = url(data.heroImageRef);
  const identity = (light: boolean) => (
    <div className={`flex flex-col gap-1.5 ${layout === "fullbleed" ? "" : "items-center text-center"}`}>
      {p.greeting ? (
        <p className="text-[13px] italic" style={{ color: light ? "rgba(255,255,255,.9)" : "var(--rbr-text-muted)", fontFamily: "var(--tt-font-display)" }}>
          {p.greeting}
        </p>
      ) : null}
      {p.teacherType ? <Eyebrow tone={light ? "light" : "primary"}>{p.teacherType}</Eyebrow> : null}
      <DisplayHeading as="h1" size={38} style={light ? { color: "#fff" } : undefined}>
        {data.teacherName}
      </DisplayHeading>
      {p.locationLine ? (
        <p className="text-[12.5px]" style={{ color: light ? "rgba(255,255,255,.85)" : "var(--rbr-text-muted)" }}>
          {p.locationLine}
        </p>
      ) : null}
    </div>
  );
  if (layout === "fullbleed") {
    return (
      <div className="relative h-[360px] @4xl:h-[420px] overflow-hidden -mt-2 @4xl:mt-0 @4xl:rounded-[var(--tt-radius-card)]">
        <TeachImage src={src} focal={p.heroImagePosition} alt={`${data.teacherName}`} fallbackLabel={data.teacherName} className="absolute inset-0 w-full h-full" />
        <div aria-hidden="true" className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgb(20 30 25 / calc(var(--tt-overlay) * .4)) 0%, rgb(20 30 25 / calc(var(--tt-overlay) + .3)) 100%)" }} />
        <div className="absolute left-6 right-6 bottom-6">{identity(true)}</div>
      </div>
    );
  }
  const imgStyle: CSSProperties =
    layout === "circle"
      ? { width: 168, height: 168, borderRadius: "999px", border: "5px solid var(--tt-surface)", boxShadow: "0 18px 40px -22px rgba(36,59,50,.5)" }
      : { width: 230, height: 290, borderRadius: "115px 115px var(--tt-radius-card) var(--tt-radius-card)" };
  return (
    <div className="flex flex-col items-center gap-5 px-6 pt-3">
      <TeachImage src={src} focal={p.heroImagePosition} alt={`${data.teacherName}`} fallbackLabel={data.teacherName} style={imgStyle} />
      {identity(false)}
    </div>
  );
}

function HomeScreen({
  data,
  url,
  open,
  goTab,
}: {
  data: TeachGuestData;
  url: (r: string | null) => string | null;
  open: (p: Page) => void;
  goTab: (t: Tab) => void;
}) {
  const s = data.settings;
  const sections = s.teachProfile.homeSections;
  const quote = sections.quote ? getDailyQuoteFrom(data.todayIso, s.dailyInspiration.quotes, s.dailyInspiration.useFallback, s.dailyInspiration.quotes.length ? "" : null) : null;
  const today = classesOn(data.classes, data.todayIso);
  const next = today.length === 0 ? nextUpcomingClass(data.classes, data.todayIso) : null;
  const [expanded, setExpanded] = useState<string | null>(null);

  const weekWindows = useMemo(() => {
    const seen = new Set<string>();
    const out: TeachItem<"teachAvailability">[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(`${data.todayIso}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i);
      for (const w of availabilityOn(data.availability, d.toISOString().slice(0, 10))) {
        if (!seen.has(w.id)) {
          seen.add(w.id);
          out.push(w);
        }
      }
    }
    return out;
  }, [data.availability, data.todayIso]);

  const latestReading = data.enabledExplore.includes("teachReadings")
    ? [...data.readings].sort((a, b) => (b.metadata.date ?? "").localeCompare(a.metadata.date ?? ""))[0]
    : undefined;
  const latestAudio = data.enabledExplore.includes("teachAudio") ? data.audio.find((a) => a.metadata.audioRef) : undefined;
  const contactOn = data.enabledExplore.includes("teachContact") && contactEntries(s.teachContact).length > 0;
  const firstName = data.teacherName.split(" ")[0] || data.teacherName;

  const profileColumn = (
    <div className="flex flex-col gap-[var(--tt-section-gap)] @4xl:sticky @4xl:top-24">
      <Hero data={data} url={url} />
      {quote ? (
        <div className="px-8">
          <DailyQuoteBlock quote={quote} style={s.teachStyle} attribution={`Today’s inspiration · from ${firstName}`} />
        </div>
      ) : null}
      {sections.contact && contactOn ? (
        <div className="px-4 @4xl:px-8">
          <PillButton onClick={() => open({ kind: "contact" })} icon="chat" className="w-full">
            Get in touch
          </PillButton>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="flex flex-col @4xl:grid @4xl:grid-cols-[400px_1fr] @4xl:gap-12 @4xl:px-10 gap-[var(--tt-section-gap)]">
      {profileColumn}
      <div className="flex flex-col gap-[var(--tt-section-gap)]">
        {sections.today ? (
          <section aria-labelledby="tt-today" className="flex flex-col gap-3 px-4 @4xl:px-0">
            <div id="tt-today">
              <SectionHeader title="Today’s classes" action={formatShortDate(data.todayIso)} />
            </div>
            {today.length > 0 ? (
              today.map((c) => (
                <TeachClassCard
                  key={c.id}
                  item={c}
                  imageUrl={url(c.imageRef)}
                  teacherName={data.teacherName}
                  expanded={expanded === c.id}
                  onToggle={() => setExpanded((e) => (e === c.id ? null : c.id))}
                  past={isClassPast(c.metadata, data.todayIso, data.nowTime)}
                  timezoneLabel={c.metadata.timezone && c.metadata.timezone !== data.timezone ? c.metadata.timezone : null}
                />
              ))
            ) : (
              <EmptyState
                title="No classes today"
                body={next ? `Next: ${next.title} · ${formatShortDate(next.metadata.startDate)} ${next.metadata.startTime}` : "New classes coming soon."}
                action={
                  <PillButton kind="soft" icon="calendar" onClick={() => goTab("schedule")}>
                    See full schedule
                  </PillButton>
                }
              />
            )}
          </section>
        ) : null}

        {sections.private && weekWindows.length > 0 ? (
          <section className="px-4 @4xl:px-0">
            <button type="button" onClick={() => goTab("schedule")} className="tt-reveal w-full text-left flex items-center gap-3.5 p-4" style={{ background: "var(--rbr-primary-soft)", borderRadius: "var(--tt-radius-card)" }}>
              <span className="flex-1 flex flex-col gap-1">
                <Eyebrow tone="primary">One-to-one</Eyebrow>
                <DisplayHeading as="h2" size={18}>
                  Private sessions this week
                </DisplayHeading>
                <span className="text-[12.5px]" style={{ color: "var(--rbr-text-muted)" }}>
                  {weekWindows
                    .slice(0, 3)
                    .map((w) => describeAvailability(w.metadata).replace("Every ", ""))
                    .join(" · ")}
                </span>
              </span>
              <span style={{ color: "var(--rbr-primary)" }}>
                <TeachIcon name="chevronRight" size={20} strokeWidth={2} />
              </span>
            </button>
          </section>
        ) : null}

        {sections.library && (latestReading || latestAudio) ? (
          <section className="flex flex-col gap-3 px-4 @4xl:px-0">
            <SectionHeader title={`From ${firstName}`} />
            <div className="grid grid-cols-2 gap-2.5">
              {latestReading ? (
                <button type="button" onClick={() => open({ kind: "reading", id: latestReading.id })} className="tt-reveal text-left overflow-hidden flex flex-col" style={{ background: "var(--tt-surface)", border: "1px solid var(--tt-line)", borderRadius: "var(--tt-radius-card)" }}>
                  <TeachImage src={url(latestReading.imageRef)} focal={latestReading.metadata.imagePosition} alt="" fallbackLabel={latestReading.title} className="w-full h-[110px]" />
                  <span className="p-3 flex flex-col gap-1">
                    <Eyebrow tone="primary">Reading</Eyebrow>
                    <span className="text-[15px] leading-tight line-clamp-2" style={{ fontFamily: "var(--tt-font-display)" }}>
                      {latestReading.title}
                    </span>
                  </span>
                </button>
              ) : null}
              {latestAudio ? (
                <button type="button" onClick={() => open({ kind: "track", id: latestAudio.id })} className="tt-reveal text-left overflow-hidden flex flex-col" style={{ background: "var(--tt-surface)", border: "1px solid var(--tt-line)", borderRadius: "var(--tt-radius-card)" }}>
                  <TeachImage src={url(latestAudio.imageRef)} focal={latestAudio.metadata.imagePosition} alt="" fallbackLabel={latestAudio.title} className="w-full h-[110px]" />
                  <span className="p-3 flex flex-col gap-1">
                    <Eyebrow tone="primary">Listen</Eyebrow>
                    <span className="text-[15px] leading-tight line-clamp-2" style={{ fontFamily: "var(--tt-font-display)" }}>
                      {latestAudio.title}
                    </span>
                  </span>
                </button>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

function ScheduleScreen({ data }: { data: TeachGuestData }) {
  const [mode, setMode] = useState<"classes" | "private">("classes");
  const days = useMemo(() => buildScheduleDays(data.classes, data.availability, data.todayIso, 14), [data.classes, data.availability, data.todayIso]);
  const firstWithClass = days.find((d) => d.classCount > 0)?.date ?? data.todayIso;
  const firstWithPrivate = days.find((d) => d.availabilityCount > 0)?.date ?? data.todayIso;
  const [selected, setSelected] = useState<string | null>(null);
  const date = selected ?? (mode === "classes" ? firstWithClass : firstWithPrivate);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const classes = classesOn(data.classes, date);
  const windows = availabilityOn(data.availability, date);
  const next = nextUpcomingClass(data.classes, date);
  const hasPrivate = data.availability.length > 0;

  return (
    <div className="flex flex-col gap-4 @4xl:max-w-[760px] @4xl:mx-auto">
      <header className="px-5 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Eyebrow>{`This week with ${data.teacherName.split(" ")[0] || data.teacherName}`}</Eyebrow>
          <DisplayHeading as="h1" size={32}>
            Schedule
          </DisplayHeading>
        </div>
        {hasPrivate ? (
          <div role="tablist" aria-label="Schedule type" className="grid grid-cols-2 p-1" style={{ background: "rgb(0 0 0 / 0.05)", borderRadius: "var(--tt-radius-pill)" }}>
            {(
              [
                ["classes", "Group classes"],
                ["private", "Private sessions"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={mode === k}
                onClick={() => {
                  setMode(k);
                  setSelected(null);
                }}
                className="min-h-10 text-[13px]"
                style={{
                  borderRadius: "var(--tt-radius-pill)",
                  background: mode === k ? "var(--tt-surface)" : "transparent",
                  fontWeight: mode === k ? 600 : 500,
                  color: mode === k ? "var(--rbr-text)" : "var(--rbr-text-muted)",
                  boxShadow: mode === k ? "0 2px 8px rgba(0,0,0,.06)" : "none",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </header>
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-5" role="listbox" aria-label="Choose a day">
        {days.map((d) => {
          const active = d.date === date;
          const count = mode === "classes" ? d.classCount : d.availabilityCount;
          const wd = WEEKDAY_LABELS[new Date(`${d.date}T12:00:00Z`).getUTCDay()].slice(0, 3).toUpperCase();
          return (
            <button
              key={d.date}
              type="button"
              role="option"
              aria-selected={active}
              aria-label={`${formatShortDate(d.date)}${count ? `, ${count} ${mode === "classes" ? "classes" : "windows"}` : ""}`}
              onClick={() => setSelected(d.date)}
              className="shrink-0 w-[52px] py-2 flex flex-col items-center gap-0.5"
              style={{
                borderRadius: "calc(var(--tt-radius-card) - 4px)",
                background: active ? "var(--rbr-navigation)" : "var(--tt-surface)",
                border: active ? "1px solid transparent" : "1px solid var(--tt-line)",
                color: active ? "var(--rbr-on-navigation)" : "var(--rbr-text)",
              }}
            >
              <span className="text-[10px] font-semibold tracking-wider" style={{ opacity: active ? 0.9 : 0.6 }}>
                {wd}
              </span>
              <span className="text-[19px]" style={{ fontFamily: "var(--tt-font-display)" }}>
                {Number(d.date.slice(8, 10))}
              </span>
              <span aria-hidden="true" className="w-1 h-1 rounded-full" style={{ background: count ? (active ? "currentColor" : "var(--rbr-primary)") : "transparent" }} />
            </button>
          );
        })}
      </div>
      <section className="flex flex-col gap-3 px-4">
        <p className="px-1 text-[12px] font-semibold" style={{ color: "var(--rbr-text-muted)" }}>
          {formatShortDate(date)}
          {mode === "classes" ? ` · ${classes.length} ${classes.length === 1 ? "class" : "classes"}` : ""}
        </p>
        {mode === "classes" ? (
          classes.length > 0 ? (
            classes.map((c) => (
              <TeachClassCard
                key={c.id}
                item={c}
                imageUrl={c.imageRef ? (data.mediaUrls[c.imageRef] ?? null) : null}
                teacherName={data.teacherName}
                expanded={expanded.has(c.id)}
                onToggle={() =>
                  setExpanded((prev) => {
                    const n = new Set(prev);
                    if (n.has(c.id)) n.delete(c.id);
                    else n.add(c.id);
                    return n;
                  })
                }
                past={isClassPast(c.metadata, data.todayIso, data.nowTime)}
                timezoneLabel={c.metadata.timezone && c.metadata.timezone !== data.timezone ? c.metadata.timezone : null}
              />
            ))
          ) : (
            <EmptyState
              icon="calendar"
              title={data.classes.length ? "No classes on this day" : "New classes coming soon"}
              body={next ? `Next: ${next.title} · ${formatShortDate(next.metadata.startDate)} ${next.metadata.startTime}` : undefined}
              action={next ? <PillButton kind="soft" onClick={() => setSelected(next.metadata.startDate)}>Go to {formatShortDate(next.metadata.startDate)}</PillButton> : undefined}
            />
          )
        ) : windows.length > 0 ? (
          windows.map((w) => <TeachAvailabilityCard key={w.id} item={w} dateIso={date} teacherName={data.teacherName} contact={data.settings.teachContact} />)
        ) : (
          <EmptyState icon="user" title="No private windows this day" body={data.availability.map((w) => describeAvailability(w.metadata)).slice(0, 3).join(" · ")} />
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// About Me
// ---------------------------------------------------------------------------

function AboutScreen({ data, url }: { data: TeachGuestData; url: (r: string | null) => string | null }) {
  const a = data.settings.teachAbout;
  const since = teachingSinceLabel(a.teachingSince, data.todayIso);
  const photo = url(a.profile.imageRef) ?? url(data.heroImageRef);
  const focal = a.profile.imageRef ? a.profile.imagePosition : data.settings.teachProfile.heroImagePosition;
  const socials: { key: string; href: string; icon: TeachIconName; label: string }[] = [];
  for (const l of a.socialLinks) {
    const href = safeHttpUrl(l.url);
    if (href) socials.push({ key: l.platform, href, icon: SOCIAL_ICON[l.platform] ?? "globe", label: l.platform });
  }
  const wa = whatsappUrl(a.whatsapp);
  if (wa) socials.push({ key: "whatsapp", href: wa, icon: "chat", label: "WhatsApp" });
  const mail = mailtoUrl(a.email);
  if (mail) socials.push({ key: "email", href: mail, icon: "mail", label: "Email" });

  return (
    <div className="flex flex-col gap-[var(--tt-section-gap)] @4xl:max-w-[820px] @4xl:mx-auto">
      <header className="flex flex-col items-center text-center gap-3.5 px-6 pt-3">
        <TeachImage src={photo} focal={focal} alt={data.teacherName} fallbackLabel={data.teacherName} className="w-[150px] h-[150px] rounded-full" style={{ border: "5px solid var(--tt-surface)", boxShadow: "0 18px 40px -22px rgba(36,59,50,.5)" }} />
        <div className="flex flex-col gap-1">
          <DisplayHeading as="h1" size={32}>
            {data.teacherName}
          </DisplayHeading>
          {data.settings.teachProfile.teacherType ? (
            <p className="text-[13.5px] font-medium" style={{ color: "var(--rbr-primary)" }}>
              {data.settings.teachProfile.teacherType}
            </p>
          ) : null}
          {since ? (
            <p className="text-[12.5px]" style={{ color: "var(--rbr-text-muted)" }}>
              {since}
            </p>
          ) : null}
        </div>
        {socials.length > 0 ? (
          <ul className="flex flex-wrap justify-center gap-2">
            {socials.map((s) => (
              <li key={s.key}>
                <a href={s.href} target={s.href.startsWith("mailto:") ? undefined : "_blank"} rel="noopener noreferrer" aria-label={s.label} className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: "var(--tt-surface)", border: "1px solid var(--tt-line)", color: "var(--rbr-primary)" }}>
                  <TeachIcon name={s.icon} size={18} />
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </header>
      {a.philosophy ? (
        <div className="px-4">
          <figure className="p-5 flex flex-col gap-2" style={{ background: "var(--rbr-primary-soft)", borderRadius: "calc(var(--tt-radius-card) + 4px)" }}>
            <Eyebrow tone="primary">Teaching philosophy</Eyebrow>
            <blockquote className="text-[19px] leading-[1.35] italic" style={{ fontFamily: "var(--tt-font-display)" }}>
              “{a.philosophy}”
            </blockquote>
          </figure>
        </div>
      ) : null}
      {a.about ? (
        <section className="px-6 flex flex-col gap-2.5">
          <SectionHeader title="About me" />
          <p className="text-[14.5px] leading-[1.65] whitespace-pre-line" style={{ color: "var(--rbr-text-muted)" }}>
            {a.about}
          </p>
        </section>
      ) : null}
      {a.styles.length > 0 ? (
        <section className="px-6 flex flex-col gap-2.5">
          <SectionHeader title="Styles I teach" />
          <div className="flex flex-wrap gap-2">
            {a.styles.map((st) => (
              <Chip key={st}>{st}</Chip>
            ))}
          </div>
        </section>
      ) : null}
      {data.gallery.length > 0 ? (
        <section className="px-4 flex flex-col gap-2.5">
          <div className="px-2">
            <SectionHeader title="Gallery" />
          </div>
          <div className="grid grid-cols-2 @xl:grid-cols-3 gap-2">
            {data.gallery.map((g, i) => (
              <TeachImage
                key={g.id}
                src={url(g.imageRef)}
                focal={g.metadata.imagePosition}
                alt={g.title || `Gallery photo ${i + 1}`}
                className={`w-full ${i % 3 === 0 ? "h-[220px]" : "h-[140px]"}`}
                style={{ borderRadius: "var(--tt-radius-image)" }}
              />
            ))}
          </div>
        </section>
      ) : null}
      {data.certificates.length > 0 ? (
        <section className="px-4 flex flex-col gap-2.5">
          <div className="px-2">
            <SectionHeader title="Training & certificates" />
          </div>
          <ul className="flex flex-col gap-2.5">
            {data.certificates.map((c) => (
              <li key={c.id} className="flex items-center gap-3 p-3.5" style={{ background: "var(--tt-surface)", border: "1px solid var(--tt-line)", borderRadius: "var(--tt-radius-card)" }}>
                {c.imageRef && url(c.imageRef) ? (
                  <TeachImage src={url(c.imageRef)} focal={c.metadata.imagePosition} alt="" className="w-12 h-12 shrink-0" style={{ borderRadius: "calc(var(--tt-radius-image) - 4px)" }} />
                ) : (
                  <span className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--rbr-secondary-soft)", color: "var(--rbr-secondary-foreground)" }}>
                    <TeachIcon name="award" size={19} />
                  </span>
                )}
                <span className="flex-1 min-w-0">
                  <span className="block text-[13.5px] font-semibold" style={{ color: "var(--rbr-text)" }}>
                    {c.title}
                  </span>
                  {c.subtitle || c.description ? (
                    <span className="block text-[12px]" style={{ color: "var(--rbr-text-muted)" }}>
                      {[c.subtitle, c.description].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                </span>
                {c.metadata.year ? (
                  <span className="text-[12px] font-semibold" style={{ color: "var(--rbr-text-muted)" }}>
                    {c.metadata.year}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Explore
// ---------------------------------------------------------------------------

function ExploreCard({
  title,
  subtitle,
  icon,
  image,
  focal,
  fallback,
  onClick,
  tall = false,
}: {
  title: string;
  subtitle: string | null;
  icon: TeachIconName;
  image: string | null;
  focal: Parameters<typeof coverStyle>[1];
  fallback: string;
  onClick: () => void;
  tall?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tt-reveal relative overflow-hidden text-left w-full ${tall ? "h-[200px]" : "h-[170px]"}`}
      style={{ borderRadius: "calc(var(--tt-radius-card) + 4px)", ...coverStyle(image, focal, fallback) }}
    >
      <span aria-hidden="true" className="absolute inset-0" style={{ background: image ? "linear-gradient(180deg, transparent 35%, rgb(20 30 25 / calc(var(--tt-overlay) + 0.3)))" : "transparent" }} />
      <span className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center text-white" style={{ background: "rgb(255 255 255 / 0.22)" }}>
        <TeachIcon name={icon} size={17} />
      </span>
      <span className="absolute left-5 right-5 bottom-4 flex flex-col gap-1">
        {subtitle ? <Eyebrow tone="light">{subtitle}</Eyebrow> : null}
        <span className="text-white text-[24px] leading-tight" style={{ fontFamily: "var(--tt-font-display)", fontSize: "calc(24px * var(--tt-display-scale, 1))" }}>
          {title}
        </span>
      </span>
    </button>
  );
}

function ExploreScreen({ data, url, open }: { data: TeachGuestData; url: (r: string | null) => string | null; open: (p: Page) => void }) {
  const cards = data.settings.teachExplore.cards;
  const on = (k: TeachExploreModule) => data.enabledExplore.includes(k);
  const tiles: ReactNode[] = [];
  const fb = (c: string | null | undefined, v: string) => c ?? v;
  if (on("teachReadings") && data.readings.length > 0) {
    const c = cards.teachReadings;
    tiles.push(<ExploreCard key="r" tall title={c?.title ?? "My Readings"} subtitle={c?.subtitle ?? "Reflections & articles"} icon="book" image={url(c?.imageRef ?? null)} focal={c?.imagePosition ?? null} fallback={fb(c?.fallbackColor, "var(--rbr-primary)")} onClick={() => open({ kind: "readings" })} />);
  }
  if (on("teachAudio") && data.audio.some((a) => a.metadata.audioRef)) {
    const c = cards.teachAudio;
    tiles.push(<ExploreCard key="a" tall title={c?.title ?? "My Audio"} subtitle={c?.subtitle ?? "Practices to listen to"} icon="headphones" image={url(c?.imageRef ?? null)} focal={c?.imagePosition ?? null} fallback={fb(c?.fallbackColor, "var(--rbr-primary-dark)")} onClick={() => open({ kind: "audio" })} />);
  }
  if (on("teachContact") && (contactEntries(data.settings.teachContact).length > 0 || data.settings.teachContact.address)) {
    const c = cards.teachContact;
    tiles.push(<ExploreCard key="c" title={c?.title ?? "Contact"} subtitle={c?.subtitle ?? "How to reach me"} icon="chat" image={url(c?.imageRef ?? null)} focal={c?.imagePosition ?? null} fallback={fb(c?.fallbackColor, "var(--rbr-secondary-dark)")} onClick={() => open({ kind: "contact" })} />);
  }
  if (on("customPages")) {
    for (const p of data.customPages) {
      tiles.push(<ExploreCard key={p.id} title={p.title} subtitle={p.subtitle} icon="page" image={url(p.imageRef)} focal={p.metadata.imagePosition} fallback={fb(p.metadata.fallbackColor, "var(--rbr-secondary-dark)")} onClick={() => open({ kind: "page", id: p.id })} />);
    }
  }
  return (
    <div className="flex flex-col gap-4 px-4 @4xl:max-w-[980px] @4xl:mx-auto">
      <header className="px-2 flex flex-col gap-1">
        <Eyebrow>{`More from ${data.teacherName.split(" ")[0] || data.teacherName}`}</Eyebrow>
        <DisplayHeading as="h1" size={32}>
          Explore
        </DisplayHeading>
      </header>
      {tiles.length > 0 ? <div className="grid gap-3 @xl:grid-cols-2">{tiles}</div> : <EmptyState icon="compass" title="More coming soon" body="Readings, audio and pages will appear here." />}
    </div>
  );
}
