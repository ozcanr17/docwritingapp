import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Play, Plus, Search, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ExecutionListResponse, ExecutionStatusKey, ExecutionSummary, ProjectSummary, TestScenarioCandidate } from "../lib/api";
import { EXECUTION_STATUS_ORDER, executionSegments, executionStatusAppearance } from "../lib/executionStatus";
import { userFacingError } from "../lib/userFacingError";
import { useToastStore } from "../stores/toasts";
import { ModalSurface } from "./TransientSurface";
import { Button, Card, CardBody, CardHeader, EmptyState, Lozenge, StatusBar, TableHead } from "./ui";

export function TestExecutionsPage({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const [projectId, setProjectId] = useState("");
  const [statuses, setStatuses] = useState<ExecutionStatusKey[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  const projects = useQuery({
    queryKey: ["projects", workspaceId],
    queryFn: () => api<ProjectSummary[]>(`/workspaces/${workspaceId}/projects`),
  });
  const search = new URLSearchParams();
  if (projectId) search.set("projectId", projectId);
  if (statuses.length) search.set("status", statuses.join(","));
  const suffix = search.toString();
  const executions = useQuery({
    queryKey: ["workspace-executions", workspaceId, suffix],
    queryFn: () => api<ExecutionListResponse>(`/workspaces/${workspaceId}/test-executions${suffix ? `?${suffix}` : ""}`),
  });

  const rows = executions.data?.executions ?? [];
  const totals = executions.data?.totals;
  const segments = useMemo(
    () => (totals ? executionSegments(totals, (status) => t(`executionStatus.${status}`)) : []),
    [totals, t],
  );

  const toggleStatus = (status: ExecutionStatusKey) =>
    setStatuses((current) => (current.includes(status) ? current.filter((entry) => entry !== status) : [...current, status]));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-editorBackground">
      <div className="space-y-4 p-4">
        <Card>
          <CardHeader
            title={t("testExecutions")}
            subtitle={t("testExecutionsHelp")}
            icon={<Play size={15} className="text-primary" />}
            actions={
              <Button variant="primary" icon={<Plus size={14} />} data-testid="open-create-execution" onClick={() => setCreateOpen(true)}>
                {t("createExecution")}
              </Button>
            }
          />
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm">
                <span className="mr-2 text-xs font-medium text-mutedForeground">{t("workHub.project")}</span>
                <select data-testid="execution-project-filter" className="input w-auto" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                  <option value="">{t("allProjectsOption")}</option>
                  {(projects.data ?? []).map((project) => (
                    <option key={project.id} value={project.id}>{project.code} · {project.name}</option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {EXECUTION_STATUS_ORDER.map((status) => {
                  const active = statuses.includes(status);
                  return (
                    <button
                      key={status}
                      type="button"
                      aria-pressed={active}
                      data-testid={`execution-status-filter-${status}`}
                      className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${active ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-mutedForeground hover:bg-muted"}`}
                      onClick={() => toggleStatus(status)}
                    >
                      {t(`executionStatus.${status}`)}
                    </button>
                  );
                })}
              </div>
            </div>
            {totals && totals.planned > 0 && <StatusBar segments={segments} total={totals.planned} testId="executions-status-bar" />}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("executionHistory")} badge={<Lozenge>{rows.length}</Lozenge>} />
          {executions.isLoading ? (
            <CardBody><p className="text-sm text-mutedForeground">{t("loading")}</p></CardBody>
          ) : rows.length === 0 ? (
            <EmptyState icon={<FlaskConical size={20} />} title={t("noExecutions")} description={t("noExecutionsHelp")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-left text-sm" data-testid="executions-table">
                <TableHead className="border-b border-border bg-surfaceSubtle">
                  <tr>
                    <th className="px-4 py-2.5">{t("workHub.key")}</th>
                    <th className="px-4 py-2.5">{t("testScenarios")}</th>
                    <th className="px-4 py-2.5">{t("status")}</th>
                    <th className="px-4 py-2.5">{t("stepResults")}</th>
                    <th className="px-4 py-2.5">{t("workHub.testPlan")}</th>
                    <th className="px-4 py-2.5">{t("workHub.environment")}</th>
                    <th className="px-4 py-2.5">{t("executedBy")}</th>
                    <th className="px-4 py-2.5">{t("createdOn")}</th>
                  </tr>
                </TableHead>
                <tbody>
                  {rows.map((execution) => <ExecutionRow key={execution.id} execution={execution} />)}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      {createOpen && <CreateExecutionDialog workspaceId={workspaceId} onClose={() => setCreateOpen(false)} />}
    </div>
  );
}

function ExecutionRow({ execution }: { execution: ExecutionSummary }) {
  const { t } = useTranslation();
  const steps = execution.stepTotals;
  return (
    <tr className="border-b border-border last:border-b-0" data-testid={`execution-${execution.key ?? execution.id}`}>
      <td className="px-4 py-2.5 font-mono text-xs text-primary">{execution.key ?? "-"}</td>
      <td className="px-4 py-2.5">
        <span className="block font-medium">{execution.testCaseRow.title || t("untitledSection")}</span>
        <span className="block text-xs text-mutedForeground">
          {execution.testCaseRow.document.key ? `${execution.testCaseRow.document.key} · ` : ""}
          {execution.testCaseRow.document.title}
        </span>
      </td>
      <td className="px-4 py-2.5">
        <Lozenge appearance={executionStatusAppearance[execution.status]}>{t(`executionStatus.${execution.status}`)}</Lozenge>
      </td>
      <td className="px-4 py-2.5 tabular-nums">
        {steps.passed} / {steps.total}
        {steps.failed > 0 && <span className="ml-1.5 text-xs text-destructive">{steps.failed} {t("executionStatus.failed").toLocaleLowerCase()}</span>}
      </td>
      <td className="px-4 py-2.5 text-xs">{execution.testPlan ? <span className="font-mono text-primary">{execution.testPlan.key}</span> : <span className="text-mutedForeground">{t("adHocExecution")}</span>}</td>
      <td className="px-4 py-2.5 text-mutedForeground">{execution.environment || "-"}</td>
      <td className="px-4 py-2.5 text-mutedForeground">{execution.executedBy?.displayName ?? "-"}</td>
      <td className="px-4 py-2.5 text-mutedForeground">{new Date(execution.createdAt).toLocaleString()}</td>
    </tr>
  );
}

function CreateExecutionDialog({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const [query, setQuery] = useState("");
  const [rowId, setRowId] = useState("");
  const [environment, setEnvironment] = useState("");
  const [buildReference, setBuildReference] = useState("");
  const [iteration, setIteration] = useState("");

  const scenarios = useQuery({
    queryKey: ["workspace-test-scenarios", workspaceId],
    queryFn: () => api<TestScenarioCandidate[]>(`/workspaces/${workspaceId}/test-scenarios`),
  });
  const normalized = query.trim().toLocaleLowerCase();
  const visible = (scenarios.data ?? []).filter(
    (candidate) => !normalized || `${candidate.title} ${candidate.objectNumber} ${candidate.document.title} ${candidate.document.key ?? ""}`.toLocaleLowerCase().includes(normalized),
  );

  const create = useMutation({
    mutationFn: () =>
      api<{ id: string; key: string | null }>(`/rows/${rowId}/executions`, {
        method: "POST",
        body: JSON.stringify({
          environment: environment.trim() || undefined,
          buildReference: buildReference.trim() || undefined,
          iteration: iteration.trim() || undefined,
        }),
      }),
    onSuccess: async (execution) => {
      await queryClient.invalidateQueries({ queryKey: ["workspace-executions", workspaceId] });
      pushToast("success", execution.key ? t("executionCreatedWithKey", { key: execution.key }) : t("executionCreated"));
      onClose();
    },
    onError: (error) => pushToast("error", userFacingError(error, t)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (rowId) create.mutate();
  };

  return (
    <ModalSurface onClose={onClose} label={t("createExecution")} testId="create-execution-dialog" panelClassName="flex max-h-[90vh] w-full max-w-2xl flex-col bg-surface">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-base font-semibold">{t("createExecution")}</h2>
          <p className="text-xs text-mutedForeground">{t("createExecutionHelp")}</p>
        </div>
        <button type="button" aria-label={t("close")} className="rounded-lg p-1.5 hover:bg-muted" onClick={onClose}><X size={17} /></button>
      </header>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
        <div className="shrink-0 border-b border-border/70 p-3">
          <label className="flex items-center gap-2 rounded-md border border-border bg-editorBackground px-2.5 py-1.5">
            <Search size={14} className="shrink-0 text-mutedForeground" />
            <input
              data-testid="execution-scenario-search"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              placeholder={t("searchTests")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {scenarios.isLoading ? (
            <p className="p-4 text-sm text-mutedForeground">{t("loading")}</p>
          ) : visible.length === 0 ? (
            <EmptyState icon={<FlaskConical size={18} />} title={t("noRunnableTests")} description={t("noRunnableTestsHelp")} />
          ) : (
            visible.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                aria-pressed={rowId === candidate.id}
                data-testid={`execution-candidate-${candidate.objectNumber}`}
                className={`flex w-full items-start gap-3 border-b border-border/70 px-4 py-2.5 text-left text-sm transition-colors last:border-b-0 hover:bg-muted ${rowId === candidate.id ? "bg-primary/8" : ""}`}
                onClick={() => setRowId(candidate.id)}
              >
                <span className="shrink-0 tabular-nums text-mutedForeground">{candidate.objectNumber}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{candidate.title || t("untitledSection")}</span>
                  <span className="block truncate text-xs text-mutedForeground">
                    {candidate.document.key ? `${candidate.document.key} · ` : ""}
                    {candidate.document.title}
                  </span>
                </span>
                <Lozenge>{t("stepCount", { count: candidate.stepCount })}</Lozenge>
              </button>
            ))
          )}
        </div>
        <div className="shrink-0 space-y-3 border-t border-border p-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-mutedForeground">{t("workHub.environment")}</span>
              <input data-testid="execution-environment" className="input" maxLength={120} value={environment} onChange={(event) => setEnvironment(event.target.value)} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-mutedForeground">{t("workHub.buildReference")}</span>
              <input data-testid="execution-build" className="input" maxLength={120} value={buildReference} onChange={(event) => setBuildReference(event.target.value)} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-mutedForeground">{t("iteration")}</span>
              <input data-testid="execution-iteration" className="input" maxLength={120} value={iteration} onChange={(event) => setIteration(event.target.value)} />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={onClose}>{t("cancel")}</Button>
            <Button type="submit" variant="primary" data-testid="submit-create-execution" icon={<Play size={14} />} disabled={!rowId || create.isPending}>
              {t("startExecution")}
            </Button>
          </div>
        </div>
      </form>
    </ModalSurface>
  );
}
