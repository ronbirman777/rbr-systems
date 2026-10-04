import { redirect } from "next/navigation";
import { loadStudioTenant } from "@/lib/configurator/studioTenant";
import { MEDIA_BUCKET } from "@/lib/media/path";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import { deriveCommercialAvailability } from "@/lib/entitlements/availability";
import { getSpaceEntitlement } from "@/lib/entitlements/getSpaceEntitlement";
import { getCustomPagesLimit } from "@/lib/entitlements/customPagesLimit";
import {
  TEACH_EDITABLE_ITEM_KEYS,
  TEACH_PRODUCT_TYPE,
  TEACH_SETTINGS_KEYS,
  collectTeachMediaRefs,
  parseTeachItems,
  parseTeachSetting,
  type TeachEditableItemKey,
  type TeachItem,
  type TeachSettings,
} from "@/lib/teach/schemas";
import { enabledExploreFrom } from "@/lib/teach/guestData";
import { LEGACY_TEACH_FALLBACK } from "@/lib/teach/style";
import { TeachStudio, type TeachStudioInitial } from "../teach-studio";

export const dynamic = "force-dynamic";

/**
 * Teach Studio entry. RLS scopes every read to the signed-in member's own
 * tenant; a Time to Flow tenant opened here is sent to its own Studio, so a
 * retreat can never be edited through the Teach model (and vice versa - see
 * the matching guard in configurator/retreat/[tenantId]/page.tsx).
 */
export default async function TeachStudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const { tenantId } = await params;
  const { section } = await searchParams;
  const { supabase, tenant } = await loadStudioTenant(tenantId, TEACH_PRODUCT_TYPE);
  if (tenant.status === "archived") redirect("/space");

  const [{ data: brand }, { data: settingsRows }, { data: itemRows }, { data: configRows }, { data: published }, entitlement] =
    await Promise.all([
      supabase
        .from("brand_configs")
        .select("custom_primary, custom_secondary, custom_navigation, custom_text, hero_image_ref")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      supabase.from("module_settings").select("module_key, data").eq("tenant_id", tenantId).in("module_key", [...TEACH_SETTINGS_KEYS]),
      supabase
        .from("module_items")
        .select("id, module_key, title, subtitle, description, image_ref, external_link, metadata, sort_order, created_at")
        .eq("tenant_id", tenantId)
        .in("module_key", [...TEACH_EDITABLE_ITEM_KEYS])
        .order("sort_order")
        .order("created_at"),
      supabase.from("module_configs").select("module_key, enabled").eq("tenant_id", tenantId),
      supabase.from("published_spaces").select("published_at").eq("tenant_id", tenantId).maybeSingle(),
      getSpaceEntitlement(supabase, tenantId),
    ]);

  const settingsByKey = new Map((settingsRows ?? []).map((r) => [r.module_key as string, r.data]));
  const settings = Object.fromEntries(
    TEACH_SETTINGS_KEYS.map((k) => [k, parseTeachSetting(k, settingsByKey.get(k))])
  ) as TeachSettings;

  const rowsByKey = new Map<string, unknown[]>();
  for (const row of itemRows ?? []) {
    const list = rowsByKey.get(row.module_key) ?? [];
    list.push(row);
    rowsByKey.set(row.module_key, list);
  }
  const items = Object.fromEntries(
    TEACH_EDITABLE_ITEM_KEYS.map((k) => [k, parseTeachItems(k, rowsByKey.get(k) ?? [])])
  ) as { [K in TeachEditableItemKey]: TeachItem<K>[] };

  // One batch of short-lived signed URLs for every draft media object the
  // Studio shows - resolved through this member's own RLS-scoped session.
  const refs = [...new Set([brand?.hero_image_ref ?? null, ...collectTeachMediaRefs({ settings, items })].filter(Boolean) as string[])];
  const mediaUrls: Record<string, string> = {};
  if (refs.length > 0) {
    const { data: signed } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(refs, 3600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) mediaUrls[s.path] = s.signedUrl;
  }

  const availability = deriveCommercialAvailability(entitlement);

  const initial: TeachStudioInitial = {
    tenantId: tenant.id,
    name: tenant.name,
    slug: tenant.slug ?? null,
    timezone: tenant.timezone ?? DEFAULT_TIMEZONE,
    colors: {
      primary: brand?.custom_primary ?? LEGACY_TEACH_FALLBACK.primary,
      accent: brand?.custom_secondary ?? LEGACY_TEACH_FALLBACK.accent,
      navigation: brand?.custom_navigation ?? null,
      text: brand?.custom_text ?? null,
    },
    heroImageRef: brand?.hero_image_ref ?? null,
    settings,
    items,
    enabledExplore: enabledExploreFrom((configRows ?? []).filter((r) => r.enabled).map((r) => r.module_key)),
    publishedAt: published?.published_at ?? null,
    canPublish: availability.canPublish,
    accessLabel: availability.effectiveStatus,
    customPagesLimit: getCustomPagesLimit(entitlement),
    mediaUrls,
    initialSection: section ?? null,
  };

  return <TeachStudio initial={initial} />;
}
