import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bug, CalendarClock, CircleCheck, CircleX, ClipboardList, Play, ShieldAlert, Timer } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ExecutionStatusTotals, PlanExecutionReport, ProjectSummary, TestPlanSummary } from "../lib/api";
import { executionSegments, executionStatusAppearance } from "../lib/executionStatus";
import { userFacingError } from "../lib/userFacingError";
import { useToastStore } from "../stores/toasts";
import { Button, Card, CardBody, CardHeader, EmptyState, Lozenge, Metric, MetricStrip, StatusBar, TableHead } from "./ui";

export function TestPlanExecutionReportPage({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const [projectId, setProjectId] = useState("");
  const [planId, setPlanId] = useState("");

  const projects = useQuery({
    queryKey: ["projects", workspaceId],
    queryFn: () => api<ProjectSummary[]>(`/workspaces/${workspaceId}/projects`),
  });
  const activeProjectId = projectId || projects.data?.[0]?.id || "";
  const plans = useQuery({
    queryKey: ["test-plans", activeProjectId],
    queryFn: () => api<TestPlanSummary[]>(`/projects/${activeProjectId}/test-plans`),
    enabled: activeProjectId !== "",
  });
  const activePlanId = planId && plans.data?.some((plan) => plan.id === planId) ? planId : plans.data?.[0]?.id ?? "";
  const report = useQuery({
    queryKey: ["plan-execution-report", activePlanId],
    queryFn: () => api<PlanExecutionReport>(`/test-plans/${activePlanId}/execution-report`),
    enabled: activePlanId !== "",
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-editorBackground">
      <div className="space-y-4 p-4">
        <Card>
          <CardHeader title={t("testExecutionReport")} subtitle={t("testExecutionReportHelp")} icon={<ClipboardList size={15} className="text-primary" />} />
          <CardBody className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-mutedForeground">{t("workHub.project")}</span>
              <select
                data-testid="report-project-select"
                className="input w-auto"
                value={activeProjectId}
                onChange={(event) => { setProjectId(event.target.value); setPlanId(""); }}
              >
                {(projects.data ?? []).map((project) => (
                  <option key={project.id} value={project.id}>{project.code} · {project.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-mutedForeground">{t("workHub.testPlan")}</span>
              <select data-testid="report-plan-select" className="input w-auto" value={activePlanId} onChange={(event) => setPlanId(event.target.value)}>
                {(plans.data ?? []).map((plan) => (
                  <option key={plan.id} value={plan.id}>{plan.key} · {plan.name}</option>
                ))}
              </select>
            </label>
          </CardBody>
        </Card>

        {plans.isLoading || report.isLoading ? (
          <p className="px-1 text-sm text-mutedForeground">{t("loading")}</p>
        ) : (plans.data ?? []).length === 0 ? (
          <EmptyState icon={<ClipboardList size={20} />} title={t("noTestPlans")} description={t("noTestPlansHelp")} />
        ) : report.data ? (
          <PlanReport report={report.data} />
        ) : null}
      </div>
    </div>
  );
}

function PlanReport({ report }: { report: PlanExecutionReport }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const { plan, totals } = report;
  const segments = useMemo(() => executionSegments(totals, (status) => t(`executionStatus.${status}`)), [totals, t]);

  const startExecution = useMutation({
    mutationFn: (itemId: string) => api(`/test-plan-items/${itemId}/executions`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["plan-execution-report", plan.id] });
      pushToast("success", t("executionCreated"));
    },
    onError: (error) => pushToast("error", userFacingError(error, t)),
  });

  return (
    <div className="space-y-4" data-testid="plan-execution-report">
      <MetricStrip testId="report-metrics">
        <Metric label={t("plannedTests")} value={totals.planned} icon={<ClipboardList size={14} />} tone="primary" caption={`${totals.executed} ${t("executedLabel")}`} />
        <Metric label={t("executionStatus.passed")} value={totals.passed} icon={<CircleCheck size={14} />} tone="success" />
        <Metric label={t("executionStatus.failed")} value={totals.failed} icon={<CircleX size={14} />} tone="danger" />
        <Metric label={t("openTests")} value={totals.notRun + totals.running} icon={<Timer size={14} />} tone="warning" caption={`${totals.running} ${t("executionStatus.running").toLocaleLowerCase()}`} />
        <Metric label={t("passRate")} value={`${totals.passRate}%`} icon={<ShieldAlert size={14} />} tone="info" caption={t("passRateCaption")} />
      </MetricStrip>

      <Card>
        <CardHeader
          title={plan.name}
          subtitle={[plan.key, plan.project ? `${plan.project.code} · ${plan.project.name}` : null, plan.owner?.displayName].filter(Boolean).join(" · ")}
          badge={<Lozenge appearance={plan.status === "completed" ? "success" : plan.status === "canceled" ? "danger" : plan.status === "active" ? "primary" : "neutral"}>{t(`workHub.planStatuses.${plan.status}`)}</Lozenge>}
        />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-mutedForeground">
            <span>{t("workHub.environment")}: <span className="font-medium text-foreground">{plan.environment || "-"}</span></span>
            <span>{t("workHub.buildReference")}: <span className="font-medium text-foreground">{plan.buildReference || "-"}</span></span>
            {(plan.startsAt || plan.endsAt) && (
              <span className="flex items-center gap-1.5">
                <CalendarClock size={12} />
                {plan.startsAt ? new Date(plan.startsAt).toLocaleDateString() : "-"} - {plan.endsAt ? new Date(plan.endsAt).toLocaleDateString() : "-"}
              </span>
            )}
          </div>
          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-xs">
              <span className="font-medium">{t("executionProgress")}</span>
              <span className="tabular-nums text-mutedForeground" data-testid="report-completion">{totals.completionRate}%</span>
            </div>
            <StatusBar segments={segments} total={totals.planned} testId="report-status-bar" />
          </div>
        </CardBody>
      </Card>

      {report.iterations.length > 1 && (
        <Card>
          <CardHeader title={t("iterationBreakdown")} badge={<Lozenge>{report.iterations.length}</Lozenge>} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm" data-testid="report-iterations">
              <TableHead className="border-b border-border bg-surfaceSubtle">
                <tr>
                  <th className="px-4 py-2.5">{t("iteration")}</th>
                  <th className="px-4 py-2.5">{t("plannedTests")}</th>
                  <th className="px-4 py-2.5 w-2/5">{t("executionProgress")}</th>
                  <th className="px-4 py-2.5">{t("passRate")}</th>
                </tr>
              </TableHead>
              <tbody>
                {report.iterations.map((iteration) => (
                  <tr key={iteration.iteration || "unassigned"} className="border-b border-border last:border-b-0" data-testid={`report-iteration-${iteration.iteration || "unassigned"}`}>
                    <td className="px-4 py-2.5 font-medium">{iteration.iteration || t("noIteration")}</td>
                    <td className="px-4 py-2.5 tabular-nums">{iteration.planned}</td>
                    <td className="px-4 py-2.5">
                      <StatusBar segments={executionSegments(iteration, (status) => t(`executionStatus.${status}`))} total={iteration.planned} legend={false} />
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{iteration.passRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title={t("plannedTests")} badge={<Lozenge>{report.items.length}</Lozenge>} />
        {report.items.length === 0 ? (
          <EmptyState icon={<ClipboardList size={18} />} title={t("noPlanItems")} description={t("noPlanItemsHelp")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[54rem] text-left text-sm" data-testid="report-items">
              <TableHead className="border-b border-border bg-surfaceSubtle">
                <tr>
                  <th className="px-4 py-2.5">{t("testScenarios")}</th>
                  <th className="px-4 py-2.5">{t("status")}</th>
                  <th className="px-4 py-2.5">{t("stepResults")}</th>
                  <th className="px-4 py-2.5">{t("iteration")}</th>
                  <th className="px-4 py-2.5">{t("workHub.assignee")}</th>
                  <th className="px-4 py-2.5">{t("defects")}</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </TableHead>
              <tbody>
                {report.items.map((item) => {
                  const steps = item.latestExecution?.stepTotals;
                  return (
                    <tr key={item.id} className="border-b border-border last:border-b-0" data-testid={`report-item-${item.testCaseRow.objectNumber}`}>
                      <td className="px-4 py-2.5">
                        <span className="block font-medium">{item.testCaseRow.title || t("untitledSection")}</span>
                        <span className="block text-xs text-mutedForeground">
                          {item.latestExecution?.key ? `${item.latestExecution.key} · ` : ""}
                          {item.testCaseRow.document.title}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <Lozenge appearance={item.status ? executionStatusAppearance[item.status] : "neutral"}>
                          {item.status ? t(`executionStatus.${item.status}`) : t("notExecuted")}
                        </Lozenge>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">{steps ? `${steps.passed} / ${steps.total}` : "-"}</td>
                      <td className="px-4 py-2.5 text-mutedForeground">{item.iteration || "-"}</td>
                      <td className="px-4 py-2.5 text-mutedForeground">{item.assignee?.displayName ?? "-"}</td>
                      <td className="px-4 py-2.5">
                        {item.defects.length === 0 ? (
                          <span className="text-mutedForeground">-</span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {item.defects.map((defect) => (
                              <Lozenge key={defect.id} appearance="danger">{defect.key}</Lozenge>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          size="sm"
                          variant="subtle"
                          icon={<Play size={13} />}
                          data-testid={`report-start-${item.testCaseRow.objectNumber}`}
                          disabled={startExecution.isPending}
                          onClick={() => startExecution.mutate(item.id)}
                        >
                          {item.executionCount > 0 ? t("retestAction") : t("startExecution")}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {report.defects.length > 0 && (
        <Card>
          <CardHeader title={t("defects")} icon={<Bug size={15} className="text-destructive" />} badge={<Lozenge appearance="danger">{report.defects.length}</Lozenge>} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm" data-testid="report-defects">
              <TableHead className="border-b border-border bg-surfaceSubtle">
                <tr>
                  <th className="px-4 py-2.5">{t("workHub.key")}</th>
                  <th className="px-4 py-2.5">{t("workHub.titleLabel")}</th>
                  <th className="px-4 py-2.5">{t("status")}</th>
                  <th className="px-4 py-2.5">{t("workHub.priority")}</th>
                </tr>
              </TableHead>
              <tbody>
                {report.defects.map((defect) => (
                  <tr key={defect.id} className="border-b border-border last:border-b-0" data-testid={`report-defect-${defect.key}`}>
                    <td className="px-4 py-2.5 font-mono text-xs text-primary">{defect.key}</td>
                    <td className="px-4 py-2.5">{defect.title}</td>
                    <td className="px-4 py-2.5">{t(`workHub.statuses.${defect.status}`)}</td>
                    <td className="px-4 py-2.5">{t(`workHub.priorities.${defect.priority}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <AssigneeBreakdown assignees={report.assignees} />
    </div>
  );
}

function AssigneeBreakdown({ assignees }: { assignees: PlanExecutionReport["assignees"] }) {
  const { t } = useTranslation();
  const named = assignees.filter((entry) => entry.id !== null);
  if (named.length === 0) return null;
  return (
    <Card>
      <CardHeader title={t("assigneeBreakdown")} badge={<Lozenge>{named.length}</Lozenge>} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-sm" data-testid="report-assignees">
          <TableHead className="border-b border-border bg-surfaceSubtle">
            <tr>
              <th className="px-4 py-2.5">{t("workHub.assignee")}</th>
              <th className="px-4 py-2.5">{t("plannedTests")}</th>
              <th className="px-4 py-2.5 w-2/5">{t("executionProgress")}</th>
              <th className="px-4 py-2.5">{t("passRate")}</th>
            </tr>
          </TableHead>
          <tbody>
            {named.map((entry) => (
              <tr key={entry.id} className="border-b border-border last:border-b-0">
                <td className="px-4 py-2.5 font-medium">{entry.displayName ?? "-"}</td>
                <td className="px-4 py-2.5 tabular-nums">{entry.totals.planned}</td>
                <td className="px-4 py-2.5">
                  <StatusBar segments={executionSegments(entry.totals, (status) => t(`executionStatus.${status}`))} total={entry.totals.planned} legend={false} />
                </td>
                <td className="px-4 py-2.5 tabular-nums">{entry.totals.passRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export type { ExecutionStatusTotals };
