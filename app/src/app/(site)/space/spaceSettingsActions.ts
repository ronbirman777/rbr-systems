"use server";

import { createClient } from "@/lib/supabase/server";
import {
  SPACE_SETTINGS_KEY,
  parseSpaceSettings,
  spaceSettingsSchema,
  type SpaceSettings,
} from "@/lib/spaceSettings";

/**
 * Read/write for the product-neutral Space Settings row. One action for
 * every product: Flow, Teach and later Heal all call these rather than
 * growing their own country/locale plumbing.
 *
 * Authorization is the same shape every Studio write already uses - the
 * RLS-scoped client, so `module_settings`' membership policies decide
 * whether this tenant is the caller's. A tenant id that is not theirs
 * selects and writes nothing. Client-side validation is never the guard:
 * the payload is re-parsed with zod here, at the write boundary.
 */

export type SpaceSettingsActionState = { error: string | null };

const OK: SpaceSettingsActionState = { error: null };

export async function loadSpaceSettings(tenantId: string): Promise<SpaceSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("module_settings")
    .select("data")
    .eq("tenant_id", tenantId)
    .eq("module_key", SPACE_SETTINGS_KEY)
    .maybeSingle();
  // A Space with no row yet is the normal case for every existing Space,
  // and parses to "nothing configured" rather than failing.
  return parseSpaceSettings(data?.data);
}

export async function saveSpaceSettings(tenantId: string, patch: unknown): Promise<SpaceSettingsActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in to save." };

  // Merge onto what is stored so a product saving only `country` cannot
  // clear a `locale` it does not know about yet (and vice versa in CP3).
  const current = await loadSpaceSettings(tenantId);
  const parsed = spaceSettingsSchema.safeParse({ ...current, ...(patch as Record<string, unknown>) });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Those settings weren't valid." };

  const { error } = await supabase.from("module_settings").upsert(
    {
      tenant_id: tenantId,
      module_key: SPACE_SETTINGS_KEY,
      data: parsed.data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,module_key" }
  );
  if (error) return { error: error.message };
  return OK;
}
