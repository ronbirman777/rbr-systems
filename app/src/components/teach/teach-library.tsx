"use client";

import { useMemo, useState } from "react";
import type { TeachGuestData } from "@/lib/teach/guestData";
import type { TeachItem } from "@/lib/teach/schemas";
import { contactEntries, safeHttpUrl, contactMethodLabel } from "@/lib/teach/links";
import { createTranslator } from "@/lib/i18n";
import { formatShortDateLocalized } from "@/lib/i18n/datetime";
import { formatDuration } from "@/lib/modules/duration";
import { audioNote, itemCategories, readingMinutes, sortByDateDesc } from "@/lib/modules/library";
import { useAudioPlayer } from "@/components/shared/use-audio-player";
import { TeachIcon, type TeachIconName } from "./teach-icons";
import { TeachImage } from "./teach-image";
import { TEACH_SIZES } from "./teach-media-sizes";
import { TeachRichText } from "./teach-rich-text";
import { BackButton, Chip, DisplayHeading, EmptyState, Eyebrow, PillLink } from "./teach-ui";
import { cardImage } from "@/lib/teach/cardImage";

const media = (data: TeachGuestData, ref: string | null | undefined) => (ref ? (data.mediaUrls[ref] ?? null) : null);

// ---------------------------------------------------------------------------
// My Readings
// ---------------------------------------------------------------------------

