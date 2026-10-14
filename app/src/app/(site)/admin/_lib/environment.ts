import "server-only";

export type AdminEnvironment = "production" | "staging" | "preview" | "development" | "local";

/**
 * Which environment this console is reading (contracts §1.1: one dashboard never mixes environments, and the page
 * header names it). Derived from Vercel's own system variables (non-secret); anything unrecognised is "local".
 * Only the derived label leaves the server.
 */
export function adminEnvironment(): AdminEnvironment {
  const v = (process.env.VERCEL_TARGET_ENV || process.env.VERCEL_ENV || "").toLowerCase();
  if (v === "production" || v === "staging" || v === "preview" || v === "development") return v;
  return "local";
}
