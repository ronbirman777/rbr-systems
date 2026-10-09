import Link from "next/link";
import { requireAdminPage } from "@/lib/billing/admin/auth";
import { listInvoices } from "@/lib/billing/admin/queries";
import { formatUtc, invoiceStatusLabel, isUuid, money, safeHttpsUrl } from "@/lib/billing/admin/ui/labels";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge, Card, EmptyRow, FilterLinks, PageHeader, RBody, RCell, RHead, RRow, RTable } from "../../_components/ui";
import { linkCls } from "../../_components/styles";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payments - InnerDweS Admin" };

const STATUSES = ["paid", "open", "void", "uncollectible", "draft"] as const;

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string; subscription?: string; tenant?: string }> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status : undefined;
  const subscriptionId = isUuid(sp.subscription) ? sp.subscription : undefined;
  const tenantId = isUuid(sp.tenant) ? sp.tenant : undefined;
  const rows = await listInvoices(createAdminClient(), { status, subscriptionId, tenantId, limit: 200 });
  return (
    <>
      <PageHeader title="Payments and invoices">
        {subscriptionId || tenantId ? <>Filtered to one {subscriptionId ? "subscription" : "Space"}. <Link className={linkCls} href="/admin/billing/payments">Clear filter</Link></> : "Newest first."}
      </PageHeader>
      <Card className="mb-4">
        <p className="text-sm text-idw-forest/85"><b>&ldquo;I paid but did not get my invoice&rdquo;:</b> the customer receives ONE InnerDweS payment-confirmation email per paid invoice, and it links to the official Stripe invoice. Find the invoice below, check it is <i>paid</i>, and share the Hosted invoice or PDF link if they cannot find the email. If the invoice is missing, open the subscription and use <i>Resync from Stripe</i>.</p>
      </Card>
      <FilterLinks base="/admin/billing/payments" param="status" current={status} options={[["", "All"], ...STATUSES.map((s): [string, string] => [s, s])]} />
      {rows.length === 0 ? <EmptyRow>No invoices match.</EmptyRow> : (
        <RTable caption="Invoices and payments">
          <RHead cols={["Date", "Customer", "Space", "Stripe invoice", "Status", "Amount", "Coupon", "Paid / failed", "Documents"]} />
          <RBody>
            {rows.map(({ invoice: i, spaceName, ownerEmail, couponCode }) => {
              const hosted = safeHttpsUrl(i.hosted_invoice_url);
              const pdf = safeHttpsUrl(i.invoice_pdf_url);
              const receipt = safeHttpsUrl(i.receipt_url);
              return (
                <RRow key={i.id as string}>
                  <RCell label="Date">{formatUtc(i.issued_at)}</RCell>
                  <RCell label="Customer">{ownerEmail ?? "-"}</RCell>
                  <RCell label="Space">{spaceName || "-"}{i.space_subscription_id ? <span className="block text-xs"><Link className={linkCls} href={`/admin/billing/subscriptions/${i.space_subscription_id}`}>subscription</Link></span> : null}</RCell>
                  <RCell label="Stripe invoice"><code className="font-mono text-xs">{i.stripe_invoice_id}</code>{i.invoice_number ? <span className="block text-xs">No. {i.invoice_number}</span> : null}<span className="block text-xs text-idw-forest/70">{i.stripe_mode}</span></RCell>
                  <RCell label="Status"><Badge tone={i.status === "paid" ? "good" : i.status === "open" ? "warn" : "neutral"}>{invoiceStatusLabel(i)}</Badge></RCell>
                  <RCell label="Amount">{money(i.total_minor, i.currency)} <span className="text-xs">{String(i.currency).trim()}</span>{i.discount_minor > 0 ? <span className="block text-xs">discount {money(i.discount_minor, i.currency)}</span> : null}</RCell>
                  <RCell label="Coupon">{couponCode ? <code className="font-mono text-xs">{couponCode}</code> : "-"}</RCell>
                  <RCell label="Paid / failed">{i.paid_at ? `paid ${formatUtc(i.paid_at)}` : i.failed_at ? `failed ${formatUtc(i.failed_at)}` : "-"}</RCell>
                  <RCell label="Documents">
                    <span className="flex flex-wrap gap-x-3">
                      {hosted ? <a className={linkCls} href={hosted} target="_blank" rel="noopener noreferrer">Hosted invoice</a> : null}
                      {pdf ? <a className={linkCls} href={pdf} target="_blank" rel="noopener noreferrer">PDF</a> : null}
                      {receipt ? <a className={linkCls} href={receipt} target="_blank" rel="noopener noreferrer">Receipt</a> : null}
                      {!hosted && !pdf && !receipt ? "none" : null}
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
