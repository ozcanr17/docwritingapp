import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bug,
  Bookmark,
  BookmarkPlus,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  ClipboardList,
  Equal,
  ExternalLink,
  FolderPlus,
  Layers,
  Link2,
  MessageSquare,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  SquareCheckBig,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import {
  api,
  ApiError,
  TestPlanCandidate,
  TestPlanDetail,
  TestPlanSummary,
  WorkItemDetail,
  WorkDashboard,
  WorkDocument,
  WorkItemPriority,
  WorkItemStatus,
  WorkItemSummary,
  WorkItemType,
  WorkItemWorkflow,
  WorkItemWorkflowPreset,
  WorkflowRole,
  WorkflowRequiredField,
  WorkUser,
} from "../lib/api";
import { ModalSurface } from "./TransientSurface";
import { Avatar, Button, Card, CardBody, CardHeader, Lozenge, LozengeAppearance, Metric, MetricStrip, TableHead } from "./ui";
import { ManagedProject, ProjectSettingsDialog } from "./ProjectSettingsDialog";
import { useWorkViewsStore, WorkViewTab } from "../stores/workViews";
import { useToastStore } from "../stores/toasts";
import { userFacingError } from "../lib/userFacingError";
import {
  useAuthoringPreferencesStore,
  WorkspaceFocus,
} from "../stores/authoringPreferences";

type Project = Omit<ManagedProject, "access"> & { access?: { canManage: boolean } };
type HubTab = "dashboard" | "items" | "board" | "plans";

const statuses: WorkItemStatus[] = [
  "backlog",
  "ready",
  "in_progress",
  "in_review",
  "done",
];
const allStatuses: WorkItemStatus[] = [...statuses, "canceled"];
const workTypes: WorkItemType[] = ["epic", "story", "task", "bug", "risk"];
const requiredFields: WorkflowRequiredField[] = ["description", "assignee", "dueAt"];

