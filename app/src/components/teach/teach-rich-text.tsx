import { Fragment, type ReactNode } from "react";
import { safeHttpUrl } from "@/lib/teach/links";

/**
 * A deliberately tiny, safe text formatter for readings and custom pages -
 * not a CMS and never raw HTML. Supports paragraphs (blank line), "- " lists,
 * "> " pull quotes, **bold**, *italic* and [label](url) links (http/https
 * only, via safeHttpUrl). Everything else renders as plain text.
 */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = pattern.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    const key = `${keyBase}-${i++}`;
    if (token.startsWith("**")) out.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("[")) {
      const [, label, url] = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/) ?? [];
      const href = safeHttpUrl(url);
      out.push(
        href ? (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" style={{ color: "var(--rbr-primary)" }}>
            {label}
          </a>
        ) : (
          <Fragment key={key}>{label}</Fragment>
        )
      );
    } else out.push(<em key={key}>{token.slice(1, -1)}</em>);
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * Renders text the ORGANIZER wrote, so it carries dir="auto": the browser
 * takes direction from the text's own first strong character rather than
 * from the app. A Hebrew biography stays right-to-left inside an English
 * Space, and an English class description stays left-to-right inside a
 * Hebrew one. Inheriting the app direction would mangle both.
 */
export function TeachRichText({ text, className = "" }: { text: string | null | undefined; className?: string }) {
  if (!text?.trim()) return null;
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div dir="auto" className={`flex flex-col gap-4 ${className}`}>
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter((l) => l.trim());
        if (lines.length > 0 && lines.every((l) => /^\s*[-•]\s+/.test(l))) {
          return (
            <ul key={bi} className="flex flex-col gap-2 ps-1">
              {lines.map((l, li) => (
                <li key={li} className="flex gap-3">
                  <span aria-hidden="true" className="mt-[0.6em] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--rbr-secondary)" }} />
                  <span>{inline(l.replace(/^\s*[-•]\s+/, ""), `${bi}-${li}`)}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (lines.length > 0 && lines.every((l) => /^\s*>\s?/.test(l))) {
          return (
            <blockquote
              key={bi}
              className="ps-4 text-[1.2em] leading-snug italic"
              style={{ borderLeft: "2px solid var(--rbr-secondary)", fontFamily: "var(--tt-font-display)", color: "var(--rbr-text)" }}
            >
              {inline(lines.map((l) => l.replace(/^\s*>\s?/, "")).join(" "), `${bi}`)}
            </blockquote>
          );
        }
        return (
          <p key={bi}>
            {lines.map((l, li) => (
              <Fragment key={li}>
                {li > 0 ? <br /> : null}
                {inline(l, `${bi}-${li}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
