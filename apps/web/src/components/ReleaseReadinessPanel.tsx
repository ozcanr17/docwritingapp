import { AlertTriangle, CheckCircle2, CircleDashed, ExternalLink, GitBranch, History, ShieldCheck, TestTube2, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ImpactAnalysis, ReleaseReadinessGateStatus, ReleaseReadinessReport } from "../lib/api";

interface ReleaseReadinessPanelProps {
  report: ReleaseReadinessReport;
  impact?: ImpactAnalysis;
  impactDepth?: number;
  creatingPackage?: boolean;
  onOpenRow: (rowId: string) => void;
  onOpenCandidate: (candidate: ReleaseReadinessReport["retestCandidates"][number]) => void;
  onImpactDepthChange?: (depth: number) => void;
  onCreatePackage?: (name: string, candidateRowIds: string[], impactDepth: number) => void;
}

const statusTone: Record<ReleaseReadinessGateStatus, string> = {
  passed: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
  not_applicable: "border-border bg-muted/50 text-mutedForeground",
};

function StatusIcon({ status, size = 16 }: { status: ReleaseReadinessGateStatus; size?: number }) {
  if (status === "passed") return <CheckCircle2 size={size} />;
  if (status === "warning") return <AlertTriangle size={size} />;
  if (status === "failed") return <XCircle size={size} />;
  return <CircleDashed size={size} />;
}

