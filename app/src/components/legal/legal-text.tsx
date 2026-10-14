import Link from "next/link";
import { Fragment } from "react";
import { tokenizeInline } from "@/lib/legal/inline";
import type { LegalBlock } from "@/lib/legal/content/types";

const LINK_CLASS =
  "text-idw-forest underline decoration-idw-forest/40 underline-offset-2 hover:decoration-idw-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-idw-forest rounded-sm";

/** Renders one string of legal text with its **bold** and [label](href) markup. */
export function LegalInline({ text }: { text: string }) {
  return (
    <>
      {tokenizeInline(text).map((t, i) => {
        if (t.kind === "text") return <Fragment key={i}>{t.value}</Fragment>;
        if (t.kind === "bold")
          return (
            <strong key={i} className="font-semibold text-idw-forest">
              {t.value}
            </strong>
          );
        if (t.href.startsWith("/"))
          return (
            <Link key={i} href={t.href} className={LINK_CLASS}>
              {t.label}
            </Link>
          );
        return (
          <a key={i} href={t.href} className={LINK_CLASS}>
            {t.label}
          </a>
        );
      })}
    </>
  );
}

function LegalTable({ block }: { block: Extract<LegalBlock, { type: "table" }> }) {
  const wide = block.head.length > 2;
  return (
    <>
      <div className={wide ? "hidden md:block print:block" : undefined}>
        <table className="w-full border-collapse text-left text-[15px] leading-6">
          <caption className="sr-only">{block.caption}</caption>
          <thead>
            <tr className="border-b border-idw-forest/20">
              {block.head.map((h) => (
                <th key={h} scope="col" className="py-2.5 pr-4 align-bottom font-semibold text-idw-forest">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r} className="border-b border-idw-forest/10 align-top">
                {row.map((cell, c) =>
                  c === 0 ? (
                    <th key={c} scope="row" className="py-3 pr-4 font-semibold text-idw-forest">
                      <LegalInline text={cell} />
                    </th>
                  ) : (
                    <td key={c} className="py-3 pr-4 text-idw-forest/85">
                      <LegalInline text={cell} />
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {wide ? (
        // Below md a 3+ column table cannot fit a phone without sideways
        // scrolling, so the same rows are shown as labelled cards instead.
        // display:none removes whichever variant is hidden from the
        // accessibility tree, so assistive technology meets one copy only.
        <ul className="md:hidden print:hidden space-y-3" aria-label={block.caption}>
          {block.rows.map((row, r) => (
            <li key={r} className="rounded-xl border border-idw-forest/15 bg-white/60 p-4">
              <p className="font-semibold text-idw-forest">
                <LegalInline text={row[0]} />
              </p>
              <dl className="mt-2 space-y-2">
                {row.slice(1).map((cell, c) => (
                  <div key={c}>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-idw-forest/70">{block.head[c + 1]}</dt>
                    <dd className="text-[15px] leading-6 text-idw-forest/85">
                      <LegalInline text={cell} />
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

export function LegalBlocks({ blocks }: { blocks: LegalBlock[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "p":
            return (
              <p key={i}>
                <LegalInline text={b.text} />
              </p>
            );
          case "note":
            return (
              <p key={i} className="rounded-xl border-l-4 border-idw-sage bg-white/60 px-4 py-3">
                <LegalInline text={b.text} />
              </p>
            );
          case "ul":
            return (
              <ul key={i} className="list-disc space-y-1.5 pl-6 marker:text-idw-forest/50">
                {b.items.map((item, j) => (
                  <li key={j}>
                    <LegalInline text={item} />
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="list-decimal space-y-1.5 pl-6">
                {b.items.map((item, j) => (
                  <li key={j}>
                    <LegalInline text={item} />
                  </li>
                ))}
              </ol>
            );
          case "table":
            return <LegalTable key={i} block={b} />;
        }
      })}
    </>
  );
}
