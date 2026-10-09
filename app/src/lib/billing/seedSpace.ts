import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_TEACH_PRESET } from "@/lib/teach/style";
import { TEACH_SETTINGS_SCHEMAS } from "@/lib/teach/schemas";

/**
 * Starting Studio defaults for a Space that has just been provisioned after
 * payment - exactly what the pre-billing create actions wrote for a new Space
 * (createTeachSpace for Teach; the Flow Studio's first brand save for Flow).
 * Every write is an idempotent upsert, so a retry or a second provisioning pass
 * can never duplicate or overwrite the owner's later edits: rows are only
 * written when absent (ignoreDuplicates), never updated.
 */
export async function seedNewSpaceDefaults(db: SupabaseClient, tenantId: string, spaceType: "teach" | "retreat", name: string): Promise<void> {
  if (spaceType === "teach") {
    const results = await Promise.all([
      db.from("brand_configs").upsert(
        {
          tenant_id: tenantId, name, custom_primary: DEFAULT_TEACH_PRESET.primary, custom_secondary: DEFAULT_TEACH_PRESET.accent,
          custom_navigation: DEFAULT_TEACH_PRESET.navigation, custom_text: DEFAULT_TEACH_PRESET.text, updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id", ignoreDuplicates: true }
      ),
      db.from("module_settings").upsert(
        {
          tenant_id: tenantId, module_key: "teachStyle",
          data: TEACH_SETTINGS_SCHEMAS.teachStyle.parse({ preset: DEFAULT_TEACH_PRESET.key, background: DEFAULT_TEACH_PRESET.surface }),
        },
        { onConflict: "tenant_id,module_key", ignoreDuplicates: true }
      ),
      db.from("module_configs").upsert(
        ["teachReadings", "teachAudio", "teachContact"].map((module_key) => ({ tenant_id: tenantId, module_key, enabled: true })),
        { onConflict: "tenant_id,module_key", ignoreDuplicates: true }
      ),
    ]);
    for (const r of results) if (r.error) throw new Error(`seed teach defaults: ${r.error.message}`);
    return;
  }
  const { error } = await db.from("brand_configs").upsert(
    { tenant_id: tenantId, name, palette: "forest-sage", atmosphere: "calm-organic", image_style: "rounded", updated_at: new Date().toISOString() },
    { onConflict: "tenant_id", ignoreDuplicates: true }
  );
  if (error) throw new Error(`seed flow defaults: ${error.message}`);
}
