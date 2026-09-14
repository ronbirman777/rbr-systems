"use server";

import { createClient } from "@/lib/supabase/server";

export type GuestAccessSettings = {
  mode: "public" | "code";
  hasCode: boolean;
  updatedAt: string | null;
};

const DEFAULT_SETTINGS: GuestAccessSettings = { mode: "public", hasCode: false, updatedAt: null };

/** Same "function doesn't exist yet" tolerance as lib/guestAccess/mode.ts -
 * this migration (0016) is not yet applied to Production, and the whole
 * Studio panel must render a sane default rather than crash the
 * Preview & Publish / Share Your Space area for every organizer until
 * it lands. */
function isFunctionMissingError(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST202" || error.code === "42883" || !!error.message?.includes("Could not find the function");
}

export async function getGuestAccessSettingsForOwner(tenantId: string): Promise<GuestAccessSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("get_guest_access_settings", { p_tenant_id: tenantId })
    .maybeSingle<{ mode: string; has_code: boolean; updated_at: string | null }>();
  if (error) {
    if (isFunctionMissingError(error)) return DEFAULT_SETTINGS;
    return DEFAULT_SETTINGS;
  }
  if (!data) return DEFAULT_SETTINGS;
  return {
    mode: data.mode === "code" ? "code" : "public",
    hasCode: !!data.has_code,
    updatedAt: data.updated_at ?? null,
  };
}

export type SetGuestAccessCodeState = { error: string | null; settings: GuestAccessSettings };

export async function setGuestAccessCode(
  _prevState: SetGuestAccessCodeState,
  formData: FormData
): Promise<SetGuestAccessCodeState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in.", settings: DEFAULT_SETTINGS };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: "Missing space.", settings: DEFAULT_SETTINGS };

  const code = String(formData.get("code") ?? "");
  if (!/^[0-9]{6}$/.test(code)) {
    return { error: "The code must be exactly 6 digits.", settings: await getGuestAccessSettingsForOwner(tenantId) };
  }

  const { error } = await supabase.rpc("set_guest_access_code", { p_tenant_id: tenantId, p_code: code });
  if (error) {
    if (isFunctionMissingError(error)) {
      return {
        error: "Guest Access isn't available in this environment yet.",
        settings: DEFAULT_SETTINGS,
      };
    }
    return { error: error.message, settings: await getGuestAccessSettingsForOwner(tenantId) };
  }

  return { error: null, settings: await getGuestAccessSettingsForOwner(tenantId) };
}

export type DisableGuestAccessCodeState = { error: string | null; settings: GuestAccessSettings };

export async function disableGuestAccessCode(
  _prevState: DisableGuestAccessCodeState,
  formData: FormData
): Promise<DisableGuestAccessCodeState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in.", settings: DEFAULT_SETTINGS };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: "Missing space.", settings: DEFAULT_SETTINGS };

  const { error } = await supabase.rpc("disable_guest_access_code", { p_tenant_id: tenantId });
  if (error) {
    if (isFunctionMissingError(error)) {
      return { error: "Guest Access isn't available in this environment yet.", settings: DEFAULT_SETTINGS };
    }
    return { error: error.message, settings: await getGuestAccessSettingsForOwner(tenantId) };
  }

  return { error: null, settings: await getGuestAccessSettingsForOwner(tenantId) };
}
