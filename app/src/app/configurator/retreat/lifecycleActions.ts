"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getSpaceType } from "@/lib/spaceTypes/registry";
import { revalidatePath } from "next/cache";
import { removeAllTenantMedia, TenantMediaCleanupError } from "@/lib/media/tenantCleanup";

import { localeFromFormData, studioMessages } from "@/lib/i18n";
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
  const t = studioMessages(localeFromFormData(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notLoggedIn") };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: t("missingSpace") };

  const { error } = await supabase.rpc("archive_space", { p_tenant_id: tenantId });
  if (error) return { error: t("archiveFailed") };

  revalidatePath("/space");
  return { error: null, success: true };
}

export async function restoreSpace(
  _prevState: LifecycleActionState,
  formData: FormData
): Promise<LifecycleActionState> {
  const t = studioMessages(localeFromFormData(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notLoggedIn") };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: t("missingSpace") };

  const { error } = await supabase.rpc("restore_space", { p_tenant_id: tenantId });
  if (error) {
    if (isSlotLimitError(error)) {
      return {
        error: t("noSlotToRestoreInto"),
        slotLimitReached: true,
      };
    }
    return { error: t("restoreFailed") };
  }

  revalidatePath("/space");
  return { error: null, success: true };
}

export async function replaceSpace(
  _prevState: LifecycleActionState,
  formData: FormData
): Promise<LifecycleActionState> {
  const t = studioMessages(localeFromFormData(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notLoggedIn") };

  const tenantId = String(formData.get("tenantId") ?? "");
  const newName = String(formData.get("newName") ?? "").trim();
  const confirmName = String(formData.get("confirmName") ?? "").trim();
  const expectedName = String(formData.get("expectedName") ?? "").trim();
  if (!tenantId) return { error: t("missingSpace") };

  // Strong confirmation for a destructive action (Task 011): the caller
  // must retype the EXISTING Space's exact current name before its
  // content is discarded - the same class of guard as a typed-name
  // delete confirmation, applied here because Replace is the closest
  // thing to a delete this task ships (see the lifecycle review's
  // Decision B rationale for why Archive alone cannot free a slot).
  if (!expectedName || confirmName !== expectedName) {
    return { error: t("confirmNameToReplace") };
  }

  // The replacement name comes from the Space's own type (DB product_type ->
  // Space Type Registry), so a Teach Space is never renamed "Untitled
  // Retreat". An unreadable tenant or an unknown type is refused BEFORE any
  // Storage or database change - Replace never guesses what it is wiping.
  // Storage cleanup below is product-agnostic (removeAllTenantMedia removes
  // every object under the tenant folder: images, audio, drafts, published
  // copies), so no product-specific media assumption is made here.
  const { data: tenant } = await supabase.from("tenants").select("product_type").eq("id", tenantId).maybeSingle();
  const spaceType = getSpaceType(tenant?.product_type);
  if (!spaceType) return { error: t("replaceFailed") };

  // TASK 024: Replace keeps the tenant identity (same id, slot, membership,
  // entitlement) and only resets its database content, so the old
  // content's Storage files would otherwise live on under this same live
  // tenant folder forever. Same order as Space deletion: Storage first,
  // the database reset only once that fully succeeded - a failure here
  // leaves the Space's rows untouched and Replace simply retryable. If the
  // reset itself then fails, the Space is still the old one (its media is
  // already gone) and re-running Replace completes it; that window is the
  // one documented cost of choosing "never reset first".
  const media = await removeSpaceMediaAsOwner(supabase, user.id, tenantId);
  if (!media.ok) return { error: t("replaceFailed") };

  const { error } = await supabase.rpc("replace_space", {
    p_tenant_id: tenantId,
    p_new_name: newName || spaceType.copy.untitledName,
  });
  if (error) return { error: t("replaceFailed") };

  revalidatePath("/space");
  return { error: null, success: true };
}

/**
 * Task 017 / TASK 024: the shared, ownership-verified Storage-cleanup
 * step used by BOTH Space deletion (deleteSpaceCompletely) and Replace
 * (replaceSpace) - one primitive, not two divergent cleanup systems.
 *
 * Ownership is re-verified here even though delete_space()/replace_space()
 * already enforce is_tenant_owner() at the database layer - the Storage
 * removal step has no equivalent check of its own (the "tenant members
 * can delete their own media" policy, 0006, only requires tenant
 * MEMBERSHIP, not ownership), so without this a non-owner member could
 * otherwise destroy a Space's media without being authorized to delete or
 * replace the Space itself.
 *
 * Callers MUST run their database step only after this returns ok: if
 * Storage cleanup fails partway, nothing has been changed in the database
 * yet, so the Space is intact and the whole action is simply retryable -
 * re-running only needs to remove whatever files are still there. The
 * reverse order would be far worse: a database reset/delete followed by a
 * failed Storage cleanup would leave orphaned files with nothing left to
 * authorize (or safely retry, without also wiping the new content's
 * uploads) their removal.
 */
async function removeSpaceMediaAsOwner(
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
  if (memberRows?.[0]?.role !== "owner") return { ok: false, reason: "not authorized to change this Space" };

  try {
    await removeAllTenantMedia(supabase, tenantId);
  } catch (e) {
    return { ok: false, reason: e instanceof TenantMediaCleanupError ? e.message : "could not remove Space media" };
  }
  return { ok: true };
}

/**
 * Task 017 (Space Storage Cleanup) — the complete, safe Space-deletion
 * routine: Storage cleanup FIRST (removeSpaceMediaAsOwner), database rows
 * (via the existing delete_space() RPC, unchanged) only once that has
 * fully succeeded. Exported so Account Deletion ((auth)/actions.ts
 * deleteAccount) can run the exact same routine once per owned Space,
 * rather than a second, divergent implementation of "what does deleting a
 * Space actually require."
 */
export async function deleteSpaceCompletely(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const media = await removeSpaceMediaAsOwner(supabase, userId, tenantId);
  if (!media.ok) return media;

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
  const t = studioMessages(localeFromFormData(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notLoggedIn") };

  const tenantId = String(formData.get("tenantId") ?? "");
  const confirmName = String(formData.get("confirmName") ?? "").trim();
  const expectedName = String(formData.get("expectedName") ?? "").trim();
  if (!tenantId) return { error: t("missingSpace") };

  if (!expectedName || confirmName !== expectedName) {
    return { error: t("confirmNameToDelete") };
  }

  const result = await deleteSpaceCompletely(supabase, user.id, tenantId);
  if (!result.ok) return { error: t("deleteFailed") };

  revalidatePath("/space");
  return { error: null, success: true };
}
