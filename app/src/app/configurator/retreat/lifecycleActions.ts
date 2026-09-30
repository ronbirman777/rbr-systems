"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { removeAllTenantMedia, TenantMediaCleanupError } from "@/lib/media/tenantCleanup";

/** Same "hint" contract as saveDraft's isSlotLimitError (actions.ts) -
 * enforce_space_slot_capacity()/restore_space() in
 * 0017_space_management_slots.sql both RAISE ... USING HINT =
 * 'SLOT_LIMIT_REACHED' for the one error class the UI must render
 * distinctly from every other failure. */
function isSlotLimitError(error: { hint?: string | null } | null | undefined): boolean {
  return error?.hint === "SLOT_LIMIT_REACHED";
}

export type LifecycleActionState = {
  error: string | null;
  slotLimitReached?: boolean;
  success?: boolean;
};

/** Space Slots (Task 011). `slots_used`/`slots_available` are always
 * derived here, never read from a persisted column - there isn't one.
 * A missing/unreadable allowance row fails closed (0 allowed, 0
 * available) rather than being treated as unlimited; the row should
 * always exist: 0017 backfilled existing users and 0026 provisions it at
 * account creation (plus a one-time legacy repair), so "missing" here is
 * itself an anomaly worth surfacing conservatively, not silently
 * granting access. A zero-capacity row is NOT missing and stays 0. */
export type SpaceSlotSummary = {
  slotsAllowed: number;
  slotsUsed: number;
  slotsAvailable: number;
};

/**
 * Task 011 (item B, unnecessary-repeated-auth-read fix): `knownUserId` is
 * an optional caller-supplied shortcut for a Server Component that has
 * already called `auth.getUser()` itself this request (e.g. My Spaces,
 * /create) - Supabase's `auth.getUser()` re-validates the session against
 * the Auth server over the network every time it's called, so calling it
 * a second time for the same request is a real, avoidable round trip, not
 * a free/local operation. When omitted, this function still resolves the
 * user itself exactly as before - existing callers that don't have it
 * handy yet keep working unchanged.
 */
export async function getSpaceSlotSummary(knownUserId?: string): Promise<SpaceSlotSummary> {
  const supabase = await createClient();
  let userId = knownUserId;
  if (!userId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id;
  }
  if (!userId) return { slotsAllowed: 0, slotsUsed: 0, slotsAvailable: 0 };

  const [{ data: slotRow }, { count }] = await Promise.all([
    supabase.from("user_space_slots").select("slots_allowed").eq("user_id", userId).maybeSingle(),
    supabase.from("tenant_members").select("tenant_id", { count: "exact", head: true }).eq("user_id", userId).eq("role", "owner"),
  ]);

  const slotsAllowed = slotRow?.slots_allowed ?? 0;
  const slotsUsed = count ?? 0;
  return { slotsAllowed, slotsUsed, slotsAvailable: Math.max(0, slotsAllowed - slotsUsed) };
}

export async function archiveSpace(
  _prevState: LifecycleActionState,
  formData: FormData
): Promise<LifecycleActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in." };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: "Missing space." };

  const { error } = await supabase.rpc("archive_space", { p_tenant_id: tenantId });
  if (error) return { error: "Couldn't archive this Space. Please try again." };

  revalidatePath("/space");
  return { error: null, success: true };
}

export async function restoreSpace(
  _prevState: LifecycleActionState,
  formData: FormData
): Promise<LifecycleActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in." };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: "Missing space." };

  const { error } = await supabase.rpc("restore_space", { p_tenant_id: tenantId });
  if (error) {
    if (isSlotLimitError(error)) {
      return {
        error: "You don't have an available Space slot to restore this into right now.",
        slotLimitReached: true,
      };
    }
    return { error: "Couldn't restore this Space. Please try again." };
  }

  revalidatePath("/space");
  return { error: null, success: true };
}

