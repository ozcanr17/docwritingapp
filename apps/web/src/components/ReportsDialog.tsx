import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useToastStore } from "../stores/toasts";

interface ReportsDialogProps {
  documentId: string;
  tab: "baselines" | "coverage" | "matrix" | "reviews" | "runs";
  onClose: () => void;
}

interface MatrixRow {
  id: string;
  title: string;
  links: { linkId: string; suspect: boolean; linkType: string; sourceId: string; sourceTitle: string; sourceType: string }[];
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

interface Diff {
  added: { id: string; title: string }[];
  removed: { id: string; title: string }[];
  modified: { id: string; before: string; after: string }[];
  summary: { added: number; removed: number; modified: number };
}

interface Coverage {
  totalRequirements: number;
  covered: number;
  uncovered: number;
  suspect: number;
  uncoveredRows: { id: string; title: string }[];
}

interface Review {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueAt: string | null;
  reviewers: Array<{ reviewerId: string; reviewer: { displayName: string; email: string } }>;
  decisions: Array<{ id: string; reviewerId: string; decision: string; comment: string | null }>;
}

export function ReportsDialog({ documentId, tab, onClose }: ReportsDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [diffRevision, setDiffRevision] = useState<number | null>(null);
  const [baselineLabel, setBaselineLabel] = useState("");
  const [baselineFormOpen, setBaselineFormOpen] = useState(false);
  const [reviewTitle, setReviewTitle] = useState("");

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
    enabled: tab === "baselines",
  });

  const coverage = useQuery({
    queryKey: ["coverage", documentId],
    queryFn: () => api<Coverage>(`/documents/${documentId}/coverage`),
    enabled: tab === "coverage",
  });

  const diff = useQuery({
    queryKey: ["diff", documentId, diffRevision],
    queryFn: () => api<Diff>(`/documents/${documentId}/baselines/${diffRevision}/diff`),
    enabled: diffRevision !== null,
  });

  const matrix = useQuery({
    queryKey: ["matrix", documentId],
    queryFn: () => api<MatrixRow[]>(`/documents/${documentId}/traceability`),
    enabled: tab === "matrix",
  });
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

  const createBaseline = useMutation({
    mutationFn: (label: string) => api(`/documents/${documentId}/baselines`, { method: "POST", body: JSON.stringify({ label: label || undefined }) }),
    onSuccess: () => {
      setBaselineLabel("");
      setBaselineFormOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["baselines", documentId] });
      void queryClient.invalidateQueries({ queryKey: ["outline", documentId] });
      pushToast("success", t("createBaseline"));
    },
    onError: () => pushToast("error", t("genericError")),
  });
  const stopRun = useMutation({
    mutationFn: (id: string) => api(`/executions/${id}/stop`, { method: "POST" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["test-runs", documentId] }),
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
        className="max-h-[80vh] w-[36rem] overflow-auto rounded border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            {tab === "baselines" ? t("baselines") : tab === "coverage" ? t("coverageReport") : tab === "matrix" ? t("traceabilityMatrix") : tab === "runs" ? t("testRuns") : t("reviews")}
          </h2>
          <button aria-label={t("close")} onClick={onClose} className="rounded p-1 hover:bg-muted">
            <X size={16} />
          </button>
        </div>

        {tab === "baselines" && (
          <div className="space-y-3 text-sm">
            <button
              data-testid="create-baseline"
              className="rounded bg-primary px-3 py-1.5 text-xs text-primaryForeground"
              onClick={() => setBaselineFormOpen(true)}
            >
              {t("createBaseline")}
            </button>
            {baselineFormOpen && (
              <form
                className="flex items-end gap-2 rounded-xl border border-border bg-editorBackground p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  createBaseline.mutate(baselineLabel.trim());
                }}
              >
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
            {diff.data && (
              <div data-testid="diff-result" className="rounded border border-border p-3 text-xs">
                <div className="mb-2 flex gap-4">
                  <span className="text-success">+ {diff.data.summary.added} {t("added")}</span>
                  <span className="text-destructive">− {diff.data.summary.removed} {t("removed")}</span>
                  <span className="text-warning">~ {diff.data.summary.modified} {t("modified")}</span>
                </div>
                {diff.data.modified.map((m) => (
                  <div key={m.id} className="text-mutedForeground">
                    <span className="line-through">{m.before}</span> → <span className="text-foreground">{m.after}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "coverage" && coverage.data && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-3">
              <Stat label={t("totalRequirements")} value={coverage.data.totalRequirements} />
              <Stat label={t("covered")} value={coverage.data.covered} tone="text-success" />
              <Stat label={t("uncovered")} value={coverage.data.uncovered} tone="text-destructive" />
            </div>
            {coverage.data.uncoveredRows.length > 0 && (
              <ul className="divide-y divide-border" data-testid="uncovered-list">
                {coverage.data.uncoveredRows.map((r) => (
                  <li key={r.id} className="py-1.5 text-mutedForeground">
                    {r.title || "—"}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === "matrix" && matrix.data && (
          <div data-testid="matrix-table" className="text-sm">
            {matrix.data.length === 0 ? (
              <div className="text-mutedForeground">{t("noRequirements")}</div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-mutedForeground">
                    <th className="py-2 pr-3">{t("requirement")}</th>
                    <th className="py-2">{t("linkedItems")}</th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.data.map((r) => (
                    <tr key={r.id} className="border-b border-border align-top">
                      <td className="py-2 pr-3 font-medium">{r.title || "—"}</td>
                      <td className="py-2">
                        {r.links.length === 0 ? (
                          <span className="text-destructive">—</span>
                        ) : (
                          <ul className="space-y-1">
                            {r.links.map((link) => (
                              <li key={link.linkId} className="flex items-center gap-1.5">
                                <span className="truncate">{link.sourceTitle || link.sourceId.slice(0, 8)}</span>
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
        )}

        {tab === "reviews" && (
          <div className="space-y-3 text-sm">
            <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (reviewTitle.trim() && profile.data) createReview.mutate(reviewTitle.trim()); }}>
              <input className="min-w-0 flex-1 rounded-lg border border-border bg-editorBackground px-3 py-2" value={reviewTitle} placeholder={t("reviewTitle")} onChange={(event) => setReviewTitle(event.target.value)} />
              <button className="rounded-lg bg-primary px-3 py-2 text-xs text-primaryForeground" disabled={!reviewTitle.trim() || !profile.data}>{t("startReview")}</button>
            </form>
            {reviews.data?.map((review) => (
              <div key={review.id} className="rounded-xl border border-border bg-editorBackground p-3">
                <div className="flex items-center justify-between"><span className="font-medium">{review.title}</span><span className="rounded bg-muted px-2 py-0.5 text-xs">{review.status}</span></div>
                <div className="mt-1 text-xs text-mutedForeground">{review.reviewers.map((item) => item.reviewer.displayName).join(", ")}</div>
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
            {runs.data?.length === 0 && <div className="text-mutedForeground">{t("noTestRuns")}</div>}
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
                  {run.status === "running" && <button className="rounded bg-destructive/10 px-2 py-1 text-destructive hover:bg-destructive/20" onClick={() => stopRun.mutate(run.id)}>{t("stopRun")}</button>}
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
