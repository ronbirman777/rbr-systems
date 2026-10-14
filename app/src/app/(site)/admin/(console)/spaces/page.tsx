import Link from "next/link";
import { requireAdminPage } from "@/lib/billing/admin/auth";
import { sectionRoles } from "@/lib/admin/sections";
import { KNOWN_SPACE_TYPES, SPACE_STATE_FILTERS, listSpaces, loadSpacesSummary, type SpaceStateFilter } from "@/lib/admin/queries/spaces";
import { metricCaption } from "@/lib/billing/admin/ui/metricCaptions";
import { formatUtcDate, statusLabel } from "@/lib/billing/admin/ui/labels";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminMetaTitle, getAdminI18n } from "../../_lib/i18n";
import { spaceStatusName, spaceTypeName } from "../../_lib/spaceTypes";
import { Badge, Card, EmptyRow, PageHeader, RBody, RCell, RHead, RRow, RTable } from "../../_components/ui";
import { linkCls } from "../../_components/styles";
import { MetricTile, MetricValue, SectionHeading, TileGrid } from "../../_components/MetricView";

export const dynamic = "force-dynamic";
export const generateMetadata = () => adminMetaTitle("secSpaces");

type SP = { type?: string; state?: string; page?: string };

function hrefWith(sp: SP, patch: Partial<SP>): string {
  const next = { ...sp, ...patch };
  const qs = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]).toString();
  return qs ? `/admin/spaces?${qs}` : "/admin/spaces";
}

function Chips({ label, options, current, make }: { label: string; options: [string, string][]; current: string; make: (v: string) => string }) {
  return (
    <nav aria-label={label} className="mb-3 flex flex-wrap gap-2">
      {options.map(([value, text]) => (
        <Link key={value || "all"} href={make(value)} aria-current={current === value ? "true" : undefined}
          className={`inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-semibold ${current === value ? "border-idw-forest bg-idw-forest text-idw-parchment" : "border-idw-forest/25 text-idw-forest hover:border-idw-forest/60"}`}>
          {text}
        </Link>
      ))}
    </nav>
  );
}

