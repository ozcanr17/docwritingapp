import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, FileText, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ImpactAnalysis, ReleaseReadinessReport, RetestPackage } from "../lib/api";
import { storedLanguage } from "../lib/i18n";
import { useToastStore } from "../stores/toasts";
import { useSelectionStore } from "../stores/selection";
import { TraceabilityGraph, TraceMatrixRow } from "./TraceabilityGraph";
import { ReleaseReadinessPanel } from "./ReleaseReadinessPanel";
import { BaselineDiffData, BaselineDiffView } from "./BaselineDiffView";
import { OperationImpactSummary } from "./OperationImpactSummary";

interface ReportsDialogProps {
  documentId: string;
  tab: "readiness" | "baselines" | "coverage" | "matrix" | "reviews" | "runs";
  onClose: () => void;
}

interface Baseline {
  id: string;
  revisionNumber: number;
  semanticVersion: string;
  label: string | null;
  createdAt: string;
  rowCount: number;
}

interface TestExecution {
  id: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  environment: string | null;
  testCaseRow: { id: string; title: string; objectNumber: number };
  executedBy: { id: string; displayName: string };
  steps: Array<{ id: string; status: string }>;
}

interface Coverage {
  mode: "requirement" | "test";
  totalItems: number;
  totalRequirements: number;
  covered: number;
  uncovered: number;
  suspect: number;
  uncoveredRows: { id: string; objectNumber: number; title: string }[];
}

interface Review {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueAt: string | null;
  baselineRevisionNumber: number | null;
  baselineSemanticVersion: string | null;
  contentHash: string | null;
  reviewers: Array<{ reviewerId: string; reviewer: { displayName: string; email: string } }>;
  decisions: Array<{ id: string; reviewerId: string; decision: string; comment: string | null }>;
}

interface ReverseTraceRequirement {
  linkId: string;
  suspect: boolean;
  linkType: string;
  requirementId: string;
  requirementNo: string | null;
  requirementTitle: string;
  requirementDescription: string | null;
  requirementDocument: { id: string; title: string; documentType: string };
}

interface ReverseTraceMatrixRow {
  id: string;
  objectNumber: number | null;
  title: string;
  document: { id: string; title: string; documentType: string };
  requirements: ReverseTraceRequirement[];
}

async function pollReportExport(jobId: string): Promise<{ ready: boolean; status: string }> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const job = await api<{ status: string; ready: boolean }>(`/exports/${jobId}`);
    if (job.status === "completed" || job.status === "failed") return job;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("timeout");
}