export function ReleaseReadinessPanel({ report, impact, impactDepth = 1, creatingPackage = false, onOpenRow, onOpenCandidate, onImpactDepthChange, onCreatePackage }: ReleaseReadinessPanelProps) {
  const { t } = useTranslation();
  const candidates = impact?.retestCandidates ?? report.retestCandidates;
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [packageName, setPackageName] = useState("");
  useEffect(() => setSelectedCandidateIds(candidates.map((candidate) => candidate.rowId)), [impactDepth, candidates]);
  const requiredGates = report.gates.filter((gate) => gate.required);
  const advisoryGates = report.gates.filter((gate) => !gate.required && gate.status !== "not_applicable");
  const failedGates = requiredGates.filter((gate) => gate.status === "failed").length;
  const heroTone = report.status === "ready"
    ? "border-success/35 bg-success/10"
    : report.status === "warning"
      ? "border-warning/35 bg-warning/10"
      : "border-destructive/35 bg-destructive/10";

  return (
    <div data-testid="release-readiness-panel" className="space-y-4 text-sm">
      <section className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-4 ${heroTone}`}>
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-xl bg-surface p-2.5 shadow-sm"><ShieldCheck size={22} /></div>
          <div className="min-w-0">
            <div data-testid="readiness-status" data-status={report.status} className="mt-0.5 text-lg font-semibold">{t(`releaseReadinessStatus.${report.status}`)}</div>
            <div className="mt-0.5 text-xs text-mutedForeground">{t("readinessAdvisoryHelp")}</div>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <div className="text-3xl font-semibold tabular-nums">{report.score}</div>
            <div className="text-[11px] uppercase tracking-wide text-mutedForeground">{t("readinessScore")}</div>
          </div>
          <div className="h-10 w-px bg-border" />
          <div className="text-right">
            <div className="text-xl font-semibold tabular-nums">{failedGates}</div>
            <div className="text-[11px] uppercase tracking-wide text-mutedForeground">{t("readinessBlockingGates")}</div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-mutedForeground">{t("readinessRequiredCriteria")}</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {requiredGates.map((gate) => (
            <div key={gate.key} data-testid={`readiness-gate-${gate.key}`} data-status={gate.status} className={`rounded-xl border p-3 ${statusTone[gate.status]}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2 font-medium"><StatusIcon status={gate.status} /><span>{t(`readinessGate.${gate.key}`)}</span></div>
                <span className="rounded-full bg-surface/75 px-1.5 py-0.5 text-[10px] font-medium text-mutedForeground">{t("required")}</span>
              </div>
              <div className="mt-2 text-xs opacity-85">{t(`readinessGateHelp.${gate.key}`)}</div>
              <div className="mt-1 text-xs font-medium">{t(`releaseReadinessGateStatus.${gate.status}`)}{gate.issueCount > 0 ? ` · ${t("readinessIssueCount", { count: gate.issueCount })}` : ""}</div>
            </div>
          ))}
        </div>
      </section>

      {advisoryGates.length > 0 && (
        <section className="rounded-xl border border-border bg-editorBackground p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-mutedForeground">{t("readinessAdvisoryChecks")}</h3>
          <p className="mt-1 text-xs text-mutedForeground">{t("readinessAdvisoryChecksHelp")}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {advisoryGates.map((gate) => (
              <div key={gate.key} data-testid={`readiness-gate-${gate.key}`} data-status={gate.status} className="flex items-start gap-2 rounded-lg border border-border bg-surface p-2.5">
                <span className={gate.status === "passed" ? "text-success" : "text-warning"}><StatusIcon status={gate.status} /></span>
                <span className="min-w-0"><span className="block text-xs font-medium">{t(`readinessGate.${gate.key}`)}</span><span className="mt-0.5 block text-xs text-mutedForeground">{t(`readinessGateHelp.${gate.key}`)}{gate.issueCount > 0 ? ` · ${t("readinessIssueCount", { count: gate.issueCount })}` : ""}</span></span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Summary icon={<History size={15} />} label={t("readinessChangedRows")} value={impact?.changedRows.length ?? ((report.baseline?.changedRows ?? report.counts.rows) + (report.baseline?.removedRows ?? 0))} />
        <Summary icon={<GitBranch size={15} />} label={t("impactTraversedLinks")} value={impact?.traversedLinkCount ?? report.counts.suspectLinks} />
        <Summary icon={<TestTube2 size={15} />} label={t("readinessRetestCandidates")} value={candidates.length} />
        <Summary icon={<AlertTriangle size={15} />} label={t("readinessCoverageGaps")} value={report.counts.uncoveredRequirements + report.counts.unlinkedTestSteps} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border">
          <div className="border-b border-border px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-mutedForeground">{t("readinessIssues")}</div>
          {report.issues.length === 0 ? (
            <div className="p-3 text-xs text-mutedForeground">{t("readinessNoIssues")}</div>
          ) : (
            <ul className="max-h-56 divide-y divide-border overflow-auto">
              {report.issues.map((issue, index) => (
                <li key={`${issue.rule}-${issue.rowId}-${index}`} className="flex items-start gap-2 px-3 py-2.5 hover:bg-muted/60">
                    <AlertTriangle size={14} className={issue.severity === "error" ? "mt-0.5 shrink-0 text-destructive" : "mt-0.5 shrink-0 text-warning"} />
                    <span className="min-w-0 flex-1"><span className="block text-xs font-medium">{t(`readinessRule.${issue.rule}`)}</span><span className="mt-0.5 block truncate text-xs text-mutedForeground">{issue.objectNumber ? `ID ${issue.objectNumber} · ` : ""}{issue.title || t("untitled")}</span><span data-testid={`readiness-why-${issue.rowId}`} className="mt-1 block text-xs leading-5 text-mutedForeground">{t(`readinessRuleWhy.${issue.rule}`)}</span></span>
                    <button type="button" data-testid={`readiness-issue-${issue.rowId}`} className="shrink-0 rounded-lg border border-border px-2 py-1 text-xs text-primary hover:bg-surface" onClick={() => {
                      onOpenRow(issue.rowId);
                      if (issue.rule === "uncovered_requirement" || issue.rule === "unlinked_test_step" || issue.rule === "untested_requirement") window.setTimeout(() => window.dispatchEvent(new CustomEvent("docsys:open-detail-tab", { detail: { rowId: issue.rowId, tab: "links" } })), 0);
                    }}>{t(`readinessRuleAction.${issue.rule}`)}<ExternalLink size={12} className="ml-1 inline" /></button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-mutedForeground">{t("readinessRetestCandidates")}</div>
            {onImpactDepthChange && <label className="flex items-center gap-1.5 text-xs text-mutedForeground">{t("impactDepth")}<select data-testid="impact-depth" className="rounded-md border border-border bg-surface px-1.5 py-1 text-foreground" value={impactDepth} onChange={(event) => onImpactDepthChange(Number(event.target.value))}><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>}
          </div>
          {candidates.length === 0 ? (
            <div className="p-3 text-xs text-mutedForeground">{t("readinessNoRetestCandidates")}</div>
          ) : (
            <>
            <div className="flex items-center justify-between border-b border-border bg-editorBackground px-3 py-2 text-xs text-mutedForeground"><span>{t("impactSummary", { affected: impact?.affectedRowCount ?? candidates.length, links: impact?.traversedLinkCount ?? report.counts.suspectLinks })}</span><button type="button" className="text-primary hover:underline" onClick={() => setSelectedCandidateIds(selectedCandidateIds.length === candidates.length ? [] : candidates.map((candidate) => candidate.rowId))}>{selectedCandidateIds.length === candidates.length ? t("clearSelection") : t("selectAllRows")}</button></div>
            <ul className="max-h-48 divide-y divide-border overflow-auto">
              {candidates.map((candidate) => (
                <li key={candidate.rowId}>
                  <div className="flex items-start gap-2 px-3 py-2.5 hover:bg-muted/60">
                    <input data-testid={`retest-candidate-${candidate.rowId}`} type="checkbox" className="mt-0.5 accent-primary" checked={selectedCandidateIds.includes(candidate.rowId)} onChange={() => setSelectedCandidateIds((selected) => selected.includes(candidate.rowId) ? selected.filter((rowId) => rowId !== candidate.rowId) : [...selected, candidate.rowId])} />
                    <TestTube2 size={14} className="mt-0.5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">ID {candidate.objectNumber} · {candidate.title || t("untitledTest")}</span><span className="mt-0.5 block truncate text-xs text-mutedForeground">{candidate.document.title} · {t(candidate.reason === "baseline_change" ? "impactBaselineReason" : "readinessSuspectReason")}</span></span>
                    <button type="button" data-testid={`readiness-retest-${candidate.rowId}`} aria-label={t("openLinkedRow")} className="rounded p-1 text-mutedForeground hover:bg-muted hover:text-foreground" onClick={() => onOpenCandidate(candidate)}><ExternalLink size={13} /></button>
                  </div>
                </li>
              ))}
            </ul>
            {onCreatePackage && <form className="flex gap-2 border-t border-border p-3" onSubmit={(event) => { event.preventDefault(); if (packageName.trim() && selectedCandidateIds.length > 0) onCreatePackage(packageName.trim(), selectedCandidateIds, impactDepth); }}><input data-testid="retest-package-name" className="min-w-0 flex-1 rounded-lg border border-border bg-editorBackground px-2.5 py-1.5 text-xs" placeholder={t("retestPackageName")} value={packageName} onChange={(event) => setPackageName(event.target.value)} /><button data-testid="create-retest-package" className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primaryForeground disabled:opacity-50" disabled={!packageName.trim() || selectedCandidateIds.length === 0 || creatingPackage}>{t("createRetestPackage")}</button></form>}
            </>
          )}
        </section>
      </div>

      {report.failedExecutions.length > 0 && (
        <section className="rounded-xl border border-warning/25 bg-warning/5">
          <div className="border-b border-warning/15 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-warning">{t("readinessExecutionInformation")}</div>
          <ul className="divide-y divide-border">
            {report.failedExecutions.map((execution) => (
              <li key={execution.rowId}>
                <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-destructive/5" onClick={() => onOpenRow(execution.rowId)}>
                  <XCircle size={14} className="shrink-0 text-warning" />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">ID {execution.objectNumber} · {execution.title || t("untitledTest")}</span>
                  <span className="rounded bg-surface px-2 py-0.5 text-[10px] text-mutedForeground">{t(`executionStatus.${execution.status}`)}</span>
                  <ExternalLink size={13} className="shrink-0 text-mutedForeground" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-editorBackground p-3">
          <div className="text-xs font-medium text-mutedForeground">{t("latestBaseline")}</div>
          <div className="mt-1 font-medium">{report.baseline ? `v${report.baseline.semanticVersion}` : t("readinessNoBaseline")}</div>
          {report.baseline && <div className="mt-1 text-xs text-mutedForeground">{report.baseline.current ? t("readinessBaselineCurrent") : t("readinessBaselineDrift", { changed: report.baseline.changedRows, removed: report.baseline.removedRows })}</div>}
        </div>
        <div className="rounded-xl border border-border bg-editorBackground p-3">
          <div className="text-xs font-medium text-mutedForeground">{t("latestReview")}</div>
          <div className="mt-1 font-medium">{report.latestReview?.title ?? t("readinessNoReview")}</div>
          {report.latestReview && <div className="mt-1 text-xs text-mutedForeground">{t(`reviewStatus.${report.latestReview.status}`)}</div>}
        </div>
      </section>
    </div>
  );
}

function Summary({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-editorBackground p-3">
      <div className="flex items-center gap-1.5 text-xs text-mutedForeground">{icon}{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
