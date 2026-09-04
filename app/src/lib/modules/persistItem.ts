"use client";

import { startTransition } from "react";
import { createModuleItemStub, deleteModuleItem } from "@/app/configurator/retreat/actions";

const STUB_INITIAL = { error: null };

/**
 * Tracks each item's in-flight background writes (stub-create, and photo
 * upload - see ModuleItemPhotoField, which registers its own promise here
 * too) by id. Creating, uploading to, and removing an item are all
 * fire-and-forget from their callers' perspective (the UI never blocks on
 * them), but the network requests they issue have no inherent ordering
 * guarantee - a Remove clicked immediately after an Add or an upload
 * could have its delete reach the database BEFORE that earlier request's
 * write does. Since delete matches by id and a not-yet-existing row
 * simply matches zero rows (a silent no-op, no error), the earlier write
 * would then land afterward and resurrect the item - with a real
 * uploaded photo, in the upload case - as an orphan the organizer already
 * believed they'd removed. Both are real adversarial-sequence bugs found
 * during verification, not hypothetical.
 *
 * The fix is a genuine causal dependency, not a guessed delay: removal
 * waits for every currently-registered write for that id to actually
 * finish (however long that takes) before firing its delete, so writes
 * are always applied before the delete that's meant to undo them,
 * regardless of network timing. If nothing is pending, this resolves
 * immediately and adds no latency.
 */
const pendingWrites = new Map<string, Promise<unknown>>();

export function registerPendingWrite(itemId: string, promise: Promise<unknown>) {
  const tracked = promise.finally(() => {
    if (pendingWrites.get(itemId) === tracked) pendingWrites.delete(itemId);
  });
  pendingWrites.set(itemId, tracked);
  return tracked;
}

export function persistNewItemStub(tenantId: string, moduleKey: string, itemId: string, sortOrder: number) {
  const formData = new FormData();
  formData.set("tenantId", tenantId);
  formData.set("moduleKey", moduleKey);
  formData.set("itemId", itemId);
  formData.set("sortOrder", String(sortOrder));

  registerPendingWrite(itemId, createModuleItemStub(STUB_INITIAL, formData).catch(() => {}));
}

export function persistItemRemoval(tenantId: string, itemId: string) {
  const pending = pendingWrites.get(itemId);

  const formData = new FormData();
  formData.set("tenantId", tenantId);
  formData.set("itemId", itemId);

  startTransition(async () => {
    if (pending) await pending;
    await deleteModuleItem(STUB_INITIAL, formData).catch(() => {});
  });
}
