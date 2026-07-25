import { useQueries, useQuery } from "@tanstack/react-query";
import { CircleSlash, FileText, Link2, ShieldAlert, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, WorkDocument } from "../lib/api";
import { Card, CardBody, CardHeader, EmptyState, Lozenge, Metric, MetricStrip, ProgressBar, TableHead } from "./ui";

interface Coverage {
  mode: "requirement" | "test";
  totalItems: number;
  totalRequirements: number;
  covered: number;
  uncovered: number;
  suspect: number;
  uncoveredRows: Array<{ id: string; objectNumber: number; title: string }>;
}

function percentage(covered: number, total: number): number {
  return total === 0 ? 0 : Math.round((covered / total) * 100);
}

export function TestCoveragePage({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const [documentId, setDocumentId] = useState("");

  const documents = useQuery({
    queryKey: ["work-documents", workspaceId],
    queryFn: () => api<WorkDocument[]>(`/workspaces/${workspaceId}/work-documents`),
  });
  const analysable = useMemo(
    () => (documents.data ?? []).filter((document) => document.documentType === "requirement" || document.documentType === "test"),
    [documents.data],
  );
  const activeDocumentId = documentId || analysable[0]?.id || "";

  const summaries = useQueries({
    queries: analysable.map((document) => ({
      queryKey: ["coverage", document.id],
      queryFn: () => api<Coverage>(`/documents/${document.id}/coverage`),
    })),
  });

  const activeIndex = analysable.findIndex((document) => document.id === activeDocumentId);
  const active = activeIndex >= 0 ? summaries[activeIndex]?.data : undefined;
  const activeDocument = analysable[activeIndex];

  const totals = summaries.reduce(
    (accumulator, summary) => {
      const data = summary.data;
      if (!data) return accumulator;
      return {
        items: accumulator.items + data.totalItems,
        covered: accumulator.covered + data.covered,
        uncovered: accumulator.uncovered + data.uncovered,
        suspect: accumulator.suspect + data.suspect,
      };
    },
    { items: 0, covered: 0, uncovered: 0, suspect: 0 },
  );

  if (documents.isLoading) return <div className="p-6 text-sm text-mutedForeground">{t("loading")}</div>;
  if (analysable.length === 0) {
    return (
      <div className="p-6">
        <EmptyState icon={<Target size={20} />} title={t("noRequirementDocuments")} description={t("noTestDocumentsHelp")} />
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-editorBackground p-4">
      <MetricStrip testId="coverage-metrics">
        <Metric label={t("totalItems")} value={totals.items} icon={<FileText size={14} />} tone="primary" />
        <Metric label={t("covered")} value={totals.covered} caption={`${percentage(totals.covered, totals.items)}%`} icon={<Link2 size={14} />} tone="success" />
        <Metric label={t("uncovered")} value={totals.uncovered} icon={<CircleSlash size={14} />} tone="danger" />
        <Metric label={t("suspect")} value={totals.suspect} icon={<ShieldAlert size={14} />} tone="warning" />
        <Metric label={t("documents")} value={analysable.length} icon={<FileText size={14} />} tone="purple" />
      </MetricStrip>

      <Card testId="coverage-by-document">
        <CardHeader title={t("coverageByDocument")} subtitle={t("coverageReport")} />
        <table className="w-full text-left text-sm">
          <TableHead className="border-b border-border bg-surfaceSubtle">
            <tr>
              <th className="px-4 py-2.5">{t("selectDocument")}</th>
              <th className="px-4 py-2.5">{t("totalItems")}</th>
              <th className="px-4 py-2.5 min-w-48">{t("coveragePercent")}</th>
              <th className="px-4 py-2.5">{t("uncovered")}</th>
              <th className="px-4 py-2.5">{t("suspect")}</th>
            </tr>
          </TableHead>
          <tbody>
            {analysable.map((document, index) => {
              const summary = summaries[index];
              const data = summary?.data;
              const share = data ? percentage(data.covered, data.totalItems) : 0;
              return (
                <tr
                  key={document.id}
                  data-testid={`coverage-row-${document.id}`}
                  className={`cursor-pointer border-b border-border last:border-b-0 transition-colors hover:bg-muted/40 ${document.id === activeDocumentId ? "bg-primary/5" : ""}`}
                  onClick={() => setDocumentId(document.id)}
                >
                  <td className="px-4 py-2.5">
                    <span className="flex min-w-0 items-center gap-2">
                      <FileText size={14} className="shrink-0 text-mutedForeground" />
                      <span className="min-w-0 truncate font-medium">{document.title}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{data?.totalItems ?? "-"}</td>
                  <td className="px-4 py-2.5">
                    {summary?.isLoading ? <span className="text-xs text-mutedForeground">{t("loading")}</span> : <ProgressBar value={share} label={`${share}%`} />}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{data ? data.uncovered : "-"}</td>
                  <td className="px-4 py-2.5">
                    {data && data.suspect > 0 ? <Lozenge appearance="warning">{data.suspect}</Lozenge> : <span className="text-mutedForeground">0</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {active && activeDocument && (
        <Card testId="coverage-detail">
          <CardHeader
            title={activeDocument.title}
            subtitle={t(active.mode === "test" ? "unlinkedTests" : "uncoveredRowsTitle")}
            badge={<Lozenge appearance={active.uncovered === 0 ? "success" : "danger"}>{`${percentage(active.covered, active.totalItems)}%`}</Lozenge>}
          />
          {active.uncoveredRows.length === 0 ? (
            <CardBody><p className="text-sm text-mutedForeground">{t("allCovered")}</p></CardBody>
          ) : (
            <div>
              {active.uncoveredRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  data-testid={`uncovered-row-${row.objectNumber}`}
                  className="flex w-full items-center gap-3 border-b border-border/70 px-4 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-muted"
                  onClick={() => window.dispatchEvent(new CustomEvent("docsys:open-document-row", { detail: { document: activeDocument, rowId: row.id } }))}
                >
                  <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-primary">{row.objectNumber}</span>
                  <span className="min-w-0 flex-1 truncate">{row.title || t("untitledSection")}</span>
                  <CircleSlash size={14} className="shrink-0 text-destructive" />
                </button>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
