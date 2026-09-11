"use server";

import { createClient } from "@/lib/supabase/server";

export type RedeemAccessCodeState = { error: string | null; success: boolean };

/**
 * Maps redeem_access_code()'s raised SQL error messages to copy a customer
 * can act on, without leaking implementation details (constraint names,
 * table names). The RPC is the single source of truth for validation - this
 * is presentation only.
 */
function friendlyRedemptionError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("already has valid access")) {
    return "This Space already has active access.";
  }
  if (lower.includes("do not have access") || lower.includes("not a member") || lower.includes("permission")) {
    return "You don't have access to manage this Space.";
  }
  if (lower.includes("duplicate key") || lower.includes("already redeemed") || lower.includes("unique")) {
    return "That code has already been used for this Space.";
  }
  if (lower.includes("not valid") || lower.includes("not found")) {
    return "That code isn't valid. Double-check it and try again.";
  }
  return "Something went wrong. Please try again.";
}

export async function redeemAccessCode(
  _prevState: RedeemAccessCodeState,
  formData: FormData
): Promise<RedeemAccessCodeState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in.", success: false };

  const tenantId = String(formData.get("tenantId") ?? "");
  const code = String(formData.get("code") ?? "");
  if (!tenantId || !code.trim()) return { error: "Missing space or code.", success: false };

  const { error } = await supabase.rpc("redeem_access_code", {
    p_tenant_id: tenantId,
    p_code: code,
  });
  if (error) return { error: friendlyRedemptionError(error.message), success: false };

  return { error: null, success: true };
}
