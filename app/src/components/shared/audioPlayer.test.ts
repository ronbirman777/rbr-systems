import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { useAudioPlayer } from "./use-audio-player";

/**
 * TASK 029 Phase 1 - the Guest audio player's behaviour moved out of
 * Teach's AudioPlayerScreen into a shared hook, so Flow's audio screen
 * gets the same player rather than a second one.
 *
 * Three of its behaviours are not cosmetic, and this file is what stops a
 * later edit from quietly dropping one. They are checked two ways,
 * because there is no DOM test runner here (and adding one is out of
 * scope): the rendered <audio> element for the attributes, and the source
 * text for the two things only an interaction could otherwise observe.
 */

function Harness(props: { src: string | null; storedDurationSeconds?: number | null }) {
  const { audioProps } = useAudioPlayer(props);
  return props.src ? h("audio", audioProps) : null;
}

const SRC = "/api/media/11111111-1111-4111-8111-111111111111/teachAudio/a/up-A/published.mp3";

describe("the shared audio player fetches only metadata until the guest presses play", () => {
  it("renders preload=metadata and never autoplay", () => {
    const out = renderToStaticMarkup(h(Harness, { src: SRC, storedDurationSeconds: 612 }));
    expect(out).toContain('preload="metadata"');
    expect(out).toContain(`src="${SRC}"`);
    expect(out).not.toContain("autoplay");
    expect(out).not.toContain('preload="auto"');
  });

  it("renders nothing at all for an item with no playable file", () => {
    expect(renderToStaticMarkup(h(Harness, { src: null }))).toBe("");
  });
});

describe("the shared audio player's source keeps its load-bearing details", () => {
  const src = readFileSync(join(process.cwd(), "src/components/shared/use-audio-player.ts"), "utf8");

  it("pauses the element when the screen unmounts", () => {
    // Captured at mount on purpose: by cleanup time the ref is nulled, so
    // `ref.current?.pause()` inside the returned function would be a no-op
    // and the track would keep playing with nothing able to stop it.
    expect(src).toMatch(/useEffect\(\(\) => \{\s*const a = ref\.current;\s*return \(\) => a\?\.pause\(\);\s*\}, \[\]\);/);
  });

  it("awaits play() and turns its rejection into a visible state", () => {
    // Browsers reject play() for policy reasons that are not file errors;
    // unawaited, that is an unhandled rejection and a dead play button.
    expect(src).toMatch(/await a\.play\(\);/);
    expect(src).toMatch(/\} catch \{\s*setStatus\("error"\);/);
  });

  it("clamps a skip against the element's own duration before the stored one", () => {
    expect(src).toContain("Math.min(Math.max(0, a.currentTime + seconds), a.duration || duration || 0)");
  });
});
