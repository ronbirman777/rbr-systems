/**
 * Tokenizer for the tiny inline markup used in legal document text (see
 * lib/legal/content/types.ts): **bold** and [label](href). Pure, so the
 * allowed link targets can be unit-tested without rendering.
 */
export type InlineToken =
  | { kind: "text"; value: string }
  | { kind: "bold"; value: string }
  | { kind: "link"; label: string; href: string };

const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

/** Only internal paths, in-page anchors and mailto: links are allowed in legal text. */
export function isAllowedLegalHref(href: string): boolean {
  if (href.startsWith("mailto:")) return /^mailto:[^\s@]+@[^\s@]+$/.test(href);
  if (href.startsWith("#")) return /^#[a-z0-9-]+$/.test(href);
  return /^\/(?!\/)[a-z0-9\-/#]*$/.test(href);
}

export function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const index = m.index ?? 0;
    if (index > last) tokens.push({ kind: "text", value: text.slice(last, index) });
    if (m[1] !== undefined) {
      tokens.push({ kind: "bold", value: m[1] });
    } else {
      const href = m[3];
      if (!isAllowedLegalHref(href)) throw new Error(`Legal text link not allowed: ${href}`);
      tokens.push({ kind: "link", label: m[2], href });
    }
    last = index + m[0].length;
  }
  if (last < text.length) tokens.push({ kind: "text", value: text.slice(last) });
  return tokens;
}

/** The same text with all markup removed (for metadata, tests and plain-text exports). */
export function inlineToPlainText(text: string): string {
  return tokenizeInline(text)
    .map((t) => (t.kind === "link" ? t.label : t.value))
    .join("");
}
