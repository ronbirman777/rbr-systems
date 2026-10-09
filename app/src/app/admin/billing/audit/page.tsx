import { requireAdminPage } from "@/lib/billing/admin/auth";
import { listAudit } from "@/lib/billing/admin/queries";
import { formatUtc } from "@/lib/billing/admin/ui/labels";
import { createAdminClient } from "@/lib/supabase/admin";
import { EmptyRow, PageHeader, RBody, RCell, RHead, RRow, RTable } from "../../_components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit - InnerDweS Admin" };

function Json({ value }: { value: unknown }) {
  return <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-idw-linen/70 p-2 text-left text-xs">{JSON.stringify(value, null, 2)}</pre>;
}

export default async function AuditPage() {
  await requireAdminPage();
  const rows = await listAudit(createAdminClient(), 200);
  return (
    <>
      <PageHeader title="Audit log">Every Admin change, newest first. The log is append-only and secrets are redacted before they are stored.</PageHeader>
      {rows.length === 0 ? <EmptyRow>No Admin changes recorded yet.</EmptyRow> : (
        <RTable caption="Admin audit log">
          <RHead cols={["Time", "Admin", "Action", "Target", "Reason", "Details"]} />
          <RBody>
            {rows.map((r) => (
              <RRow key={r.id as string}>
                <RCell label="Time">{formatUtc(r.created_at)}</RCell>
                <RCell label="Admin">{r.adminEmail ?? (r.admin_user_id ? "(account removed)" : "-")}</RCell>
                <RCell label="Action"><code className="font-mono text-xs">{r.action}</code></RCell>
                <RCell label="Target">{r.target_type}{r.target_id ? <span className="block break-all font-mono text-xs">{r.target_id}</span> : null}</RCell>
                <RCell label="Reason">{r.reason ?? "-"}</RCell>
                <RCell label="Details" className="md:min-w-48">
                  {r.before_state || r.after_state ? (
                    <details className="w-full text-left">
                      <summary className="cursor-pointer text-sm font-medium underline">Before / after</summary>
                      <div className="mt-2 grid gap-2">
                        <div><p className="text-xs font-semibold">Before</p><Json value={r.before_state} /></div>
                        <div><p className="text-xs font-semibold">After</p><Json value={r.after_state} /></div>
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
