import { describe, expect, it } from "vitest";
import {
  audioAttached,
  audioDetached,
  imageRemoved,
  imageUploaded,
  moveItemById,
  patchExploreCard,
  patchItemById,
  patchSlot,
  resolveListUpdate,
  resolvePatch,
  type ListUpdate,
  type Patch,
} from "./studioStateUpdates";

/**
 * Stale-closure data-loss race (TASK 027.5 final blocker). An image/audio
 * upload resolves AFTER the user edited something else. The completion
 * handler was created in an earlier render, so anything it captured is
 * stale; it must change ONLY its own media field against the latest state.
 *
 * The harness mirrors the Studio's setters exactly: React's functional
 * setState queue, resolveListUpdate / resolvePatch, and the ItemList /
 * ModulesSection / AboutSection call shapes.
 */

type Item = { id: string; title: string; imageRef: string | null; imageUrl: string | null; metadata: Record<string, unknown> };
type Cards = Record<string, { title: string | null; subtitle: string | null; imageRef: string | null; imagePosition: unknown; fallbackColor: string | null } | undefined>;
type State = {
  items: Record<"readings" | "audio", Item[]>;
  settings: {
    teachAbout: { bio: string; profile: { imageRef: string | null; imagePosition: unknown } };
    teachContact: { note: string; cover: { imageRef: string | null; imagePosition: unknown } };
    teachExplore: { enabled: boolean; cards: Cards };
  };
};

const item = (id: string, over: Partial<Item> = {}): Item => ({ id, title: `T-${id}`, imageRef: null, imageUrl: null, metadata: {}, ...over });
const S1 = (): State => ({
  items: { readings: [item("r1", { imageRef: "OLD-r1" }), item("r2")], audio: [item("a1", { metadata: { audioRef: "OLD-audio", category: "c1" } })] },
  settings: {
    teachAbout: { bio: "bio-S1", profile: { imageRef: "OLD-profile", imagePosition: { x: 1, y: 1 } } },
    teachContact: { note: "note-S1", cover: { imageRef: null, imagePosition: null } },
    teachExplore: { enabled: true, cards: { teachReadings: { title: "card-S1", subtitle: null, imageRef: "OLD-card", imagePosition: null, fallbackColor: null } } },
  },
});

function makeStore(initial: State) {
  let state = initial;
  const store = {
    get state() {
      return state;
    },
    setItems(key: keyof State["items"], next: ListUpdate<Item>) {
      state = { ...state, items: { ...state.items, [key]: resolveListUpdate(next, state.items[key]) } };
    },
    updateSetting<K extends keyof State["settings"]>(key: K, patch: Patch<State["settings"][K]>) {
      state = { ...state, settings: { ...state.settings, [key]: { ...state.settings[key], ...resolvePatch(patch, state.settings[key]) } } };
    },
    removeItem(key: keyof State["items"], id: string) {
      state = { ...state, items: { ...state.items, [key]: state.items[key].filter((i) => i.id !== id) } };
    },
  };
  return store;
}
type Store = ReturnType<typeof makeStore>;

/** The ItemList.update binding. */
const itemUpdate = (s: Store, key: keyof State["items"], id: string) => (patch: Patch<Item>) =>
  s.setItems(key, (prev) => patchItemById(prev, id, patch));

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

/** ItemImage.onUpload: server call first, then a field-scoped patch. */
async function itemImageUpload(update: (p: Patch<Item>) => void, upload: Promise<{ ref: string | null; error: string | null }>) {
  const res = await upload;
  if (res.error || !res.ref) return res.error ?? "Upload failed.";
  update(imageUploaded<Item>(res.ref));
  return null;
}

