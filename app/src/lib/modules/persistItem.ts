"use client";

import { createModuleItemStub, deleteModuleItem } from "@/app/configurator/retreat/actions";

const STUB_INITIAL = { error: null };

/**
 * Every mutation that touches a module_items/schedule_items row - stub
 * create, photo upload, Save, Remove - was previously an independent
 * fire-and-forget call, with only ad-hoc pairwise "await the other one's
 * promise" checks holding them in order. That's a form of implicit,
 * timing-dependent concurrency: it depends on each caller correctly
 * knowing what might be in flight, and on React's own scheduling (which
 * turned out to have several real seconds of slack around
 * useActionState + startTransition dispatches - confirmed in both dev and
 * a production build) not accidentally delaying one operation past
 * another. That's exactly the "unnecessary concurrency" this replaces.
 *
 * The fix: one FIFO queue per item id, entirely outside React's
 * scheduling. Every operation for a given id - regardless of which
 * function requests it, regardless of whether it's a single-item op
 * (create, upload, remove) or a bulk op that happens to include this id
 * (Save) - is appended to that id's queue and does not start until
 * everything already queued for that id has fully settled. This is the
 * only ordering mechanism in this module: no timeout decides correctness,
 * only queue position does (a bounded timeout would still leave a window
 * where two operations could reorder under load; a queue has no such
 * window by construction - each link only starts once the previous one
 * is truly done).
 *
 * This makes the required invariant hold structurally: a Remove enqueued
 * for an item always runs after whatever was already queued for that
 * item (a stub create, an upload, a Save that included it) - and because
 * Remove's own delete becomes the new tail, anything queued for that id
 * afterward (there shouldn't be any, once it's gone from the UI) would
 * still run after the delete, never before it.
 */
const itemQueues = new Map<string, Promise<unknown>>();

function tail(itemId: string): Promise<unknown> {
  return itemQueues.get(itemId) ?? Promise.resolve();
}

/** Queues `op` behind every already-queued operation for `itemId`. */
export function enqueueItemOp<T>(itemId: string, op: () => Promise<T>): Promise<T> {
  return enqueueItemsOp([itemId], op);
}

/**
 * Same guarantee as enqueueItemOp, for one operation (Save) that touches
 * several items' rows in a single request. Waits for the current tail of
 * every given id, runs `op` once, then becomes the new tail for all of
 * them at once - so Save is ordered relative to each item's own queue,
 * and a Remove for any one of those items, queued after Save was
 * dispatched, correctly waits for Save to finish first.
 */
export function enqueueItemsOp<T>(itemIds: string[], op: () => Promise<T>): Promise<T> {
  const previousSettled = Promise.all(itemIds.map((id) => tail(id).catch(() => {})));
  const result = previousSettled.then(op);
  const settled = result.catch(() => {});
  for (const id of itemIds) itemQueues.set(id, settled);
  return result;
}

export function persistNewItemStub(tenantId: string, moduleKey: string, itemId: string, sortOrder: number) {
  const formData = new FormData();
  formData.set("tenantId", tenantId);
  formData.set("moduleKey", moduleKey);
  formData.set("itemId", itemId);
  formData.set("sortOrder", String(sortOrder));

  enqueueItemOp(itemId, () => createModuleItemStub(STUB_INITIAL, formData).catch(() => ({ error: null })));
}

export function persistItemRemoval(tenantId: string, itemId: string) {
  const formData = new FormData();
  formData.set("tenantId", tenantId);
  formData.set("itemId", itemId);

  enqueueItemOp(itemId, () => deleteModuleItem(STUB_INITIAL, formData).catch(() => ({ error: null })));
}
