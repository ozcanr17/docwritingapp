import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, FileText, FlaskConical, Link2, ListChecks, Play, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, OutlineRow, TestExecution, WorkDocument } from "../lib/api";
import { Card, CardBody, CardHeader, EmptyState, Lozenge, LozengeAppearance, Metric, MetricStrip, TableHead } from "./ui";

type ExecutionStatus = TestExecution["status"];

const statusAppearance: Record<ExecutionStatus, LozengeAppearance> = {
  not_run: "neutral",
  running: "primary",
  passed: "success",
  failed: "danger",
  blocked: "warning",
  skipped: "neutral",
};

function isScenario(row: OutlineRow): boolean {
  return row.rowType === "heading" || row.rowType === "test_case";
}

function stepDescendantCount(rows: OutlineRow[], scenarioId: string): number {
  const byParent = new Map<string, OutlineRow[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    const bucket = byParent.get(row.parentId);
    if (bucket) bucket.push(row);
    else byParent.set(row.parentId, [row]);
  }
  let total = 0;
  const walk = (parentId: string) => {
    for (const child of byParent.get(parentId) ?? []) {
      if (child.rowType === "test_step") total += 1;
      walk(child.id);
    }
  };
  walk(scenarioId);
  return total;
}

export function TestRepositoryPage({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [selected, setSelected] = useState<{ documentId: string; rowId: string | null }>({ documentId: "", rowId: null });
  const [tab, setTab] = useState<"coverage" | "executions">("coverage");

  const documents = useQuery({
    queryKey: ["work-documents", workspaceId],
    queryFn: () => api<WorkDocument[]>(`/workspaces/${workspaceId}/work-documents`),
  });
  const testDocuments = useMemo(
    () => (documents.data ?? []).filter((document) => document.documentType === "test"),
    [documents.data],
  );

  const activeDocumentId = selected.documentId || testDocuments[0]?.id || "";
  const outline = useQuery({
    queryKey: ["outline", activeDocumentId],
    queryFn: () => api<OutlineRow[]>(`/documents/${activeDocumentId}/outline`),
    enabled: activeDocumentId !== "",
  });
  const executions = useQuery({
    queryKey: ["document-executions", activeDocumentId],
    queryFn: () => api<Array<TestExecution & { rowId: string }>>(`/documents/${activeDocumentId}/executions`),
    enabled: activeDocumentId !== "",
  });

  const rows = outline.data ?? [];
  const scenarios = rows.filter(isScenario);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleScenarios = normalizedQuery
    ? scenarios.filter((scenario) =>
        [scenario.title, scenario.displayNumber, ...rows.filter((row) => row.parentId === scenario.id).map((row) => `${row.title} ${row.action ?? ""}`)]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedQuery),
      )
    : scenarios;

  const latestByRow = useMemo(() => {
    const map = new Map<string, TestExecution>();
    for (const execution of executions.data ?? []) {
      const current = map.get(execution.rowId);
      if (!current || new Date(execution.createdAt) > new Date(current.createdAt)) map.set(execution.rowId, execution);
    }
    return map;
  }, [executions.data]);

  const selectedRow = rows.find((row) => row.id === selected.rowId) ?? null;
  const selectedExecution = selected.rowId ? latestByRow.get(selected.rowId) ?? null : null;
  const rowExecutions = (executions.data ?? []).filter((execution) => execution.rowId === selected.rowId);

  const passed = [...latestByRow.values()].filter((execution) => execution.status === "passed").length;
  const failed = [...latestByRow.values()].filter((execution) => execution.status === "failed").length;
  const executedRows = latestByRow.size;

  if (documents.isLoading) return <div className="p-6 text-sm text-mutedForeground">{t("loading")}</div>;
  if (testDocuments.length === 0) {
    return (
      <div className="p-6">
        <EmptyState icon={<FlaskConical size={20} />} title={t("noTestDocuments")} description={t("noTestDocumentsHelp")} />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-editorBackground">
      <div className="shrink-0 space-y-4 p-4 pb-0">
        <MetricStrip testId="test-repository-metrics">
          <Metric label={t("testScenarios")} value={scenarios.length} caption={`${rows.length} ${t("testSteps")}`} icon={<ListChecks size={14} />} tone="primary" />
          <Metric label={t("testExecutions")} value={executions.data?.length ?? 0} caption={`${executedRows} ${t("testScenarios")}`} icon={<Play size={14} />} tone="info" />
          <Metric label={t("workHub.passedExecutions")} value={passed} icon={<ListChecks size={14} />} tone="success" />
          <Metric label={t("workHub.failedExecutions")} value={failed} icon={<ListChecks size={14} />} tone="danger" />
          <Metric label={t("documents")} value={testDocuments.length} icon={<FileText size={14} />} tone="purple" />
        </MetricStrip>
      </div>
      <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Card className="flex min-h-0 flex-col" testId="test-repository-tree">
          <CardHeader title={t("testRepository")} subtitle={t("testRepositoryHelp")} />
          <div className="shrink-0 border-b border-border/70 p-2.5">
            <label className="flex items-center gap-2 rounded-md border border-border bg-editorBackground px-2.5 py-1.5">
              <Search size={14} className="shrink-0 text-mutedForeground" />
              <input
                data-testid="test-repository-search"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                placeholder={t("searchTests")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {testDocuments.map((document) => {
              const isActive = document.id === activeDocumentId;
              return (
                <div key={document.id}>
                  <button
                    type="button"
                    data-testid={`repository-document-${document.id}`}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${isActive ? "bg-primary/8 font-medium text-primary" : ""}`}
                    onClick={() => setSelected({ documentId: document.id, rowId: null })}
                  >
                    <FileText size={14} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{document.title}</span>
                  </button>
                  {isActive && (
                    <div className="pb-1">
                      {outline.isLoading && <div className="px-8 py-2 text-xs text-mutedForeground">{t("loading")}</div>}
                      {visibleScenarios.map((scenario) => {
                        const steps = rows.filter((row) => row.parentId === scenario.id && row.rowType === "test_step");
                        const totalSteps = stepDescendantCount(rows, scenario.id);
                        const open = expanded.includes(scenario.id);
                        const execution = latestByRow.get(scenario.id);
                        return (
                          <div key={scenario.id}>
                            <div className="flex items-center gap-1 pr-2" style={{ paddingLeft: 8 + scenario.depth * 12 }}>
                              <button
                                type="button"
                                aria-label={open ? t("collapseAllGroups") : t("expandAllGroups")}
                                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-mutedForeground hover:bg-muted"
                                onClick={() => setExpanded((current) => open ? current.filter((id) => id !== scenario.id) : [...current, scenario.id])}
                              >
                                {steps.length > 0 ? (open ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span className="h-1 w-1 rounded-full bg-border" />}
                              </button>
                              <button
                                type="button"
                                data-testid={`repository-scenario-${scenario.displayNumber}`}
                                className={`flex min-w-0 flex-1 items-center gap-2 rounded px-1.5 py-1.5 text-left text-[13px] transition-colors hover:bg-muted ${selected.rowId === scenario.id ? "bg-primary/10 font-medium text-primary" : ""}`}
                                onClick={() => setSelected({ documentId: document.id, rowId: scenario.id })}
                              >
                                <span className="shrink-0 tabular-nums text-mutedForeground">{scenario.displayNumber}</span>
                                <span className="min-w-0 flex-1 truncate">{scenario.title || t("untitledSection")}</span>
                                {execution ? (
                                  <Lozenge appearance={statusAppearance[execution.status]}>{t(`executionStatus.${execution.status}`)}</Lozenge>
                                ) : totalSteps > 0 ? (
                                  <span className="shrink-0 text-[11px] tabular-nums text-mutedForeground">{totalSteps}</span>
                                ) : null}
                              </button>
                            </div>
                            {open && steps.map((step) => (
                              <button
                                key={step.id}
                                type="button"
                                data-testid={`repository-step-${step.displayNumber}`}
                                className={`flex w-full items-center gap-2 py-1.5 pr-3 text-left text-xs transition-colors hover:bg-muted ${selected.rowId === step.id ? "bg-primary/10 font-medium text-primary" : "text-mutedForeground"}`}
                                style={{ paddingLeft: 34 + scenario.depth * 12 }}
                                onClick={() => setSelected({ documentId: document.id, rowId: step.id })}
                              >
                                <span className="shrink-0 tabular-nums">{step.stepNumber ?? ""}</span>
                                <span className="min-w-0 flex-1 truncate">{step.action || step.title || t("untitledSection")}</span>
                              </button>
                            ))}
                          </div>
                        );
                      })}
                      {!outline.isLoading && visibleScenarios.length === 0 && (
                        <div className="px-8 py-2 text-xs text-mutedForeground">{t("noSearchResults")}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {selectedRow ? (
          <Card className="flex min-h-0 flex-col" testId="test-repository-detail">
            <CardHeader
              title={selectedRow.title || selectedRow.action || t("untitledSection")}
              subtitle={`${selectedRow.displayNumber} · ${t(selectedRow.rowType === "test_step" ? "typeTestStep" : "typeHeading")}`}
              icon={<FlaskConical size={15} className="text-primary" />}
              badge={
                <Lozenge appearance={selectedExecution ? statusAppearance[selectedExecution.status] : "neutral"}>
                  {selectedExecution ? t(`executionStatus.${selectedExecution.status}`) : t("notExecuted")}
                </Lozenge>
              }
            />
            <div role="tablist" aria-label={t("testRepository")} className="flex shrink-0 gap-1 border-b border-border/70 px-3 py-1.5">
              {(["coverage", "executions"] as const).map((candidate) => (
                <button
                  key={candidate}
                  role="tab"
                  aria-selected={tab === candidate}
                  data-testid={`test-detail-tab-${candidate}`}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${tab === candidate ? "bg-primary/10 text-primary" : "text-mutedForeground hover:bg-muted hover:text-foreground"}`}
                  onClick={() => setTab(candidate)}
                >
                  {t(candidate === "coverage" ? "coverageTab" : "executionsTab")}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {tab === "coverage" && (
                <CardBody className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Link2 size={14} className="text-mutedForeground" />
                    <span className="font-medium">{t("linkedRequirementsCount")}</span>
                    <Lozenge appearance={selectedRow.linkedRequirements.length ? "success" : "warning"}>
                      {selectedRow.linkedRequirements.length}
                    </Lozenge>
                  </div>
                  {selectedRow.linkedRequirements.length === 0 ? (
                    <p className="text-sm text-mutedForeground">{t("noLinkedRequirements")}</p>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-border">
                      {selectedRow.linkedRequirements.map((requirement) => (
                        <div key={requirement.id} className="flex items-start gap-3 border-b border-border/70 px-3 py-2 text-sm last:border-b-0">
                          <span className="shrink-0 font-mono text-xs text-primary">{requirement.requirementNo ?? "-"}</span>
                          <span className="min-w-0 flex-1">{requirement.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedRow.expectedResult && (
                    <div className="rounded-lg border border-border bg-surfaceSubtle p-3 text-sm">
                      <div className="text-xs font-medium text-mutedForeground">{t("expectedResult")}</div>
                      <p className="mt-1 whitespace-pre-wrap">{selectedRow.expectedResult}</p>
                    </div>
                  )}
                </CardBody>
              )}
              {tab === "executions" && (
                rowExecutions.length === 0 ? (
                  <CardBody><p className="text-sm text-mutedForeground">{t("noExecutions")}</p></CardBody>
                ) : (
                  <table className="w-full text-left text-sm">
                    <TableHead className="border-b border-border bg-surfaceSubtle">
                      <tr>
                        <th className="px-4 py-2.5">{t("status")}</th>
                        <th className="px-4 py-2.5">{t("stepResults")}</th>
                        <th className="px-4 py-2.5">{t("workHub.environment")}</th>
                        <th className="px-4 py-2.5">{t("createdOn")}</th>
                      </tr>
                    </TableHead>
                    <tbody>
                      {rowExecutions.map((execution) => {
                        const passedSteps = execution.steps.filter((step) => step.status === "passed").length;
                        return (
                          <tr key={execution.id} className="border-b border-border last:border-b-0" data-testid={`execution-row-${execution.id}`}>
                            <td className="px-4 py-2.5"><Lozenge appearance={statusAppearance[execution.status]}>{t(`executionStatus.${execution.status}`)}</Lozenge></td>
                            <td className="px-4 py-2.5 tabular-nums">{passedSteps} / {execution.steps.length}</td>
                            <td className="px-4 py-2.5 text-mutedForeground">{execution.environment || "-"}</td>
                            <td className="px-4 py-2.5 text-mutedForeground">{new Date(execution.createdAt).toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )
              )}
            </div>
          </Card>
        ) : (
          <Card className="flex min-h-0 items-center justify-center">
            <EmptyState icon={<FlaskConical size={20} />} title={t("selectTestItem")} description={t("selectTestItemHelp")} />
          </Card>
        )}
      </div>
    </div>
  );
}
