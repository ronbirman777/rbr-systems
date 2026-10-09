import Link from "next/link";
import type { StudioSuspendedLabels } from "@/lib/billing/studioGate";

/**
 * Shown INSTEAD of a Studio when billing has suspended (or ended) it. Server-compatible: no state, no client
 * code. Labels arrive pre-translated; the Space name is user-authored (dir="auto", never translated).
 */
export function StudioSuspended({
  spaceName,
  tenantId,
  labels,
  dir = "ltr",
  lang,
}: {
  spaceName: string;
  tenantId: string;
  labels: StudioSuspendedLabels;
  dir?: "ltr" | "rtl";
  /** The account language the labels are in; the surrounding document may still be English. */
  lang?: string;
}) {
  return (
    <main dir={dir} lang={lang} className="flex-1 bg-idw-parchment px-4 sm:px-6 py-16 flex flex-col items-center">
      <section aria-labelledby="studio-suspended-title" className="w-full max-w-md rounded-2xl border border-idw-forest/10 bg-white p-6 sm:p-8 text-start">
        <h1 id="studio-suspended-title" className="font-ui text-2xl text-idw-forest">{labels.title}</h1>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-idw-forest/50 break-words" dir="auto">{spaceName}</p>
        <p className="mt-4 text-sm leading-relaxed text-idw-forest/70">{labels.body}</p>
        {labels.deadline ? <p className="mt-3 text-sm leading-relaxed text-idw-forest/70">{labels.deadline}</p> : null}
        <div className="mt-6 flex flex-wrap gap-2.5 items-center">
          {labels.resolvePayment ? (
            <Link
              href={`/billing/${tenantId}`}
              className="inline-flex items-center justify-center min-h-11 px-5 rounded-full bg-idw-forest text-idw-parchment text-sm font-semibold active:scale-[0.97] motion-reduce:active:scale-100 transition-transform"
            >
              {labels.resolvePayment}
            </Link>
          ) : null}
          <Link
            href="/space"
            className="inline-flex items-center justify-center min-h-11 px-5 rounded-full border border-idw-forest/20 text-idw-forest text-sm font-semibold active:bg-idw-forest/10"
          >
            {labels.backToSpaces}
          </Link>
        </div>
      </section>
    </main>
  );
}
