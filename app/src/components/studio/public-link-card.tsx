"use client";

import { useEffect, useRef, useState } from "react";
import { copyTextToClipboard, displayPublicUrl } from "@/lib/studio/publicLink";

/**
 * Public link row shared by every Studio's Publish & Share surface: the
 * canonical URL, Copy link and Open Guest App. The link only counts as
 * "open-able" once published; before that the card says so instead of
 * offering a link that would 404.
 */
export function PublicLinkCard({
  url,
  openHref,
  published,
  title = "Guest App link",
  openLabel = "Open Guest App",
}: {
  url: string;
  openHref: string;
  published: boolean;
  title?: string;
  openLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy() {
    const ok = await copyTextToClipboard(url);
    if (!ok) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-2xl border border-[#E2DACD] bg-white p-4 sm:p-5" data-testid="public-link-card">
      <p className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[#8C8A84]">{title}</p>
      <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="flex-1 min-w-0 text-[14px] text-[#192B21] break-all" data-testid="public-link-url">
          {displayPublicUrl(url)}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={copy}
            aria-live="polite"
            className="min-h-10 px-4 rounded-full border border-[#192B21]/20 text-[12.5px] font-semibold text-[#192B21]"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          {published ? (
            <a
              href={openHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center min-h-10 px-4 rounded-full bg-[#192B21] text-white text-[12.5px] font-semibold"
            >
              {openLabel} ↗
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : null}
        </div>
      </div>
      {!published ? (
        <p className="mt-2 text-[12px] text-[#8C8A84]">This link goes live when you publish. Until then guests cannot open it.</p>
      ) : null}
    </div>
  );
}