export async function replaceSpace(
  _prevState: LifecycleActionState,
  formData: FormData
): Promise<LifecycleActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in." };

  const tenantId = String(formData.get("tenantId") ?? "");
  const newName = String(formData.get("newName") ?? "").trim();
  const confirmName = String(formData.get("confirmName") ?? "").trim();
  const expectedName = String(formData.get("expectedName") ?? "").trim();
  if (!tenantId) return { error: "Missing space." };

  // Strong confirmation for a destructive action (Task 011): the caller
  // must retype the EXISTING Space's exact current name before its
  // content is discarded - the same class of guard as a typed-name
  // delete confirmation, applied here because Replace is the closest
  // thing to a delete this task ships (see the lifecycle review's
  // Decision B rationale for why Archive alone cannot free a slot).
  if (!expectedName || confirmName !== expectedName) {
    return { error: "Type the Space's current name exactly to confirm replacing it." };
  }

  const { error } = await supabase.rpc("replace_space", {
    p_tenant_id: tenantId,
    p_new_name: newName || "Untitled Retreat",
  });
  if (error) return { error: "Couldn't replace this Space. Please try again." };

  revalidatePath("/space");
  return { error: null, success: true };
}

/**
 * Task 017 (Space Storage Cleanup) — the complete, safe Space-deletion
 * routine: Storage cleanup FIRST, database rows (via the existing
 * delete_space() RPC, unchanged) only once that has fully succeeded.
 * Exported so Account Deletion ((auth)/actions.ts deleteAccount) can run
 * the exact same routine once per owned Space, rather than a second,
 * divergent implementation of "what does deleting a Space actually
 * require."
 *
 * Ordering is deliberate and is what makes a partial failure safe: if
 * Storage cleanup fails partway, nothing has been deleted from the
 * database yet, so the Space (and whatever files remain) is completely
 * intact and this is simply retryable - re-running it only needs to
 * remove whatever files are still there, then still reaches
 * delete_space(). The reverse order would be far worse: if the database
 * row were deleted first and Storage cleanup then failed, the files
 * would be orphaned with no owning tenant left to authorize (or even
 * retry) their cleanup - exactly the TASK 016 audit finding this task
 * fixes, not a state this routine may ever reintroduce.
 *
 * Ownership is re-verified here even though delete_space() itself already
 * enforces is_tenant_owner() at the database layer - the Storage removal
 * step has no equivalent check of its own (the "tenant members can
 * delete their own media" policy, 0006, only requires tenant MEMBERSHIP,
 * not ownership), so without this a non-owner member could otherwise
 * invoke this function directly and destroy a Space's media without
 * being authorized to delete the Space itself.
 */
export async function deleteSpaceCompletely(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { data: memberRows, error: membershipError } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId);
  if (membershipError) return { ok: false, reason: "could not verify Space ownership" };
  if (memberRows?.[0]?.role !== "owner") return { ok: false, reason: "not authorized to delete this Space" };

  try {
    await removeAllTenantMedia(supabase, tenantId);
  } catch (e) {
    return { ok: false, reason: e instanceof TenantMediaCleanupError ? e.message : "could not remove Space media" };
  }

  const { error: dbError } = await supabase.rpc("delete_space", { p_tenant_id: tenantId });
  if (dbError) return { ok: false, reason: "could not remove Space data" };

  return { ok: true };
}

/**
 * Task 014: permanent delete, the one lifecycle action that genuinely
 * removes the tenant row (0018_space_delete.sql) rather than changing
 * status/content in place. Same strong typed-name confirmation as
 * replaceSpace, applied here because this is strictly MORE destructive
 * than Replace (Replace keeps the tenant identity and its slot; Delete
 * removes both permanently) - it should never require less confirmation
 * than the less-destructive action already does.
 *
 * Task 017: now delegates to deleteSpaceCompletely so this UI action also
 * removes the Space's Storage media, not only its database rows -
 * unchanged form fields, unchanged confirmation UX, unchanged error
 * message on failure.
 */
export async function deleteSpace(
  _prevState: LifecycleActionState,
  formData: FormData
): Promise<LifecycleActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in." };

  const tenantId = String(formData.get("tenantId") ?? "");
  const confirmName = String(formData.get("confirmName") ?? "").trim();
  const expectedName = String(formData.get("expectedName") ?? "").trim();
  if (!tenantId) return { error: "Missing space." };

  if (!expectedName || confirmName !== expectedName) {
    return { error: "Type the Space's current name exactly to confirm deleting it." };
  }

  const result = await deleteSpaceCompletely(supabase, user.id, tenantId);
  if (!result.ok) return { error: "Couldn't delete this Space. Please try again." };

  revalidatePath("/space");
  return { error: null, success: true };
}
