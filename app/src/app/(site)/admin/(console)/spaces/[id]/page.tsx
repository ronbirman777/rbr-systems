import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/billing/admin/auth";
import { sectionRoles } from "@/lib/admin/sections";
import { getSpaceDetail } from "@/lib/admin/queries/spaces";
import { auditSensitiveView } from "@/lib/admin/audit/views";
import { lookupEmails } from "@/lib/billing/admin/queries";
import { formatUtc, isUuid, money, statusLabel } from "@/lib/billing/admin/ui/labels";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminMetaTitle, getAdminI18n } from "../../../_lib/i18n";
import { spaceStatusName, spaceTypeName } from "../../../_lib/spaceTypes";
import { Badge, Card, Dl, PageHeader } from "../../../_components/ui";
import { linkCls } from "../../../_components/styles";
import { MetricValue } from "../../../_components/MetricView";

export const dynamic = "force-dynamic";
export const generateMetadata = () => adminMetaTitle("metaSpace");

/**
 * One Space. The ONLY console page that shows customer personal data: the owner's email (contracts §1.4,
 * `owner_pii_detail`). The email is resolved only after the view has been written to the audit log; if that write
 * fails, the email is not shown (fail closed).
 */
export default async function SpaceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPage({ roles: sectionRoles("spaces") });
  const c = await getAdminI18n();
  const { t } = c;
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = createAdminClient();
  const d = await getSpaceDetail(db, id);
  if (!d) notFound();

  let owners: { state: "shown"; emails: (string | null)[] } | { state: "hidden" } | { state: "none" } = { state: "none" };
  if (d.ownerUserIds.length) {
    const audited = await auditSensitiveView(db, admin, { action: "view.space_detail", targetType: "tenant", targetId: d.id, fields: ["owner_email"] });
    if (audited.ok) {
      const emails = await lookupEmails(db, d.ownerUserIds);
      owners = { state: "shown", emails: d.ownerUserIds.map((u) => emails.get(u) ?? null) };
    } else owners = { state: "hidden" };
  }

  const sub = d.subscription;
  return (
    <>
      <p className="mb-2 text-sm"><Link className={linkCls} href="/admin/spaces">{t("spdBack")}</Link></p>
      <PageHeader title={d.name || d.id}>
        <span className="inline-flex flex-wrap gap-1.5">
          <Badge>{spaceTypeName(d.productType, c)}</Badge>
          <Badge tone={d.status === "archived" ? "neutral" : d.status === "live" ? "good" : "warn"}>{spaceStatusName(d.status, c)}</Badge>
          {d.publishedAt ? <Badge tone="good">{t("spcPublished")}</Badge> : <Badge>{t("spdNotPublished")}</Badge>}
          {d.editsPending ? <Badge tone="warn">{t("spcEditsPendingBadge")}</Badge> : null}
        </span>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("spdIdentity")} id="identity">
          <Dl items={[
            [t("spdId"), <code key="id" className="text-xs">{d.id}</code>],
            [t("spdSlug"), d.slug ?? "-"],
            [t("spdTimezone"), d.timezone],
            [t("spdCreated"), formatUtc(d.createdAt, c)],
            [t("spdContentUpdated"), formatUtc(d.contentUpdatedAt, c)],
            [t("spdPublishedAt"), d.publishedAt ? formatUtc(d.publishedAt, c) : "-"],
            [t("spdArchivedAt"), d.archivedAt ? formatUtc(d.archivedAt, c) : "-"],
          ]} />
        </Card>

        <Card title={t("spdOwner")} id="owner">
          {owners.state === "none" ? <p className="text-sm">{t("spdOwnerNone")}</p> : owners.state === "hidden" ? (
            <p role="status" className="text-sm text-red-800">{t("spdOwnerHidden")}</p>
          ) : (
            <>
              <ul className="text-sm">{owners.emails.map((e, i) => <li key={i}><bdi>{e ?? t("unknownEmail")}</bdi></li>)}</ul>
              {d.ownerIdsTruncated ? <p className="mt-1 text-xs text-idw-forest/70">{t("spdOwnerMore")}</p> : null}
              <p className="mt-3 text-xs text-idw-forest/70">{t("spdOwnerAudited")}</p>
            </>
          )}
        </Card>

        <Card title={t("spdSubscription")} id="subscription">
          {sub.state === "unavailable" ? <p className="text-sm">{t("spdSubUnavailable")}</p> : sub.state === "none" ? <p className="text-sm">{t("spdNoSubscription")}</p> : (
            <>
              <Dl items={[
                [t("spdSubStatus"), statusLabel(sub.status, c)],
                [t("spdSubAmount"), sub.baseAmountMinor == null && sub.currentEffectiveAmountMinor == null ? "-" : `${money(sub.currentEffectiveAmountMinor ?? sub.baseAmountMinor, sub.currency, c.locale)} ${sub.currency ?? t("ovcCurrencyUnknown")}`],
                [t("spdSubPeriodEnd"), sub.currentPeriodEnd ? formatUtc(sub.currentPeriodEnd, c) : "-"],
                [t("spdSubCancelAtEnd"), sub.cancelAtPeriodEnd ? t("spdYes") : t("spdNo")],
                [t("spdSubPaymentFailed"), sub.paymentFailedAt ? formatUtc(sub.paymentFailedAt, c) : "-"],
                [t("spdSubExempt"), sub.exemptReason ?? "-"],
              ]} />
              <p className="mt-3 text-sm"><Link className={linkCls} href={`/admin/billing/subscriptions/${sub.id}`}>{t("spdOpenSubscription")}</Link></p>
            </>
          )}
        </Card>

        <Card title={t("spdMembers")} id="members">
          <Dl items={[
            [t("spdOwners"), <MetricValue key="o" m={d.members.owner} c={c} />],
            [t("spdPractitioners"), <MetricValue key="p" m={d.members.practitioner} c={c} />],
            [t("spdClients"), <MetricValue key="c" m={d.members.client} c={c} />],
            [t("spdContentItems"), <MetricValue key="i" m={d.contentItems} c={c} />],
          ]} />
        </Card>
      </div>
    </>
  );
}
