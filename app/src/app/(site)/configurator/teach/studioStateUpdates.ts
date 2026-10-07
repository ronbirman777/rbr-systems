/**
 * Pure state-merge helpers for the Teach Studio. Async handlers (uploads,
 * audio attach/detach) complete after the render they were created in, so
 * they must never write a whole list/object built from render-time values.
 * These helpers apply a field-scoped change to the LATEST state.
 */

export type Patch<T> = Partial<T> | ((current: T) => Partial<T>);

export function resolvePatch<T>(patch: Patch<T>, current: T): Partial<T> {
  return typeof patch === "function" ? patch(current) : patch;
}

/** Merge a patch into the item with `id`; every other item is untouched. A vanished item (deleted meanwhile) is a no-op. */
export function patchItemById<T extends { id: string }>(list: T[], id: string, patch: Patch<T>): T[] {
  let hit = false;
  const next = list.map((it) => {
    if (it.id !== id) return it;
    hit = true;
    return { ...it, ...resolvePatch(patch, it) };
  });
  return hit ? next : list;
}

export type ListUpdate<T> = T[] | ((prev: T[]) => T[]);

export function resolveListUpdate<T>(update: ListUpdate<T>, prev: T[]): T[] {
  return typeof update === "function" ? update(prev) : update;
}

/** Reorder against the latest list; no-op when the id is gone or the move is out of range. */
export function moveItemById<T extends { id: string }>(list: T[], id: string, dir: -1 | 1): T[] {
  const i = list.findIndex((it) => it.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

const BLANK_EXPLORE_CARD = { title: null, subtitle: null, imageRef: null, imagePosition: null, fallbackColor: null };

/** Merge `patch` into one Explore card of the latest `cards` map; the other cards (and the card's other fields) are untouched. */
export function patchExploreCard<C extends { [k: string]: object | undefined }, K extends keyof C & string>(
  cards: C,
  key: K,
  patch: Partial<NonNullable<C[K]>>
): C {
  return { ...cards, [key]: { ...BLANK_EXPLORE_CARD, ...cards[key], ...patch } };
}

/** Merge `patch` into one named sub-object (e.g. teachAbout.profile) of the latest settings slice. */
export function patchSlot<S extends object, K extends keyof S>(slice: S, key: K, patch: Partial<S[K]>): Pick<S, K> {
  return { [key]: { ...slice[key], ...patch } } as Pick<S, K>;
}

type WithMeta = { metadata: object };

/** Upload completed: only the image ref and its focal point change; the rest of the item is whatever is current. */
export const imageUploaded =
  <T extends WithMeta>(ref: string) =>
  (cur: T): Partial<T> =>
    ({ imageRef: ref, metadata: { ...cur.metadata, imagePosition: null } }) as unknown as Partial<T>;

export const imageRemoved =
  <T extends WithMeta>() =>
  (cur: T): Partial<T> =>
    ({ imageRef: null, imageUrl: null, metadata: { ...cur.metadata, imagePosition: null } }) as unknown as Partial<T>;

export const audioAttached =
  <T extends WithMeta>(path: string, durationSeconds: number | null) =>
  (cur: T): Partial<T> =>
    ({ metadata: { ...cur.metadata, audioRef: path, durationSeconds } }) as unknown as Partial<T>;

export const audioDetached =
  <T extends WithMeta>() =>
  (cur: T): Partial<T> =>
    ({ metadata: { ...cur.metadata, audioRef: null, durationSeconds: null } }) as unknown as Partial<T>;