export default async function SpacesPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdminPage({ roles: sectionRoles("spaces") });
  const c = await getAdminI18n();
  const { t } = c;
  const sp = await searchParams;
  const type = (KNOWN_SPACE_TYPES as readonly string[]).includes(sp.type ?? "") ? sp.type! : "";
  const state = (SPACE_STATE_FILTERS as readonly string[]).includes(sp.state ?? "") ? (sp.state as SpaceStateFilter) : undefined;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const db = createAdminClient();
  const [s, list] = await Promise.all([loadSpacesSummary(db), listSpaces(db, { page, type: type || undefined, state })]);
  const nf = new Intl.NumberFormat(c.locale);
  const total = list.total.state === "ok" ? list.total.value : null;
  const first = (list.page - 1) * list.pageSize + 1;
  const last = (list.page - 1) * list.pageSize + list.rows.length;
  const filters: SP = { type: type || undefined, state };

  return (
    <>
      <PageHeader title={t("spcTitle")}>{t("spcIntro")}</PageHeader>

      <SectionHeading>{t("spcAccountsAndSpaces")}</SectionHeading>
      <TileGrid>
        <MetricTile label={t("spcAccounts")} m={s.accounts} c={c} caption={t("spcAccountsNote")} />
        <MetricTile label={t("spcTotal")} m={s.total} c={c} />
        <MetricTile label={t("spcArchived")} m={s.archived} c={c} />
      </TileGrid>

      <SectionHeading>{t("spcByType")}</SectionHeading>
      <TileGrid>
        {s.byType.map(({ type: ty, metric }) => <MetricTile key={ty} label={spaceTypeName(ty, c)} m={metric} c={c} />)}
      </TileGrid>

      <SectionHeading>{t("spcPublishing")}</SectionHeading>
      <TileGrid>
        <MetricTile label={t("spcPublished")} m={s.published} c={c} />
        <MetricTile label={t("spcDraft")} m={s.draft} c={c} />
        <MetricTile label={t("spcEditsPending")} m={s.editsPending} c={c} />
        <MetricTile label={t("spcPublishedMonth")} m={s.publishedThisMonth} c={c} />
      </TileGrid>

      <SectionHeading>{t("spcBilling")}</SectionHeading>
      <TileGrid>
        <MetricTile label={t("ovPaidSubscriptions")} m={s.billing.paidSubscriptions} c={c} caption={metricCaption("paidSubscriptions", c)} />
        <MetricTile label={t("ovPaidSpaces")} m={s.billing.paidSpaces} c={c} caption={metricCaption("paidSpaces", c)} />
        <MetricTile label={t("spcLegacy")} m={s.billing.legacy} c={c} caption={t("spcLegacyCaption")} />
        <MetricTile label={t("ovExemptSpaces")} m={s.billing.exempt} c={c} caption={metricCaption("exempt", c)} />
        <MetricTile label={t("ovGuestSuspended")} m={s.billing.guestSuspended} c={c} caption={metricCaption("guestSuspended", c)} />
        <MetricTile label={t("ovStudioSuspended")} m={s.billing.studioSuspended} c={c} caption={metricCaption("studioSuspended", c)} />
      </TileGrid>

      <SectionHeading>{t("spcNewByMonth")}</SectionHeading>
      <Card>
        <RTable caption={t("spcNewByMonth")}>
          <RHead cols={[t("spcMonth"), ...KNOWN_SPACE_TYPES.map((ty) => spaceTypeName(ty, c))]} />
          <RBody>
            {s.newByMonth.map((m) => (
              <RRow key={m.monthStart}>
                <RCell label={t("spcMonth")}>{m.monthStart.slice(0, 7)}</RCell>
                {KNOWN_SPACE_TYPES.map((ty) => <RCell key={ty} label={spaceTypeName(ty, c)}><MetricValue m={m.byType[ty]} c={c} /></RCell>)}
              </RRow>
            ))}
          </RBody>
        </RTable>
        <p className="mt-3 text-xs text-idw-forest/70">{t("spcNewByMonthNote")}</p>
      </Card>

      <SectionHeading>{t("spcGrowth")}</SectionHeading>
      <div className="grid gap-3 sm:grid-cols-2"><MetricTile label={t("spcGrowth")} m={{ state: "not_measured", reason: "snapshots_missing" }} c={c} /></div>

      <SectionHeading>{t("spcList")}</SectionHeading>
      <Chips label={t("spcFilterTypeAria")} current={type} make={(v) => hrefWith(filters, { type: v || undefined, page: undefined })}
        options={[["", t("spcFilterAll")], ...KNOWN_SPACE_TYPES.map((ty) => [ty, spaceTypeName(ty, c)] as [string, string])]} />
      <Chips label={t("spcFilterStateAria")} current={state ?? ""} make={(v) => hrefWith(filters, { state: v || undefined, page: undefined })}
        options={[["", t("spcFilterAll")], ["active", t("spcFilterActive")], ["draft", t("spcFilterDraft")], ["archived", t("spcFilterArchived")]]} />
      <Card>
        {list.total.state !== "ok" ? (
          <p role="status" className="text-sm text-red-800">{t("msError")}</p>
        ) : list.rows.length === 0 ? (
          <EmptyRow>{t("spcEmpty")}</EmptyRow>
        ) : (
          <>
            <p className="mb-3 text-sm text-idw-forest/75" data-spaces-total={total ?? undefined}>{t("spcShowing", { from: nf.format(first), to: nf.format(last), total: total == null ? "" : nf.format(total) })}</p>
            <RTable caption={t("spcListCaption")}>
              <RHead cols={[t("spcColName"), t("spcColType"), t("spcColState"), t("spcColBilling"), t("spcColCreated")]} />
              <RBody>
                {list.rows.map((r) => (
                  <RRow key={r.id}>
                    <RCell label={t("spcColName")}><Link className={linkCls} href={`/admin/spaces/${r.id}`}><bdi>{r.name || r.id}</bdi></Link></RCell>
                    <RCell label={t("spcColType")}>{spaceTypeName(r.productType, c)}</RCell>
                    <RCell label={t("spcColState")}>
                      <span className="inline-flex flex-wrap gap-1">
                        <Badge tone={r.status === "archived" ? "neutral" : r.status === "live" ? "good" : "warn"}>{spaceStatusName(r.status, c)}</Badge>
                        {r.publishedAt ? <Badge tone="good">{t("spcPublished")}</Badge> : null}
                        {r.editsPending ? <Badge tone="warn">{t("spcEditsPendingBadge")}</Badge> : null}
                      </span>
                    </RCell>
                    <RCell label={t("spcColBilling")}>{r.billingStatus === "unavailable" ? t("spcBillingUnavailable") : r.billingStatus ? statusLabel(r.billingStatus, c) : t("spcLegacy")}</RCell>
                    <RCell label={t("spcColCreated")}>{formatUtcDate(r.createdAt, c)}</RCell>
                  </RRow>
                ))}
              </RBody>
            </RTable>
            <nav aria-label={t("spcPagination")} className="mt-4 flex flex-wrap gap-3 text-sm">
              {list.page > 1 ? <Link className={linkCls} href={hrefWith(filters, { page: String(list.page - 1) })}>{t("spcPrev")}</Link> : null}
              {total != null && last < total ? <Link className={linkCls} href={hrefWith(filters, { page: String(list.page + 1) })}>{t("spcNext")}</Link> : null}
            </nav>
          </>
        )}
      </Card>
    </>
  );
}
