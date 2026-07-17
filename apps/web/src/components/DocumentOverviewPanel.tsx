import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileText, Link2, ListTree, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api, DashboardSummary, DocumentSummary, OutlineRow } from "../lib/api";

export function DocumentOverviewPanel({ documentId, onClose }: { documentId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const document = useQuery({ queryKey: ["document", documentId], queryFn: () => api<DocumentSummary>(`/documents/${documentId}`) });
  const outline = useQuery({ queryKey: ["outline", documentId], queryFn: () => api<OutlineRow[]>(`/documents/${documentId}/outline`) });
  const dashboard = useQuery({ queryKey: ["dashboard", documentId], queryFn: () => api<DashboardSummary>(`/documents/${documentId}/dashboard`) });
  const rows = outline.data ?? [];
  const linkedRows = rows.filter((row) => row.linkCount > 0).length;
  const headings = rows.filter((row) => row.rowType === "heading").length;
  return <div data-testid="document-overview-panel" className="flex min-h-0 flex-1 flex-col">
    <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
      <div className="min-w-0"><div className="text-xs font-semibold uppercase tracking-wider text-mutedForeground">{t("documentOverview")}</div><h2 className="mt-1 truncate font-semibold">{document.data?.title ?? t("loading")}</h2></div>
      <button type="button" className="rounded-md p-1.5 text-mutedForeground hover:bg-muted hover:text-foreground" aria-label={t("closeDetailsPanel")} onClick={onClose}><X size={16} /></button>
    </header>
    <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
      <p className="text-sm leading-6 text-mutedForeground">{t("documentOverviewHelp")}</p>
      <div className="grid grid-cols-2 gap-2">
        <OverviewStat icon={<ListTree size={15} />} label={t("totalObjects")} value={rows.length} />
        <OverviewStat icon={<FileText size={15} />} label={t("headings")} value={headings} />
        <OverviewStat icon={<Link2 size={15} />} label={t("linkedObjects")} value={linkedRows} />
        <OverviewStat icon={dashboard.data?.qualityIssues ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />} label={t("qualityScore")} value={`${dashboard.data?.qualityScore ?? "-"}%`} tone={dashboard.data?.qualityIssues ? "warning" : "success"} />
      </div>
      {dashboard.data && <section className="rounded-xl border border-border bg-editorBackground p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-mutedForeground">{t("coverageAndQuality")}</h3>
        <dl className="mt-3 space-y-2 text-sm">
          <OverviewLine label={t("coveredRequirements")} value={`${dashboard.data.coveredRequirements}/${dashboard.data.requirements}`} />
          <OverviewLine label={t("qualityIssues")} value={dashboard.data.qualityIssues} />
          <OverviewLine label={t("suspectLinks")} value={dashboard.data.suspectLinks} />
          <OverviewLine label={t("incompleteTests")} value={dashboard.data.incompleteTests} />
        </dl>
      </section>}
    </div>
  </div>;
}

function OverviewStat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone?: "warning" | "success" }) {
  return <div className="rounded-xl border border-border bg-editorBackground p-3"><div className={`flex items-center gap-1.5 text-xs ${tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "text-mutedForeground"}`}>{icon}{label}</div><div className="mt-2 text-xl font-semibold tabular-nums">{value}</div></div>;
}

function OverviewLine({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3"><dt className="text-mutedForeground">{label}</dt><dd className="font-medium tabular-nums">{value}</dd></div>;
}
