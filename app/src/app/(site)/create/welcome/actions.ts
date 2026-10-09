"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSpaceType, studioHref } from "@/lib/spaceTypes/registry";
import { createClient } from "@/lib/supabase/server";

const nameSchema = z.string().trim().min(1).max(80);

/**
 * Post-payment onboarding: give the new Space its name, then open Studio. Runs as the signed-in owner
 * (RLS decides whether they may write); nothing here is billing-privileged. A blank/invalid name simply skips
 * naming - the buyer is never blocked from reaching their Studio.
 */
export async function nameSpaceAction(tenantId: string, formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/log-in");
  if (!z.string().uuid().safeParse(tenantId).success) redirect("/space");

  const { data: tenant } = await supabase.from("tenants").select("product_type").eq("id", tenantId).maybeSingle();
  if (!tenant) redirect("/space");

  const parsed = nameSchema.safeParse(formData.get("name"));
  if (parsed.success && formData.get("skip") == null) {
    await supabase.from("tenants").update({ name: parsed.data }).eq("id", tenantId);
    await supabase.from("brand_configs").update({ name: parsed.data }).eq("tenant_id", tenantId);
  }
  redirect(studioHref(getSpaceType(tenant.product_type) ? tenant.product_type : null, tenantId) ?? "/space");
}