export function WorkManagementPage({
  workspaceId,
  contextDocumentId,
  contextRowId,
}: {
  workspaceId: string;
  contextDocumentId?: string | null;
  contextRowId?: string | null;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const location = useLocation();
  const navigate = useNavigate();
  const segments = location.pathname.split("/").filter(Boolean);
  const routeItemKey = segments[0] === "work" && segments[1] === "item" ? segments[2] ?? null : null;
  const tab: HubTab = segments[1] === "list" ? "items" : segments[1] === "board" ? "board" : segments[1] === "plans" ? "plans" : "dashboard";
  const setTab = useCallback((next: HubTab) => {
    navigate(`/work/${next === "dashboard" ? "summary" : next === "items" ? "list" : next}`);
  }, [navigate]);
  useEffect(() => {
    if (location.pathname === "/work" || location.pathname === "/work/") navigate("/work/summary", { replace: true });
  }, [location.pathname, navigate]);
  const [query, setQuery] = useState("");
  const [mine, setMine] = useState(false);
  const [bugsOnly, setBugsOnly] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [activeViewId, setActiveViewId] = useState("");
  const views = useWorkViewsStore((state) => state.views);
  const saveView = useWorkViewsStore((state) => state.saveView);
  const removeView = useWorkViewsStore((state) => state.removeView);
  const projects = useQuery({
    queryKey: ["projects", workspaceId],
    queryFn: () => api<Project[]>(`/workspaces/${workspaceId}/projects`),
  });
  const projectAccess = useQuery({
    queryKey: ["project-access", workspaceId],
    queryFn: () => api<{ canManage: boolean }>(`/workspaces/${workspaceId}/project-access`),
  });
  const activeProjectId =
    projects.data?.some((project) => project.id === selectedProjectId)
      ? selectedProjectId
      : projects.data?.[0]?.id ?? null;
  const activeProject = projects.data?.find((project) => project.id === activeProjectId) ?? null;
  const canManageActiveProject = activeProject?.access?.canManage ?? projectAccess.data?.canManage ?? false;
  const managedActiveProject: ManagedProject | null = activeProject
    ? { ...activeProject, access: { canManage: canManageActiveProject } }
    : null;
  useEffect(() => {
    const maybeOpenCreate = () => {
      if (window.sessionStorage.getItem("docsys.openWorkCreate") !== "1" || !activeProjectId) return;
      window.sessionStorage.removeItem("docsys.openWorkCreate");
      setCreateOpen(true);
    };
    maybeOpenCreate();
    window.addEventListener("docsys:open-work-create", maybeOpenCreate);
    return () => window.removeEventListener("docsys:open-work-create", maybeOpenCreate);
  }, [activeProjectId]);
  useEffect(() => {
    if (activeProjectId && activeProjectId !== selectedProjectId)
      setSelectedProjectId(activeProjectId);
  }, [activeProjectId, selectedProjectId]);
  const params = new URLSearchParams();
  if (activeProjectId) params.set("projectId", activeProjectId);
  if (tab !== "dashboard" && query.trim()) params.set("q", query.trim());
  if (tab !== "dashboard" && mine) params.set("assigneeId", "me");
  if (tab !== "dashboard" && bugsOnly) params.set("type", "bug");
  const items = useQuery({
    queryKey: ["work-items", workspaceId, activeProjectId, tab, query, mine, bugsOnly],
    queryFn: () =>
      api<WorkItemSummary[]>(
        `/workspaces/${workspaceId}/work-items?${params.toString()}`,
      ),
    enabled: activeProjectId !== null,
  });
  const plans = useQuery({
    queryKey: ["test-plans", activeProjectId],
    queryFn: () =>
      api<TestPlanSummary[]>(`/projects/${activeProjectId}/test-plans`),
    enabled: activeProjectId !== null,
  });
  const workflow = useQuery({
    queryKey: ["work-item-workflow", activeProjectId],
    queryFn: () => api<WorkItemWorkflow>(`/projects/${activeProjectId}/workflow`),
    enabled: activeProjectId !== null,
  });
  const dashboard = useQuery({
    queryKey: ["work-dashboard", activeProjectId],
    queryFn: () => api<WorkDashboard>(`/projects/${activeProjectId}/work-dashboard`),
    enabled: activeProjectId !== null,
  });
  const locationState = (location.state ?? null) as { workItemId?: string; from?: string } | null;
  const keyLookup = useQuery({
    queryKey: ["work-item-by-key", workspaceId, routeItemKey],
    queryFn: async () => {
      const code = routeItemKey?.split("-")[0] ?? "";
      const project = projects.data?.find((candidate) => candidate.code === code);
      const results = await api<WorkItemSummary[]>(
        `/workspaces/${workspaceId}/work-items?${project ? `projectId=${project.id}&` : ""}q=${encodeURIComponent(routeItemKey ?? "")}`,
      );
      return results.find((candidate) => candidate.key === routeItemKey) ?? null;
    },
    enabled: routeItemKey !== null && !locationState?.workItemId && projects.isSuccess,
  });
  const routeItemId = routeItemKey ? locationState?.workItemId ?? keyLookup.data?.id ?? null : null;
  const openItem = useCallback((item: { id: string; key: string }) => {
    navigate(`/work/item/${item.key}`, { state: { workItemId: item.id, from: location.pathname } });
  }, [location.pathname, navigate]);
  const openItemById = useCallback((id: string) => {
    const pool: WorkItemSummary[] = [
      ...(items.data ?? []),
      ...(dashboard.data?.myOpenBugs ?? []),
      ...(dashboard.data?.recentItems ?? []),
    ];
    const found = pool.find((candidate) => candidate.id === id);
    if (found) openItem(found);
  }, [dashboard.data, items.data, openItem]);
  const closeItem = useCallback(() => {
    navigate(locationState?.from ?? "/work/summary");
  }, [locationState?.from, navigate]);
  const refreshWork = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["work-items", workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ["work-dashboard", activeProjectId] }),
    ]);
  };
  const update = useMutation({
    mutationFn: ({
      item,
      status,
    }: {
      item: WorkItemSummary;
      status: WorkItemStatus;
    }) =>
      api(`/work-items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ expectedVersion: item.version, status }),
      }),
    onSuccess: refreshWork,
    onError: (error) => pushToast("error", userFacingError(error, t)),
  });
  const move = useMutation({
    mutationFn: ({
      item,
      targetStatus,
      anchorId,
      position,
    }: {
      item: WorkItemSummary;
      targetStatus: WorkItemStatus;
      anchorId: string | null;
      position: "before" | "after";
    }) =>
      api(`/work-items/${item.id}/move`, {
        method: "POST",
        body: JSON.stringify({
          expectedVersion: item.version,
          targetStatus,
          anchorId,
          position,
        }),
      }),
    onSuccess: refreshWork,
    onError: (error) => pushToast("error", userFacingError(error, t)),
  });
  const projectViews = views.filter((view) => view.projectId === activeProjectId);
  const applyView = (viewId: string) => {
    setActiveViewId(viewId);
    const view = projectViews.find((candidate) => candidate.id === viewId);
    if (!view) {
      setQuery("");
      setMine(false);
      setBugsOnly(false);
      return;
    }
    setTab(view.tab);
    setQuery(view.query);
    setMine(view.mine);
    setBugsOnly(view.bugsOnly);
  };

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-editorBackground">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {!routeItemKey && (
        <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2">
          {projects.data && projects.data.length > 0 && (
            <label className="min-w-0">
              <span className="sr-only">{t("workHub.activeProject")}</span>
              <select
                data-testid="project-selector"
                className="max-w-56 rounded-md border border-border bg-editorBackground px-2 py-1.5 text-sm outline-none"
                value={activeProjectId ?? ""}
                onChange={(event) => {
                  setSelectedProjectId(event.target.value);
                  setSelectedPlanId(null);
                }}
              >
                {projects.data.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.code} · {project.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button
            variant="primary"
            size="sm"
            data-testid="open-create-item"
            icon={<Plus size={14} />}
            disabled={!activeProjectId}
            onClick={() => setCreateOpen(true)}
          >
            {t("workHub.newItem")}
          </Button>
          <Button size="sm" icon={<ClipboardList size={14} />} disabled={!activeProjectId} onClick={() => setPlanOpen(true)}>
            {t("workHub.newPlan")}
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" icon={<Settings2 size={14} />} data-testid="open-workflow-editor" disabled={!workflow.data || !canManageActiveProject} onClick={() => setWorkflowOpen(true)}>
              {t("workHub.workflow")}
            </Button>
            {projectAccess.data?.canManage && (
              <Button size="sm" icon={<Settings2 size={14} />} data-testid="open-project-settings" onClick={() => setProjectSettingsOpen(true)}>
                {t("workHub.projectSettings")}
              </Button>
            )}
            <Button size="sm" icon={<FolderPlus size={14} />} data-testid="open-create-project" onClick={() => setCreateProjectOpen(true)}>
              {t("workHub.newProject")}
            </Button>
          </div>
        </div>
      )}
      {(contextRowId || contextDocumentId) && !routeItemKey && (
        <div className="flex items-center gap-2 border-b border-border bg-primary/5 px-4 py-2 text-xs text-primary">
          <Link2 size={14} />
          {contextRowId
            ? t("workHub.rowContext")
            : t("workHub.documentContext")}
        </div>
      )}
      {!routeItemKey && tab !== "plans" && tab !== "dashboard" && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2">
          <>
            <label className="relative min-w-56 flex-1">
              <Search
                size={14}
                className="absolute left-3 top-2.5 text-mutedForeground"
              />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveViewId("");
                }}
                className="w-full rounded-lg border border-border bg-editorBackground py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
                placeholder={t("workHub.search")}
              />
            </label>
            <button
              type="button"
              aria-pressed={mine}
              className={`rounded-lg border px-3 py-2 text-sm ${mine ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
              onClick={() => {
                setMine((value) => !value);
                setActiveViewId("");
              }}
            >
              <UserRound size={14} className="mr-1.5 inline" />
              {t("workHub.assignedToMe")}
            </button>
            <button
              type="button"
              aria-pressed={bugsOnly}
              className={`rounded-lg border px-3 py-2 text-sm ${bugsOnly ? "border-danger bg-destructive/10 text-destructive" : "border-border"}`}
              onClick={() => {
                setBugsOnly((value) => !value);
                setActiveViewId("");
              }}
            >
              <Bug size={14} className="mr-1.5 inline" />
              {t("workHub.bugs")}
            </button>
            <label className="flex min-w-44 items-center gap-2 rounded-lg border border-border bg-editorBackground px-2">
              <Bookmark size={14} className="text-mutedForeground" />
              <span className="sr-only">{t("workHub.savedViews")}</span>
              <select
                data-testid="work-view-selector"
                className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
                value={activeViewId}
                onChange={(event) => applyView(event.target.value)}
              >
                <option value="">{t("workHub.currentView")}</option>
                {projectViews.map((view) => (
                  <option key={view.id} value={view.id}>
                    {view.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              data-testid="save-work-view"
              className="rounded-lg border border-border px-2.5 py-2 text-mutedForeground hover:bg-muted hover:text-foreground"
              title={t("workHub.saveView")}
              aria-label={t("workHub.saveView")}
              onClick={() => setSaveViewOpen(true)}
            >
              <BookmarkPlus size={15} />
            </button>
            {activeViewId && (
              <button
                type="button"
                data-testid="remove-work-view"
                className="rounded-lg border border-border px-2.5 py-2 text-destructive hover:bg-destructive/10"
                title={t("workHub.removeView")}
                aria-label={t("workHub.removeView")}
                onClick={() => {
                  removeView(activeViewId);
                  applyView("");
                }}
              >
                <Trash2 size={15} />
              </button>
            )}
          </>
        </div>
      )}
      {routeItemKey ? (
        routeItemId ? (
          <WorkItemView
            workItemId={routeItemId}
            workspaceId={workspaceId}
            workflow={workflow.data}
            onClose={closeItem}
          />
        ) : keyLookup.isFetching || !projects.isSuccess ? (
          <div className="p-8 text-sm text-mutedForeground">{t("workHub.loading")}</div>
        ) : (
          <Empty
            title={t("workHub.itemNotFound")}
            detail={t("workHub.itemNotFoundHelp")}
            action={
              <Button variant="primary" className="mt-4" onClick={closeItem}>
                {t("workHub.backToList")}
              </Button>
            }
          />
        )
      ) : (
      <div className={`min-h-0 flex-1 ${tab === "board" ? "overflow-x-auto overflow-y-hidden p-3" : "overflow-auto p-4"}`}>
        {projects.isLoading ? (
          <Empty title={t("workHub.loadingProjects")} detail={t("workHub.loadingProjectsHelp")} />
        ) : projects.isError ? (
          <Empty title={t("workHub.projectLoadError")} detail={t("workHub.projectLoadErrorHelp")} />
        ) : !activeProjectId ? (
          <Empty
            title={t("workHub.noProject")}
            detail={t("workHub.noProjectHelp")}
            action={
              <button
                type="button"
                data-testid="empty-create-project"
                className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primaryForeground"
                onClick={() => setCreateProjectOpen(true)}
              >
                <FolderPlus size={15} className="mr-1.5 inline" />
                {t("workHub.createFirstProject")}
              </button>
            }
          />
        ) : tab === "dashboard" ? (
          <WorkDashboardView
            dashboard={dashboard.data}
            items={items.data ?? []}
            workflow={workflow.data}
            onOpen={openItemById}
            onMove={(item, targetStatus, anchorId, position) =>
              move.mutate({ item, targetStatus, anchorId, position })
            }
          />
        ) : tab === "plans" ? (
          <PlanList plans={plans.data ?? []} onOpen={setSelectedPlanId} />
        ) : tab === "board" ? (
          <Board
            items={items.data ?? []}
            onOpen={openItemById}
            workflow={workflow.data}
            onMove={(item, targetStatus, anchorId, position) =>
              move.mutate({ item, targetStatus, anchorId, position })
            }
          />
        ) : (
          <ItemList
            items={items.data ?? []}
            onOpen={openItemById}
            workflow={workflow.data}
            onStatus={(item, status) => update.mutate({ item, status })}
            onMove={(item, anchorId, position) =>
              move.mutate({
                item,
                targetStatus: item.status,
                anchorId,
                position,
              })
            }
          />
        )}
      </div>
      )}
      </div>
      {createOpen && activeProjectId && (
        <CreateItemDialog
          projectId={activeProjectId}
          workspaceId={workspaceId}
          contextDocumentId={contextDocumentId}
          contextRowId={contextRowId}
          onClose={() => setCreateOpen(false)}
        />
      )}
      {createProjectOpen && (
        <CreateProjectDialog
          workspaceId={workspaceId}
          onCreated={(projectId) => setSelectedProjectId(projectId)}
          onClose={() => setCreateProjectOpen(false)}
        />
      )}
      {projectSettingsOpen && (
        <ProjectSettingsDialog
          workspaceId={workspaceId}
          project={managedActiveProject}
          onProjectChanged={(project) => {
            setSelectedProjectId(project.id);
            queryClient.setQueryData<Project[]>(["projects", workspaceId], (current) => {
              if (!current) return [project];
              const exists = current.some((item) => item.id === project.id);
              return exists
                ? current.map((item) => item.id === project.id ? project : item)
                : [...current, project];
            });
          }}
          onProjectArchived={(projectId) => {
            setSelectedProjectId((current) => current === projectId ? null : current);
            setSelectedPlanId(null);
          }}
          onClose={() => setProjectSettingsOpen(false)}
        />
      )}
      {planOpen && activeProjectId && (
        <CreatePlanDialog
          projectId={activeProjectId}
          onClose={() => setPlanOpen(false)}
        />
      )}
      {workflowOpen && activeProjectId && workflow.data && (
        <WorkflowDialog
          projectId={activeProjectId}
          workflow={workflow.data}
          onClose={() => setWorkflowOpen(false)}
        />
      )}
      {selectedPlanId && activeProjectId && (
        <TestPlanDetailDialog
          testPlanId={selectedPlanId}
          projectId={activeProjectId}
          onClose={() => setSelectedPlanId(null)}
        />
      )}
      {saveViewOpen && activeProjectId && (tab === "items" || tab === "board") && (
        <SaveWorkViewDialog
          tab={tab}
          projectId={activeProjectId}
          query={query}
          mine={mine}
          bugsOnly={bugsOnly}
          onSave={(name) => {
            const id = saveView({
              projectId: activeProjectId,
              name,
              tab,
              query,
              mine,
              bugsOnly,
            });
            setActiveViewId(id);
            setSaveViewOpen(false);
          }}
          onClose={() => setSaveViewOpen(false)}
        />
      )}
    </div>
  );
}

function SaveWorkViewDialog({
  tab,
  projectId,
  query,
  mine,
  bugsOnly,
  onSave,
  onClose,
}: {
  tab: WorkViewTab;
  projectId: string;
  query: string;
  mine: boolean;
  bugsOnly: boolean;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  return (
    <DialogFrame title={t("workHub.saveView")} onClose={onClose}>
      <form
        className="mt-5 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) onSave(name.trim());
        }}
      >
        <Field label={t("workHub.viewName")}>
          <input
            autoFocus
            required
            maxLength={80}
            data-testid="work-view-name"
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-5 text-mutedForeground">
          {t("workHub.viewSummary", {
            layout: t(`workHub.${tab === "items" ? "list" : "board"}`),
            query: query || t("workHub.noSearchFilter"),
            assignment: mine
              ? t("workHub.assignedToMe")
              : t("workHub.allAssignees"),
            type: bugsOnly ? t("workHub.bugs") : t("workHub.allTypes"),
          })}
        </div>
        <input type="hidden" value={projectId} readOnly />
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted" onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="submit" data-testid="confirm-save-work-view" disabled={!name.trim()} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primaryForeground disabled:opacity-50">
            {t("save")}
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}

function WorkDashboardView({
  dashboard,
  items,
  workflow,
  onOpen,
  onMove,
}: {
  dashboard?: WorkDashboard;
  items: WorkItemSummary[];
  workflow?: WorkItemWorkflow;
  onOpen: (id: string) => void;
  onMove: (item: WorkItemSummary, status: WorkItemStatus, anchorId: string | null, position: "before" | "after") => void;
}) {
  const { t } = useTranslation();
  const workspaceFocus = useAuthoringPreferencesStore(
    (state) => state.workspaceFocus,
  );
  if (!dashboard) return <Empty title={t("workHub.loadingDashboard")} detail={t("workHub.loadingDashboardHelp")} />;
  return (
    <div className="space-y-4">
      <MetricStrip testId="work-metrics">
        <Metric label={t("workHub.openItems")} value={dashboard.metrics.open} caption={`${dashboard.metrics.total} ${t("workHub.totalItems")}`} icon={<AlertCircle size={14} />} tone="primary" />
        <Metric
          label={t("workHub.myOpenBugs")}
          value={dashboard.metrics.myOpenBugCount}
          caption={`${dashboard.metrics.criticalOpen} ${t("workHub.criticalOpen")}`}
          delta={dashboard.metrics.criticalOpen > 0 ? t("workHub.criticalOpen") : undefined}
          deltaTone="negative"
          icon={<Bug size={14} />}
          tone="danger"
        />
        <Metric label={t("workHub.activePlans")} value={dashboard.metrics.activePlans} caption={`${dashboard.metrics.executions} ${t("workHub.lifecycleExecutions")}`} icon={<CheckCircle2 size={14} />} tone="success" />
        <Metric label={t("workHub.completionRate")} value={`${dashboard.metrics.completionRate}%`} caption={`${dashboard.metrics.completed} / ${dashboard.metrics.total}`} icon={<Activity size={14} />} tone="info" />
        <Metric label={t("workHub.unassignedOpen")} value={dashboard.metrics.unassigned} caption={`${dashboard.metrics.linkedEvidence} ${t("workHub.linkedEvidence")}`} icon={<UserRound size={14} />} tone="purple" />
      </MetricStrip>
      <RoleFocusSummary focus={workspaceFocus} metrics={dashboard.metrics} />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title={t("workHub.myOpenBugs")} icon={<Bug size={15} className="text-destructive" />} badge={<Lozenge appearance={dashboard.myOpenBugs.length ? "danger" : "neutral"}>{dashboard.myOpenBugs.length}</Lozenge>} />
          <div className="py-1"><DashboardItemList items={dashboard.myOpenBugs} empty={t("workHub.noMyOpenBugs")} onOpen={onOpen} /></div>
        </Card>
        <Card>
          <CardHeader title={t("workHub.recentItems")} icon={<ClipboardList size={15} className="text-primary" />} badge={<Lozenge>{dashboard.recentItems.length}</Lozenge>} />
          <div className="py-1"><DashboardItemList items={dashboard.recentItems} empty={t("workHub.noRecentItems")} onOpen={onOpen} /></div>
        </Card>
        <Card>
          <CardHeader title={t("workHub.systemMetrics")} icon={<Activity size={15} className="text-success" />} />
          <CardBody className="grid grid-cols-2 gap-2">
            <DashboardMetric label={t("workHub.completionRate")} value={`${dashboard.metrics.completionRate}%`} />
            <DashboardMetric label={t("workHub.totalItems")} value={dashboard.metrics.total} />
            <DashboardMetric label={t("workHub.unassignedOpen")} value={dashboard.metrics.unassigned} tone={dashboard.metrics.unassigned ? "warning" : "success"} />
            <DashboardMetric label={t("workHub.criticalOpen")} value={dashboard.metrics.criticalOpen} tone={dashboard.metrics.criticalOpen ? "danger" : "success"} />
          </CardBody>
        </Card>
      </div>
      <EngineeringLifecycle metrics={dashboard.metrics} />
      <Card>
        <CardHeader
          title={t("workHub.workflowBoard")}
          subtitle={t("workHub.workflowBoardHelp")}
          badge={<Lozenge>{t("workHub.itemCount", { count: items.length })}</Lozenge>}
        />
        <CardBody className="overflow-x-auto">
          <Board items={items} onOpen={onOpen} workflow={workflow} onMove={onMove} embedded />
        </CardBody>
      </Card>
    </div>
  );
}

function RoleFocusSummary({
  focus,
  metrics,
}: {
  focus: WorkspaceFocus;
  metrics: WorkDashboard["metrics"];
}) {
  const { t } = useTranslation();
  const values =
    focus === "tester"
      ? [
          [t("workHub.activePlans"), metrics.activePlans],
          [t("workHub.lifecycleExecutions"), metrics.executions],
          [t("workHub.failedExecutions"), metrics.failedExecutions],
        ]
      : focus === "reviewer"
        ? [
            [t("workHub.criticalOpen"), metrics.criticalOpen],
            [t("workHub.unassignedOpen"), metrics.unassigned],
            [t("workHub.lifecycleDefects"), metrics.openDefects],
          ]
        : [
            [t("workHub.lifecycleRequirements"), metrics.requirements],
            [t("workHub.lifecycleTests"), metrics.testCases],
            [t("workHub.linkedEvidence"), metrics.linkedEvidence],
          ];
  return (
    <Card testId="role-focus-summary">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-52">
          <div className="text-[11px] font-medium text-primary">{t("workspaceFocus.label")}</div>
          <h2 className="mt-0.5 text-sm font-semibold text-foreground">{t(`workspaceFocus.${focus}.title`)}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {values.map(([label, value]) => (
            <div key={String(label)} className="min-w-28 rounded-lg border border-border bg-surfaceSubtle px-3 py-2">
              <div className="text-lg font-semibold tabular-nums tracking-tight">{value}</div>
              <div className="text-[11px] text-mutedForeground">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function EngineeringLifecycle({ metrics }: { metrics: WorkDashboard["metrics"] }) {
  const { t } = useTranslation();
  const stages = [
    { key: "requirements", label: t("workHub.lifecycleRequirements"), value: metrics.requirements ?? 0, icon: <ClipboardList size={16} /> },
    { key: "tests", label: t("workHub.lifecycleTests"), value: metrics.testCases ?? 0, meta: t("workHub.lifecyclePlanned", { count: metrics.plannedTests ?? 0 }), icon: <CheckCircle2 size={16} /> },
    { key: "executions", label: t("workHub.lifecycleExecutions"), value: metrics.executions ?? 0, meta: t("workHub.lifecyclePassRate", { rate: metrics.executionPassRate ?? 0 }), icon: <Play size={16} /> },
    { key: "defects", label: t("workHub.lifecycleDefects"), value: metrics.openDefects ?? 0, meta: metrics.failedExecutions ? t("workHub.lifecycleFailed", { count: metrics.failedExecutions }) : t("workHub.lifecycleNoFailed"), icon: <Bug size={16} /> },
  ];
  return (
    <Card testId="engineering-lifecycle">
      <CardHeader
        title={t("workHub.engineeringLifecycle")}
        subtitle={t("workHub.engineeringLifecycleHelp")}
        badge={<Lozenge appearance="primary">{t("workHub.linkedEvidenceCount", { count: metrics.linkedEvidence ?? 0 })}</Lozenge>}
      />
      <CardBody className="grid gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
        {stages.map((stage, index) => (
          <div key={stage.key} className="contents">
            <div className="rounded-lg border border-border bg-surfaceSubtle p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-mutedForeground">{stage.icon}{stage.label}</div>
              <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{stage.value}</div>
              {stage.meta && <div className="mt-1 text-[11px] text-mutedForeground">{stage.meta}</div>}
            </div>
            {index < stages.length - 1 && <ArrowRight aria-hidden="true" size={15} className="mx-auto self-center text-mutedForeground max-md:rotate-90" />}
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

function DashboardItemList({ items, empty, onOpen }: { items: WorkItemSummary[]; empty: string; onOpen: (id: string) => void }) {
  if (!items.length) return <p className="py-6 text-center text-xs text-mutedForeground">{empty}</p>;
  return (
    <div>
      {items.map((item) => (
        <button key={item.id} type="button" className="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-muted" onClick={() => onOpen(item.id)}>
          <TypeIcon type={item.type} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium">{item.title}</span>
            <span className="mt-0.5 block font-mono text-[10px] text-primary">{item.key}</span>
          </span>
          <PriorityBadge priority={item.priority} />
        </button>
      ))}
    </div>
  );
}

function DashboardMetric({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "success" | "warning" | "danger" }) {
  const toneClass = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "danger" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-surfaceSubtle p-3">
      <div className="text-[11px] text-mutedForeground">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums tracking-tight ${toneClass}`}>{value}</div>
    </div>
  );
}

function ItemList({
  items,
  onOpen,
  onStatus,
  onMove,
  workflow,
}: {
  items: WorkItemSummary[];
  onOpen: (id: string) => void;
  onStatus: (item: WorkItemSummary, status: WorkItemStatus) => void;
  onMove: (item: WorkItemSummary, anchorId: string, position: "before" | "after") => void;
  workflow?: WorkItemWorkflow;
}) {
  const { t } = useTranslation();
  if (!items.length)
    return (
      <Empty title={t("workHub.noItems")} detail={t("workHub.noItemsHelp")} />
    );
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <table className="w-full text-left text-sm">
        <TableHead className="border-b border-border bg-surfaceSubtle">
          <tr>
            <th className="w-20 px-3 py-2.5"><span className="sr-only">{t("workHub.order")}</span></th>
            <th className="px-4 py-2.5">{t("workHub.key")}</th>
            <th className="px-4 py-2.5">{t("workHub.summary")}</th>
            <th className="px-4 py-2.5">{t("workHub.priority")}</th>
            <th className="px-4 py-2.5">{t("workHub.assignee")}</th>
            <th className="px-4 py-2.5">{t("workHub.status")}</th>
          </tr>
        </TableHead>
        <tbody>
          {items.map((item, index) => (
            <tr
              key={item.id}
              className="cursor-pointer border-t border-border hover:bg-muted/30"
              onClick={() => onOpen(item.id)}
            >
              <td className="px-2 py-3" onClick={(event) => event.stopPropagation()}>
                <span className="flex">
                  <button
                    type="button"
                    className="rounded p-1 text-mutedForeground hover:bg-muted hover:text-foreground disabled:opacity-25"
                    aria-label={t("workHub.moveUp", { key: item.key })}
                    disabled={index === 0 || items[index - 1]?.status !== item.status}
                    onClick={() => {
                      const anchor = items[index - 1];
                      if (anchor) onMove(item, anchor.id, "before");
                    }}
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-mutedForeground hover:bg-muted hover:text-foreground disabled:opacity-25"
                    aria-label={t("workHub.moveDown", { key: item.key })}
                    disabled={index === items.length - 1 || items[index + 1]?.status !== item.status}
                    onClick={() => {
                      const anchor = items[index + 1];
                      if (anchor) onMove(item, anchor.id, "after");
                    }}
                  >
                    <ArrowDown size={13} />
                  </button>
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-2.5">
                <span className="inline-flex items-center gap-2">
                  <TypeIcon type={item.type} />
                  <span className="font-mono text-xs text-primary">{item.key}</span>
                </span>
              </td>
              <td className="min-w-64 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{item.title}</span>
                  {item._count.artifactLinks > 0 && (
                    <span className="text-xs text-mutedForeground">
                      <Link2 size={11} className="mr-0.5 inline" />
                      {item._count.artifactLinks}
                    </span>
                  )}
                  {item._count.comments > 0 && (
                    <span className="text-xs text-mutedForeground">
                      <MessageSquare size={11} className="mr-0.5 inline" />
                      {item._count.comments}
                    </span>
                  )}
                </div>
              </td>
              <td className="whitespace-nowrap px-4 py-2.5">
                <PriorityBadge priority={item.priority} />
              </td>
              <td className="whitespace-nowrap px-4 py-2.5">
                {item.assignee ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-foreground/80">
                    <Avatar name={item.assignee.displayName} size="xs" />
                    {item.assignee.displayName}
                  </span>
                ) : (
                  <span className="text-xs text-mutedForeground">{t("workHub.unassigned")}</span>
                )}
              </td>
              <td
                className="whitespace-nowrap px-4 py-2.5"
                onClick={(event) => event.stopPropagation()}
              >
                <StatusSelect item={item} workflow={workflow} onStatus={onStatus} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Board({
  items,
  onOpen,
  onMove,
  workflow,
  embedded = false,
}: {
  items: WorkItemSummary[];
  onOpen: (id: string) => void;
  onMove: (item: WorkItemSummary, status: WorkItemStatus, anchorId: string | null, position: "before" | "after") => void;
  workflow?: WorkItemWorkflow;
  embedded?: boolean;
}) {
  const { t } = useTranslation();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  return (
    <div className={`grid grid-cols-5 gap-2.5 ${embedded ? "min-w-[1120px]" : "h-full min-w-[1020px]"}`}>
      {statuses.map((status) => {
        const columnItems = items.filter((item) => item.status === status);
        return (
        <section
          key={status}
          data-testid={`board-column-${status}`}
          className={`flex min-h-0 flex-col rounded-lg border border-border/70 bg-surfaceSubtle ${embedded ? "" : "h-full"}`}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const item = items.find((candidate) => candidate.id === draggedId);
            const targetItems = columnItems.filter((candidate) => candidate.id !== draggedId);
            const anchor = targetItems.at(-1);
            if (item && (item.status === status || allowedStatuses(item, workflow).includes(status))) onMove(item, status, anchor?.id ?? null, "after");
            setDraggedId(null);
          }}
        >
          <header className="flex shrink-0 items-center justify-between px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-mutedForeground">
            <span>{t(`workHub.statuses.${status}`)}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 tabular-nums">
              {columnItems.length}
            </span>
          </header>
          <div className={`space-y-1.5 px-1.5 pb-1.5 ${embedded ? "" : "min-h-0 flex-1 overflow-y-auto"}`}>
            {columnItems.map((item) => (
                <article
                  key={item.id}
                  draggable
                  className="cursor-grab rounded-md border border-border bg-surface p-2.5 shadow-sm transition-colors hover:border-primary/50 active:cursor-grabbing"
                  onDragStart={(event) => {
                    setDraggedId(item.id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => setDraggedId(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const source = items.find((candidate) => candidate.id === draggedId);
                    if (source && (source.status === status || allowedStatuses(source, workflow).includes(status))) onMove(source, status, item.id, "before");
                    setDraggedId(null);
                  }}
                  onClick={() => onOpen(item.id)}
                >
                  <div className="text-sm font-medium leading-5">
                    {item.title}
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <TypeIcon type={item.type} />
                      <span className="truncate font-mono text-[11px] text-primary">{item.key}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <PriorityIcon priority={item.priority} />
                      {item.assignee ? (
                        <Avatar name={item.assignee.displayName} size="xs" />
                      ) : (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-borderStrong text-mutedForeground" title={t("workHub.unassigned")} aria-label={t("workHub.unassigned")}>
                          <UserRound size={11} />
                        </span>
                      )}
                    </span>
                  </div>
                </article>
              ))}
          </div>
        </section>
        );
      })}
    </div>
  );
}

function PlanList({
  plans,
  onOpen,
}: {
  plans: TestPlanSummary[];
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  if (!plans.length)
    return (
      <Empty title={t("workHub.noPlans")} detail={t("workHub.noPlansHelp")} />
    );
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {plans.map((plan) => (
        <button
          key={plan.id}
          type="button"
          className="overflow-hidden rounded-xl border border-border bg-surface text-left transition-colors hover:border-primary/50"
          onClick={() => onOpen(plan.id)}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border/70 px-4 py-3">
            <div className="min-w-0">
              <div className="font-mono text-xs text-primary">{plan.key}</div>
              <h2 className="mt-0.5 truncate text-sm font-semibold">{plan.name}</h2>
            </div>
            <Lozenge appearance={plan.status === "completed" ? "success" : plan.status === "active" ? "primary" : "neutral"}>
              {t(`workHub.planStatuses.${plan.status}`)}
            </Lozenge>
          </div>
          <div className="p-4">
            <p className="line-clamp-2 text-sm text-mutedForeground">
              {plan.description || t("workHub.noDescription")}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-border bg-surfaceSubtle p-2.5">
                <div className="text-mutedForeground">{t("workHub.tests")}</div>
                <div className="mt-1 text-base font-semibold tabular-nums">{plan._count.items}</div>
              </div>
              <div className="rounded-lg border border-border bg-surfaceSubtle p-2.5">
                <div className="text-mutedForeground">{t("workHub.environment")}</div>
                <div className="mt-1 truncate text-base font-semibold">{plan.environment || "-"}</div>
              </div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function StatusSelect({
  item,
  onStatus,
  workflow,
}: {
  item: WorkItemSummary;
  onStatus: (item: WorkItemSummary, status: WorkItemStatus) => void;
  workflow?: WorkItemWorkflow;
}) {
  const { t } = useTranslation();
  const toneClasses: Record<WorkItemStatus, string> = {
    backlog: "border-border bg-muted text-foreground/80",
    ready: "border-info/30 bg-info/10 text-info",
    in_progress: "border-primary/30 bg-primary/10 text-primary",
    in_review: "border-warning/35 bg-warning/12 text-warning",
    done: "border-success/30 bg-success/10 text-success",
    canceled: "border-border bg-muted text-mutedForeground",
  };
  return (
    <select
      value={item.status}
      data-status={item.status}
      onChange={(event) => onStatus(item, event.target.value as WorkItemStatus)}
      className={`rounded-md border px-2 py-1 text-xs font-semibold ${toneClasses[item.status]}`}
    >
      {[item.status, ...allowedStatuses(item, workflow)].filter((status, index, values) => values.indexOf(status) === index).map((status) => (
        <option key={status} value={status}>
          {t(`workHub.statuses.${status}`)}
        </option>
      ))}
    </select>
  );
}

function allowedStatuses(item: WorkItemSummary, workflow?: WorkItemWorkflow) {
  const candidates = workflow?.schemes[item.type].transitions[item.status] ?? allStatuses.filter((status) => status !== item.status);
  if (!workflow) return candidates;
  const actorRoles = workflow.actorRoleKeys ?? [];
  const isAdministrator = actorRoles.some((role) => ["system_admin", "organization_admin", "workspace_admin"].includes(role));
  return candidates.filter((target) => {
    const allowedRoles = workflow.schemes[item.type].transitionRoles?.[item.status]?.[target] ?? [];
    return allowedRoles.length === 0 || isAdministrator || allowedRoles.some((role) => actorRoles.includes(role));
  });
}

function TypeIcon({ type, size = 14 }: { type: WorkItemType; size?: number }) {
  const { t } = useTranslation();
  const label = t(`workHub.types.${type}`);
  const icon = type === "bug" ? (
    <Bug size={size} className="text-destructive" />
  ) : type === "risk" ? (
    <ShieldAlert size={size} className="text-warning" />
  ) : type === "epic" ? (
    <Layers size={size} className="text-[#8250DF]" />
  ) : type === "story" ? (
    <Bookmark size={size} className="text-[#1F845A]" />
  ) : (
    <SquareCheckBig size={size} className="text-[#1868DB]" />
  );
  return <span role="img" aria-label={label} title={label} className="inline-flex shrink-0 items-center">{icon}</span>;
}

function PriorityIcon({ priority, size = 14 }: { priority: WorkItemPriority; size?: number }) {
  const { t } = useTranslation();
  const label = t(`workHub.priorities.${priority}`);
  const icon = priority === "critical" ? (
    <ChevronsUp size={size} className="text-[#AE2E24]" />
  ) : priority === "highest" ? (
    <ChevronsUp size={size} className="text-destructive" />
  ) : priority === "high" ? (
    <ChevronUp size={size} className="text-[#E56910]" />
  ) : priority === "low" ? (
    <ChevronDown size={size} className="text-info" />
  ) : priority === "lowest" ? (
    <ChevronsDown size={size} className="text-info" />
  ) : (
    <Equal size={size} className="text-mutedForeground" />
  );
  return <span role="img" aria-label={label} title={label} className="inline-flex shrink-0 items-center">{icon}</span>;
}

const statusAppearances: Record<WorkItemStatus, LozengeAppearance> = {
  backlog: "neutral",
  ready: "info",
  in_progress: "primary",
  in_review: "warning",
  done: "success",
  canceled: "neutral",
};

function StatusLozenge({ status }: { status: WorkItemStatus }) {
  const { t } = useTranslation();
  return <Lozenge appearance={statusAppearances[status]}>{t(`workHub.statuses.${status}`)}</Lozenge>;
}

function PriorityBadge({ priority }: { priority: WorkItemPriority }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-foreground/80">
      <PriorityIcon priority={priority} />
      {t(`workHub.priorities.${priority}`)}
    </span>
  );
}

function Empty({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <ClipboardList size={36} className="mx-auto text-mutedForeground" />
      <h2 className="mt-4 font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-mutedForeground">{detail}</p>
      {action}
    </div>
  );
}

function DialogFrame({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <ModalSurface
      onClose={onClose}
      label={title}
      testId="dialog-frame"
      panelClassName={`flex max-h-[90vh] w-full flex-col bg-surface ${wide ? "max-w-5xl" : "max-w-lg"}`}
    >
        <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            aria-label={title}
            className="rounded-lg p-1.5 hover:bg-muted"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto p-5">{children}</div>
    </ModalSurface>
  );
}

function CreateProjectDialog({
  workspaceId,
  onCreated,
  onClose,
}: {
  workspaceId: string;
  onCreated: (projectId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const create = useMutation({
    mutationFn: () =>
      api<Project>(`/workspaces/${workspaceId}/projects`, {
        method: "POST",
        body: JSON.stringify({ name, code, description }),
      }),
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ["projects", workspaceId] });
      onCreated(project.id);
      onClose();
    },
  });
  const errorKey =
    create.error instanceof ApiError && create.error.status === 403
      ? "workHub.projectPermissionError"
      : create.error instanceof ApiError && create.error.status === 409
        ? "workHub.projectCodeExists"
        : "workHub.projectCreateError";
  return (
    <DialogFrame title={t("workHub.createProject")} onClose={onClose}>
      <form
        className="mt-5 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <Field label={t("workHub.projectName")}>
          <input
            data-testid="project-name"
            autoFocus
            required
            maxLength={200}
            value={name}
            className="input"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label={t("workHub.projectCode")}>
          <input
            data-testid="project-code"
            required
            minLength={2}
            maxLength={12}
            pattern="[A-Za-z][A-Za-z0-9]*"
            value={code}
            className="input font-mono uppercase"
            onChange={(event) => setCode(event.target.value.toLocaleUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))}
          />
          <p className="mt-1 text-xs text-mutedForeground">{t("workHub.projectCodeHelp")}</p>
        </Field>
        <Field label={t("workHub.descriptionLabel")}>
          <textarea
            maxLength={2000}
            value={description}
            className="input min-h-24 resize-y"
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-5 text-mutedForeground">
          {t("workHub.projectCreationHelp")}
        </div>
        {create.isError && <p role="alert" className="text-sm text-destructive">{t(errorKey)}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted" onClick={onClose}>{t("cancel")}</button>
          <button
            type="submit"
            data-testid="create-project"
            disabled={create.isPending || !name.trim() || code.length < 2}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primaryForeground disabled:opacity-50"
          >
            {create.isPending ? t("workHub.creatingProject") : t("workHub.createProject")}
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}

function WorkflowDialog({
  projectId,
  workflow,
  onClose,
}: {
  projectId: string;
  workflow: WorkItemWorkflow;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [type, setType] = useState<WorkItemType>("task");
  const [draft, setDraft] = useState<WorkItemWorkflow>(() => structuredClone(workflow));
  const [activePreset, setActivePreset] = useState("");
  const presets = useQuery({
    queryKey: ["work-item-workflow-presets", projectId],
    queryFn: () => api<WorkItemWorkflowPreset[]>(`/projects/${projectId}/workflow-presets`),
  });
  const save = useMutation({
    mutationFn: () =>
      api<WorkItemWorkflow>(`/projects/${projectId}/workflow`, {
        method: "PUT",
        body: JSON.stringify({
          expectedVersion: draft.version,
          schemes: draft.schemes,
        }),
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(["work-item-workflow", projectId], next);
      onClose();
    },
  });
  const toggleTransition = (from: WorkItemStatus, to: WorkItemStatus) => {
    setDraft((current) => {
      const next = structuredClone(current);
      const values = next.schemes[type].transitions[from];
      next.schemes[type].transitions[from] = values.includes(to)
        ? values.filter((value) => value !== to)
        : [...values, to];
      if (values.includes(to)) delete next.schemes[type].transitionRoles[from][to];
      return next;
    });
  };
  const setTransitionRoles = (from: WorkItemStatus, to: WorkItemStatus, value: string) => {
    setDraft((current) => {
      const next = structuredClone(current);
      const roles: WorkflowRole[] = value === "manager"
        ? ["project_manager"]
        : value === "editor"
          ? ["editor"]
          : value === "manager_editor"
            ? ["project_manager", "editor"]
            : [];
      if (roles.length) next.schemes[type].transitionRoles[from][to] = roles;
      else delete next.schemes[type].transitionRoles[from][to];
      return next;
    });
  };
  const transitionRoleValue = (from: WorkItemStatus, to: WorkItemStatus) => {
    const roles = draft.schemes[type].transitionRoles?.[from]?.[to] ?? [];
    if (roles.length === 2) return "manager_editor";
    if (roles[0] === "project_manager") return "manager";
    if (roles[0] === "editor") return "editor";
    return "any";
  };
  const toggleRequired = (status: WorkItemStatus, field: WorkflowRequiredField) => {
    setDraft((current) => {
      const next = structuredClone(current);
      const values = next.schemes[type].requiredFields[status];
      next.schemes[type].requiredFields[status] = values.includes(field)
        ? values.filter((value) => value !== field)
        : [...values, field];
      return next;
    });
  };
  return (
    <DialogFrame title={t("workHub.workflowTitle")} onClose={onClose} wide>
      <p className="mt-2 text-sm text-mutedForeground">{t("workHub.workflowHelp")}</p>
      <section className="mt-4 rounded-xl border border-border bg-muted/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">{t("workHub.workflowPresets")}</h3>
            <p className="mt-0.5 text-xs text-mutedForeground">{t("workHub.workflowPresetsHelp")}</p>
          </div>
          {activePreset && <span role="status" data-testid="workflow-preset-pending" className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">{t("workHub.workflowPresetPending")}</span>}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {presets.data?.map((preset) => (
            <button
              key={preset.key}
              type="button"
              data-testid={`workflow-preset-${preset.key}`}
              className={`rounded-lg border p-3 text-left hover:border-primary/50 hover:bg-surface ${activePreset === preset.key ? "border-primary bg-primary/5" : "border-border bg-editorBackground"}`}
              onClick={() => {
                setDraft((current) => ({ ...current, schemes: structuredClone(preset.schemes) }));
                setActivePreset(preset.key);
              }}
            >
              <span className="block text-sm font-medium">{t(`workHub.workflowPresetNames.${preset.key}`)}</span>
              <span className="mt-1 block text-xs leading-5 text-mutedForeground">{t(`workHub.workflowPresetDescriptions.${preset.key}`)}</span>
            </button>
          ))}
        </div>
      </section>
      <div className="mt-4 flex flex-wrap gap-1.5" role="tablist" aria-label={t("workHub.type")}>
        {workTypes.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={value === type}
            className={`rounded-lg border px-3 py-1.5 text-xs ${value === type ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
            onClick={() => setType(value)}
          >
            {t(`workHub.types.${value}`)}
          </button>
        ))}
      </div>
      <div className="mt-4 overflow-auto rounded-xl border border-border">
        <table className="min-w-[780px] w-full text-left text-xs">
          <thead className="bg-muted/40 text-mutedForeground">
            <tr>
              <th className="px-3 py-2">{t("workHub.fromStatus")}</th>
              <th className="px-3 py-2">{t("workHub.allowedTransitions")}</th>
              <th className="px-3 py-2">{t("workHub.requiredFields")}</th>
            </tr>
          </thead>
          <tbody>
            {allStatuses.map((from) => (
              <tr key={from} className="border-t border-border align-top">
                <th className="whitespace-nowrap px-3 py-3 font-medium">{t(`workHub.statuses.${from}`)}</th>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1.5">
                    {allStatuses.filter((to) => to !== from).map((to) => (
                      <div key={to} className="rounded-md border border-border bg-editorBackground px-2 py-1.5">
                        <label className="flex cursor-pointer items-center gap-1">
                          <input
                            type="checkbox"
                            checked={draft.schemes[type].transitions[from].includes(to)}
                            onChange={() => toggleTransition(from, to)}
                          />
                          {t(`workHub.statuses.${to}`)}
                        </label>
                        {draft.schemes[type].transitions[from].includes(to) && (
                          <select
                            className="mt-1 w-full rounded border border-border bg-surface px-1.5 py-1 text-[11px]"
                            aria-label={t("workHub.transitionPermissionLabel", {
                              from: t(`workHub.statuses.${from}`),
                              to: t(`workHub.statuses.${to}`),
                            })}
                            value={transitionRoleValue(from, to)}
                            onChange={(event) => setTransitionRoles(from, to, event.target.value)}
                          >
                            <option value="any">{t("workHub.transitionRoleOptions.any")}</option>
                            <option value="manager">{t("workHub.transitionRoleOptions.manager")}</option>
                            <option value="editor">{t("workHub.transitionRoleOptions.editor")}</option>
                            <option value="manager_editor">{t("workHub.transitionRoleOptions.managerEditor")}</option>
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1.5">
                    {requiredFields.map((field) => (
                      <label key={field} className="flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1">
                        <input
                          type="checkbox"
                          checked={draft.schemes[type].requiredFields[from].includes(field)}
                          onChange={() => toggleRequired(from, field)}
                        />
                        {t(`workHub.workflowFields.${field}`)}
                      </label>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {save.isError && <p role="alert" className="mt-3 text-sm text-destructive">{t("workHub.workflowSaveError")}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted" onClick={onClose}>{t("cancel")}</button>
        <button type="button" data-testid="save-workflow" className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primaryForeground disabled:opacity-50" disabled={save.isPending} onClick={() => save.mutate()}>{t("save")}</button>
      </div>
    </DialogFrame>
  );
}

function CreateItemDialog({
  projectId,
  workspaceId,
  contextDocumentId,
  contextRowId,
  onClose,
}: {
  projectId: string;
  workspaceId: string;
  contextDocumentId?: string | null;
  contextRowId?: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [type, setType] = useState<WorkItemType>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<WorkItemPriority>("medium");
  const [reporterId, setReporterId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [labels, setLabels] = useState("");
  const [stepsToReproduce, setStepsToReproduce] = useState("");
  const [expectedResult, setExpectedResult] = useState("");
  const [actualResult, setActualResult] = useState("");
  const [environment, setEnvironment] = useState("");
  const [affectedVersion, setAffectedVersion] = useState("");
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [section, setSection] = useState<"details" | "qa" | "relations">("details");
  const users = useQuery({
    queryKey: ["work-users", workspaceId],
    queryFn: () => api<WorkUser[]>(`/workspaces/${workspaceId}/work-users`),
  });
  const documents = useQuery({
    queryKey: ["work-documents", workspaceId],
    queryFn: () => api<WorkDocument[]>(`/workspaces/${workspaceId}/work-documents`),
  });
  const [linkContext, setLinkContext] = useState(
    Boolean(contextRowId || contextDocumentId),
  );
  const contextArtifact = linkContext
    ? contextRowId
      ? { rowId: contextRowId, role: type === "bug" ? "affects" : "relates_to" }
      : contextDocumentId
        ? {
            documentId: contextDocumentId,
            role: type === "bug" ? "affects" : "relates_to",
          }
        : undefined
    : undefined;
  const artifacts = [
    ...(contextArtifact ? [contextArtifact] : []),
    ...selectedDocumentIds
      .filter((documentId) => documentId !== contextDocumentId || !linkContext)
      .map((documentId) => ({ documentId, role: type === "bug" ? "affects" : "relates_to" })),
  ];
  const create = useMutation({
    mutationFn: () =>
      api(`/projects/${projectId}/work-items`, {
        method: "POST",
        body: JSON.stringify({
          type,
          title,
          description,
          stepsToReproduce: type === "bug" ? stepsToReproduce : undefined,
          expectedResult: type === "bug" ? expectedResult : undefined,
          actualResult: type === "bug" ? actualResult : undefined,
          environment: type === "bug" ? environment : undefined,
          affectedVersion: type === "bug" ? affectedVersion : undefined,
          priority,
          reporterId: reporterId || undefined,
          assigneeId: assigneeId || null,
          labels: labels
            .split(",")
            .map((label) => label.trim())
            .filter(Boolean),
          artifacts,
        }),
      }),
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["work-items", workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ["work-dashboard", projectId] }),
      ]);
      onClose();
    },
  });
  const sections = [
    {
      id: "details" as const,
      label: t("workHub.createSections.details"),
      icon: ClipboardList,
    },
    ...(type === "bug"
      ? [
          {
            id: "qa" as const,
            label: t("workHub.createSections.qa"),
            icon: Bug,
          },
        ]
      : []),
    {
      id: "relations" as const,
      label: t("workHub.createSections.relations"),
      icon: Link2,
    },
  ];

  useEffect(() => {
    if (type !== "bug" && section === "qa") setSection("details");
  }, [section, type]);

  return (
    <ModalSurface
      onClose={onClose}
      label={t("workHub.createItem")}
      testId="create-work-item-dialog"
      panelClassName="flex h-[min(760px,calc(100dvh-2rem))] w-full max-w-3xl flex-col bg-surface"
    >
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <header className="flex shrink-0 items-start justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">{t("workHub.createItem")}</h2>
            <p className="mt-1 text-sm text-mutedForeground">
              {t("workHub.createItemHelp")}
            </p>
          </div>
          <button
            type="button"
            aria-label={t("close")}
            className="rounded-lg p-1.5 hover:bg-muted"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </header>

        <div
          role="tablist"
          aria-label={t("workHub.createSections.label")}
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-4 py-2"
        >
          {sections.map((item) => {
            const Icon = item.icon;
            const selected = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                data-testid={`create-section-${item.id}`}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  selected
                    ? "bg-primary/10 text-primary"
                    : "text-mutedForeground hover:bg-muted hover:text-foreground"
                }`}
                onClick={() => setSection(item.id)}
              >
                <Icon size={16} />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {section === "details" && (
            <div
              role="tabpanel"
              className="mx-auto max-w-2xl space-y-4"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("workHub.type")}>
                  <select
                    data-testid="work-item-type"
                    value={type}
                    onChange={(event) =>
                      setType(event.target.value as WorkItemType)
                    }
                    className="input"
                  >
                    <option value="bug">{t("workHub.types.bug")}</option>
                    <option value="task">{t("workHub.types.task")}</option>
                    <option value="story">{t("workHub.types.story")}</option>
                    <option value="epic">{t("workHub.types.epic")}</option>
                    <option value="risk">{t("workHub.types.risk")}</option>
                  </select>
                </Field>
                <Field label={t("workHub.priority")}>
                  <select
                    value={priority}
                    onChange={(event) =>
                      setPriority(event.target.value as WorkItemPriority)
                    }
                    className="input"
                  >
                    {(
                      [
                        "lowest",
                        "low",
                        "medium",
                        "high",
                        "highest",
                        "critical",
                      ] as WorkItemPriority[]
                    ).map((value) => (
                      <option key={value} value={value}>
                        {t(`workHub.priorities.${value}`)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label={t("workHub.summary")}>
                <input
                  autoFocus
                  required
                  data-testid="work-item-summary"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="input"
                />
              </Field>
              <Field label={t("workHub.descriptionLabel")}>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="input min-h-32 resize-y"
                />
              </Field>
              {type === "bug" && (
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl border border-border bg-editorBackground p-4 text-left hover:border-primary/40 hover:bg-muted"
                  onClick={() => setSection("qa")}
                >
                  <span>
                    <span className="block text-sm font-semibold">
                      {t("workHub.qaDetails")}
                    </span>
                    <span className="mt-1 block text-xs text-mutedForeground">
                      {t("workHub.qaDetailsSummary")}
                    </span>
                  </span>
                  <ArrowRight size={17} className="text-mutedForeground" />
                </button>
              )}
            </div>
          )}

          {section === "qa" && type === "bug" && (
            <section
              role="tabpanel"
              className="mx-auto max-w-2xl space-y-4"
            >
              <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-4">
                <h3 className="text-sm font-semibold text-destructive">
                  {t("workHub.qaDetails")}
                </h3>
                <p className="mt-1 text-xs leading-5 text-mutedForeground">
                  {t("workHub.qaDetailsHelp")}
                </p>
              </div>
              <Field label={t("workHub.stepsToReproduce")}>
                <textarea
                  data-testid="work-item-steps"
                  value={stepsToReproduce}
                  onChange={(event) => setStepsToReproduce(event.target.value)}
                  className="input min-h-32 resize-y"
                  placeholder={t("workHub.stepsToReproducePlaceholder")}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("workHub.expectedResult")}>
                  <textarea
                    data-testid="work-item-expected"
                    value={expectedResult}
                    onChange={(event) => setExpectedResult(event.target.value)}
                    className="input min-h-24 resize-y"
                  />
                </Field>
                <Field label={t("workHub.actualResult")}>
                  <textarea
                    data-testid="work-item-actual"
                    value={actualResult}
                    onChange={(event) => setActualResult(event.target.value)}
                    className="input min-h-24 resize-y"
                  />
                </Field>
                <Field label={t("workHub.testEnvironment")}>
                  <input
                    data-testid="work-item-environment"
                    value={environment}
                    onChange={(event) => setEnvironment(event.target.value)}
                    className="input"
                    placeholder={t("workHub.testEnvironmentPlaceholder")}
                  />
                </Field>
                <Field label={t("workHub.affectedVersion")}>
                  <input
                    data-testid="work-item-version"
                    value={affectedVersion}
                    onChange={(event) => setAffectedVersion(event.target.value)}
                    className="input"
                    placeholder={t("workHub.affectedVersionPlaceholder")}
                  />
                </Field>
              </div>
            </section>
          )}

          {section === "relations" && (
            <div role="tabpanel" className="mx-auto max-w-2xl space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-border bg-editorBackground p-4">
                <SlidersHorizontal
                  size={18}
                  className="mt-0.5 shrink-0 text-primary"
                />
                <div>
                  <h3 className="text-sm font-semibold">
                    {t("workHub.createSections.relations")}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-mutedForeground">
                    {t("workHub.relationsHelp")}
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("workHub.reporter")}>
                  <select
                    data-testid="work-item-reporter"
                    value={reporterId}
                    onChange={(event) => setReporterId(event.target.value)}
                    className="input"
                  >
                    <option value="">{t("workHub.currentUser")}</option>
                    {(users.data ?? []).map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.displayName}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("workHub.assignee")}>
                  <select
                    value={assigneeId}
                    onChange={(event) => setAssigneeId(event.target.value)}
                    className="input"
                  >
                    <option value="">{t("workHub.unassigned")}</option>
                    {(users.data ?? []).map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.displayName}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label={t("workHub.labels")}>
                <input
                  data-testid="work-item-labels"
                  value={labels}
                  onChange={(event) => setLabels(event.target.value)}
                  className="input"
                  placeholder={t("workHub.labelsHelp")}
                />
              </Field>
              <DocumentPicker
                documents={documents.data ?? []}
                selectedIds={selectedDocumentIds}
                onChange={setSelectedDocumentIds}
              />
              {(contextRowId || contextDocumentId) && (
                <label className="flex items-center gap-2 rounded-lg border border-border bg-editorBackground p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={linkContext}
                    onChange={(event) => setLinkContext(event.target.checked)}
                  />
                  {contextRowId
                    ? t("workHub.linkSelectedRow")
                    : t("workHub.linkCurrentDocument")}
                </label>
              )}
            </div>
          )}
        </div>

        <footer className="relative flex shrink-0 items-center justify-between gap-3 border-t border-border bg-surface px-5 py-3">
          <p className="min-w-0 truncate text-xs text-mutedForeground">
            {type === "bug"
              ? t("workHub.createFooterBug")
              : t("workHub.createFooterItem")}
          </p>
          <div className="flex shrink-0 justify-end gap-2">
          <button
            type="button"
            className="rounded-lg px-3 py-2 text-sm hover:bg-muted"
            onClick={onClose}
          >
            {t("cancel")}
          </button>
          <button
            type="submit"
            data-testid="create-work-item-submit"
            disabled={!title.trim() || create.isPending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primaryForeground disabled:opacity-50"
          >
            {t("create")}
          </button>
          </div>
          {create.isError && (
            <p
              role="alert"
              className="absolute bottom-16 left-5 right-5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive shadow-lg"
            >
              {t("workHub.createItemError")}
            </p>
          )}
        </footer>
      </form>
    </ModalSurface>
  );
}

function CreatePlanDialog({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [environment, setEnvironment] = useState("");
  const create = useMutation({
    mutationFn: () =>
      api(`/projects/${projectId}/test-plans`, {
        method: "POST",
        body: JSON.stringify({ name, description, environment }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["test-plans", projectId],
      });
      onClose();
    },
  });
  return (
    <DialogFrame title={t("workHub.createPlan")} onClose={onClose}>
      <form
        className="mt-5 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <Field label={t("workHub.planName")}>
          <input
            autoFocus
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="input"
          />
        </Field>
        <Field label={t("workHub.environment")}>
          <input
            value={environment}
            onChange={(event) => setEnvironment(event.target.value)}
            className="input"
          />
        </Field>
        <Field label={t("workHub.descriptionLabel")}>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="input min-h-24 resize-y"
          />
        </Field>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg px-3 py-2 text-sm hover:bg-muted"
            onClick={onClose}
          >
            {t("cancel")}
          </button>
          <button
            type="submit"
            disabled={!name.trim() || create.isPending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primaryForeground disabled:opacity-50"
          >
            {t("create")}
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}

function WorkItemView({
  workItemId,
  workspaceId,
  workflow,
  onClose,
}: {
  workItemId: string;
  workspaceId: string;
  workflow?: WorkItemWorkflow;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ["work-item", workItemId],
    queryFn: () => api<WorkItemDetail>(`/work-items/${workItemId}`),
  });
  const users = useQuery({
    queryKey: ["work-users", workspaceId],
    queryFn: () => api<WorkUser[]>(`/workspaces/${workspaceId}/work-users`),
  });
  const documents = useQuery({
    queryKey: ["work-documents", workspaceId],
    queryFn: () => api<WorkDocument[]>(`/workspaces/${workspaceId}/work-documents`),
  });
  const [type, setType] = useState<WorkItemType>("task");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<WorkItemStatus>("backlog");
  const [priority, setPriority] = useState<WorkItemPriority>("medium");
  const [reporterId, setReporterId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [labels, setLabels] = useState("");
  const [stepsToReproduce, setStepsToReproduce] = useState("");
  const [expectedResult, setExpectedResult] = useState("");
  const [actualResult, setActualResult] = useState("");
  const [environment, setEnvironment] = useState("");
  const [affectedVersion, setAffectedVersion] = useState("");
  const [documentIdsToLink, setDocumentIdsToLink] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  useEffect(() => {
    if (!detail.data) return;
    setType(detail.data.type);
    setTitle(detail.data.title);
    setDescription(detail.data.description ?? "");
    setStatus(detail.data.status);
    setPriority(detail.data.priority);
    setReporterId(detail.data.reporter.id);
    setAssigneeId(detail.data.assignee?.id ?? "");
    setLabels(detail.data.labels.join(", "));
    setStepsToReproduce(detail.data.stepsToReproduce ?? "");
    setExpectedResult(detail.data.expectedResult ?? "");
    setActualResult(detail.data.actualResult ?? "");
    setEnvironment(detail.data.environment ?? "");
    setAffectedVersion(detail.data.affectedVersion ?? "");
  }, [detail.data]);
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["work-item", workItemId] }),
      queryClient.invalidateQueries({ queryKey: ["work-items", workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ["work-dashboard", detail.data?.project.id] }),
    ]);
  };
  const save = useMutation({
    mutationFn: () =>
      api(`/work-items/${workItemId}`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: detail.data?.version,
          type,
          title,
          description,
          stepsToReproduce: type === "bug" ? stepsToReproduce : null,
          expectedResult: type === "bug" ? expectedResult : null,
          actualResult: type === "bug" ? actualResult : null,
          environment: type === "bug" ? environment : null,
          affectedVersion: type === "bug" ? affectedVersion : null,
          status,
          priority,
          reporterId,
          assigneeId: assigneeId || null,
          labels: labels
            .split(",")
            .map((label) => label.trim())
            .filter(Boolean),
        }),
      }),
    onSuccess: refresh,
  });
  const linkDocuments = useMutation({
    mutationFn: () => api(`/work-items/${workItemId}/artifacts/batch`, {
      method: "POST",
      body: JSON.stringify({ artifacts: documentIdsToLink.map((documentId) => ({ documentId, role: type === "bug" ? "affects" : "relates_to" })) }),
    }),
    onSuccess: async () => {
      setDocumentIdsToLink([]);
      await refresh();
    },
  });
  const addComment = useMutation({
    mutationFn: () =>
      api(`/work-items/${workItemId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: comment, mentionUserIds: mentionIds }),
      }),
    onSuccess: async () => {
      setComment("");
      setMentionIds([]);
      await refresh();
    },
  });
  const item = detail.data;
  const linkedDocumentIds = new Set(item?.artifactLinks.flatMap((link) => link.document ? [link.document.id] : []) ?? []);
  return (
    <div data-testid="work-item-page" className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface">
      <header className="flex min-h-12 shrink-0 items-center gap-2.5 border-b border-border px-4 py-2">
        <button
          type="button"
          data-testid="work-item-back"
          aria-label={t("workHub.backToList")}
          title={t("workHub.backToList")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-mutedForeground hover:bg-muted hover:text-foreground"
          onClick={onClose}
        >
          <ArrowLeft size={16} />
        </button>
        {item ? (
          <>
            <TypeIcon type={item.type} size={15} />
            <span className="shrink-0 font-mono text-xs text-primary">{item.key}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.title}</span>
            <StatusLozenge status={item.status} />
            <PriorityIcon priority={item.priority} />
            {item.assignee && <Avatar name={item.assignee.displayName} size="sm" />}
          </>
        ) : (
          <span className="text-sm text-mutedForeground">{t("workHub.loading")}</span>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      {!item ? (
        <div className="py-12 text-center text-sm text-mutedForeground">
          {t("workHub.loading")}
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.6fr)]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("workHub.type")}>
                <select value={type} onChange={(event) => setType(event.target.value as WorkItemType)} className="input">
                  {workTypes.map((value) => <option key={value} value={value}>{t(`workHub.types.${value}`)}</option>)}
                </select>
              </Field>
              <Field label={t("workHub.status")}>
                <select value={status} onChange={(event) => setStatus(event.target.value as WorkItemStatus)} className="input">
                  {[item.status, ...(workflow?.schemes[type].transitions[item.status] ?? allStatuses)].filter((value, index, values) => values.indexOf(value) === index).map((value) => (
                    <option key={value} value={value}>{t(`workHub.statuses.${value}`)}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label={t("workHub.summary")}>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="input"
              />
            </Field>
            <Field label={t("workHub.descriptionLabel")}>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="input min-h-32 resize-y"
              />
            </Field>
            {type === "bug" && (
              <section className="space-y-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-destructive">{t("workHub.qaDetails")}</h3>
                  <p className="mt-1 text-xs text-mutedForeground">{t("workHub.qaDetailsHelp")}</p>
                </div>
                <Field label={t("workHub.stepsToReproduce")}>
                  <textarea value={stepsToReproduce} onChange={(event) => setStepsToReproduce(event.target.value)} className="input min-h-28 resize-y" />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t("workHub.expectedResult")}>
                    <textarea value={expectedResult} onChange={(event) => setExpectedResult(event.target.value)} className="input min-h-24 resize-y" />
                  </Field>
                  <Field label={t("workHub.actualResult")}>
                    <textarea value={actualResult} onChange={(event) => setActualResult(event.target.value)} className="input min-h-24 resize-y" />
                  </Field>
                  <Field label={t("workHub.testEnvironment")}>
                    <input value={environment} onChange={(event) => setEnvironment(event.target.value)} className="input" />
                  </Field>
                  <Field label={t("workHub.affectedVersion")}>
                    <input value={affectedVersion} onChange={(event) => setAffectedVersion(event.target.value)} className="input" />
                  </Field>
                </div>
              </section>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("workHub.priority")}>
                <select
                  value={priority}
                  onChange={(event) =>
                    setPriority(event.target.value as WorkItemPriority)
                  }
                  className="input"
                >
                  {(
                    [
                      "lowest",
                      "low",
                      "medium",
                      "high",
                      "highest",
                      "critical",
                    ] as WorkItemPriority[]
                  ).map((value) => (
                    <option key={value} value={value}>
                      {t(`workHub.priorities.${value}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("workHub.reporter")}>
                <select value={reporterId} onChange={(event) => setReporterId(event.target.value)} className="input">
                  {(users.data ?? []).map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}
                </select>
              </Field>
              <Field label={t("workHub.assignee")}>
                <select
                  value={assigneeId}
                  onChange={(event) => setAssigneeId(event.target.value)}
                  className="input"
                >
                  <option value="">{t("workHub.unassigned")}</option>
                  {(users.data ?? []).map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.displayName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("workHub.labels")}>
                <input
                  value={labels}
                  onChange={(event) => setLabels(event.target.value)}
                  className="input"
                  placeholder={t("workHub.labelsHelp")}
                />
              </Field>
            </div>
            {save.isError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{t("workHub.saveItemError")}</p>}
            <div className="flex justify-end">
              <button
                type="button"
                disabled={!title.trim() || save.isPending}
                onClick={() => save.mutate()}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primaryForeground disabled:opacity-50"
              >
                {t("save")}
              </button>
            </div>
            <section className="rounded-xl border border-border p-4">
              <h3 className="text-sm font-semibold">{t("workHub.comments")}</h3>
              <div className="mt-3 max-h-56 space-y-2 overflow-auto">
                {item.comments.length ? (
                  item.comments.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-lg bg-editorBackground p-3 text-sm"
                    >
                      <div className="text-xs font-medium text-primary">
                        {entry.author.displayName}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap">{entry.body}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-mutedForeground">
                    {t("workHub.noComments")}
                  </p>
                )}
              </div>
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                className="input mt-3 min-h-20 resize-y"
                placeholder={t("workHub.addComment")}
              />
              <div className="mt-2 flex flex-wrap gap-1">
                {(users.data ?? []).map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    aria-pressed={mentionIds.includes(user.id)}
                    onClick={() =>
                      setMentionIds((current) =>
                        current.includes(user.id)
                          ? current.filter((id) => id !== user.id)
                          : [...current, user.id],
                      )
                    }
                    className={`rounded-full border px-2 py-1 text-[11px] ${mentionIds.includes(user.id) ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
                  >
                    @{user.displayName}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  disabled={!comment.trim() || addComment.isPending}
                  onClick={() => addComment.mutate()}
                  className="rounded-lg border border-primary px-3 py-1.5 text-xs text-primary disabled:opacity-50"
                >
                  {t("workHub.sendComment")}
                </button>
              </div>
            </section>
          </div>
          <aside className="space-y-4">
            <WorkItemEngineeringChain item={item} />
            <section className="rounded-xl border border-border p-4">
              <h3 className="text-sm font-semibold">
                {t("workHub.linkedEvidence")}
              </h3>
              <div className="mt-3 space-y-2">
                {item.artifactLinks.length ? (
                  item.artifactLinks.map((link) => {
                    const target = artifactTarget(link);
                    return (
                      <button
                        key={link.id}
                        type="button"
                        className="flex w-full items-start gap-2 rounded-lg bg-editorBackground p-3 text-left text-xs hover:bg-muted"
                        onClick={() =>
                          target.rowId &&
                          target.document &&
                          window.dispatchEvent(
                            new CustomEvent("docsys:open-document-row", {
                              detail: {
                                document: target.document,
                                rowId: target.rowId,
                              },
                            }),
                          )
                        }
                      >
                        <ExternalLink
                          size={13}
                          className="mt-0.5 shrink-0 text-primary"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {target.title}
                          </span>
                          <span className="mt-1 block truncate text-mutedForeground">
                            {target.document?.title}
                          </span>
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="text-xs text-mutedForeground">
                    {t("workHub.noEvidence")}
                  </p>
                )}
              </div>
              <div className="mt-4 border-t border-border pt-4">
                <DocumentPicker
                  documents={(documents.data ?? []).filter((document) => !linkedDocumentIds.has(document.id))}
                  selectedIds={documentIdsToLink}
                  onChange={setDocumentIdsToLink}
                  compact
                />
                <button
                  type="button"
                  disabled={!documentIdsToLink.length || linkDocuments.isPending}
                  onClick={() => linkDocuments.mutate()}
                  className="mt-3 w-full rounded-lg border border-primary px-3 py-2 text-xs font-medium text-primary disabled:opacity-50"
                >
                  <Link2 size={13} className="mr-1.5 inline" />
                  {t("workHub.linkDocuments")}
                </button>
                {linkDocuments.isError && <p role="alert" className="mt-2 text-xs text-destructive">{t("workHub.linkDocumentsError")}</p>}
              </div>
            </section>
            <section className="rounded-xl border border-border p-4">
              <h3 className="text-sm font-semibold">
                {t("workHub.relations")}
              </h3>
              <div className="mt-3 space-y-2">
                {[
                  ...item.outgoingRelations.map((entry) => ({
                    ...entry.target,
                    relation: entry.relationType,
                  })),
                  ...item.incomingRelations.map((entry) => ({
                    ...entry.source,
                    relation: entry.relationType,
                  })),
                ].map((entry) => (
                  <div
                    key={`${entry.id}-${entry.relation}`}
                    className="rounded-lg bg-editorBackground p-3 text-xs"
                  >
                    <span className="font-mono text-primary">{entry.key}</span>
                    <span className="ml-2 text-mutedForeground">
                      {entry.relation}
                    </span>
                    <div className="mt-1 truncate font-medium">
                      {entry.title}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      )}
      </div>
    </div>
  );
}

function WorkItemEngineeringChain({ item }: { item: WorkItemDetail }) {
  const { t } = useTranslation();
  const requirementLinks = item.artifactLinks.filter((link) => link.document?.documentType === "requirement" || link.row?.document.documentType === "requirement").length;
  const testLinks = item.artifactLinks.filter((link) => link.document?.documentType === "test" || link.row?.document.documentType === "test" || link.testExecution || link.testStepExecution).length;
  const executionLinks = item.artifactLinks.filter((link) => link.testExecution || link.testStepExecution).length;
  const stages = [
    { label: t("workHub.lifecycleRequirements"), count: requirementLinks },
    { label: t("workHub.lifecycleTests"), count: testLinks },
    { label: t("workHub.lifecycleExecutions"), count: executionLinks },
    { label: t("workHub.lifecycleDefects"), count: item.type === "bug" ? 1 : 0 },
  ];
  return (
    <section data-testid="work-item-engineering-chain" className="rounded-xl border border-border p-4">
      <h3 className="text-sm font-semibold">{t("workHub.evidenceChain")}</h3>
      <p className="mt-1 text-xs leading-5 text-mutedForeground">{t("workHub.evidenceChainHelp")}</p>
      <ol className="mt-3 space-y-1.5">
        {stages.map((stage, index) => (
          <li key={stage.label} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${stage.count ? "border-primary/30 bg-primary/5" : "border-border text-mutedForeground"}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${stage.count ? "bg-primary text-primaryForeground" : "bg-muted"}`}>{index + 1}</span>
            <span className="min-w-0 flex-1">{stage.label}</span>
            <span className="font-semibold tabular-nums">{stage.count}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function artifactTarget(link: WorkItemDetail["artifactLinks"][number]) {
  if (link.row)
    return {
      title: link.row.title || `ID ${link.row.objectNumber}`,
      rowId: link.row.id,
      document: link.row.document,
    };
  if (link.testStepExecution)
    return {
      title: link.testStepExecution.testStepRow.title,
      rowId: link.testStepExecution.testStepRow.id,
      document: {
        ...link.testStepExecution.testStepRow.document,
        documentType: "test" as const,
      },
    };
  if (link.testExecution)
    return {
      title: link.testExecution.testCaseRow.title,
      rowId: link.testExecution.testCaseRow.id,
      document: {
        ...link.testExecution.testCaseRow.document,
        documentType: "test" as const,
      },
    };
  return {
    title: link.document?.title ?? "-",
    rowId: null,
    document: link.document,
  };
}

function TestPlanDetailDialog({
  testPlanId,
  projectId,
  onClose,
}: {
  testPlanId: string;
  projectId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const detail = useQuery({
    queryKey: ["test-plan", testPlanId],
    queryFn: () => api<TestPlanDetail>(`/test-plans/${testPlanId}`),
  });
  const candidates = useQuery({
    queryKey: ["test-plan-candidates", testPlanId, search],
    queryFn: () =>
      api<TestPlanCandidate[]>(
        `/test-plans/${testPlanId}/candidates?q=${encodeURIComponent(search)}`,
      ),
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["test-plan", testPlanId] }),
      queryClient.invalidateQueries({
        queryKey: ["test-plan-candidates", testPlanId],
      }),
      queryClient.invalidateQueries({ queryKey: ["test-plans", projectId] }),
    ]);
  };
  const add = useMutation({
    mutationFn: (rowId: string) =>
      api(`/test-plans/${testPlanId}/items`, {
        method: "POST",
        body: JSON.stringify({ testCaseRowId: rowId }),
      }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (itemId: string) =>
      api(`/test-plan-items/${itemId}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const start = useMutation({
    mutationFn: (itemId: string) =>
      api(`/test-plan-items/${itemId}/executions`, { method: "POST" }),
    onSuccess: refresh,
  });
  const plan = detail.data;
  const latestExecutions = plan?.items.flatMap((item) => item.executions.slice(0, 1)) ?? [];
  const completedExecutions = latestExecutions.filter((execution) => ["passed", "failed", "blocked", "skipped"].includes(execution.status)).length;
  const passedExecutions = latestExecutions.filter((execution) => execution.status === "passed").length;
  const failedExecutions = latestExecutions.filter((execution) => execution.status === "failed").length;
  return (
    <DialogFrame
      title={plan ? `${plan.key} - ${plan.name}` : t("workHub.loading")}
      onClose={onClose}
      wide
    >
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.6fr)]">
        <section data-testid="test-plan-progress" className="grid gap-2 rounded-xl border border-border bg-editorBackground p-3 sm:grid-cols-4 lg:col-span-2">
          <DashboardMetric label={t("workHub.plannedTests")} value={plan?.items.length ?? 0} />
          <DashboardMetric label={t("workHub.completedExecutions")} value={completedExecutions} />
          <DashboardMetric label={t("workHub.passedExecutions")} value={passedExecutions} tone="success" />
          <DashboardMetric label={t("workHub.failedExecutions")} value={failedExecutions} tone={failedExecutions ? "danger" : "success"} />
        </section>
        <section className="rounded-xl border border-border p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{t("workHub.planTests")}</h3>
            <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
              {plan ? t(`workHub.planStatuses.${plan.status}`) : "-"}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {plan?.items.length ? (
              plan.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg bg-editorBackground p-3"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent("docsys:open-document-row", {
                          detail: {
                            document: {
                              ...item.testCaseRow.document,
                              documentType: "test",
                            },
                            rowId: item.testCaseRow.id,
                          },
                        }),
                      )
                    }
                  >
                    <div className="truncate text-sm font-medium">
                      {item.testCaseRow.title ||
                        `ID ${item.testCaseRow.objectNumber}`}
                    </div>
                    <div className="mt-1 text-xs text-mutedForeground">
                      {item.testCaseRow.document.title} -{" "}
                      {item.assignee?.displayName ?? t("workHub.unassigned")}
                    </div>
                  </button>
                  {item.executions[0] && (
                    <span className="rounded bg-muted px-2 py-1 text-[10px]">
                      {t(`executionStatus.${item.executions[0].status}`)}
                    </span>
                  )}
                  <button
                    type="button"
                    title={t("workHub.startExecution")}
                    onClick={() => start.mutate(item.id)}
                    className="rounded-lg border border-primary p-2 text-primary"
                  >
                    <Play size={14} />
                  </button>
                  {!item.executions.length && (
                    <button
                      type="button"
                      title={t("workHub.removeFromPlan")}
                      onClick={() => remove.mutate(item.id)}
                      className="rounded-lg p-2 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-sm text-mutedForeground">
                {t("workHub.noPlanTests")}
              </p>
            )}
          </div>
        </section>
        <section className="rounded-xl border border-border p-4">
          <h3 className="font-semibold">{t("workHub.addTests")}</h3>
          <label className="relative mt-3 block">
            <Search
              size={14}
              className="absolute left-3 top-2.5 text-mutedForeground"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="input pl-9"
              placeholder={t("workHub.searchTests")}
            />
          </label>
          <div className="mt-3 max-h-[55vh] space-y-2 overflow-auto">
            {(candidates.data ?? []).map((candidate) => (
              <div
                key={candidate.id}
                className="rounded-lg border border-border p-3"
              >
                <div className="text-sm font-medium">
                  {candidate.title || `ID ${candidate.objectNumber}`}
                </div>
                <div className="mt-1 text-xs text-mutedForeground">
                  {candidate.document.title} -{" "}
                  {t("workHub.stepCount", { count: candidate.stepCount })}
                </div>
                <button
                  type="button"
                  disabled={add.isPending}
                  onClick={() => add.mutate(candidate.id)}
                  className="mt-2 w-full rounded-lg border border-primary px-2 py-1.5 text-xs text-primary disabled:opacity-50"
                >
                  <Plus size={12} className="mr-1 inline" />
                  {t("workHub.addToPlan")}
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </DialogFrame>
  );
}

function DocumentPicker({
  documents,
  selectedIds,
  onChange,
  compact = false,
}: {
  documents: WorkDocument[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase();
  const visible = documents.filter((document) => !normalized || document.title.toLocaleLowerCase().includes(normalized));
  return (
    <section className={compact ? "" : "rounded-xl border border-border bg-editorBackground p-3"}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">{t("workHub.linkDocumentsTitle")}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-mutedForeground">{t("workHub.selectedCount", { count: selectedIds.length })}</span>
      </div>
      <label className="relative mt-2 block">
        <Search size={13} className="absolute left-3 top-2.5 text-mutedForeground" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} className="input py-1.5 pl-8 text-xs" placeholder={t("workHub.searchDocuments")} />
      </label>
      <div className={`${compact ? "max-h-36" : "max-h-44"} mt-2 space-y-1 overflow-auto`}>
        {visible.length ? visible.map((document) => {
          const checked = selectedIds.includes(document.id);
          return (
            <label key={document.id} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-xs ${checked ? "border-primary/50 bg-primary/10" : "border-transparent hover:border-border hover:bg-muted"}`}>
              <input
                type="checkbox"
                data-testid={`work-document-${document.id}`}
                className="mt-0.5 h-4 w-4 accent-primary"
                checked={checked}
                onChange={() => onChange(checked ? selectedIds.filter((id) => id !== document.id) : [...selectedIds, document.id])}
              />
              <span className="min-w-0">
                <span className="block truncate font-medium">{document.title}</span>
                <span className="mt-0.5 block text-[10px] text-mutedForeground">{t(`workHub.documentTypes.${document.documentType}`)}</span>
              </span>
            </label>
          );
        }) : <p className="py-4 text-center text-xs text-mutedForeground">{t("workHub.noDocuments")}</p>}
      </div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-xs font-medium text-mutedForeground">
        {label}
      </span>
      {children}
    </label>
  );
}
