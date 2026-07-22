import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Bug,
  CheckCircle2,
  ClipboardList,
  Columns3,
  ExternalLink,
  LayoutList,
  Link2,
  MessageSquare,
  Play,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  api,
  TestPlanCandidate,
  TestPlanDetail,
  TestPlanSummary,
  WorkItemDetail,
  WorkItemPriority,
  WorkItemStatus,
  WorkItemSummary,
  WorkItemType,
  WorkUser,
} from "../lib/api";

interface Project {
  id: string;
  name: string;
  code: string;
}
type HubTab = "items" | "board" | "plans";

const statuses: WorkItemStatus[] = [
  "backlog",
  "ready",
  "in_progress",
  "in_review",
  "done",
];

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
  const [tab, setTab] = useState<HubTab>("items");
  const [query, setQuery] = useState("");
  const [mine, setMine] = useState(false);
  const [bugsOnly, setBugsOnly] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const projects = useQuery({
    queryKey: ["projects", workspaceId],
    queryFn: () => api<Project[]>(`/workspaces/${workspaceId}/projects`),
  });
  const activeProjectId = projects.data?.[0]?.id ?? null;
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  if (mine) params.set("assigneeId", "me");
  if (bugsOnly) params.set("type", "bug");
  const items = useQuery({
    queryKey: ["work-items", workspaceId, query, mine, bugsOnly],
    queryFn: () =>
      api<WorkItemSummary[]>(
        `/workspaces/${workspaceId}/work-items?${params.toString()}`,
      ),
  });
  const plans = useQuery({
    queryKey: ["test-plans", activeProjectId],
    queryFn: () =>
      api<TestPlanSummary[]>(`/projects/${activeProjectId}/test-plans`),
    enabled: activeProjectId !== null,
  });
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
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ["work-items", workspaceId],
      }),
  });
  const counts = useMemo(
    () => ({
      open:
        items.data?.filter(
          (item) => !["done", "canceled"].includes(item.status),
        ).length ?? 0,
      bugs:
        items.data?.filter(
          (item) => item.type === "bug" && item.status !== "done",
        ).length ?? 0,
      plans: plans.data?.filter((plan) => plan.status === "active").length ?? 0,
    }),
    [items.data, plans.data],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-editorBackground">
      <header className="border-b border-border bg-surface px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">{t("workHub.title")}</h1>
            <p className="mt-1 text-sm text-mutedForeground">
              {t("workHub.description")}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
              onClick={() => setPlanOpen(true)}
              disabled={!activeProjectId}
            >
              <ClipboardList size={15} className="mr-1.5 inline" />
              {t("workHub.newPlan")}
            </button>
            <button
              type="button"
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primaryForeground hover:opacity-90"
              onClick={() => setCreateOpen(true)}
              disabled={!activeProjectId}
            >
              <Plus size={15} className="mr-1.5 inline" />
              {t("workHub.newItem")}
            </button>
          </div>
        </div>
        {(contextRowId || contextDocumentId) && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-primary">
            <Link2 size={14} />
            {contextRowId
              ? t("workHub.rowContext")
              : t("workHub.documentContext")}
          </div>
        )}
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Metric
            icon={<AlertCircle size={16} />}
            label={t("workHub.openItems")}
            value={counts.open}
          />
          <Metric
            icon={<Bug size={16} />}
            label={t("workHub.openBugs")}
            value={counts.bugs}
            tone="danger"
          />
          <Metric
            icon={<CheckCircle2 size={16} />}
            label={t("workHub.activePlans")}
            value={counts.plans}
            tone="success"
          />
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2.5">
        <div className="flex rounded-lg border border-border bg-editorBackground p-0.5">
          <TabButton
            active={tab === "items"}
            onClick={() => setTab("items")}
            icon={<LayoutList size={14} />}
            label={t("workHub.list")}
          />
          <TabButton
            active={tab === "board"}
            onClick={() => setTab("board")}
            icon={<Columns3 size={14} />}
            label={t("workHub.board")}
          />
          <TabButton
            active={tab === "plans"}
            onClick={() => setTab("plans")}
            icon={<ClipboardList size={14} />}
            label={t("workHub.testPlans")}
          />
        </div>
        {tab !== "plans" && (
          <>
            <label className="relative min-w-56 flex-1">
              <Search
                size={14}
                className="absolute left-3 top-2.5 text-mutedForeground"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full rounded-lg border border-border bg-editorBackground py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
                placeholder={t("workHub.search")}
              />
            </label>
            <button
              type="button"
              aria-pressed={mine}
              className={`rounded-lg border px-3 py-2 text-sm ${mine ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
              onClick={() => setMine((value) => !value)}
            >
              <UserRound size={14} className="mr-1.5 inline" />
              {t("workHub.assignedToMe")}
            </button>
            <button
              type="button"
              aria-pressed={bugsOnly}
              className={`rounded-lg border px-3 py-2 text-sm ${bugsOnly ? "border-danger bg-danger/10 text-danger" : "border-border"}`}
              onClick={() => setBugsOnly((value) => !value)}
            >
              <Bug size={14} className="mr-1.5 inline" />
              {t("workHub.bugs")}
            </button>
          </>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {!activeProjectId ? (
          <Empty
            title={t("workHub.noProject")}
            detail={t("workHub.noProjectHelp")}
          />
        ) : tab === "plans" ? (
          <PlanList plans={plans.data ?? []} onOpen={setSelectedPlanId} />
        ) : tab === "board" ? (
          <Board
            items={items.data ?? []}
            onOpen={setSelectedItemId}
            onStatus={(item, status) => update.mutate({ item, status })}
          />
        ) : (
          <ItemList
            items={items.data ?? []}
            onOpen={setSelectedItemId}
            onStatus={(item, status) => update.mutate({ item, status })}
          />
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
      {planOpen && activeProjectId && (
        <CreatePlanDialog
          projectId={activeProjectId}
          onClose={() => setPlanOpen(false)}
        />
      )}
      {selectedItemId && (
        <WorkItemDetailDialog
          workItemId={selectedItemId}
          workspaceId={workspaceId}
          onClose={() => setSelectedItemId(null)}
        />
      )}
      {selectedPlanId && activeProjectId && (
        <TestPlanDetailDialog
          testPlanId={selectedPlanId}
          projectId={activeProjectId}
          onClose={() => setSelectedPlanId(null)}
        />
      )}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  tone = "normal",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: "normal" | "danger" | "success";
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-editorBackground px-4 py-3">
      <span
        className={
          tone === "danger"
            ? "text-danger"
            : tone === "success"
              ? "text-success"
              : "text-primary"
        }
      >
        {icon}
      </span>
      <div>
        <div className="text-xl font-semibold leading-none">{value}</div>
        <div className="mt-1 text-xs text-mutedForeground">{label}</div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${active ? "bg-surface text-primary shadow-sm" : "text-mutedForeground"}`}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function ItemList({
  items,
  onOpen,
  onStatus,
}: {
  items: WorkItemSummary[];
  onOpen: (id: string) => void;
  onStatus: (item: WorkItemSummary, status: WorkItemStatus) => void;
}) {
  const { t } = useTranslation();
  if (!items.length)
    return (
      <Empty title={t("workHub.noItems")} detail={t("workHub.noItemsHelp")} />
    );
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-mutedForeground">
          <tr>
            <th className="px-4 py-3">{t("workHub.key")}</th>
            <th className="px-4 py-3">{t("workHub.summary")}</th>
            <th className="px-4 py-3">{t("workHub.priority")}</th>
            <th className="px-4 py-3">{t("workHub.assignee")}</th>
            <th className="px-4 py-3">{t("workHub.status")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className="cursor-pointer border-t border-border hover:bg-muted/30"
              onClick={() => onOpen(item.id)}
            >
              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-primary">
                {item.key}
              </td>
              <td className="min-w-64 px-4 py-3">
                <div className="flex items-center gap-2">
                  <TypeIcon type={item.type} />
                  <span className="font-medium">{item.title}</span>
                </div>
                <div className="mt-1 flex gap-3 text-xs text-mutedForeground">
                  {item._count.artifactLinks > 0 && (
                    <span>
                      <Link2 size={11} className="mr-1 inline" />
                      {item._count.artifactLinks}
                    </span>
                  )}
                  {item._count.comments > 0 && (
                    <span>
                      <MessageSquare size={11} className="mr-1 inline" />
                      {item._count.comments}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                <PriorityBadge priority={item.priority} />
              </td>
              <td className="px-4 py-3 text-mutedForeground">
                {item.assignee?.displayName ?? t("workHub.unassigned")}
              </td>
              <td
                className="px-4 py-3"
                onClick={(event) => event.stopPropagation()}
              >
                <StatusSelect item={item} onStatus={onStatus} />
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
  onStatus,
}: {
  items: WorkItemSummary[];
  onOpen: (id: string) => void;
  onStatus: (item: WorkItemSummary, status: WorkItemStatus) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid min-w-[980px] grid-cols-5 gap-3">
      {statuses.map((status) => (
        <section
          key={status}
          className="rounded-xl border border-border bg-surface"
        >
          <header className="flex items-center justify-between border-b border-border px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">
            <span>{t(`workHub.statuses.${status}`)}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-mutedForeground">
              {items.filter((item) => item.status === status).length}
            </span>
          </header>
          <div className="space-y-2 p-2">
            {items
              .filter((item) => item.status === status)
              .map((item) => (
                <article
                  key={item.id}
                  className="cursor-pointer rounded-lg border border-border bg-editorBackground p-3 shadow-sm hover:border-primary/50"
                  onClick={() => onOpen(item.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-primary">
                      {item.key}
                    </span>
                    <TypeIcon type={item.type} />
                  </div>
                  <div className="mt-2 text-sm font-medium leading-5">
                    {item.title}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <PriorityBadge priority={item.priority} />
                    <select
                      aria-label={t("workHub.status")}
                      value={item.status}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) =>
                        onStatus(item, event.target.value as WorkItemStatus)
                      }
                      className="max-w-24 rounded border border-border bg-surface px-1 py-1 text-[10px]"
                    >
                      {statuses.map((option) => (
                        <option key={option} value={option}>
                          {t(`workHub.statuses.${option}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                </article>
              ))}
          </div>
        </section>
      ))}
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
        <article
          key={plan.id}
          className="cursor-pointer rounded-xl border border-border bg-surface p-4 hover:border-primary/50"
          onClick={() => onOpen(plan.id)}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-mono text-xs text-primary">{plan.key}</div>
              <h2 className="mt-1 font-semibold">{plan.name}</h2>
            </div>
            <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
              {t(`workHub.planStatuses.${plan.status}`)}
            </span>
          </div>
          <p className="mt-3 line-clamp-2 text-sm text-mutedForeground">
            {plan.description || t("workHub.noDescription")}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-muted/40 p-2">
              <div className="text-mutedForeground">{t("workHub.tests")}</div>
              <div className="mt-1 font-semibold">{plan._count.items}</div>
            </div>
            <div className="rounded-lg bg-muted/40 p-2">
              <div className="text-mutedForeground">
                {t("workHub.environment")}
              </div>
              <div className="mt-1 truncate font-semibold">
                {plan.environment || "-"}
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function StatusSelect({
  item,
  onStatus,
}: {
  item: WorkItemSummary;
  onStatus: (item: WorkItemSummary, status: WorkItemStatus) => void;
}) {
  const { t } = useTranslation();
  return (
    <select
      value={item.status}
      onChange={(event) => onStatus(item, event.target.value as WorkItemStatus)}
      className="rounded-lg border border-border bg-editorBackground px-2 py-1.5 text-xs"
    >
      {statuses.map((status) => (
        <option key={status} value={status}>
          {t(`workHub.statuses.${status}`)}
        </option>
      ))}
      <option value="canceled">{t("workHub.statuses.canceled")}</option>
    </select>
  );
}

function TypeIcon({ type }: { type: WorkItemType }) {
  return type === "bug" ? (
    <Bug size={14} className="shrink-0 text-danger" />
  ) : type === "risk" ? (
    <ShieldAlert size={14} className="shrink-0 text-warning" />
  ) : (
    <ClipboardList size={14} className="shrink-0 text-primary" />
  );
}

function PriorityBadge({ priority }: { priority: WorkItemPriority }) {
  const { t } = useTranslation();
  const danger = ["critical", "highest", "high"].includes(priority);
  return (
    <span
      className={`rounded-full px-2 py-1 text-[11px] font-medium ${danger ? "bg-danger/10 text-danger" : "bg-muted text-mutedForeground"}`}
    >
      {t(`workHub.priorities.${priority}`)}
    </span>
  );
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <ClipboardList size={36} className="mx-auto text-mutedForeground" />
      <h2 className="mt-4 font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-mutedForeground">{detail}</p>
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
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className={`max-h-[90vh] w-full overflow-auto rounded-2xl border border-border bg-surface p-5 shadow-2xl ${wide ? "max-w-5xl" : "max-w-lg"}`}
      >
        <header className="flex items-center justify-between">
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
        {children}
      </div>
    </div>
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
  const [assigneeId, setAssigneeId] = useState("");
  const users = useQuery({
    queryKey: ["work-users", workspaceId],
    queryFn: () => api<WorkUser[]>(`/workspaces/${workspaceId}/work-users`),
  });
  const [linkContext, setLinkContext] = useState(
    Boolean(contextRowId || contextDocumentId),
  );
  const artifact = linkContext
    ? contextRowId
      ? { rowId: contextRowId, role: type === "bug" ? "affects" : "relates_to" }
      : contextDocumentId
        ? {
            documentId: contextDocumentId,
            role: type === "bug" ? "affects" : "relates_to",
          }
        : undefined
    : undefined;
  const create = useMutation({
    mutationFn: () =>
      api(`/projects/${projectId}/work-items`, {
        method: "POST",
        body: JSON.stringify({
          type,
          title,
          description,
          priority,
          assigneeId: assigneeId || null,
          artifact,
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["work-items", workspaceId],
      });
      onClose();
    },
  });
  return (
    <DialogFrame title={t("workHub.createItem")} onClose={onClose}>
      <form
        className="mt-5 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("workHub.type")}>
            <select
              value={type}
              onChange={(event) => setType(event.target.value as WorkItemType)}
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
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="input"
          />
        </Field>
        <Field label={t("workHub.descriptionLabel")}>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="input min-h-28 resize-y"
          />
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
            disabled={!title.trim() || create.isPending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primaryForeground disabled:opacity-50"
          >
            {t("create")}
          </button>
        </div>
      </form>
    </DialogFrame>
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

function WorkItemDetailDialog({
  workItemId,
  workspaceId,
  onClose,
}: {
  workItemId: string;
  workspaceId: string;
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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<WorkItemStatus>("backlog");
  const [priority, setPriority] = useState<WorkItemPriority>("medium");
  const [assigneeId, setAssigneeId] = useState("");
  const [labels, setLabels] = useState("");
  const [comment, setComment] = useState("");
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  useEffect(() => {
    if (!detail.data) return;
    setTitle(detail.data.title);
    setDescription(detail.data.description ?? "");
    setStatus(detail.data.status);
    setPriority(detail.data.priority);
    setAssigneeId(detail.data.assignee?.id ?? "");
    setLabels(detail.data.labels.join(", "));
  }, [detail.data]);
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["work-item", workItemId] }),
      queryClient.invalidateQueries({ queryKey: ["work-items", workspaceId] }),
    ]);
  };
  const save = useMutation({
    mutationFn: () =>
      api(`/work-items/${workItemId}`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: detail.data?.version,
          title,
          description,
          status,
          priority,
          assigneeId: assigneeId || null,
          labels: labels
            .split(",")
            .map((label) => label.trim())
            .filter(Boolean),
        }),
      }),
    onSuccess: refresh,
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
  return (
    <DialogFrame
      title={item ? `${item.key} - ${item.title}` : t("workHub.loading")}
      onClose={onClose}
      wide
    >
      {!item ? (
        <div className="py-12 text-center text-sm text-mutedForeground">
          {t("workHub.loading")}
        </div>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.6fr)]">
          <div className="space-y-4">
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
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("workHub.status")}>
                <select
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as WorkItemStatus)
                  }
                  className="input"
                >
                  {[...statuses, "canceled" as const].map((value) => (
                    <option key={value} value={value}>
                      {t(`workHub.statuses.${value}`)}
                    </option>
                  ))}
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
    </DialogFrame>
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
  return (
    <DialogFrame
      title={plan ? `${plan.key} - ${plan.name}` : t("workHub.loading")}
      onClose={onClose}
      wide
    >
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.6fr)]">
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
                      className="rounded-lg p-2 text-danger hover:bg-danger/10"
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
