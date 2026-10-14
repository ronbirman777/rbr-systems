import { legalAliasHandler } from "@/lib/legal/aliasRedirect";

/** Permanent alias: /privacy -> /legal/privacy (see lib/legal/documents.ts LEGAL_ALIASES). */
export const GET = legalAliasHandler("privacy");
