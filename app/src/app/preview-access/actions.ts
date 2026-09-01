"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  PREVIEW_COOKIE_MAX_AGE_SECONDS,
  PREVIEW_COOKIE_NAME,
} from "@/lib/preview-gate/config";
import { sha256Hex, timingSafeEqual } from "@/lib/preview-gate/hash";

export type PreviewAccessState = { error: string | null };

export async function verifyPreviewAccess(
  _prevState: PreviewAccessState,
  formData: FormData
): Promise<PreviewAccessState> {
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");
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

  redirect(next.startsWith("/") ? next : "/");
}
