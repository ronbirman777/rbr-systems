import { NextResponse } from "next/server";
import { legalHref, type LegalDocumentId } from "./documents";

/**
 * Route handler factory for the short legal aliases (/terms, /privacy): a
 * permanent 308 to the canonical /legal/<slug> page on the same origin. The
 * query string is dropped on purpose - nothing reads it.
 */
export function legalAliasHandler(id: LegalDocumentId) {
  return function GET(request: Request) {
    return NextResponse.redirect(new URL(legalHref(id), request.url), 308);
  };
}
