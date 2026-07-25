import { useQuery } from "@tanstack/react-query";
import { FileText, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, WorkDocument } from "../lib/api";
import { TraceMatrixRow } from "./TraceabilityGraph";
import { Card, CardBody, CardHeader, EmptyState, Lozenge, Metric, MetricStrip, ProgressBar } from "./ui";

type Direction = "requirement_to_test" | "test_to_requirement";

interface ReverseRequirement {
  linkId: string;
  suspect: boolean;
  linkType: string;
  requirementId: string;
  requirementNo: string | null;
  requirementTitle: string;
  requirementDocument: { id: string; title: string; documentType: string };
}

interface ReverseRow {
  id: string;
  objectNumber: number | null;
  title: string;
  document: { id: string; title: string; documentType: string };
  requirements: ReverseRequirement[];
}

interface MatrixCell {
  key: string;
  label: string;
  document: { id: string; title: string; documentType: string };
  rowId: string;
}

interface MatrixModel {
  rows: Array<{ id: string; label: string; caption: string; documentId: string; cells: Map<string, { suspect: boolean }> }>;
  columns: MatrixCell[];
}

function buildForward(rows: TraceMatrixRow[]): MatrixModel {
  const columns = new Map<string, MatrixCell>();
  const model: MatrixModel["rows"] = rows.map((row) => {
    const cells = new Map<string, { suspect: boolean }>();
    for (const link of row.links) {
      const key = link.sourceScenarioId ?? link.sourceId;
      if (!columns.has(key)) {
        columns.set(key, {
          key,
          label: link.sourceTitle || key.slice(0, 8),
          document: link.sourceDocument,
          rowId: link.sourceScenarioId ?? link.sourceId,
        });
      }
      const existing = cells.get(key);
      cells.set(key, { suspect: (existing?.suspect ?? false) || link.suspect });
    }
    return {
      id: row.id,
      label: row.requirementNo ?? (row.objectNumber ? `ID ${row.objectNumber}` : row.title),
      caption: row.title,
      documentId: "",
      cells,
    };
  });
  return { rows: model, columns: [...columns.values()] };
}

function buildReverse(rows: ReverseRow[]): MatrixModel {
  const columns = new Map<string, MatrixCell>();
  const model: MatrixModel["rows"] = rows.map((row) => {
    const cells = new Map<string, { suspect: boolean }>();
    for (const requirement of row.requirements) {
      const key = requirement.requirementId;
      if (!columns.has(key)) {
        columns.set(key, {
          key,
          label: requirement.requirementNo ?? requirement.requirementTitle,
          document: requirement.requirementDocument,
          rowId: requirement.requirementId,
        });
      }
      const existing = cells.get(key);
      cells.set(key, { suspect: (existing?.suspect ?? false) || requirement.suspect });
    }
    return {
      id: row.id,
      label: row.objectNumber ? `ID ${row.objectNumber}` : row.title,
      caption: row.title,
      documentId: row.document.id,
      cells,
    };
  });
  return { rows: model, columns: [...columns.values()] };
}

