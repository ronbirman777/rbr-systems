import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isTenantId } from "@/lib/media/path";

/**
 * Resolves the Flow Studio tenant for the current request, or ends the
 * request with notFound()/redirect(). Called from the route layout - which
 * renders OUTSIDE the segment's loading.tsx Suspense boundary, so the HTTP
 * status is still changeable - and again from the page, where React's
 * per-request cache() makes it free. Otherwise notFound() thrown inside the
 * boundary arrives after the 200 shell has already been flushed.
 */
export const loadStudioTenant = cache(async (tenantId: string) => {
  if (!isTenantId(tenantId)) notFound();
  const supabase = await createClient();
  // Independent reads, run together so the layout adds one round trip in
  // front of the first byte, not two. RLS scopes the tenant read to tenants
  // the signed-in user is a member of - a draft belonging to someone else
  // simply won't come back, regardless of the id - and a signed-out
  // visitor never reaches the result (redirected below).
  const [
    {
      data: { user },
    },
    { data: tenant },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("tenants")
      .select("id, name, timezone, slug, product_type")
      .eq("id", tenantId)
      .maybeSingle(),
  ]);
  if (!user) redirect("/log-in");
  if (!tenant || tenant.product_type !== "retreat") notFound();
  return { supabase, tenant };
});
