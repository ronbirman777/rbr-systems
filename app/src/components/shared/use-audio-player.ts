"use client";

import { useEffect, useRef, useState, type AudioHTMLAttributes, type RefObject } from "react";

/**
 * The audio player's behaviour, with no opinion about how it looks.
 *
 * Extracted from Teach's AudioPlayerScreen unchanged, because Flow needs
 * the same player and the mechanics are the easy thing to get subtly
 * wrong twice: which events update which piece of state, what `skip`
 * clamps against, and the cleanup that stops playback when the guest
 * navigates away. The CHROME is not shared - the two products draw a
 * different player - so this returns state and a props bag, not markup.
 *
 * Three behaviours here are load-bearing and must survive any later edit:
 *
 *   `preload="metadata"` and no autoplay. A guest App that preloaded the
 *     audio itself would pull megabytes nobody asked for; CP4 measured
 *     the Guest shell on the assumption that only metadata is fetched
 *     until the guest presses play.
 *
 *   The pause-on-unmount effect. Without it, leaving the player screen
 *     leaves the track playing with no way to stop it, because the
 *     element is gone. It captures the element at mount deliberately: by
 *     the time the cleanup runs, the ref has already been nulled.
 *
 *   `play()` is awaited and its rejection caught. Browsers reject it for
 *     reasons that are not errors in the file (an autoplay policy, a
 *     gesture that did not count), so the rejection becomes a visible
 *     "could not play" state rather than an unhandled rejection.
 */
export type AudioPlayerStatus = "idle" | "loading" | "error";

export type AudioPlayer = {
  /** Spread onto `<audio>`, together with nothing else. */
  audioProps: AudioHTMLAttributes<HTMLAudioElement> & { ref: RefObject<HTMLAudioElement | null> };
  playing: boolean;
  /** Current position in seconds. */
  time: number;
  /**
   * Length in seconds: the stored estimate until the browser reads the
   * real one from the file, then that. 0 when neither is known, which is
   * why every consumer clamps the scrubber's max to at least 1.
   */
  duration: number;
  status: AudioPlayerStatus;
  /** Play if paused, pause if playing. Safe to call before the element mounts. */
  toggle: () => Promise<void>;
  /** Seek by a relative number of seconds, clamped to the track. */
  skip: (seconds: number) => void;
  /** Seek to an absolute position in seconds. */
  seek: (seconds: number) => void;
};

export function useAudioPlayer(opts: {
  /** The media URL, or null when the item has no playable file. */
  src: string | null;
  /** The duration stored at upload, used until the file reports its own. */
  storedDurationSeconds?: number | null;
}): AudioPlayer {
  const { src, storedDurationSeconds } = opts;
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(storedDurationSeconds ?? 0);
  const [status, setStatus] = useState<AudioPlayerStatus>("idle");

  useEffect(() => {
    const a = ref.current;
    return () => a?.pause();
  }, []);

  const toggle = async () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) {
      setStatus("loading");
      try {
        await a.play();
        setStatus("idle");
      } catch {
        setStatus("error");
      }
    } else a.pause();
  };

  const seek = (seconds: number) => {
    const a = ref.current;
    if (a) a.currentTime = seconds;
  };

  const skip = (seconds: number) => {
    const a = ref.current;
    // Clamped against the element's own duration first: it is the truth
    // once loaded, and `duration` may still be the stored estimate.
    if (a) a.currentTime = Math.min(Math.max(0, a.currentTime + seconds), a.duration || duration || 0);
  };

  return {
    audioProps: {
      ref,
      src: src ?? undefined,
      preload: "metadata",
      onPlay: () => setPlaying(true),
      onPause: () => setPlaying(false),
      onEnded: () => setPlaying(false),
      onTimeUpdate: (e) => setTime(e.currentTarget.currentTime),
      onLoadedMetadata: (e) => {
        if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration);
      },
      onError: () => setStatus("error"),
    },
    playing,
    time,
    duration,
    status,
    toggle,
    skip,
    seek,
  };
}
