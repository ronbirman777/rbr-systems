/**
 * Temporary master-password gate for the whole InnerDweS platform during
 * development/review - entirely separate from Supabase/customer auth,
 * which continues to work normally once past this gate.
 *
 * Disabling this feature for public launch requires zero code changes:
 * just unset INNERDWES_PREVIEW_PASSWORD in the deployment environment.
 * proxy.ts checks this at request time and no-ops the whole gate when unset.
 */
export const PREVIEW_COOKIE_NAME = "idw_preview_access";
export const PREVIEW_GATE_PATH = "/preview-access";
export const PREVIEW_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export function isPreviewGateEnabled(): boolean {
  return !!process.env.INNERDWES_PREVIEW_PASSWORD;
}