describe("item image upload completing after an unrelated edit", () => {
  it("keeps the newer title edit AND applies the new image; the old image does not return", async () => {
    const s = makeStore(S1());
    const update = itemUpdate(s, "readings", "r1"); // bound in the render of S1
    const up = deferred<{ ref: string | null; error: string | null }>();
    const done = itemImageUpload(update, up.promise);

    update({ title: "edited-S2" }); // user edits before the upload resolves
    expect(s.state.items.readings[0].title).toBe("edited-S2");

    up.resolve({ ref: "NEW-r1", error: null });
    expect(await done).toBeNull();

    const r1 = s.state.items.readings[0];
    expect(r1.title).toBe("edited-S2");
    expect(r1.imageRef).toBe("NEW-r1");
    expect(r1.imageRef).not.toBe("OLD-r1");
  });

  it("negative control: the pre-fix whole-array write from a render snapshot DOES lose the edit", async () => {
    const s = makeStore(S1());
    const snapshot = s.state.items.readings; // what the stale closure captured
    const staleUpdate = (id: string, patch: Partial<Item>) =>
      s.setItems("readings", snapshot.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    const up = deferred<string>();
    const done = up.promise.then((ref) => staleUpdate("r1", { imageRef: ref }));
    s.setItems("readings", (prev) => patchItemById(prev, "r1", { title: "edited-S2" }));
    up.resolve("NEW-r1");
    await done;
    expect(s.state.items.readings[0].title).toBe("T-r1"); // edit lost: this is the bug the fix removes
  });

  it("an edit to a different item made during the upload survives", async () => {
    const s = makeStore(S1());
    const up = deferred<{ ref: string | null; error: string | null }>();
    const done = itemImageUpload(itemUpdate(s, "readings", "r1"), up.promise);
    itemUpdate(s, "readings", "r2")({ title: "other-item-S2" });
    up.resolve({ ref: "NEW-r1", error: null });
    await done;
    expect(s.state.items.readings.map((i) => [i.title, i.imageRef])).toEqual([["T-r1", "NEW-r1"], ["other-item-S2", null]]);
  });

  it("a metadata edit on the same item during the upload survives (only imageRef / imagePosition change)", async () => {
    const s = makeStore(S1());
    const update = itemUpdate(s, "readings", "r1");
    const up = deferred<{ ref: string | null; error: string | null }>();
    const done = itemImageUpload(update, up.promise);
    update((cur) => ({ metadata: { ...cur.metadata, category: "poetry" } }));
    up.resolve({ ref: "NEW-r1", error: null });
    await done;
    expect(s.state.items.readings[0].metadata).toEqual({ category: "poetry", imagePosition: null });
    expect(s.state.items.readings[0].imageRef).toBe("NEW-r1");
  });

  it("a reorder during the upload is preserved and the image lands on the right item", async () => {
    const s = makeStore(S1());
    const up = deferred<{ ref: string | null; error: string | null }>();
    const done = itemImageUpload(itemUpdate(s, "readings", "r1"), up.promise);
    s.setItems("readings", (prev) => moveItemById(prev, "r1", 1));
    up.resolve({ ref: "NEW-r1", error: null });
    await done;
    expect(s.state.items.readings.map((i) => [i.id, i.imageRef])).toEqual([["r2", null], ["r1", "NEW-r1"]]);
  });

  it("two uploads on different items completing out of order both land and keep their own edits", async () => {
    const s = makeStore(S1());
    const u1 = deferred<{ ref: string | null; error: string | null }>();
    const u2 = deferred<{ ref: string | null; error: string | null }>();
    const d1 = itemImageUpload(itemUpdate(s, "readings", "r1"), u1.promise);
    const d2 = itemImageUpload(itemUpdate(s, "readings", "r2"), u2.promise);
    itemUpdate(s, "readings", "r1")({ title: "r1-S2" });
    u2.resolve({ ref: "NEW-r2", error: null }); // second upload finishes first
    await d2;
    itemUpdate(s, "readings", "r2")({ title: "r2-S3" });
    u1.resolve({ ref: "NEW-r1", error: null });
    await d1;
    expect(s.state.items.readings.map((i) => [i.title, i.imageRef])).toEqual([["r1-S2", "NEW-r1"], ["r2-S3", "NEW-r2"]]);
  });

  it("an image upload and an audio attach on the same item, completing out of order, both survive", async () => {
    const s = makeStore(S1());
    const update = itemUpdate(s, "audio", "a1");
    const img = deferred<{ ref: string | null; error: string | null }>();
    const aud = deferred<string>();
    const dImg = itemImageUpload(update, img.promise);
    const dAud = aud.promise.then((p) => update(audioAttached<Item>(p, 90)));
    aud.resolve("NEW-audio");
    await dAud;
    img.resolve({ ref: "NEW-cover", error: null });
    await dImg;
    const a1 = s.state.items.audio[0];
    expect(a1.imageRef).toBe("NEW-cover");
    expect(a1.metadata).toEqual({ audioRef: "NEW-audio", durationSeconds: 90, category: "c1", imagePosition: null });
  });

  it("upload failure changes nothing, including edits made while it was pending", async () => {
    const s = makeStore(S1());
    const update = itemUpdate(s, "readings", "r1");
    const up = deferred<{ ref: string | null; error: string | null }>();
    const done = itemImageUpload(update, up.promise);
    update({ title: "edited-S2" });
    const before = s.state;
    up.resolve({ ref: null, error: "Upload failed." });
    expect(await done).toBe("Upload failed.");
    expect(s.state).toBe(before);
    expect(s.state.items.readings[0]).toMatchObject({ title: "edited-S2", imageRef: "OLD-r1" });
  });

  it("an upload that rejects leaves state untouched", async () => {
    const s = makeStore(S1());
    const up = deferred<{ ref: string | null; error: string | null }>();
    const before = s.state;
    const done = itemImageUpload(itemUpdate(s, "readings", "r1"), up.promise);
    up.reject(new Error("network"));
    await expect(done).rejects.toThrow("network");
    expect(s.state).toBe(before);
  });

  it("the item being deleted while its upload is pending is not resurrected", async () => {
    const s = makeStore(S1());
    const up = deferred<{ ref: string | null; error: string | null }>();
    const done = itemImageUpload(itemUpdate(s, "readings", "r1"), up.promise);
    s.removeItem("readings", "r1");
    const before = s.state.items.readings;
    up.resolve({ ref: "NEW-r1", error: null });
    await done;
    expect(s.state.items.readings.map((i) => i.id)).toEqual(["r2"]);
    expect(s.state.items.readings).toBe(before);
  });

  it("removing the image while another field is edited only clears the image fields", () => {
    const s = makeStore(S1());
    const update = itemUpdate(s, "readings", "r1");
    update({ title: "edited-S2" });
    update(imageRemoved<Item>());
    expect(s.state.items.readings[0]).toMatchObject({ title: "edited-S2", imageRef: null, imageUrl: null });
  });

  it("audio detach only clears the audio fields", () => {
    const s = makeStore(S1());
    const update = itemUpdate(s, "audio", "a1");
    update({ title: "edited-S2" });
    update(audioDetached<Item>());
    expect(s.state.items.audio[0].title).toBe("edited-S2");
    expect(s.state.items.audio[0].metadata).toEqual({ audioRef: null, durationSeconds: null, category: "c1" });
  });
});

describe("settings image upload completing after an unrelated settings edit", () => {
  const aboutProfile = (s: Store) => (v: { imageRef?: string | null; imagePosition: unknown }) =>
    s.updateSetting("teachAbout", (latest) => patchSlot(latest, "profile", v));
  const exploreCard = (s: Store, k: string, patch: object) =>
    s.updateSetting("teachExplore", (latest) => ({ cards: patchExploreCard(latest.cards, k, patch) }));

  it("About: bio edited during the profile-image upload survives; the new image lands", async () => {
    const s = makeStore(S1());
    const onChange = aboutProfile(s);
    const up = deferred<string>();
    const done = up.promise.then((ref) => onChange({ imageRef: ref, imagePosition: null }));
    s.updateSetting("teachAbout", { bio: "bio-S2" });
    up.resolve("NEW-profile");
    await done;
    expect(s.state.settings.teachAbout).toEqual({ bio: "bio-S2", profile: { imageRef: "NEW-profile", imagePosition: null } });
  });

  it("Contact: another settings section edited during the cover upload survives", async () => {
    const s = makeStore(S1());
    const up = deferred<string>();
    const done = up.promise.then((ref) =>
      s.updateSetting("teachContact", (latest) => patchSlot(latest, "cover", { imageRef: ref, imagePosition: null }))
    );
    s.updateSetting("teachContact", { note: "note-S2" });
    s.updateSetting("teachAbout", { bio: "bio-S2" });
    up.resolve("NEW-cover");
    await done;
    expect(s.state.settings.teachContact).toEqual({ note: "note-S2", cover: { imageRef: "NEW-cover", imagePosition: null } });
    expect(s.state.settings.teachAbout.bio).toBe("bio-S2");
  });

  it("Explore: card title typed during the card-image upload survives, and sibling cards are untouched", async () => {
    const s = makeStore(S1());
    const up = deferred<string>();
    const done = up.promise.then((ref) => exploreCard(s, "teachReadings", { imageRef: ref, imagePosition: null }));
    exploreCard(s, "teachReadings", { title: "card-S2" });
    exploreCard(s, "teachAudio", { title: "audio-card-S2" });
    up.resolve("NEW-card");
    await done;
    const cards = s.state.settings.teachExplore.cards;
    expect(cards.teachReadings).toMatchObject({ title: "card-S2", imageRef: "NEW-card" });
    expect(cards.teachAudio).toMatchObject({ title: "audio-card-S2", imageRef: null });
  });

  it("Explore: two card uploads completing out of order both land", async () => {
    const s = makeStore(S1());
    const u1 = deferred<string>();
    const u2 = deferred<string>();
    const d1 = u1.promise.then((ref) => exploreCard(s, "teachReadings", { imageRef: ref }));
    const d2 = u2.promise.then((ref) => exploreCard(s, "teachContact", { imageRef: ref }));
    u2.resolve("NEW-contact");
    await d2;
    u1.resolve("NEW-readings");
    await d1;
    const cards = s.state.settings.teachExplore.cards;
    expect(cards.teachReadings).toMatchObject({ title: "card-S1", imageRef: "NEW-readings" });
    expect(cards.teachContact).toMatchObject({ imageRef: "NEW-contact" });
  });

  it("a cross-section upload pair (About profile + Contact cover) out of order both land", async () => {
    const s = makeStore(S1());
    const u1 = deferred<string>();
    const u2 = deferred<string>();
    const d1 = u1.promise.then((ref) => aboutProfile(s)({ imageRef: ref, imagePosition: null }));
    const d2 = u2.promise.then((ref) =>
      s.updateSetting("teachContact", (latest) => patchSlot(latest, "cover", { imageRef: ref, imagePosition: null }))
    );
    u2.resolve("NEW-cover");
    await d2;
    u1.resolve("NEW-profile");
    await d1;
    expect(s.state.settings.teachAbout.profile.imageRef).toBe("NEW-profile");
    expect(s.state.settings.teachContact.cover.imageRef).toBe("NEW-cover");
  });

  it("focal-point and remove only touch the image slot", () => {
    const s = makeStore(S1());
    s.updateSetting("teachAbout", { bio: "bio-S2" });
    aboutProfile(s)({ imagePosition: { x: 5, y: 5 } });
    expect(s.state.settings.teachAbout.profile).toEqual({ imageRef: "OLD-profile", imagePosition: { x: 5, y: 5 } });
    aboutProfile(s)({ imageRef: null, imagePosition: null });
    expect(s.state.settings.teachAbout).toEqual({ bio: "bio-S2", profile: { imageRef: null, imagePosition: null } });
  });
});

describe("helpers", () => {
  it("patchItemById returns the same list when the id is absent", () => {
    const list = [item("x")];
    expect(patchItemById(list, "nope", { title: "z" })).toBe(list);
  });
  it("moveItemById is a no-op out of range or for an unknown id", () => {
    const list = [item("x"), item("y")];
    expect(moveItemById(list, "x", -1)).toBe(list);
    expect(moveItemById(list, "y", 1)).toBe(list);
    expect(moveItemById(list, "zzz", 1)).toBe(list);
  });
});
