/**
 * Structured body of a legal document. Plain data (no JSX) so that the text
 * can be tested, diffed and archived independently of how it is rendered.
 *
 * Inline markup inside any string is deliberately tiny and is parsed by
 * components/legal/legal-inline.tsx:
 *   **bold**              strong emphasis
 *   [label](href)         a link: an internal path ("/legal/privacy",
 *                         "#section-id") or "mailto:" - nothing else.
 */
export type LegalBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "table"; caption: string; head: string[]; rows: string[][] }
  | { type: "note"; text: string };

export type LegalSubsection = { id: string; heading: string; blocks: LegalBlock[] };

export type LegalSection = {
  id: string;
  heading: string;
  blocks: LegalBlock[];
  subsections?: LegalSubsection[];
};

export type LegalDocumentBody = {
  /** Paragraphs shown before the first numbered section. */
  intro: LegalBlock[];
  sections: LegalSection[];
};

export const p = (text: string): LegalBlock => ({ type: "p", text });
export const ul = (...items: string[]): LegalBlock => ({ type: "ul", items });
export const ol = (...items: string[]): LegalBlock => ({ type: "ol", items });
export const note = (text: string): LegalBlock => ({ type: "note", text });
export const table = (caption: string, head: string[], rows: string[][]): LegalBlock => ({
  type: "table",
  caption,
  head,
  rows,
});
export const section = (
  id: string,
  heading: string,
  blocks: LegalBlock[],
  subsections?: LegalSubsection[],
): LegalSection => ({ id, heading, blocks, subsections });
export const sub = (id: string, heading: string, ...blocks: LegalBlock[]): LegalSubsection => ({
  id,
  heading,
  blocks,
});

/** Shared link fragments, so every document refers to the others identically. */
export const MAIL = "[contact@innerdwes.com](mailto:contact@innerdwes.com)";
export const L = {
  terms: "[Terms of Service](/legal/terms)",
  privacy: "[Privacy Policy](/legal/privacy)",
  dpa: "[Data Processing Addendum](/legal/dpa)",
  aup: "[Acceptable Use Policy](/legal/acceptable-use)",
  copyright: "[Copyright & Content Takedown Policy](/legal/copyright)",
  subprocessors: "[Service Providers & Subprocessors](/legal/subprocessors)",
  billing: "[Billing, Cancellation & Refund Policy](/legal/billing)",
} as const;