export function TraceabilityMatrixPage({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const [documentId, setDocumentId] = useState("");
  const [direction, setDirection] = useState<Direction>("requirement_to_test");
  const [query, setQuery] = useState("");
  const [suspectOnly, setSuspectOnly] = useState(false);

  const documents = useQuery({
    queryKey: ["work-documents", workspaceId],
    queryFn: () => api<WorkDocument[]>(`/workspaces/${workspaceId}/work-documents`),
  });
  const analysable = useMemo(
    () => (documents.data ?? []).filter((document) => document.documentType === "requirement" || document.documentType === "test"),
    [documents.data],
  );
  const activeDocumentId = documentId || analysable[0]?.id || "";

  const forward = useQuery({
    queryKey: ["matrix", activeDocumentId, "requirement_to_test"],
    queryFn: () => api<TraceMatrixRow[]>(`/documents/${activeDocumentId}/traceability`),
    enabled: activeDocumentId !== "" && direction === "requirement_to_test",
  });
  const reverse = useQuery({
    queryKey: ["matrix", activeDocumentId, "test_to_requirement"],
    queryFn: () => api<ReverseRow[]>(`/documents/${activeDocumentId}/traceability?direction=test_to_requirement`),
    enabled: activeDocumentId !== "" && direction === "test_to_requirement",
  });

  const loading = direction === "requirement_to_test" ? forward.isLoading : reverse.isLoading;
  const model = useMemo(() => {
    const base = direction === "requirement_to_test" ? buildForward(forward.data ?? []) : buildReverse(reverse.data ?? []);
    const normalized = query.trim().toLocaleLowerCase();
    const rows = base.rows.filter((row) => {
      const matchesQuery = !normalized || `${row.label} ${row.caption}`.toLocaleLowerCase().includes(normalized);
      const matchesSuspect = !suspectOnly || [...row.cells.values()].some((cell) => cell.suspect);
      return matchesQuery && matchesSuspect;
    });
    const usedColumns = new Set<string>();
    for (const row of rows) for (const [key, cell] of row.cells) if (!suspectOnly || cell.suspect) usedColumns.add(key);
    return { rows, columns: base.columns.filter((column) => usedColumns.has(column.key)) };
  }, [direction, forward.data, query, reverse.data, suspectOnly]);

  const linkedRows = model.rows.filter((row) => row.cells.size > 0).length;
  const totalLinks = model.rows.reduce((sum, row) => sum + row.cells.size, 0);
  const suspectLinks = model.rows.reduce((sum, row) => sum + [...row.cells.values()].filter((cell) => cell.suspect).length, 0);

  const openRow = (targetDocumentId: string, rowId: string) => {
    const target = analysable.find((document) => document.id === targetDocumentId) ?? analysable.find((document) => document.id === activeDocumentId);
    if (target) window.dispatchEvent(new CustomEvent("docsys:open-document-row", { detail: { document: target, rowId } }));
  };

  if (documents.isLoading) return <div className="p-6 text-sm text-mutedForeground">{t("loading")}</div>;
  if (analysable.length === 0) {
    return <div className="p-6"><EmptyState icon={<FileText size={20} />} title={t("noRequirementDocuments")} description={t("noTestDocumentsHelp")} /></div>;
  }

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-auto bg-editorBackground p-4">
      <MetricStrip testId="matrix-metrics">
        <Metric label={t("matrixRowsCovered")} value={linkedRows} caption={`${model.rows.length} ${t("totalItems")}`} tone="primary" />
        <Metric label={t("matrixColumnsUsed")} value={model.columns.length} tone="info" />
        <Metric label={t("links")} value={totalLinks} tone="success" />
        <Metric label={t("suspect")} value={suspectLinks} tone="warning" />
        <Metric label={t("documents")} value={analysable.length} tone="purple" />
      </MetricStrip>

      <Card testId="matrix-controls">
        <CardHeader title={t("traceabilityMatrix")} subtitle={t("matrixLegend")} />
        <CardBody className="flex flex-wrap items-end gap-3">
          <label className="min-w-56 flex-1 text-sm">
            <span className="mb-1 block text-xs font-medium text-mutedForeground">{t("selectDocument")}</span>
            <select
              data-testid="matrix-document"
              className="w-full rounded-md border border-border bg-editorBackground px-2 py-1.5 text-sm outline-none"
              value={activeDocumentId}
              onChange={(event) => setDocumentId(event.target.value)}
            >
              {analysable.map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}
            </select>
          </label>
          <label className="min-w-48 text-sm">
            <span className="mb-1 block text-xs font-medium text-mutedForeground">{t("matrixDirection")}</span>
            <select
              data-testid="matrix-direction"
              className="w-full rounded-md border border-border bg-editorBackground px-2 py-1.5 text-sm outline-none"
              value={direction}
              onChange={(event) => setDirection(event.target.value as Direction)}
            >
              <option value="requirement_to_test">{t("requirementToTest")}</option>
              <option value="test_to_requirement">{t("testToRequirement")}</option>
            </select>
          </label>
          <label className="min-w-48 flex-1 text-sm">
            <span className="mb-1 block text-xs font-medium text-mutedForeground">{t("searchPlaceholder")}</span>
            <span className="flex items-center gap-2 rounded-md border border-border bg-editorBackground px-2.5 py-1.5">
              <Search size={14} className="shrink-0 text-mutedForeground" />
              <input
                data-testid="matrix-search"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </span>
          </label>
          <button
            type="button"
            data-testid="matrix-suspect-only"
            aria-pressed={suspectOnly}
            className={`h-8 rounded-md border px-3 text-sm ${suspectOnly ? "border-warning/50 bg-warning/12 text-warning" : "border-border text-foreground/80 hover:bg-muted"}`}
            onClick={() => setSuspectOnly((current) => !current)}
          >
            {t("suspectOnly")}
          </button>
        </CardBody>
        {model.rows.length > 0 && (
          <CardBody className="grid gap-3 border-t border-border/70 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs text-mutedForeground">{t("matrixRowsCovered")}</div>
              <ProgressBar value={model.rows.length === 0 ? 0 : (linkedRows / model.rows.length) * 100} label={`${Math.round(model.rows.length === 0 ? 0 : (linkedRows / model.rows.length) * 100)}%`} />
            </div>
            <div>
              <div className="mb-1 text-xs text-mutedForeground">{t("suspect")}</div>
              <ProgressBar
                value={totalLinks === 0 ? 0 : (suspectLinks / totalLinks) * 100}
                label={`${suspectLinks} / ${totalLinks}`}
              />
            </div>
          </CardBody>
        )}
      </Card>

      {loading ? (
        <Card><CardBody><p className="text-sm text-mutedForeground">{t("loading")}</p></CardBody></Card>
      ) : model.columns.length === 0 ? (
        <Card><EmptyState icon={<FileText size={20} />} title={t("noMatrixData")} description={t("noMatrixDataHelp")} /></Card>
      ) : (
        <Card testId="matrix-grid">
          <div className="overflow-auto">
            <table className="border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-56 border-b border-r border-border bg-surfaceSubtle px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-mutedForeground">
                    {t(direction === "requirement_to_test" ? "requirements" : "tests")}
                  </th>
                  {model.columns.map((column) => (
                    <th key={column.key} className="border-b border-r border-border bg-surfaceSubtle p-0 align-bottom">
                      <button
                        type="button"
                        title={column.label}
                        className="flex h-36 w-9 items-end justify-center pb-2 text-left hover:bg-muted"
                        onClick={() => openRow(column.document.id, column.rowId)}
                      >
                        <span className="max-h-32 max-w-32 truncate text-xs text-foreground/80 [writing-mode:vertical-rl] [transform:rotate(180deg)]">{column.label}</span>
                      </button>
                    </th>
                  ))}
                  <th className="border-b border-border bg-surfaceSubtle px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-mutedForeground">#</th>
                </tr>
              </thead>
              <tbody>
                {model.rows.map((row) => (
                  <tr key={row.id} data-testid={`matrix-row-${row.id}`}>
                    <th className="sticky left-0 z-10 min-w-56 max-w-72 border-b border-r border-border bg-surface px-3 py-1.5 text-left font-normal">
                      <button type="button" className="block w-full min-w-0 text-left hover:text-primary" onClick={() => openRow(row.documentId || activeDocumentId, row.id)}>
                        <span className="block truncate font-mono text-xs text-primary">{row.label}</span>
                        <span className="block truncate text-xs text-mutedForeground">{row.caption}</span>
                      </button>
                    </th>
                    {model.columns.map((column) => {
                      const cell = row.cells.get(column.key);
                      const visible = cell && (!suspectOnly || cell.suspect);
                      return (
                        <td key={column.key} className="border-b border-r border-border p-0 text-center">
                          <span className="flex h-8 w-9 items-center justify-center">
                            {visible && (
                              <span
                                title={cell.suspect ? t("suspect") : t("links")}
                                className={`h-2.5 w-2.5 rounded-full ${cell.suspect ? "bg-warning" : "bg-primary"}`}
                              />
                            )}
                          </span>
                        </td>
                      );
                    })}
                    <td className="border-b border-border px-2 text-center text-xs tabular-nums text-mutedForeground">
                      {suspectOnly ? [...row.cells.values()].filter((cell) => cell.suspect).length : row.cells.size}
                    </td>
                  </tr>
                ))}
                <tr>
                  <th className="sticky left-0 z-10 border-r border-border bg-surfaceSubtle px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-mutedForeground">#</th>
                  {model.columns.map((column) => {
                    const count = model.rows.filter((row) => {
                      const cell = row.cells.get(column.key);
                      return cell && (!suspectOnly || cell.suspect);
                    }).length;
                    return (
                      <td key={column.key} className="border-r border-border bg-surfaceSubtle text-center text-xs tabular-nums text-mutedForeground">
                        {count}
                      </td>
                    );
                  })}
                  <td className="bg-surfaceSubtle text-center text-xs font-semibold tabular-nums">
                    {suspectOnly ? suspectLinks : totalLinks}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {suspectLinks > 0 && (
            <CardBody className="border-t border-border/70 py-2.5">
              <Lozenge appearance="warning">{`${suspectLinks} ${t("suspect")}`}</Lozenge>
            </CardBody>
          )}
        </Card>
      )}
    </div>
  );
}
