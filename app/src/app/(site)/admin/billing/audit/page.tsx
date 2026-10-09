import { requireAdminPage } from "@/lib/billing/admin/auth";
import { listAudit } from "@/lib/billing/admin/queries";
import { formatUtc } from "@/lib/billing/admin/ui/labels";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminMetaTitle, getAdminI18n } from "../../_lib/i18n";
import { Badge, EmptyRow, FilterLinks, PageHeader, RBody, RCell, RHead, RRow, RTable } from "../../_components/ui";

export const dynamic = "force-dynamic";
export const generateMetadata = () => adminMetaTitle("navAudit");

function Json({ value }: { value: unknown }) {
  return <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-idw-linen/70 p-2 text-left text-xs">{JSON.stringify(value, null, 2)}</pre>;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ qa?: string }> }) {
  await requireAdminPage();
  const c = await getAdminI18n();
  const { t } = c;
  const { qa } = await searchParams;
  const showQa = qa === "1";
  const all = await listAudit(createAdminClient(), 200);
  const hiddenQa = all.filter((r) => r.qaReason).length;
  // TASK 032 QA/test entries are append-only (they can never be removed) so they are hidden by default, never counted anywhere, and badged when shown.
  const rows = showQa ? all : all.filter((r) => !r.qaReason);
  return (
    <>
      <PageHeader title={t("auTitle")}>{t("auIntro")}</PageHeader>
      {hiddenQa > 0 || showQa ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <FilterLinks base="/admin/billing/audit" param="qa" current={showQa ? "1" : undefined} label={t("filterAria")} options={[["", t("auFilterReal")], ["1", t("auFilterQa", { count: hiddenQa })]]} />
        </div>
      ) : null}
      {rows.length === 0 ? <EmptyRow>{t("auEmpty")}</EmptyRow> : (
        <RTable caption={t("auCaption")}>
          <RHead cols={[t("colTime"), t("colAdmin"), t("colAction"), t("colTarget"), t("colReason"), t("colDetails")]} />
          <RBody>
            {rows.map((r) => (
              <RRow key={r.id as string}>
                <RCell label={t("colTime")}>{formatUtc(r.created_at, c)}</RCell>
                <RCell label={t("colAdmin")}>{r.adminEmail ?? (r.admin_user_id ? t("accountRemoved") : "-")}</RCell>
                <RCell label={t("colAction")}><code className="font-mono text-xs">{r.action}</code>{r.qaReason ? <span className="ms-2"><Badge tone="warn">{t("auQaBadge")}</Badge></span> : null}</RCell>
                <RCell label={t("colTarget")}>{r.target_type}{r.target_id ? <span className="block break-all font-mono text-xs">{r.target_id}</span> : null}</RCell>
                <RCell label={t("colReason")}>{r.reason ?? "-"}</RCell>
                <RCell label={t("colDetails")} className="md:min-w-48">
                  {r.before_state || r.after_state ? (
                    <details className="w-full text-left">
                      <summary className="cursor-pointer text-sm font-medium underline">{t("auBeforeAfter")}</summary>
                      <div className="mt-2 grid gap-2">
                        <div><p className="text-xs font-semibold">{t("auBefore")}</p><Json value={r.before_state} /></div>
                        <div><p className="text-xs font-semibold">{t("auAfter")}</p><Json value={r.after_state} /></div>
                      </div>
                    </details>
                  ) : "-"}
                </RCell>
              </RRow>
            ))}
          </RBody>
        </RTable>
      )}
    </>
  );
}
