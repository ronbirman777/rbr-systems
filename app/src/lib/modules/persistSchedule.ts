"use client";

import { createScheduleItemStub, deleteScheduleItem } from "@/app/configurator/retreat/actions";
import { enqueueItemOp } from "@/lib/modules/persistItem";

const STUB_INITIAL = { error: null };

/**
 * Schedule's counterpart to persistItem.ts's persistNewItemStub/
 * persistItemRemoval - same shared per-item queue (item ids are globally
 * unique regardless of which table they belong to, so one queue is
 * correct, not just convenient), pointed at schedule_items' own
 * stub-create/delete actions instead of module_items'.
 */
export function persistNewScheduleItemStub(tenantId: string, itemId: string, date: string, startTime: string) {
  const formData = new FormData();
  formData.set("tenantId", tenantId);
  formData.set("itemId", itemId);
  formData.set("date", date);
  formData.set("startTime", startTime);

  enqueueItemOp(itemId, () => createScheduleItemStub(STUB_INITIAL, formData).catch(() => ({ error: null })));
}

export function persistScheduleItemRemoval(tenantId: string, itemId: string) {
  const formData = new FormData();
  formData.set("tenantId", tenantId);
  formData.set("itemId", itemId);

  enqueueItemOp(itemId, () => deleteScheduleItem(STUB_INITIAL, formData).catch(() => ({ error: null })));
}
