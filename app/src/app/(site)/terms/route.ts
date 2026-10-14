import { legalAliasHandler } from "@/lib/legal/aliasRedirect";

/** Permanent alias: /terms -> /legal/terms (see lib/legal/documents.ts LEGAL_ALIASES). */
export const GET = legalAliasHandler("terms");