export function ReadingsScreen({ data, onBack, onOpen, title }: { data: TeachGuestData; onBack: () => void; onOpen: (id: string) => void; title: string }) {
  const [cat, setCat] = useState<string | null>(null);
  const sorted = useMemo(() => sortByDateDesc(data.readings), [data.readings]);
  const cats = itemCategories(sorted);
  const list = cat ? sorted.filter((r) => r.metadata.category === cat) : sorted;
  const [featured, ...rest] = list;
  const { t } = createTranslator(data.locale);
  return (
    <div className="flex flex-col gap-4 @min-[40rem]:gap-6 px-4 @min-[40rem]:px-6 @4xl:px-10 pb-8">
      <BackButton label={t("teach", "navExplore")} onClick={onBack} />
      <header className="px-2 @min-[40rem]:px-0 flex flex-col gap-1">
        <Eyebrow>{t("teach", "readingsEyebrow")}</Eyebrow>
        <DisplayHeading as="h1" className="[--tt-h1:32px] @min-[40rem]:[--tt-h1:42px] @4xl:[--tt-h1:46px]" style={{ fontSize: "calc(var(--tt-h1) * var(--tt-display-scale, 1))" }}>
          {title}
        </DisplayHeading>
      </header>
      {cats.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto no-scrollbar px-2 -mx-2">
          <Chip active={cat === null} onClick={() => setCat(null)}>
            {t("common", "all")}
          </Chip>
          {cats.map((c) => (
            <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
              {c}
            </Chip>
          ))}
        </div>
      ) : null}
      {!featured ? (
        <EmptyState icon="book" title={t("teach", "noReadings")} body={t("teach", "noReadingsBody")} />
      ) : (
        <>
          <button type="button" onClick={() => onOpen(featured.id)} className="tt-reveal text-start overflow-hidden @4xl:grid @4xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]" style={{ background: "var(--tt-surface)", border: "1px solid var(--tt-line)", borderRadius: "var(--tt-radius-card)" }}>
            <TeachImage {...cardImage(data, "teachReadings", featured)} alt="" fallbackLabel={featured.title} sizes={TEACH_SIZES.readingFeatured} className="w-full h-[200px] @min-[40rem]:h-[280px] @4xl:h-full @4xl:min-h-[360px]" />
            <span className="flex flex-col gap-1.5 p-4 @min-[40rem]:p-6 @4xl:p-10 @4xl:justify-center @4xl:gap-3">
              <Eyebrow tone="primary">
                {[
                  featured.metadata.category,
                  readingMinutes(featured.description)
                    ? t("teach", "minutesRead", { count: readingMinutes(featured.description)! })
                    : featured.externalLink
                      ? t("teach", "externalArticle")
                      : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Eyebrow>
              <DisplayHeading userContent as="h2" className="[--tt-h2:23px] @min-[40rem]:[--tt-h2:28px] @4xl:[--tt-h2:34px]" style={{ fontSize: "calc(var(--tt-h2) * var(--tt-display-scale, 1))" }}>
                {featured.title}
              </DisplayHeading>
              {featured.metadata.excerpt ? (
                <span dir="auto" className="text-[13.5px] @4xl:text-[15px] leading-[1.5]" style={{ color: "var(--rbr-text-muted)" }}>
                  {featured.metadata.excerpt}
                </span>
              ) : null}
            </span>
          </button>
          <ul className="flex flex-col gap-2.5 @min-[40rem]:grid @min-[40rem]:grid-cols-2 @min-[40rem]:gap-4 @4xl:grid-cols-3 @4xl:gap-5">
            {rest.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onOpen(r.id)} className="tt-reveal w-full h-full text-start flex items-center gap-3 p-2.5 @4xl:flex-col @4xl:items-stretch @4xl:gap-0 @4xl:p-0 @4xl:overflow-hidden" style={{ background: "var(--tt-surface)", border: "1px solid var(--tt-line)", borderRadius: "var(--tt-radius-card)" }}>
                  <TeachImage {...cardImage(data, "teachReadings", r)} alt="" fallbackLabel={r.title} sizes={TEACH_SIZES.readingRow} className="w-[78px] h-[78px] @4xl:w-full @4xl:h-[180px] @4xl:!rounded-none shrink-0" style={{ borderRadius: "var(--tt-radius-image)" }} />
                  <span className="flex-1 min-w-0 flex flex-col gap-1 @4xl:p-4 @4xl:gap-1.5">
                    {r.metadata.category ? <Eyebrow userContent tone="primary">{r.metadata.category}</Eyebrow> : null}
                    <DisplayHeading userContent as="h3" size={16.5} className="line-clamp-2">
                      {r.title}
                    </DisplayHeading>
                    <span className="flex items-center gap-1 text-[12px] truncate" style={{ color: "var(--rbr-text-muted)" }}>
                      {r.metadata.excerpt ?? (r.metadata.date ? formatShortDateLocalized(r.metadata.date, data.locale) : "")}
                      {r.externalLink && !r.description ? <TeachIcon name="external" size={12} /> : null}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function ReadingDetailScreen({ data, item, onBack }: { data: TeachGuestData; item: TeachItem<"teachReadings">; onBack: () => void }) {
  const external = safeHttpUrl(item.externalLink);
  const mins = readingMinutes(item.description);
  const { t } = createTranslator(data.locale);
  return (
    <article className="flex flex-col pb-8">
      <div className="relative @4xl:mx-10 @4xl:overflow-hidden @4xl:rounded-[var(--tt-radius-card)]">
        <TeachImage {...cardImage(data, "teachReadings", item)} alt="" fallbackLabel={item.title} sizes={TEACH_SIZES.readingCover} className="w-full h-[260px] @min-[40rem]:h-[360px] @4xl:h-[460px]" />
        <div className="absolute top-3 start-3 @4xl:top-5 @4xl:start-5">
          <button type="button" onClick={onBack} aria-label={t("common", "backTo", { label: t("teach", "exploreReadings") })} className="w-11 h-11 rounded-full flex items-center justify-center shadow" style={{ background: "var(--tt-surface)", color: "var(--rbr-text)" }}>
            <TeachIcon name="chevronLeft" size={20} strokeWidth={2} />
          </button>
        </div>
      </div>
      <div className="px-6 pt-6 @4xl:pt-12 flex flex-col gap-4 max-w-[680px] @4xl:max-w-[720px] w-full mx-auto">
        <Eyebrow tone="primary">
          {[item.metadata.category, mins ? t("teach", "minutesRead", { count: mins }) : null].filter(Boolean).join(" · ") ||
            t("teach", "reading")}
        </Eyebrow>
        <DisplayHeading userContent as="h1" className="[--tt-h1:30px] @min-[40rem]:[--tt-h1:38px] @4xl:[--tt-h1:46px]" style={{ fontSize: "calc(var(--tt-h1) * var(--tt-display-scale, 1))" }}>
          {item.title}
        </DisplayHeading>
        {item.metadata.author || item.metadata.date ? (
          <p className="text-[12.5px]" style={{ color: "var(--rbr-text-muted)" }}>
            {[item.metadata.author, item.metadata.date ? formatShortDateLocalized(item.metadata.date, data.locale) : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
        {!item.description && item.metadata.excerpt ? (
          <p dir="auto" className="text-[15px] leading-[1.65]" style={{ color: "var(--rbr-text)" }}>
            {item.metadata.excerpt}
          </p>
        ) : null}
        <TeachRichText text={item.description} className="text-[15px] @4xl:text-[17px] leading-[1.7] @4xl:leading-[1.8]" />
        {external ? (
          <a href={external} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-3 p-4" style={{ background: "var(--rbr-primary-soft)", borderRadius: "var(--tt-radius-card)", color: "var(--rbr-primary-foreground)" }}>
            <span className="flex-1">
              <span className="block text-[12px] font-semibold" style={{ color: "var(--rbr-primary)" }}>
                {item.description ? t("teach", "alsoPublishedExternally") : t("teach", "externalArticle")}
              </span>
              <span className="block text-[14px] font-semibold" style={{ color: "var(--rbr-text)" }}>
                {t("teach", "readFullArticle")}
              </span>
            </span>
            <TeachIcon name="external" size={20} strokeWidth={2} />
          </a>
        ) : null}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// My Audio
// ---------------------------------------------------------------------------

export function AudioListScreen({ data, onBack, onOpen, title }: { data: TeachGuestData; onBack: () => void; onOpen: (id: string) => void; title: string }) {
  const tracks = data.audio.filter((a) => a.metadata.audioRef && media(data, a.metadata.audioRef));
  const [cat, setCat] = useState<string | null>(null);
  const cats = itemCategories(tracks);
  const list = cat ? tracks.filter((item) => item.metadata.category === cat) : tracks;
  const [featured, ...rest] = list;
  const { t } = createTranslator(data.locale);
  return (
    <div className="flex flex-col gap-4 @min-[40rem]:gap-6 px-4 @min-[40rem]:px-6 @4xl:px-10 pb-8">
      <BackButton label={t("teach", "navExplore")} onClick={onBack} />
      <header className="px-2 @min-[40rem]:px-0 flex flex-col gap-1">
        <Eyebrow>{t("teach", "audioEyebrow")}</Eyebrow>
        <DisplayHeading as="h1" className="[--tt-h1:32px] @min-[40rem]:[--tt-h1:42px] @4xl:[--tt-h1:46px]" style={{ fontSize: "calc(var(--tt-h1) * var(--tt-display-scale, 1))" }}>
          {title}
        </DisplayHeading>
      </header>
      {cats.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto no-scrollbar px-2 -mx-2">
          <Chip active={cat === null} onClick={() => setCat(null)}>
            {t("common", "all")}
          </Chip>
          {cats.map((c) => (
            <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
              {c}
            </Chip>
          ))}
        </div>
      ) : null}
      {!featured ? (
        <EmptyState icon="headphones" title={t("teach", "noAudio")} body={t("teach", "noAudioBody")} />
      ) : (
        <>
          <button type="button" onClick={() => onOpen(featured.id)} className="tt-reveal relative overflow-hidden text-start h-[190px] @min-[40rem]:h-[260px] @4xl:h-[360px]" style={{ borderRadius: "var(--tt-radius-card)" }}>
            <TeachImage {...cardImage(data, "teachAudio", featured)} alt="" fallbackLabel={featured.title} sizes={TEACH_SIZES.audioFeatured} className="absolute inset-0 w-full h-full" />
            <span aria-hidden="true" className="absolute inset-0" style={{ background: "linear-gradient(180deg, transparent 30%, rgb(20 30 25 / calc(var(--tt-overlay) + 0.25)))" }} />
            <span className="absolute start-4 bottom-4 end-20 @4xl:start-8 @4xl:bottom-8 @4xl:end-32 flex flex-col gap-1">
              <Eyebrow tone="light">{[featured.metadata.category, formatDuration(featured.metadata.durationSeconds)].filter(Boolean).join(" · ")}</Eyebrow>
              <span dir="auto" className="text-white text-[22px] @min-[40rem]:text-[28px] @4xl:text-[36px] leading-tight" style={{ fontFamily: "var(--tt-font-display)" }}>
                {featured.title}
              </span>
            </span>
            <span className="absolute end-4 bottom-4 w-12 h-12 @4xl:end-8 @4xl:bottom-8 @4xl:w-16 @4xl:h-16 rounded-full flex items-center justify-center" style={{ background: "var(--tt-surface)", color: "var(--rbr-primary)" }}>
              <TeachIcon name="play" size={20} />
            </span>
          </button>
          <ul className="flex flex-col gap-2.5 @min-[40rem]:grid @min-[40rem]:grid-cols-2 @min-[40rem]:gap-4 @4xl:grid-cols-3">
            {rest.map((track) => (
              <li key={track.id}>
                <button type="button" onClick={() => onOpen(track.id)} className="tt-reveal w-full text-start flex items-center gap-3 p-2.5" style={{ background: "var(--tt-surface)", border: "1px solid var(--tt-line)", borderRadius: "var(--tt-radius-card)" }}>
                  <TeachImage {...cardImage(data, "teachAudio", track)} alt="" fallbackLabel={track.title} sizes={TEACH_SIZES.audioRow} className="w-16 h-16 shrink-0" style={{ borderRadius: "var(--tt-radius-image)" }} />
                  <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                    {track.metadata.category ? <Eyebrow userContent tone="primary">{track.metadata.category}</Eyebrow> : null}
                    <DisplayHeading userContent as="h3" size={16.5} className="truncate">
                      {track.title}
                    </DisplayHeading>
                    {formatDuration(track.metadata.durationSeconds) ? (
                      <span className="text-[12px]" style={{ color: "var(--rbr-text-muted)" }}>
                        {formatDuration(track.metadata.durationSeconds)}
                      </span>
                    ) : null}
                  </span>
                  <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--rbr-primary-soft)", color: "var(--rbr-primary)" }}>
                    <TeachIcon name="play" size={16} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Simple, calm player: play/pause, scrub, -15/+15, time. No playlists/downloads (v1). */
export function AudioPlayerScreen({ data, item, onBack }: { data: TeachGuestData; item: TeachItem<"teachAudio">; onBack: () => void }) {
  const src = media(data, item.metadata.audioRef);
  const { audioProps, playing, time, duration, status, toggle, skip, seek } = useAudioPlayer({
    src,
    storedDurationSeconds: item.metadata.durationSeconds,
  });
  const { t } = createTranslator(data.locale);
  const note = audioNote(item.metadata);

  return (
    <div className="flex flex-col pb-10">
      <div className="px-4 @min-[40rem]:px-6 @4xl:px-10 w-full @4xl:max-w-[1000px] @4xl:mx-auto">
        <BackButton label={t("teach", "exploreAudio")} onClick={onBack} />
      </div>
      <div className="px-7 flex flex-col items-center gap-5 max-w-[520px] w-full mx-auto @4xl:max-w-[1000px] @4xl:grid @4xl:grid-cols-[400px_minmax(0,1fr)] @4xl:gap-16 @4xl:px-10 @4xl:pt-6">
        <TeachImage
          {...cardImage(data, "teachAudio", item)}
          alt=""
          fallbackLabel={item.title}
          sizes={TEACH_SIZES.audioArtwork}
          className="w-full max-w-[300px] @4xl:max-w-none aspect-square"
          style={{ borderRadius: "calc(var(--tt-radius-card) + 4px)", boxShadow: "0 24px 50px -24px rgba(36,59,50,.45)" }}
        />
        <div className="w-full flex flex-col items-center gap-5 @4xl:items-start">
          <div className="text-center @4xl:text-start flex flex-col gap-1.5">
            {item.metadata.category ? <Eyebrow userContent tone="primary">{item.metadata.category}</Eyebrow> : null}
            <DisplayHeading userContent as="h1" className="[--tt-h1:27px] @4xl:[--tt-h1:40px]" style={{ fontSize: "calc(var(--tt-h1) * var(--tt-display-scale, 1))" }}>
              {item.title}
            </DisplayHeading>
            <p className="text-[13px]" style={{ color: "var(--rbr-text-muted)" }}>
              {[data.teacherName, formatDuration(duration || item.metadata.durationSeconds)].filter(Boolean).join(" · ")}
            </p>
          </div>
          {src ? (
            <>
              <audio {...audioProps} />
              <div className="w-full flex flex-col gap-1.5">
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, Math.round(duration))}
                  step={1}
                  value={Math.min(Math.round(time), Math.max(1, Math.round(duration)))}
                  onChange={(e) => seek(Number(e.target.value))}
                  aria-label={t("common", "seek")}
                  className="tt-range w-full"
                />
                <div className="flex justify-between text-[11.5px] tabular-nums" style={{ color: "var(--rbr-text-muted)" }}>
                  <span>{formatDuration(time) ?? "0:00"}</span>
                  <span>-{formatDuration(Math.max(0, duration - time)) ?? "0:00"}</span>
                </div>
              </div>
              <div className="flex items-center gap-9" style={{ color: "var(--rbr-text)" }}>
                <button type="button" onClick={() => skip(-15)} aria-label={t("common", "skipBack15")} className="w-12 h-12 flex flex-col items-center justify-center">
                  <TeachIcon name="back15" size={26} />
                  <span className="text-[9.5px] font-semibold -mt-0.5" style={{ color: "var(--rbr-text-muted)" }}>
                    15
                  </span>
                </button>
                <button type="button" onClick={toggle} aria-label={playing ? t("common", "pause") : t("common", "play")} className="w-[72px] h-[72px] rounded-full flex items-center justify-center" style={{ background: "var(--rbr-primary)", color: "var(--rbr-on-primary)" }}>
                  <TeachIcon name={playing ? "pause" : "play"} size={28} />
                </button>
                <button type="button" onClick={() => skip(15)} aria-label={t("common", "skipForward15")} className="w-12 h-12 flex flex-col items-center justify-center">
                  <TeachIcon name="forward15" size={26} />
                  <span className="text-[9.5px] font-semibold -mt-0.5" style={{ color: "var(--rbr-text-muted)" }}>
                    15
                  </span>
                </button>
              </div>
              {status === "loading" ? (
                <p className="text-[12px]" style={{ color: "var(--rbr-text-muted)" }} role="status">
                  {t("common", "loading")}
                </p>
              ) : status === "error" ? (
                <p className="text-[12.5px]" style={{ color: "#8F3B3B" }} role="alert">
                  {t("teach", "audioLoadError")}
                </p>
              ) : null}
            </>
          ) : (
            <EmptyState icon="headphones" title={t("teach", "audioUnavailable")} />
          )}
          {note ? (
            <div className="w-full p-4 flex flex-col gap-2" style={{ background: "var(--rbr-secondary-soft)", borderRadius: "var(--tt-radius-card)" }}>
              <p className="flex items-center gap-2 text-[12.5px] font-semibold" style={{ color: "var(--rbr-text)" }}>
                <TeachIcon name="leaf" size={15} />
                {t("teach", "noteFrom", { name: data.teacherName.split(" ")[0] || t("teach", "yourTeacher") })}
              </p>
              <p dir="auto" className="text-[13.5px] leading-[1.55] whitespace-pre-line" style={{ color: "var(--rbr-text-muted)" }}>
                {note}
              </p>
            </div>
          ) : null}
          {item.description ? (
            <p dir="auto" className="w-full text-[13.5px] leading-[1.55] whitespace-pre-line" style={{ color: "var(--rbr-text-muted)" }}>
              {item.description}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// How to Contact Me
// ---------------------------------------------------------------------------

const CONTACT_ICON: Record<string, TeachIconName> = {
  whatsapp: "chat",
  phone: "phone",
  email: "mail",
  instagram: "instagram",
  facebook: "facebook",
  website: "globe",
  telegram: "telegram",
  bookingUrl: "calendar",
};

export function ContactScreen({ data, onBack, backLabel }: { data: TeachGuestData; onBack: () => void; backLabel: string }) {
  const c = data.settings.teachContact;
  const { t } = createTranslator(data.locale);
  const entries = contactEntries(c, data.locale);
  const primary = entries.find((e) => e.method === c.primary) ?? null;
  const rest = entries.filter((e) => e !== primary);
  const cover = media(data, c.cover.imageRef);
  const map = safeHttpUrl(c.mapUrl);
  return (
    <div className="flex flex-col pb-10">
      <div className="relative">
        {cover ? <TeachImage src={cover} focal={c.cover.imagePosition} alt="" sizes={TEACH_SIZES.pageCover} className="w-full h-[210px]" /> : <div className="h-16" />}
        <div className="absolute top-3 start-3">
          <button type="button" onClick={onBack} aria-label={t("common", "backTo", { label: backLabel })} className="w-11 h-11 rounded-full flex items-center justify-center shadow" style={{ background: "var(--tt-surface)", color: "var(--rbr-text)" }}>
            <TeachIcon name="chevronLeft" size={20} strokeWidth={2} />
          </button>
        </div>
      </div>
      <div className={`px-4 ${cover ? "-mt-8" : ""} relative max-w-[640px] w-full mx-auto`}>
        <div className="p-5 flex flex-col gap-4" style={{ background: "var(--tt-surface)", borderRadius: "calc(var(--tt-radius-card) + 6px)", boxShadow: "0 18px 40px -26px rgba(36,59,50,.45)" }}>
          <div className="flex flex-col gap-1.5">
            <Eyebrow tone="primary">{t("teach", "howToContact")}</Eyebrow>
            <DisplayHeading as="h1" size={30}>
              {c.title ?? t("teach", "letsConnect")}
            </DisplayHeading>
            {c.intro ? (
              <p dir="auto" className="text-[13.5px] leading-[1.55]" style={{ color: "var(--rbr-text-muted)" }}>
                {c.intro}
              </p>
            ) : null}
          </div>
          {primary ? (
            <PillLink href={primary.href} icon={CONTACT_ICON[primary.method]} external={!primary.href.startsWith("mailto:") && !primary.href.startsWith("tel:")} className="w-full">
              {c.buttonLabel ?? t("teach", "messageOn", { method: contactMethodLabel(data.locale)[primary.method] })}
            </PillLink>
          ) : null}
          {rest.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {rest.map((e) => (
                <li key={e.method}>
                  <a
                    href={e.href}
                    target={e.href.startsWith("mailto:") || e.href.startsWith("tel:") ? undefined : "_blank"}
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 min-h-14"
                    style={{ background: "var(--tt-bg)", borderRadius: "calc(var(--tt-radius-card) - 6px)" }}
                  >
                    <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--rbr-primary-soft)", color: "var(--rbr-primary)" }}>
                      <TeachIcon name={CONTACT_ICON[e.method]} size={17} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[10.5px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--rbr-text-muted)" }}>
                        {e.label}
                      </span>
                      <span className="block text-[14px] font-medium truncate" style={{ color: "var(--rbr-text)" }}>
                        {e.value}
                      </span>
                    </span>
                    <span style={{ color: "var(--rbr-text-muted)" }}>
                      <TeachIcon name="external" size={15} />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          {c.address || c.locationName ? (
            <div className="flex items-start gap-3 p-3" style={{ border: "1px solid var(--tt-line)", borderRadius: "calc(var(--tt-radius-card) - 6px)" }}>
              <span className="mt-0.5" style={{ color: "var(--rbr-primary)" }}>
                <TeachIcon name="pin" size={18} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[10.5px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--rbr-text-muted)" }}>
                  {c.locationName ?? t("teach", "studioAddress")}
                </span>
                {c.address ? (
                  <span dir="auto" className="block text-[13.5px]" style={{ color: "var(--rbr-text)" }}>
                    {c.address}
                  </span>
                ) : null}
              </span>
              {map ? (
                <a href={map} target="_blank" rel="noopener noreferrer" className="text-[12.5px] font-semibold min-h-11 flex items-center" style={{ color: "var(--rbr-primary)" }}>
                  {t("common", "map")}
                </a>
              ) : null}
            </div>
          ) : null}
          {entries.length === 0 && !c.address ? <EmptyState icon="chat" title={t("teach", "contactSoon")} /> : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom page
// ---------------------------------------------------------------------------

export function CustomPageScreen({ data, page, onBack }: { data: TeachGuestData; page: TeachItem<"customPages">; onBack: () => void }) {
  const button = safeHttpUrl(page.metadata.buttonUrl);
  const img = media(data, page.imageRef);
  const { t } = createTranslator(data.locale);
  return (
    <article className="flex flex-col pb-10">
      <div className="relative">
        {img ? (
          <TeachImage src={img} focal={page.metadata.imagePosition} alt="" sizes={TEACH_SIZES.pageCover} className="w-full h-[240px]" />
        ) : (
          <div className="h-[140px]" style={{ background: page.metadata.fallbackColor ?? "var(--rbr-primary-soft)" }} />
        )}
        <div className="absolute top-3 start-3">
          <button type="button" onClick={onBack} aria-label={t("common", "backTo", { label: t("teach", "navExplore") })} className="w-11 h-11 rounded-full flex items-center justify-center shadow" style={{ background: "var(--tt-surface)", color: "var(--rbr-text)" }}>
            <TeachIcon name="chevronLeft" size={20} strokeWidth={2} />
          </button>
        </div>
      </div>
      <div className="px-6 pt-6 flex flex-col gap-4 max-w-[680px] w-full mx-auto">
        {page.subtitle ? <Eyebrow tone="primary">{page.subtitle}</Eyebrow> : null}
        <DisplayHeading as="h1" size={30}>
          {page.title}
        </DisplayHeading>
        <TeachRichText text={page.description} className="text-[15px] leading-[1.7]" />
        {button ? (
          <PillLink href={button} icon="link" className="w-full mt-2">
            {page.metadata.buttonLabel ?? t("common", "learnMore")}
          </PillLink>
        ) : null}
      </div>
    </article>
  );
}
