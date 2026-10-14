import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_CONTACT_EMAIL, LEGAL_DOCUMENTS, formatLegalDate, legalHref } from "@/lib/legal/documents";

export const metadata: Metadata = {
  title: "Legal · InnerDweS",
  description: "InnerDweS Terms of Service, Privacy Policy and the other policies that apply to the Service.",
  alternates: { canonical: "/legal" },
};

export default function LegalIndexPage() {
  return (
    <div className="mx-auto w-full max-w-[880px] px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="font-editorial text-[34px] leading-[1.12] tracking-[-0.01em] text-idw-forest sm:text-[44px]">Legal</h1>
      <p className="mt-4 max-w-[60ch] font-ui text-base leading-7 text-idw-forest/85">
        The documents that govern your use of InnerDweS and explain how we handle data. Each document shows its version and
        the date from which it applies.
      </p>
      <ul className="mt-10 divide-y divide-idw-forest/10 border-y border-idw-forest/10">
        {LEGAL_DOCUMENTS.map((d) => (
          <li key={d.id} className="py-5">
            <h2 className="font-ui text-lg font-semibold text-idw-forest">
              <Link href={legalHref(d.id)} className="underline decoration-idw-forest/30 underline-offset-4 hover:decoration-idw-forest">
                {d.title}
              </Link>
            </h2>
            <p className="mt-1.5 font-ui text-[15px] leading-6 text-idw-forest/80">{d.summary}</p>
            <p className="mt-1.5 font-ui text-sm text-idw-forest/75">
              Version {d.version} · Effective <time dateTime={d.effectiveDate}>{formatLegalDate(d.effectiveDate)}</time>
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-8 font-ui text-sm text-idw-forest/75">
        Questions about any of these documents:{" "}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-idw-forest underline underline-offset-2">
          {LEGAL_CONTACT_EMAIL}
        </a>
      </p>
    </div>
  );
}
