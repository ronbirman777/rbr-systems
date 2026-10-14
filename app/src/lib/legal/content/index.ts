import type { LegalDocumentId } from "../documents";
import type { LegalDocumentBody } from "./types";
import { termsBody } from "./terms";
import { privacyBody } from "./privacy";
import { dpaBody } from "./dpa";
import { acceptableUseBody } from "./acceptable-use";
import { copyrightBody } from "./copyright";
import { subprocessorsBody } from "./subprocessors";
import { billingBody } from "./billing";

/** The body of every public legal document, keyed by its registry id. */
export const LEGAL_BODIES: Readonly<Record<LegalDocumentId, LegalDocumentBody>> = {
  terms: termsBody,
  privacy: privacyBody,
  dpa: dpaBody,
  "acceptable-use": acceptableUseBody,
  copyright: copyrightBody,
  subprocessors: subprocessorsBody,
  billing: billingBody,
};
