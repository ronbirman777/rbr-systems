import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/teach/fonts", () => ({ TEACH_FONT_VARIABLES: "" }));

import { cardImage } from "@/lib/teach/cardImage";
import { parsePublishedTeachSpace, type TeachGuestData } from "@/lib/teach/guestData";
import { TeachGuestApp } from "./teach-guest-app";
import { AudioListScreen, AudioPlayerScreen, ReadingDetailScreen, ReadingsScreen } from "./teach-library";

const T = "11111111-2222-3333-4444-555555555555";
const ref = (m: string, id: string) => `${T}/${m}/${id}/published.webp`;
const url = (r: string) => `/api/media/${r}`;
const COVER_R = ref("teachExplore", "readings");
const COVER_A = ref("teachExplore", "audio");
const OWN_R = ref("teachReadings", "r1");
const OWN_A = ref("teachAudio", "a1");

type Opts = { covers?: boolean; ownImages?: boolean };

function build({ covers = true, ownImages = false }: Opts = {}): TeachGuestData {
  return parsePublishedTeachSpace({
    name: "Lena Example",
    theme: null,
    timezone: "Asia/Makassar",
    enabled_modules: ["teachReadings", "teachAudio"],
    modules: {
      teach: {
        settings: {
          teachExplore: covers
            ? { cards: { teachReadings: { imageRef: COVER_R, imagePosition: { x: 0.2, y: 0.3 } }, teachAudio: { imageRef: COVER_A } } }
            : {},
        },
        items: {
          teachReadings: [{ id: "r1", title: "Breathing", imageRef: ownImages ? OWN_R : null, metadata: { date: "2026-09-01" } }],
          teachAudio: [{ id: "a1", title: "Grounding", imageRef: ownImages ? OWN_A : null, metadata: { audioRef: ref("teachAudioFile", "a1") } }],
        },
      },
    },
  });
}

const noop = () => {};
const readings = (d: TeachGuestData) => renderToStaticMarkup(createElement(ReadingsScreen, { data: d, onBack: noop, onOpen: noop, title: "Readings" }));
const audioList = (d: TeachGuestData) => renderToStaticMarkup(createElement(AudioListScreen, { data: d, onBack: noop, onOpen: noop, title: "Audio" }));
const readingDetail = (d: TeachGuestData) => renderToStaticMarkup(createElement(ReadingDetailScreen, { data: d, item: d.readings[0], onBack: noop }));
const player = (d: TeachGuestData) => renderToStaticMarkup(createElement(AudioPlayerScreen, { data: d, item: d.audio[0], onBack: noop }));
const home = (d: TeachGuestData) => renderToStaticMarkup(createElement(TeachGuestApp, { data: d }));

describe("cardImage helper", () => {
  it("the item's own image wins over the module cover, with the item's focal point", () => {
    const d = build({ ownImages: true });
    const own = { x: 0.9, y: 0.1 };
    const got = cardImage(d, "teachReadings", { imageRef: OWN_R, metadata: { imagePosition: own } });
    expect(got).toEqual({ src: url(OWN_R), focal: own });
    expect(cardImage(d, "teachAudio", d.audio[0]).src).toBe(url(OWN_A));
  });

  it("falls back to the module cover (and the cover's focal point) when the item has no image", () => {
    const d = build();
    expect(cardImage(d, "teachReadings", d.readings[0])).toEqual({ src: url(COVER_R), focal: { x: 0.2, y: 0.3 } });
    expect(cardImage(d, "teachAudio", d.audio[0]).src).toBe(url(COVER_A));
  });

  it("falls back to the cover when an item ref has no resolvable URL", () => {
    const d = build();
    expect(cardImage(d, "teachReadings", { imageRef: "not-in-media-urls", metadata: {} }).src).toBe(url(COVER_R));
  });

  it("returns null (caller keeps its initial placeholder) when neither image exists", () => {
    const d = build({ covers: false });
    expect(cardImage(d, "teachReadings", d.readings[0])).toEqual({ src: null, focal: null });
    expect(cardImage(d, "teachAudio", d.audio[0]).src).toBeNull();
  });

  it("never reads Audio's cover for a Reading or the reverse", () => {
    const d = build();
    expect(cardImage(d, "teachReadings", d.readings[0]).src).not.toBe(url(COVER_A));
    expect(cardImage(d, "teachAudio", d.audio[0]).src).not.toBe(url(COVER_R));
  });
});

describe("Reading and Audio cards: item image > module cover > initial", () => {
  const surfaces: Array<[string, (d: TeachGuestData) => string, string, string]> = [
    ["Readings list", readings, COVER_R, OWN_R],
    ["Reading detail", readingDetail, COVER_R, OWN_R],
    ["Audio list", audioList, COVER_A, OWN_A],
    ["Audio player", player, COVER_A, OWN_A],
    ["Home 'From <teacher>'", home, COVER_R, OWN_R],
  ];

  for (const [name, render, cover, own] of surfaces) {
    it(`${name}: item image wins`, () => {
      const html = render(build({ ownImages: true }));
      expect(html).toContain(url(own));
      expect(html).not.toContain(url(cover));
    });

    it(`${name}: no item image -> module cover is rendered, not an initial`, () => {
      const html = render(build());
      expect(html).toContain(url(cover));
    });
  }

  it("Home audio card falls back to the Audio cover", () => {
    expect(home(build())).toContain(url(COVER_A));
    expect(home(build({ ownImages: true }))).toContain(url(OWN_A));
  });

  it("neither image: the existing initial placeholder remains and no <img> appears for the card", () => {
    const d = build({ covers: false });
    const list = readings(d);
    expect(list).toContain(">B<");
    expect(list).not.toContain("<img");
    const au = audioList(d);
    expect(au).toContain(">G<");
    expect(au).not.toContain("<img");
  });

  it("a cover is only ever referenced through /api/media (no raw storage URL)", () => {
    const html = readings(build());
    expect(html).toContain(`src="/api/media/${COVER_R}"`);
    expect(html).not.toMatch(/supabase\.co/);
  });
});
