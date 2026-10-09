import type { BillingPageModel } from "@/lib/billing/billingPageModel";
import { translate, type Locale, type TranslationKey } from "@/lib/i18n";

const card = "rounded-2xl border border-idw-forest/10 bg-white p-5 sm:p-6";

const CHIP_TONE: Record<string, string> = {
  active: "bg-idw-sage/40 text-idw-forest",
  exempt: "bg-idw-sage/40 text-idw-forest",
  canceling: "bg-idw-linen text-idw-forest",
  setting_up: "bg-idw-linen text-idw-forest",
  ended: "bg-idw-forest/10 text-idw-forest",
  payment_issue: "bg-idw-clay/20 text-idw-clay-text",
  guest_suspended: "bg-idw-clay/20 text-idw-clay-text",
  studio_suspended: "bg-idw-clay/20 text-idw-clay-text",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4 py-2">
      <dt className="text-xs font-semibold uppercase tracking-wide text-idw-forest/50">{label}</dt>
      <dd className="text-sm text-idw-forest sm:text-end break-words">{children}</dd>
    </div>
  );
}

/**
 * The read-only part of the Billing / Plan page. Everything arrives pre-formatted in `model`
 * (buildBillingPageModel); this component only lays it out. Server component, no client code.
 */
export function BillingSections({ model, locale }: { model: BillingPageModel; locale: Locale }) {
  const t = (k: TranslationKey<"billing">) => translate(locale, "billing", k);
  const tone = CHIP_TONE[model.state] ?? CHIP_TONE.active;

  return (
    <div className="space-y-5">
      {model.banner ? (
        <div role="note" className="rounded-2xl border border-idw-clay/40 bg-idw-clay/10 px-5 py-4 text-sm leading-relaxed text-idw-forest">
          {model.banner}
        </div>
      ) : null}

      <section aria-labelledby="plan-heading" className={card}>
        <h2 id="plan-heading" className="sr-only">{t("planLabel")}</h2>
        <dl className="divide-y divide-idw-forest/10">
          <Row label={t("planLabel")}>
            <span className="font-semibold">{model.planName}</span>
            {model.priceLine ? <span className="text-idw-forest/70"> · {model.priceLine}</span> : null}
          </Row>
          <Row label={t("statusLabel")}>
            {/* Text, not colour alone, carries the state. */}
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>{model.statusText}</span>
          </Row>
          {model.period ? <Row label={t("periodLabel")}>{model.period}</Row> : null}
          {model.nextBilling ? <Row label={t("nextBilling")}>{model.nextBilling}</Row> : null}
          {model.nextCharge ? <Row label={t("nextCharge")}>{model.nextCharge}</Row> : null}
        </dl>
      </section>

      {model.coupon ? (
        <section aria-labelledby="coupon-heading" className={card}>
          <h2 id="coupon-heading" className="text-sm font-semibold text-idw-forest">{t("couponSection")}</h2>
          <p className="mt-2 text-sm text-idw-forest" dir="auto"><bdi>{model.coupon.code}</bdi></p>
          {model.coupon.progress ? <p className="mt-1 text-sm text-idw-forest/70">{model.coupon.progress}</p> : null}
          {model.coupon.remaining ? <p className="mt-1 text-sm text-idw-forest/70">{model.coupon.remaining}</p> : null}
        </section>
      ) : null}

      {model.whatsNext ? (
        <section aria-labelledby="next-heading" className={card}>
          <h2 id="next-heading" className="text-sm font-semibold text-idw-forest">{t("nextActionTitle")}</h2>
          <p className="mt-2 text-sm text-idw-forest/80">{model.whatsNext}</p>
        </section>
      ) : null}

      {model.audio ? (
        <section aria-labelledby="included-heading" className={card}>
          <h2 id="included-heading" className="text-sm font-semibold text-idw-forest">{t("includedTitle")}</h2>
          <p className="mt-2 text-sm text-idw-forest/80">{model.audio}</p>
        </section>
      ) : null}

      {model.exempt ? null : <History model={model} locale={locale} />}
    </div>
  );
}

function History({ model, locale }: { model: BillingPageModel; locale: Locale }) {
  const t = (k: TranslationKey<"billing">) => translate(locale, "billing", k);
  return (
    <section aria-labelledby="history-heading" className={card}>
      <h2 id="history-heading" className="text-sm font-semibold text-idw-forest">{t("historyTitle")}</h2>
      {model.invoices.length === 0 ? (
        <p className="mt-3 text-sm text-idw-forest/60">{t("historyEmpty")}</p>
      ) : (
        <>
          {/* Narrow screens: stacked cards (no horizontal page scroll). */}
          <ul className="mt-3 space-y-3 md:hidden">
            {model.invoices.map((i) => (
              <li key={i.id} className="rounded-xl border border-idw-forest/10 p-4 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold text-idw-forest">{i.date}</span>
                  <span className="text-idw-forest">{i.amount}</span>
                </div>
                <div className="mt-1 text-idw-forest/70">{i.status}{i.refunded ? ` · ${i.refunded}` : ""}</div>
                {i.reference ? <div className="mt-1 text-xs text-idw-forest/50 break-all" dir="ltr">{i.reference}</div> : null}
                {i.href ? <DocLink href={i.href} label={t("viewInvoice")} /> : null}
              </li>
            ))}
          </ul>
          <table className="mt-3 hidden w-full text-sm md:table">
            <thead>
              <tr className="text-start text-xs font-semibold uppercase tracking-wide text-idw-forest/50">
                <th scope="col" className="py-2 pe-3 text-start font-semibold">{t("colDate")}</th>
                <th scope="col" className="py-2 pe-3 text-start font-semibold">{t("colAmount")}</th>
                <th scope="col" className="py-2 pe-3 text-start font-semibold">{t("colStatus")}</th>
                <th scope="col" className="py-2 pe-3 text-start font-semibold">{t("colReference")}</th>
                <th scope="col" className="py-2 text-start font-semibold">{t("colDocument")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-idw-forest/10">
              {model.invoices.map((i) => (
                <tr key={i.id} className="align-top">
                  <td className="py-3 pe-3 text-idw-forest">{i.date}</td>
                  <td className="py-3 pe-3 text-idw-forest">{i.amount}</td>
                  <td className="py-3 pe-3 text-idw-forest/80">{i.status}{i.refunded ? <div className="text-xs">{i.refunded}</div> : null}</td>
                  <td className="py-3 pe-3 text-xs text-idw-forest/60 break-all" dir="ltr">{i.reference}</td>
                  <td className="py-3">{i.href ? <DocLink href={i.href} label={t("viewInvoice")} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

function DocLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center min-h-11 text-sm font-semibold text-idw-forest underline underline-offset-2">
      {label}
    </a>
  );
}
