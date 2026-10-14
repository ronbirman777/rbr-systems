import type { LegalDocumentId } from "../../documents";
import type { LegalDocumentBody } from "../types";
import { termsBodyV1_0 } from "./terms-1.0";
import { privacyBodyV1_0 } from "./privacy-1.0";
import { dpaBodyV1_0 } from "./dpa-1.0";
import { billingBodyV1_0 } from "./billing-1.0";

/**
 * Bodies of superseded versions, keyed by document id and then by `version`.
 * Every previous version listed in a document's registry history has exactly
 * one entry here (documents.test.ts enforces it).
 */
export const LEGAL_ARCHIVED_BODIES: Readonly<Partial<Record<LegalDocumentId, Readonly<Record<string, LegalDocumentBody>>>>> = {
  terms: { "1.0": termsBodyV1_0 },
  privacy: { "1.0": privacyBodyV1_0 },
  dpa: { "1.0": dpaBodyV1_0 },
  billing: { "1.0": billingBodyV1_0 },
};
