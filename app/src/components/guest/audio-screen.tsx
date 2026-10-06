"use client";

import { useState, type CSSProperties } from "react";
import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import type { BrandConfig } from "@/lib/theme/tokens";
import { playableTracks, type DisplayFlowTrack } from "@/lib/modules/flowLibrary";
import { audioNote, itemCategories } from "@/lib/modules/library";
import { formatDuration } from "@/lib/modules/duration";
import { objectPositionStyle } from "@/lib/modules/imagePosition";
import { useAudioPlayer } from "@/components/shared/use-audio-player";
import { createTranslator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import { BrandImage } from "@/components/shared/brand-image";
import { FLOW_SIZES } from "@/components/flow-media-sizes";
import { FlowBackButton, FlowEmptyNote, FlowScreenHeader } from "./flow-screen-chrome";

export type AudioScreenProps = {
  brand: BrandConfig;
  tracks: DisplayFlowTrack[];
  locale?: Locale;
};

/**
 * Flow Audio - list, then one player (TASK 029, P4A).
 *
 * The PLAYER'S BEHAVIOUR is the shared hook (useAudioPlayer): metadata
 * preload only, no autoplay, pause on unmount, play() awaited and its
 * rejection surfaced. Those are the properties CP4 measured the Guest
 * shell against, and they are not re-implemented here - this file only
 * decides how the player looks.
 *
 * A track with no file never reaches the list: `playableTracks` drops it.
 * The organizer still sees it in the Studio, marked "no file yet", which
 * is the difference between a draft and a broadcast rather than two
 * different rules.
 */
export function AudioScreen({ brand, tracks, locale = DEFAULT_LOCALE }: AudioScreenProps) {
  const { t } = createTranslator(locale);
  const vars = deriveThemeVars(brand) as CSSProperties;
  const [openId, setOpenId] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);

  const playable = playableTracks(tracks) as DisplayFlowTrack[];
  const categories = itemCategories(playable);
  const list = category ? playable.filter((a) => a.metadata.category === category) : playable;
  const open = openId ? (playable.find((a) => a.id === openId) ?? null) : null;

  if (open) {
    return <AudioPlayerScreen brand={brand} track={open} onBack={() => setOpenId(null)} locale={locale} />;
  }

  return (
    <div style={vars} className="flex-1 overflow-y-auto no-scrollbar">
      <FlowScreenHeader eyebrow={t("flow", "eyebrowAudio")} title={t("flow", "moduleAudio")} />

      {categories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar px-6 pb-4">
          <Chip active={category === null} onClick={() => setCategory(null)} label={t("common", "all")} />
          {categories.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(c)} label={c} userContent />
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <FlowEmptyNote>{t("flow", "noTracksGuest")}</FlowEmptyNote>
      ) : (
        <div className="px-4 pb-10 space-y-2.5">
          {list.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setOpenId(a.id)}
              className="w-full text-start rounded-3xl overflow-hidden flex items-center gap-3 min-h-[76px]"
              style={{
                background: "var(--rbr-cream)",
                border: "1px solid color-mix(in srgb, var(--rbr-sand) 30%, transparent)",
              }}
            >
              <span className="w-[76px] h-[76px] shrink-0 block">
                <BrandImage
                  src={a.imageUrl}
                  alt=""
                  className="w-full h-full"
                  sizes={FLOW_SIZES.tile}
                  style={{ objectPosition: objectPositionStyle(a.metadata.imagePosition) }}
                  fallback="linear-gradient(160deg, var(--rbr-primary), var(--rbr-primary-dark))"
                />
              </span>
              <span className="flex-1 min-w-0">
                {a.metadata.category && (
                  <span
                    dir="auto"
                    className="block text-[9.5px] tracking-[0.18em] uppercase font-medium"
                    style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-secondary-foreground)" }}
                  >
                    {a.metadata.category}
                  </span>
                )}
                <span
                  dir="auto"
                  className="block text-[15px] leading-snug truncate"
                  style={{ fontFamily: "var(--rbr-font-display)", color: "var(--rbr-text)" }}
                >
                  {a.title}
                </span>
                {formatDuration(a.metadata.durationSeconds) && (
                  <span
                    className="block text-[11.5px] mt-0.5 tabular-nums"
                    style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}
                  >
                    {formatDuration(a.metadata.durationSeconds)}
                  </span>
                )}
              </span>
              <span
                aria-hidden="true"
                className="w-10 h-10 me-4 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "var(--rbr-primary-soft)" }}
              >
                <PlayGlyph />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  userContent,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  userContent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      dir={userContent ? "auto" : undefined}
      className="shrink-0 rounded-full px-3.5 py-1.5 text-[11.5px] font-medium whitespace-nowrap transition-colors"
      style={{
        fontFamily: "var(--rbr-font-ui)",
        background: active ? "var(--rbr-primary)" : "var(--rbr-cream)",
        color: active ? "var(--rbr-on-primary)" : "var(--rbr-dusk)",
        border: `1px solid ${active ? "transparent" : "color-mix(in srgb, var(--rbr-sand) 55%, transparent)"}`,
      }}
    >
      {label}
    </button>
  );
}

/**
 * One track, playing.
 *
 * Mounted ONLY when a guest has chosen a track - never alongside the
 * list - so no <audio> element exists until then, and nothing is fetched
 * for tracks nobody opened.
 */
