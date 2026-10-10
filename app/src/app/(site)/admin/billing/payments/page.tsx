import Link from "next/link";
import { requireAdminPage } from "@/lib/billing/admin/auth";
import { listInvoices } from "@/lib/billing/admin/queries";
import { formatUtc, invoiceAmountLines, invoiceAmountNote, invoiceStatusLabel, invoiceStatusWord, isUuid, money, safeHttpsUrl } from "@/lib/billing/admin/ui/labels";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminMetaTitle, getAdminI18n } from "../../_lib/i18n";
import { Badge, Card, EmptyRow, FilterLinks, InvoiceAmounts, PageHeader, RBody, RCell, RHead, RRow, RTable } from "../../_components/ui";
import { linkCls } from "../../_components/styles";

export const dynamic = "force-dynamic";
export const generateMetadata = () => adminMetaTitle("navPayments");

const STATUSES = ["paid", "open", "void", "uncollectible", "draft"] as const;

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string; subscription?: string; tenant?: string }> }) {
  await requireAdminPage();
  const c = await getAdminI18n();
  const { t, locale } = c;
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status : undefined;
  const subscriptionId = isUuid(sp.subscription) ? sp.subscription : undefined;
  const tenantId = isUuid(sp.tenant) ? sp.tenant : undefined;
  const rows = await listInvoices(createAdminClient(), { status, subscriptionId, tenantId, limit: 200 });
  return (
    <>
      <PageHeader title={t("payTitle")}>
        {subscriptionId || tenantId ? <>{subscriptionId ? t("payFilteredSubscription") : t("payFilteredSpace")} <Link className={linkCls} href="/admin/billing/payments">{t("payClearFilter")}</Link></> : t("payNewest")}
      </PageHeader>
      <Card className="mb-4">
        <p className="text-sm text-idw-forest/85"><b>{t("payHelpTitle")}</b> {t("payHelpBody")}</p>
        <p className="mt-2 text-sm text-idw-forest/85">{t("payAmountsHelp")}</p>
      </Card>
      <FilterLinks base="/admin/billing/payments" param="status" current={status} label={t("filterAria")} options={[["", t("filterAll")], ...STATUSES.map((s): [string, string] => [s, invoiceStatusWord(s, c)])]} />
      {rows.length === 0 ? <EmptyRow>{t("payEmpty")}</EmptyRow> : (
        <RTable caption={t("payCaption")}>
          <RHead cols={[t("colDate"), t("colCustomer"), t("colSpace"), t("colStripeInvoice"), t("colStatus"), t("colAmounts"), t("colCoupon"), t("colPaidFailed"), t("colDocuments")]} />
          <RBody>
            {rows.map(({ invoice: i, spaceName, ownerEmail, couponCode }) => {
              const hosted = safeHttpsUrl(i.hosted_invoice_url);
              const pdf = safeHttpsUrl(i.invoice_pdf_url);
              const receipt = safeHttpsUrl(i.receipt_url);
              return (
                <RRow key={i.id as string}>
                  <RCell label={t("colDate")}>{formatUtc(i.issued_at, c)}</RCell>
                  <RCell label={t("colCustomer")}>{ownerEmail ?? "-"}</RCell>
                  <RCell label={t("colSpace")}>{spaceName || "-"}{i.space_subscription_id ? <span className="block text-xs"><Link className={linkCls} href={`/admin/billing/subscriptions/${i.space_subscription_id}`}>{t("paySubscriptionLink")}</Link></span> : null}</RCell>
                  <RCell label={t("colStripeInvoice")}><code className="font-mono text-xs">{i.stripe_invoice_id}</code>{i.invoice_number ? <span className="block text-xs">{t("payInvoiceNo", { number: i.invoice_number })}</span> : null}<span className="block text-xs text-idw-forest/70">{i.stripe_mode}</span></RCell>
                  <RCell label={t("colStatus")}><Badge tone={i.status === "paid" ? "good" : i.status === "open" ? "warn" : "neutral"}>{invoiceStatusLabel(i, c)}</Badge></RCell>
                  <RCell label={t("colAmounts")}>
                    <InvoiceAmounts lines={invoiceAmountLines(i, c)} note={invoiceAmountNote(i, c)} currency={String(i.currency).trim()} />
                    {i.discount_minor > 0 ? <span className="block text-xs">{t("payDiscount", { amount: money(i.discount_minor, i.currency, locale) })}</span> : null}
                  </RCell>
                  <RCell label={t("colCoupon")}>{couponCode ? <code className="font-mono text-xs">{couponCode}</code> : "-"}</RCell>
                  <RCell label={t("colPaidFailed")}>{i.paid_at ? t("payPaid", { time: formatUtc(i.paid_at, c) }) : i.failed_at ? t("payFailed", { time: formatUtc(i.failed_at, c) }) : "-"}</RCell>
                  <RCell label={t("colDocuments")}>
                    <span className="flex flex-wrap gap-x-3">
                      {hosted ? <a className={linkCls} href={hosted} target="_blank" rel="noopener noreferrer">{t("docHosted")}</a> : null}
                      {pdf ? <a className={linkCls} href={pdf} target="_blank" rel="noopener noreferrer">{t("docPdf")}</a> : null}
                      {receipt ? <a className={linkCls} href={receipt} target="_blank" rel="noopener noreferrer">{t("docReceipt")}</a> : null}
                      {!hosted && !pdf && !receipt ? t("docNone") : null}
                    </span>
                  </RCell>
                </RRow>
              );
            })}
          </RBody>
        </RTable>
      )}
    </>
  );
}
