"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  PREVIEW_COOKIE_MAX_AGE_SECONDS,
  PREVIEW_COOKIE_NAME,
} from "@/lib/preview-gate/config";
import { sha256Hex, timingSafeEqual } from "@/lib/preview-gate/hash";
import { safeInternalRedirectPath } from "@/lib/safe-redirect";

export type PreviewAccessState = { error: string | null };

export async function verifyPreviewAccess(
  _prevState: PreviewAccessState,
  formData: FormData
): Promise<PreviewAccessState> {
  const password = String(formData.get("password") ?? "");
  // Same class of risk as auth/confirm's `next` - a query param round-
  // tripped through a form field - validated the same way rather than
  // the previous startsWith("/") check alone, which let "//evil.example"
  // (protocol-relative) through.
  const next = safeInternalRedirectPath(formData.get("next") as string | null, "/");
  const realPassword = process.env.INNERDWES_PREVIEW_PASSWORD ?? "";

  if (!realPassword || !timingSafeEqual(password, realPassword)) {
    return { error: "That password isn't right." };
  }

  const cookieStore = await cookies();
  cookieStore.set(PREVIEW_COOKIE_NAME, await sha256Hex(realPassword), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PREVIEW_COOKIE_MAX_AGE_SECONDS,
  });

  redirect(next);
}