function AudioPlayerScreen({
  brand,
  track,
  onBack,
  locale,
}: {
  brand: BrandConfig;
  track: DisplayFlowTrack;
  onBack: () => void;
  locale: Locale;
}) {
  const { t } = createTranslator(locale);
  const vars = deriveThemeVars(brand) as CSSProperties;
  const { audioProps, playing, time, duration, status, toggle, skip, seek } = useAudioPlayer({
    src: track.audioUrl,
    storedDurationSeconds: track.metadata.durationSeconds,
  });
  const note = audioNote(track.metadata);
  const max = Math.max(1, Math.round(duration));

  return (
    <div style={vars} className="flex-1 overflow-y-auto no-scrollbar">
      <FlowBackButton label={t("flow", "moduleAudio")} onClick={onBack} />

      <div className="px-7 pt-2 flex flex-col items-center gap-5">
        <div className="w-full max-w-[280px] aspect-square rounded-3xl overflow-hidden shadow-lg">
          <BrandImage
            src={track.imageUrl}
            alt=""
            className="w-full h-full"
            sizes={FLOW_SIZES.frame}
            style={{ objectPosition: objectPositionStyle(track.metadata.imagePosition) }}
            fallback="linear-gradient(160deg, var(--rbr-primary), var(--rbr-primary-dark))"
          />
        </div>

        <div className="text-center flex flex-col gap-1.5">
          {track.metadata.category && (
            <p
              dir="auto"
              className="text-[10px] tracking-[0.2em] uppercase font-medium"
              style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-secondary-foreground)" }}
            >
              {track.metadata.category}
            </p>
          )}
          <h1
            dir="auto"
            className="text-[24px] leading-tight font-normal"
            style={{ fontFamily: "var(--rbr-font-display)", color: "var(--rbr-text)" }}
          >
            {track.title}
          </h1>
          {formatDuration(duration || track.metadata.durationSeconds) && (
            <p
              className="text-[12px] tabular-nums"
              style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}
            >
              {formatDuration(duration || track.metadata.durationSeconds)}
            </p>
          )}
        </div>

        {track.audioUrl ? (
          <>
            <audio {...audioProps} />
            <div className="w-full flex flex-col gap-1.5">
              <input
                type="range"
                min={0}
                max={max}
                step={1}
                value={Math.min(Math.round(time), max)}
                onChange={(e) => seek(Number(e.target.value))}
                aria-label={t("common", "seek")}
                aria-valuetext={formatDuration(time) ?? "0:00"}
                className="rbr-range w-full"
              />
              <div
                className="flex justify-between text-[11.5px] tabular-nums"
                style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}
              >
                <span>{formatDuration(time) ?? "0:00"}</span>
                <span>-{formatDuration(Math.max(0, duration - time)) ?? "0:00"}</span>
              </div>
            </div>

            <div className="flex items-center gap-8">
              <button
                type="button"
                onClick={() => skip(-15)}
                aria-label={t("common", "skipBack15")}
                className="w-12 h-12 flex flex-col items-center justify-center"
                style={{ color: "var(--rbr-dusk)" }}
              >
                <SkipGlyph back />
                <span className="text-[9.5px] font-semibold -mt-0.5">15</span>
              </button>
              <button
                type="button"
                onClick={toggle}
                aria-label={playing ? t("common", "pause") : t("common", "play")}
                className="w-[72px] h-[72px] rounded-full flex items-center justify-center shadow-lg"
                style={{ background: "var(--rbr-primary)", color: "var(--rbr-on-primary)" }}
              >
                {playing ? <PauseGlyph /> : <PlayGlyph large />}
              </button>
              <button
                type="button"
                onClick={() => skip(15)}
                aria-label={t("common", "skipForward15")}
                className="w-12 h-12 flex flex-col items-center justify-center"
                style={{ color: "var(--rbr-dusk)" }}
              >
                <SkipGlyph />
                <span className="text-[9.5px] font-semibold -mt-0.5">15</span>
              </button>
            </div>

            {status === "loading" ? (
              <p className="text-[12px]" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }} role="status">
                {t("common", "loading")}
              </p>
            ) : status === "error" ? (
              <p className="text-[12.5px]" style={{ fontFamily: "var(--rbr-font-ui)", color: "#8F3B3B" }} role="alert">
                {t("flow", "audioLoadError")}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-[12.5px]" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }} role="status">
            {t("flow", "audioUnavailable")}
          </p>
        )}

        {note && (
          <div
            className="w-full rounded-2xl p-4 mt-1"
            style={{ background: "var(--rbr-secondary-soft)" }}
          >
            <p
              dir="auto"
              className="text-[13.5px] leading-relaxed whitespace-pre-line"
              style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-text)" }}
            >
              {note}
            </p>
          </div>
        )}

        {track.description && (
          <p
            dir="auto"
            className="w-full text-[13.5px] leading-relaxed whitespace-pre-line"
            style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-dusk)" }}
          >
            {track.description}
          </p>
        )}
      </div>
      <div className="pb-10" />
    </div>
  );
}

function PlayGlyph({ large }: { large?: boolean }) {
  const size = large ? 26 : 15;
  return (
    // NOT mirrored in RTL: a play triangle means "play", not
    // "rightwards", and flipping it produces a rewind button. See the
    // icon rule in lib/i18n/direction.ts.
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  );
}

function SkipGlyph({ back }: { back?: boolean }) {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={back ? undefined : { transform: "scaleX(-1)" }}
    >
      <path d="M11 5 6 9l5 4" />
      <path d="M6 9h7a5 5 0 1 1 0 10h-2" />
    </svg>
  );
}