export function ReportsDialog({ documentId, tab, onClose }: ReportsDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const openDetail = useSelectionStore((s) => s.openDetail);
  const [diffRevision, setDiffRevision] = useState<number | null>(null);
  const [baselineLabel, setBaselineLabel] = useState("");
  const [baselineFormOpen, setBaselineFormOpen] = useState(false);
  const [reviewTitle, setReviewTitle] = useState("");
  const [traceMode, setTraceMode] = useState<"graph" | "table">("graph");
  const [traceDirection, setTraceDirection] = useState<"requirement_to_test" | "test_to_requirement">("requirement_to_test");
  const [traceQuery, setTraceQuery] = useState("");
  const [suspectOnly, setSuspectOnly] = useState(false);
  const [impactDepth, setImpactDepth] = useState(1);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const baselines = useQuery({
    queryKey: ["baselines", documentId],
    queryFn: () => api<Baseline[]>(`/documents/${documentId}/baselines`),
    enabled: tab === "baselines" || tab === "reviews",
  });

  const readiness = useQuery({
    queryKey: ["release-readiness", documentId],
    queryFn: () => api<ReleaseReadinessReport>(`/documents/${documentId}/release-readiness`),
    enabled: tab === "readiness" || tab === "baselines",
  });
  const impact = useQuery({
    queryKey: ["impact-analysis", documentId, impactDepth],
    queryFn: () => api<ImpactAnalysis>(`/documents/${documentId}/impact-analysis?depth=${impactDepth}`),
    enabled: tab === "readiness",
  });

  const coverage = useQuery({
    queryKey: ["coverage", documentId],
    queryFn: () => api<Coverage>(`/documents/${documentId}/coverage`),
    enabled: tab === "coverage",
  });

  const diff = useQuery({
    queryKey: ["diff", documentId, diffRevision],
    queryFn: () => api<BaselineDiffData>(`/documents/${documentId}/baselines/${diffRevision}/diff`),
    enabled: diffRevision !== null,
  });

  const matrix = useQuery({
    queryKey: ["matrix", documentId],
    queryFn: () => api<TraceMatrixRow[]>(`/documents/${documentId}/traceability`),
    enabled: tab === "matrix" && traceDirection === "requirement_to_test",
  });
  const reverseMatrix = useQuery({
    queryKey: ["matrix", documentId, "test_to_requirement"],
    queryFn: () => api<ReverseTraceMatrixRow[]>(`/documents/${documentId}/traceability?direction=test_to_requirement`),
    enabled: tab === "matrix" && traceDirection === "test_to_requirement",
  });
  const visibleMatrix = useMemo(() => {
    const normalized = traceQuery.trim().toLocaleLowerCase();
    return (matrix.data ?? []).map((row) => ({
      ...row,
      links: row.links.filter((link) => (!suspectOnly || link.suspect) && (!normalized || `${row.requirementNo ?? ""} ${row.title} ${link.sourceTitle} ${link.sourceDocument.title} ${link.linkType}`.toLocaleLowerCase().includes(normalized))),
    })).filter((row) => row.links.length > 0 || (!suspectOnly && !normalized));
  }, [matrix.data, suspectOnly, traceQuery]);
  const visibleReverseMatrix = useMemo(() => {
    const normalized = traceQuery.trim().toLocaleLowerCase();
    return (reverseMatrix.data ?? []).map((row) => ({
      ...row,
      requirements: row.requirements.filter((requirement) => (!suspectOnly || requirement.suspect) && (!normalized || `${row.title} ${row.document.title} ${requirement.requirementNo ?? ""} ${requirement.requirementTitle} ${requirement.requirementDescription ?? ""}`.toLocaleLowerCase().includes(normalized))),
    })).filter((row) => row.requirements.length > 0 || (!suspectOnly && !normalized));
  }, [reverseMatrix.data, suspectOnly, traceQuery]);
  const profile = useQuery({ queryKey: ["me"], queryFn: () => api<{ id: string }>("/auth/me"), enabled: tab === "reviews" });
  const reviews = useQuery({
    queryKey: ["reviews", documentId],
    queryFn: () => api<Review[]>(`/documents/${documentId}/reviews`),
    enabled: tab === "reviews",
  });
  const runs = useQuery({
    queryKey: ["test-runs", documentId],
    queryFn: () => api<TestExecution[]>(`/documents/${documentId}/executions`),
    enabled: tab === "runs",
  });
  const retestPackages = useQuery({
    queryKey: ["retest-packages", documentId],
    queryFn: () => api<RetestPackage[]>(`/documents/${documentId}/retest-packages`),
    enabled: tab === "runs",
  });

  const createBaseline = useMutation({
    mutationFn: (label: string) => api(`/documents/${documentId}/baselines`, { method: "POST", body: JSON.stringify({ label: label || undefined }) }),
    onSuccess: () => {
      setBaselineLabel("");
      setBaselineFormOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["baselines", documentId] });
      void queryClient.invalidateQueries({ queryKey: ["outline", documentId] });
      void queryClient.invalidateQueries({ queryKey: ["release-readiness", documentId] });
      pushToast("success", t("createBaseline"));
    },
    onError: () => pushToast("error", t("genericError")),
  });
  const stopRun = useMutation({
    mutationFn: (id: string) => api(`/executions/${id}/stop`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["test-runs", documentId] });
      void queryClient.invalidateQueries({ queryKey: ["retest-packages", documentId] });
    },
    onError: () => pushToast("error", t("genericError")),
  });
  const completeRun = useMutation({
    mutationFn: (id: string) => api(`/executions/${id}/complete`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["test-runs", documentId] });
      void queryClient.invalidateQueries({ queryKey: ["retest-packages", documentId] });
    },
    onError: () => pushToast("error", t("completeRunHelp")),
  });
  const createRetestPackage = useMutation({
    mutationFn: (input: { name: string; candidateRowIds: string[]; impactDepth: number }) => api(`/documents/${documentId}/retest-packages`, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["retest-packages", documentId] });
      pushToast("success", t("retestPackageCreated"));
    },
    onError: () => pushToast("error", t("genericError")),
  });
  const startRetestItem = useMutation({
    mutationFn: (input: { rowId: string; packageItemId: string }) => api(`/rows/${input.rowId}/executions`, { method: "POST", body: JSON.stringify({ retestPackageItemId: input.packageItemId }) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["test-runs", documentId] });
      void queryClient.invalidateQueries({ queryKey: ["retest-packages", documentId] });
      pushToast("success", t("runStarted"));
    },
    onError: () => pushToast("error", t("genericError")),
  });
  const cancelRetestPackage = useMutation({
    mutationFn: (packageId: string) => api(`/retest-packages/${packageId}/cancel`, { method: "POST" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["retest-packages", documentId] }),
    onError: () => pushToast("error", t("genericError")),
  });
  const exportTraceability = useMutation({
    mutationFn: async (format: "docx" | "xlsx") => {
      const created = await api<{ id: string }>(`/documents/${documentId}/exports`, {
        method: "POST",
        body: JSON.stringify({
          format,
          locale: storedLanguage(),
          scope: "traceability",
          traceabilityDirection: traceDirection,
        }),
      });
      const job = await pollReportExport(created.id);
      if (!job.ready) throw new Error("failed");
      return (await api<{ url: string }>(`/exports/${created.id}/download`)).url;
    },
    onSuccess: (url) => {
      window.open(url, "_blank");
      pushToast("success", t("exportReady"));
    },
    onError: () => pushToast("error", t("genericError")),
  });
  const createReview = useMutation({
    mutationFn: (title: string) => api(`/documents/${documentId}/reviews`, { method: "POST", body: JSON.stringify({ title, reviewerIds: [profile.data?.id], activate: true }) }),
    onSuccess: () => { setReviewTitle(""); void queryClient.invalidateQueries({ queryKey: ["reviews", documentId] }); },
    onError: () => pushToast("error", t("genericError")),
  });
  const decideReview = useMutation({
    mutationFn: (input: { id: string; decision: string }) => api(`/reviews/${input.id}/decisions`, { method: "POST", body: JSON.stringify({ decision: input.decision }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["reviews", documentId] }),
    onError: () => pushToast("error", t("genericError")),
  });

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        data-testid="reports-dialog"
        className={`max-h-[84vh] overflow-auto rounded-2xl border border-border bg-surface p-5 shadow-2xl ${tab === "matrix" ? "w-[64rem] max-w-[calc(100vw-2rem)]" : tab === "readiness" ? "w-[58rem] max-w-[calc(100vw-2rem)]" : "w-[36rem] max-w-[calc(100vw-2rem)]"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            {tab === "readiness" ? t("releaseReadiness") : tab === "baselines" ? t("baselines") : tab === "coverage" ? t("coverageReport") : tab === "matrix" ? t("traceabilityMatrix") : tab === "runs" ? t("testRuns") : t("reviews")}
          </h2>
          <button data-testid="close-reports" aria-label={t("close")} onClick={onClose} className="rounded p-1 hover:bg-muted">
            <X size={16} />
          </button>
        </div>

        {tab === "baselines" && (
          <div className="space-y-3 text-sm">
            {readiness.data && (
              <div data-testid="baseline-readiness" data-status={readiness.data.status} className={`rounded-xl border p-3 ${readiness.data.status === "ready" ? "border-success/30 bg-success/10" : readiness.data.status === "warning" ? "border-warning/30 bg-warning/10" : "border-destructive/30 bg-destructive/10"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div><div className="text-xs font-medium uppercase tracking-wide text-mutedForeground">{t("releaseReadiness")}</div><div className="mt-0.5 font-medium">{t(`releaseReadinessStatus.${readiness.data.status}`)}</div></div>
                  <div className="text-right"><div className="text-xl font-semibold tabular-nums">{readiness.data.score}</div><div className="text-[10px] uppercase tracking-wide text-mutedForeground">{t("readinessScore")}</div></div>
                </div>
                <div className="mt-2 text-xs text-mutedForeground">{t("baselineReadinessAdvisory", { count: readiness.data.gates.filter((gate) => gate.required && gate.status === "failed").length })}</div>
              </div>
            )}
            <button
              data-testid="create-baseline"
              className="rounded bg-primary px-3 py-1.5 text-xs text-primaryForeground"
              onClick={() => setBaselineFormOpen(true)}
            >
              {t("createBaseline")}
            </button>
            {baselineFormOpen && (
              <form
                className="space-y-3 rounded-xl border border-border bg-editorBackground p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  createBaseline.mutate(baselineLabel.trim());
                }}
              >
                {readiness.data && <OperationImpactSummary
                  description={t("baselineImpactDescription")}
                  metrics={[
                    { key: "rows", label: t("snapshotObjects"), value: readiness.data.counts.rows },
                    { key: "changed", label: t("changedObjects"), value: readiness.data.baseline?.changedRows ?? readiness.data.counts.rows },
                    { key: "removed", label: t("removedObjects"), value: readiness.data.baseline?.removedRows ?? 0 },
                  ]}
                  warning={t("baselineImpactWarning")}
                />}
                <div className="flex items-end gap-2">
                  <label className="min-w-0 flex-1 text-xs text-mutedForeground">
                    {t("baselineLabel")}
                    <input
                      autoFocus
                      data-testid="baseline-label-input"
                      className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-foreground"
                      value={baselineLabel}
                      onChange={(event) => setBaselineLabel(event.target.value)}
                    />
                  </label>
                  <button
                    type="submit"
                    data-testid="baseline-create-submit"
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primaryForeground disabled:opacity-50"
                    disabled={createBaseline.isPending}
                  >
                    {t("create")}
                  </button>
                </div>
              </form>
            )}
            {baselines.data && baselines.data.length === 0 ? (
              <div className="text-mutedForeground">{t("noBaselines")}</div>
            ) : (
              <ul className="divide-y divide-border">
                {baselines.data?.map((b) => (
                  <li key={b.id} className="flex items-center justify-between py-2">
                    <span>
                      <span className="font-medium tabular-nums">v{b.semanticVersion}</span>{b.label ? ` — ${b.label}` : ""}
                      <span className="ml-2 text-xs text-mutedForeground">({b.rowCount})</span>
                    </span>
                    <button
                      data-testid={`diff-baseline-${b.revisionNumber}`}
                      className="text-xs text-primary hover:underline"
                      onClick={() => setDiffRevision(b.revisionNumber)}
                    >
                      {t("diff")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {diff.isLoading && <div className="text-xs text-mutedForeground">{t("loading")}</div>}
            {diff.isError && <div className="text-xs text-destructive">{t("genericError")}</div>}
            {diff.data && <BaselineDiffView data={diff.data} onOpenRow={(rowId) => { onClose(); window.setTimeout(() => openDetail(rowId), 0); }} />}
          </div>
        )}

        {tab === "readiness" && readiness.isLoading && <div className="text-sm text-mutedForeground">{t("loading")}</div>}
        {tab === "readiness" && readiness.isError && <div className="text-sm text-destructive">{t("genericError")}</div>}
        {tab === "readiness" && readiness.data && (
          <ReleaseReadinessPanel
            report={readiness.data}
            impact={impact.data}
            impactDepth={impactDepth}
            creatingPackage={createRetestPackage.isPending}
            onImpactDepthChange={setImpactDepth}
            onCreatePackage={(name, candidateRowIds, depth) => createRetestPackage.mutate({ name, candidateRowIds, impactDepth: depth })}
            onOpenRow={(rowId) => {
              onClose();
              window.setTimeout(() => openDetail(rowId), 0);
            }}
            onOpenCandidate={(candidate) => {
              onClose();
              window.dispatchEvent(new CustomEvent("docsys:open-document-row", { detail: { document: candidate.document, rowId: candidate.rowId } }));
            }}
          />
        )}

        {tab === "coverage" && coverage.data && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-3">
              <Stat label={t(coverage.data.mode === "test" ? "totalTests" : "totalRequirements")} value={coverage.data.totalItems ?? coverage.data.totalRequirements} />
              <Stat label={t(coverage.data.mode === "test" ? "linkedTests" : "covered")} value={coverage.data.covered} tone="text-success" />
              <Stat label={t(coverage.data.mode === "test" ? "unlinkedTests" : "uncovered")} value={coverage.data.uncovered} tone="text-destructive" />
            </div>
            {coverage.data.uncoveredRows.length > 0 && (
              <ul className="divide-y divide-border" data-testid="uncovered-list">
                {coverage.data.uncoveredRows.map((r) => (
                  <li key={r.id}>
                    <button type="button" className="flex w-full items-center gap-2 py-2 text-left text-mutedForeground hover:text-foreground" onClick={() => { onClose(); window.setTimeout(() => openDetail(r.id), 0); }}>
                      <span className="shrink-0 tabular-nums">ID {r.objectNumber}</span>
                      <span className="truncate">{r.title || t("untitled")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === "matrix" && (
          <div className="text-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex rounded-lg border border-border bg-editorBackground p-0.5">
                <button data-testid="trace-requirement-to-test" className={`rounded-md px-3 py-1.5 text-xs ${traceDirection === "requirement_to_test" ? "bg-surface shadow-sm" : "text-mutedForeground"}`} onClick={() => setTraceDirection("requirement_to_test")}>{t("requirementsToTests")}</button>
                <button data-testid="trace-test-to-requirement" className={`rounded-md px-3 py-1.5 text-xs ${traceDirection === "test_to_requirement" ? "bg-surface shadow-sm" : "text-mutedForeground"}`} onClick={() => { setTraceDirection("test_to_requirement"); setTraceMode("table"); }}>{t("testsToRequirements")}</button>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" disabled={exportTraceability.isPending} className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-50" onClick={() => exportTraceability.mutate("xlsx")}><FileSpreadsheet size={13} />{t("exportXlsx")}</button>
                <button type="button" disabled={exportTraceability.isPending} className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-50" onClick={() => exportTraceability.mutate("docx")}><FileText size={13} />{t("exportDocx")}</button>
              </div>
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {traceDirection === "requirement_to_test" && <div className="flex rounded-lg border border-border bg-editorBackground p-0.5">
                <button data-testid="trace-graph-mode" className={`rounded-md px-2.5 py-1.5 text-xs ${traceMode === "graph" ? "bg-surface shadow-sm" : "text-mutedForeground"}`} onClick={() => setTraceMode("graph")}>{t("traceGraph")}</button>
                <button className={`rounded-md px-2.5 py-1.5 text-xs ${traceMode === "table" ? "bg-surface shadow-sm" : "text-mutedForeground"}`} onClick={() => setTraceMode("table")}>{t("traceTable")}</button>
              </div>}
              <label className="flex min-w-52 flex-1 items-center gap-2 rounded-lg border border-border bg-editorBackground px-2.5 py-1.5"><Search size={13} className="text-mutedForeground" /><input className="min-w-0 flex-1 bg-transparent text-xs outline-none" placeholder={t("traceSearch")} value={traceQuery} onChange={(event) => setTraceQuery(event.target.value)} /></label>
              <label className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs"><input type="checkbox" checked={suspectOnly} onChange={(event) => setSuspectOnly(event.target.checked)} className="accent-primary" />{t("suspectOnly")}</label>
            </div>
            {(traceDirection === "requirement_to_test" ? matrix.isLoading : reverseMatrix.isLoading) && <div className="py-8 text-center text-mutedForeground">{t("loading")}</div>}
            {traceDirection === "requirement_to_test" && matrix.data && traceMode === "graph" ? (
              <TraceabilityGraph
                rows={matrix.data}
                query={traceQuery}
                suspectOnly={suspectOnly}
                onOpenRequirement={(rowId) => { onClose(); window.setTimeout(() => openDetail(rowId), 0); }}
                onOpenSource={(link) => {
                  onClose();
                  window.dispatchEvent(new CustomEvent("docsys:open-document-row", { detail: { document: link.sourceDocument, rowId: link.sourceId } }));
                }}
              />
            ) : traceDirection === "requirement_to_test" && matrix.data ? (
              <div data-testid="matrix-table">
            {visibleMatrix.length === 0 ? (
              <div className="text-mutedForeground">{t("noRequirements")}</div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-mutedForeground">
                    <th className="py-2 pr-3">{t("requirementNumber")}</th>
                    <th className="py-2">{t("linkedTests")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleMatrix.map((r) => (
                    <tr key={r.id} className="border-b border-border align-top">
                      <td className="py-2 pr-3"><button type="button" className="font-mono font-medium hover:text-primary hover:underline" onClick={() => { onClose(); window.setTimeout(() => openDetail(r.id), 0); }}>{r.requirementNo || `ID ${r.objectNumber ?? r.id.slice(0, 8)}`}</button></td>
                      <td className="py-2">
                        {r.links.length === 0 ? (
                          <span className="text-destructive">—</span>
                        ) : (
                          <ul className="space-y-1">
                            {r.links.map((link) => (
                              <li key={link.linkId} className="flex items-center gap-1.5">
                                <button type="button" className="truncate text-left hover:text-primary hover:underline" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent("docsys:open-document-row", { detail: { document: link.sourceDocument, rowId: link.sourceScenarioId ?? link.sourceId } })); }}>{link.sourceTitle || link.sourceId.slice(0, 8)}</button>
                                {link.suspect && (
                                  <span className="rounded bg-warning/20 px-1 text-[10px] uppercase text-warning">
                                    {t("suspect")}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
              </div>
            ) : traceDirection === "test_to_requirement" && reverseMatrix.data ? (
              <div data-testid="reverse-matrix-table">
                {visibleReverseMatrix.length === 0 ? <div className="text-mutedForeground">{t("noTraceResults")}</div> : (
                  <table className="w-full border-collapse">
                    <thead><tr className="border-b border-border text-left text-xs uppercase text-mutedForeground"><th className="py-2 pr-3">{t("testName")}</th><th className="py-2">{t("requirementNumber")}</th></tr></thead>
                    <tbody>
                      {visibleReverseMatrix.map((row) => (
                        <tr key={row.id} className="border-b border-border align-top">
                          <td className="w-[42%] py-2 pr-3"><button type="button" className="text-left font-medium hover:text-primary hover:underline" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent("docsys:open-document-row", { detail: { document: row.document, rowId: row.id } })); }}>{row.title || t("untitledTest")}</button><div className="mt-0.5 truncate text-[10px] text-mutedForeground">{row.document.title}</div></td>
                          <td className="py-2">
                            {row.requirements.length === 0 ? <span className="text-destructive">—</span> : <ul className="space-y-1">{row.requirements.map((requirement) => (
                              <li key={requirement.linkId} className="flex items-center gap-1.5">
                                <button type="button" className="font-mono hover:text-primary hover:underline" title={requirement.requirementDescription ?? requirement.requirementTitle} onClick={() => { onClose(); window.dispatchEvent(new CustomEvent("docsys:open-document-row", { detail: { document: requirement.requirementDocument, rowId: requirement.requirementId } })); }}>{requirement.requirementNo || `ID ${requirement.requirementId.slice(0, 8)}`}</button>
                                {requirement.suspect && <span className="rounded bg-warning/20 px-1 text-[10px] uppercase text-warning">{t("suspect")}</span>}
                              </li>
                            ))}</ul>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ) : null}
          </div>
        )}

        {tab === "reviews" && (
          <div className="space-y-3 text-sm">
            {baselines.data?.length === 0 && <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning">{t("reviewRequiresBaseline")}</div>}
            <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (reviewTitle.trim() && profile.data) createReview.mutate(reviewTitle.trim()); }}>
              <input className="min-w-0 flex-1 rounded-lg border border-border bg-editorBackground px-3 py-2" value={reviewTitle} placeholder={t("reviewTitle")} onChange={(event) => setReviewTitle(event.target.value)} />
              <button className="rounded-lg bg-primary px-3 py-2 text-xs text-primaryForeground disabled:opacity-50" disabled={!reviewTitle.trim() || !profile.data || !baselines.data?.length}>{t("startReview")}</button>
            </form>
            {reviews.data?.map((review) => (
              <div key={review.id} className="rounded-xl border border-border bg-editorBackground p-3">
                <div className="flex items-center justify-between gap-2"><span className="font-medium">{review.title}</span><span className="flex items-center gap-2"><span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">{review.baselineSemanticVersion ? `v${review.baselineSemanticVersion}` : t("draft")}</span><span className="rounded bg-muted px-2 py-0.5 text-xs">{review.status}</span></span></div>
                <div className="mt-1 text-xs text-mutedForeground">{review.reviewers.map((item) => item.reviewer.displayName).join(", ")}</div>
                {review.contentHash && <div className="mt-1 truncate font-mono text-[10px] text-mutedForeground" title={review.contentHash}>{t("signedContentHash")} · {review.contentHash}</div>}
                {review.status === "active" && (
                  <div className="mt-3 flex gap-2">
                    <button className="rounded-lg bg-success/15 px-2 py-1 text-xs text-success" onClick={() => decideReview.mutate({ id: review.id, decision: "approved" })}>{t("approve")}</button>
                    <button className="rounded-lg bg-warning/15 px-2 py-1 text-xs text-warning" onClick={() => decideReview.mutate({ id: review.id, decision: "changes_requested" })}>{t("requestChanges")}</button>
                    <button className="rounded-lg bg-destructive/15 px-2 py-1 text-xs text-destructive" onClick={() => decideReview.mutate({ id: review.id, decision: "rejected" })}>{t("reject")}</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {tab === "runs" && (
          <div className="space-y-2 text-sm">
            {retestPackages.data && retestPackages.data.length > 0 && <div className="mb-4 space-y-2"><div className="text-xs font-semibold uppercase tracking-wide text-mutedForeground">{t("retestPackages")}</div>{retestPackages.data.map((retestPackage) => <div key={retestPackage.id} data-testid={`retest-package-${retestPackage.id}`} className="rounded-xl border border-border bg-editorBackground p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="font-medium">{retestPackage.name}</div><div className="mt-0.5 text-xs text-mutedForeground">{retestPackage.sourceDocument.title} · {t("impactDepthValue", { depth: retestPackage.impactDepth })} · {retestPackage.createdBy.displayName}</div></div><div className="flex items-center gap-2"><span className="rounded-full bg-muted px-2 py-1 text-xs">{t(`retestPackageStatus.${retestPackage.status}`)}</span>{["draft", "active"].includes(retestPackage.status) && <button className="rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10" onClick={() => cancelRetestPackage.mutate(retestPackage.id)}>{t("cancelPackage")}</button>}</div></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${retestPackage.progress.total === 0 ? 0 : (retestPackage.progress.completed / retestPackage.progress.total) * 100}%` }} /></div><div className="mt-1 text-xs text-mutedForeground">{t("retestProgress", { completed: retestPackage.progress.completed, total: retestPackage.progress.total, passed: retestPackage.progress.passed, failed: retestPackage.progress.failed })}</div><ul className="mt-2 divide-y divide-border">{retestPackage.items.map((item) => { const latest = item.executions[0]; return <li key={item.id} className="flex items-center gap-2 py-2"><button type="button" className="min-w-0 flex-1 truncate text-left text-xs hover:text-primary" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent("docsys:open-document-row", { detail: { document: item.testRow.document, rowId: item.testRow.id } })); }}>ID {item.testRow.objectNumber} · {item.testRow.title || t("untitledTest")}</button><span className="rounded bg-surface px-2 py-0.5 text-[10px] text-mutedForeground">{latest ? t(`executionStatus.${latest.status}`) : t("notRun")}</span>{latest?.status === "running" ? <><button className="rounded bg-primary/10 px-2 py-1 text-xs text-primary" onClick={() => completeRun.mutate(latest.id)}>{t("completeRun")}</button><button className="rounded bg-destructive/10 px-2 py-1 text-xs text-destructive" onClick={() => stopRun.mutate(latest.id)}>{t("stopRun")}</button></> : retestPackage.status !== "canceled" && <button data-testid={`start-retest-item-${item.id}`} className="rounded bg-primary px-2 py-1 text-xs text-primaryForeground" onClick={() => startRetestItem.mutate({ rowId: item.testRow.id, packageItemId: item.id })}>{latest ? t("rerun") : t("startRun")}</button>}</li>; })}</ul></div>)}</div>}
            {runs.data?.length === 0 && retestPackages.data?.length === 0 && <div className="text-mutedForeground">{t("noTestRuns")}</div>}
            {runs.data?.map((run) => (
              <div key={run.id} className="rounded-xl border border-border bg-editorBackground p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">#{run.testCaseRow.objectNumber} {run.testCaseRow.title || t("untitledTest")}</div>
                    <div className="mt-1 text-xs text-mutedForeground">{run.executedBy.displayName} · {run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}</div>
                  </div>
                  <span className="rounded bg-muted px-2 py-1 text-xs">{t(`executionStatus.${run.status}`)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-mutedForeground">
                  <span>{t("testStepProgress", { completed: run.steps.filter((step) => !["not_run", "running"].includes(step.status)).length, total: run.steps.length })}</span>
                  {run.status === "running" && <div className="flex gap-2"><button className="rounded bg-primary/10 px-2 py-1 text-primary hover:bg-primary/20" onClick={() => completeRun.mutate(run.id)}>{t("completeRun")}</button><button className="rounded bg-destructive/10 px-2 py-1 text-destructive hover:bg-destructive/20" onClick={() => stopRun.mutate(run.id)}>{t("stopRun")}</button></div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded border border-border p-3 text-center">
      <div className={`text-2xl font-semibold tabular-nums ${tone ?? ""}`}>{value}</div>
      <div className="mt-1 text-xs text-mutedForeground">{label}</div>
    </div>
  );
}
