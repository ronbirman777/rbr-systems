"use server";

import { createClient } from "@/lib/supabase/server";
import { brandConfigSchema } from "@/lib/theme/tokens";

export type SaveDraftState = {
  error: string | null;
  tenantId: string | null;
};

/**
 * Creates the tenant on first save (empty tenantId field) and upserts its
 * brand config on every save. This is real persistence, scoped by RLS to
 * the signed-in user - not a local-storage stand-in.
 */
export async function saveDraft(
  prevState: SaveDraftState,
  formData: FormData
): Promise<SaveDraftState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in to save.", tenantId: null };

  let tenantId = String(formData.get("tenantId") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!tenantId) {
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .insert({ name: name || "Untitled Retreat", product_type: "retreat" })
      .select("id")
      .single();
    if (tenantError || !tenant) {
      return { error: tenantError?.message ?? "Could not create your space.", tenantId: null };
    }
    tenantId = tenant.id;
  } else {
    await supabase.from("tenants").update({ name: name || "Untitled Retreat" }).eq("id", tenantId);
  }

  const parsed = brandConfigSchema.safeParse({
    name,
    logoUrl: null,
    palette: String(formData.get("palette") ?? "forest-sage"),
    customPrimary: null,
    atmosphere: String(formData.get("atmosphere") ?? "calm-organic"),
    imageStyle: "rounded",
  });
  if (!parsed.success) {
    return { error: "Some brand details weren't valid.", tenantId };
  }

  const { error: brandError } = await supabase.from("brand_configs").upsert({
    tenant_id: tenantId,
    name: parsed.data.name,
    palette: parsed.data.palette,
    atmosphere: parsed.data.atmosphere,
    image_style: parsed.data.imageStyle,
    updated_at: new Date().toISOString(),
  });
  if (brandError) return { error: brandError.message, tenantId };

  return { error: null, tenantId };
}
