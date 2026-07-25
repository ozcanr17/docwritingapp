import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Building2, FolderKanban, FolderPlus, MessageSquareWarning, ShieldCheck, Trash2, UserPlus, Users, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { ConfirmDialog, ModalSurface } from "./TransientSurface";
import { AdminSection } from "../lib/appSections";
import { Card, CardBody, CardHeader, EmptyState, Lozenge, Metric, MetricStrip } from "./ui";
import { ProjectSchemaAdmin } from "./ProjectSchemaAdmin";
import { CreateProjectDialog } from "./WorkManagementPage";
import { Button } from "./ui";

type RoleKey = "organization_admin" | "workspace_admin" | "project_manager" | "editor" | "reviewer" | "viewer";
interface Member { id: string; email: string; displayName: string; isActive: boolean; roleKey: RoleKey; }
interface PilotFeedback { id: string; createdAt: string; actor: { displayName: string; email: string } | null; nextData: { category?: string; title?: string; description?: string }; }
interface AdminSummary {
  scope: { workspaces: number; projects: number; documents: number; restrictedDocuments: number };
  recentAudit: Array<{ id: string; action: string; entityType: string; entityId: string; actorId: string | null; workspaceId: string | null; documentId: string | null; createdAt: string }>;
}

const roles: RoleKey[] = ["organization_admin", "workspace_admin", "project_manager", "editor", "reviewer", "viewer"];

export function AdminPanel({ organizationId, workspaceId, currentUserId, onClose, variant = "dialog", section, onSectionChange }: { organizationId: string; workspaceId?: string | null; currentUserId: string; onClose: () => void; variant?: "dialog" | "page"; section?: AdminSection; onSectionChange?: (section: AdminSection) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ displayName: "", email: "", password: "", roleKey: "editor" as RoleKey });
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [internalTab, setInternalTab] = useState<AdminSection>("overview");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const tab = section ?? internalTab;
  const setTab = onSectionChange ?? setInternalTab;
  const projects = useQuery({
    queryKey: ["projects", workspaceId],
    queryFn: () => api<Array<{ id: string; code: string; name: string; access?: { canManage: boolean } }>>(`/workspaces/${workspaceId}/projects`),
    enabled: Boolean(workspaceId) && tab === "projects",
  });
  const projectAccess = useQuery({
    queryKey: ["project-access", workspaceId],
    queryFn: () => api<{ canManage: boolean; canCreate: boolean }>(`/workspaces/${workspaceId}/project-access`),
    enabled: Boolean(workspaceId) && tab === "projects",
  });
  const members = useQuery({ queryKey: ["organization-members", organizationId], queryFn: () => api<Member[]>(`/organizations/${organizationId}/members`) });
  const feedback = useQuery({ queryKey: ["pilot-feedback", organizationId], queryFn: () => api<PilotFeedback[]>(`/organizations/${organizationId}/pilot-feedback`) });
  const summary = useQuery({ queryKey: ["administration-summary", organizationId], queryFn: () => api<AdminSummary>(`/organizations/${organizationId}/administration-summary`) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["organization-members", organizationId] });
  const createUser = useMutation({
    mutationFn: () => api(`/organizations/${organizationId}/users`, { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => { setForm({ displayName: "", email: "", password: "", roleKey: "editor" }); void refresh(); },
  });
  const updateMember = useMutation({
    mutationFn: ({ userId, patch }: { userId: string; patch: Partial<Pick<Member, "roleKey" | "isActive">> }) => api(`/organizations/${organizationId}/members/${userId}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => void refresh(),
  });
  const removeMember = useMutation({
    mutationFn: (userId: string) => api(`/organizations/${organizationId}/members/${userId}`, { method: "DELETE" }),
    onSuccess: () => { setRemoveTarget(null); void refresh(); },
  });
  const submit = (event: FormEvent) => { event.preventDefault(); createUser.mutate(); };
  const body = <>
      {variant === "dialog" && <header className="flex items-center justify-between border-b border-border px-5 py-4"><div className="flex items-center gap-3"><span className="rounded-lg bg-primary/10 p-2 text-primary"><ShieldCheck size={20} /></span><div><h2 id="admin-panel-title" className="font-semibold">{t("adminPanel")}</h2><p className="text-xs text-mutedForeground">{t("adminPanelDescription")}</p></div></div><button aria-label={t("close")} className="rounded-lg p-2 hover:bg-muted" onClick={onClose}><X size={17} /></button></header>}
      <div className={variant === "page" ? "flex min-h-0 flex-1" : "flex min-h-0 flex-1 flex-col"}>
      {variant === "dialog" && <nav className="flex gap-1 overflow-x-auto border-b border-border bg-muted/25 px-4 py-2" aria-label={t("adminPanel")}>
        <AdminTab testId="admin-tab-overview" active={tab === "overview"} onClick={() => setTab("overview")} icon={<Building2 size={15} />} label={t("adminOverview")} />
        <AdminTab testId="admin-tab-projects" active={tab === "projects"} onClick={() => setTab("projects")} icon={<FolderKanban size={15} />} label={t("projectAdministration")} />
        <AdminTab testId="admin-tab-users" active={tab === "users"} onClick={() => setTab("users")} icon={<Users size={15} />} label={t("usersAndRoles")} />
        <AdminTab testId="admin-tab-audit" active={tab === "audit"} onClick={() => setTab("audit")} icon={<Activity size={15} />} label={t("auditLog")} />
        <AdminTab testId="admin-tab-feedback" active={tab === "feedback"} onClick={() => setTab("feedback")} icon={<MessageSquareWarning size={15} />} label={t("pilotFeedbackInbox")} />
      </nav>}
      <div className="min-h-0 flex-1 overflow-auto">
      {tab === "overview" && <section className="space-y-4 p-4">
        <MetricStrip testId="admin-scope-metrics">
          <Metric label={t("workspaces")} value={summary.data?.scope.workspaces ?? 0} icon={<Building2 size={14} />} tone="primary" />
          <Metric label={t("projects")} value={summary.data?.scope.projects ?? 0} icon={<FolderKanban size={14} />} tone="purple" />
          <Metric label={t("documents")} value={summary.data?.scope.documents ?? 0} icon={<Building2 size={14} />} tone="info" />
          <Metric label={t("restrictedDocuments")} value={summary.data?.scope.restrictedDocuments ?? 0} icon={<ShieldCheck size={14} />} tone="warning" />
          <Metric label={t("activeUsers")} value={members.data?.filter((member) => member.isActive).length ?? 0} icon={<Users size={14} />} tone="success" />
        </MetricStrip>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title={t("roleDistribution")} />
            <CardBody className="space-y-1.5">
              {roles.map((role) => { const count = members.data?.filter((member) => member.roleKey === role).length ?? 0; return <div key={role} className="flex items-center justify-between rounded-md border border-border bg-surfaceSubtle px-3 py-2 text-xs"><span>{t(`adminRole.${role}`)}</span><span className="font-semibold tabular-nums">{count}</span></div>; })}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t("governanceStatus")} />
            <CardBody className="space-y-1.5">
              <GovernanceRow label={t("activeUsers")} value={members.data?.filter((member) => member.isActive).length ?? 0} />
              <GovernanceRow label={t("administrators")} value={members.data?.filter((member) => member.roleKey === "organization_admin" && member.isActive).length ?? 0} />
              <GovernanceRow label={t("recentAuditEvents")} value={summary.data?.recentAudit.length ?? 0} />
              <p className="mt-1 rounded-md border border-info/25 bg-info/10 p-3 text-xs leading-5 text-info">{t("adminPermissionNotice")}</p>
            </CardBody>
          </Card>
        </div>
      </section>}
      {tab === "projects" && (
        <section className="space-y-4 p-4" data-testid="admin-projects">
          {!workspaceId ? (
            <EmptyState title={t("selectProjectToConfigure")} description={t("projectSchemaHelp")} />
          ) : projects.isLoading ? (
            <p className="text-sm text-mutedForeground">{t("loading")}</p>
          ) : (projects.data ?? []).length === 0 ? (
            <EmptyState
              title={t("workHub.noProject")}
              description={t("workHub.noProjectHelp")}
              action={projectAccess.data?.canCreate ? (
                <Button variant="primary" icon={<FolderPlus size={14} />} data-testid="admin-create-project" onClick={() => setCreateProjectOpen(true)}>
                  {t("workHub.createProject")}
                </Button>
              ) : undefined}
            />
          ) : (
            <>
              <Card>
                <CardHeader
                  title={t("projectAdministration")}
                  badge={<Lozenge>{projects.data?.length ?? 0}</Lozenge>}
                  actions={projectAccess.data?.canCreate ? (
                    <Button size="sm" icon={<FolderPlus size={14} />} data-testid="admin-create-project" onClick={() => setCreateProjectOpen(true)}>
                      {t("workHub.createProject")}
                    </Button>
                  ) : undefined}
                />
                <CardBody className="flex flex-wrap gap-1.5">
                  {(projects.data ?? []).map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      data-testid={`admin-project-${project.code}`}
                      aria-pressed={selectedProjectId === project.id || (!selectedProjectId && projects.data?.[0]?.id === project.id)}
                      className={`rounded-md border px-2.5 py-1.5 text-sm ${(selectedProjectId ?? projects.data?.[0]?.id) === project.id ? "border-primary/40 bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}
                      onClick={() => setSelectedProjectId(project.id)}
                    >
                      <span className="font-mono text-xs">{project.code}</span> {project.name}
                    </button>
                  ))}
                </CardBody>
              </Card>
              {(selectedProjectId ?? projects.data?.[0]?.id) && (
                <ProjectSchemaAdmin
                  projectId={(selectedProjectId ?? projects.data?.[0]?.id) as string}
                  canManage={Boolean(projectAccess.data?.canManage)}
                />
              )}
            </>
          )}
          {createProjectOpen && workspaceId && (
            <CreateProjectDialog
              workspaceId={workspaceId}
              onCreated={(projectId) => setSelectedProjectId(projectId)}
              onClose={() => setCreateProjectOpen(false)}
            />
          )}
        </section>
      )}
      {tab === "users" && <div className="grid min-h-0 lg:grid-cols-[20rem_1fr]">
        <form autoComplete="off" className="border-b border-border p-5 lg:border-b-0 lg:border-r" onSubmit={submit}>
          <h3 className="flex items-center gap-2 text-sm font-semibold"><UserPlus size={16} />{t("createUser")}</h3>
          <Field name="managed-display-name" label={t("displayName")} autoComplete="off" value={form.displayName} onChange={(value) => setForm({ ...form, displayName: value })} />
          <Field name="managed-email" label={t("email")} type="email" autoComplete="off" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
          <Field name="managed-new-password" label={t("password")} type="password" autoComplete="new-password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} />
          <label className="mt-3 block text-xs text-mutedForeground">{t("role")}<select className="mt-1 w-full rounded-lg border border-border bg-editorBackground px-3 py-2 text-foreground" value={form.roleKey} onChange={(event) => setForm({ ...form, roleKey: event.target.value as RoleKey })}>{roles.map((role) => <option key={role} value={role}>{t(`adminRole.${role}`)}</option>)}</select></label>
          <button className="mt-4 w-full rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primaryForeground disabled:opacity-50" disabled={createUser.isPending || !form.displayName || !form.email || form.password.length < 10}>{t("createUser")}</button>
          {createUser.isError && <p className="mt-2 text-xs text-destructive">{t("operationFailed")}</p>}
        </form>
        <section className="min-h-0 p-5"><div><div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-semibold">{t("usersAndRoles")}</h3><p className="text-xs text-mutedForeground">{t("usersAndRolesDescription")}</p></div><span className="rounded-full bg-muted px-2 py-1 text-xs">{members.data?.length ?? 0}</span></div>
          <div className="space-y-2">{members.data?.map((member) => <div key={member.id} className="grid items-center gap-3 rounded-xl border border-border bg-editorBackground p-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto_auto]"><div className="min-w-0"><div className="truncate text-sm font-medium">{member.displayName}{member.id === currentUserId && <span className="ml-2 text-xs text-primary">{t("you")}</span>}</div><div className="truncate text-xs text-mutedForeground">{member.email}</div></div><select aria-label={t("role")} className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs" value={member.roleKey} disabled={member.id === currentUserId || updateMember.isPending} onChange={(event) => updateMember.mutate({ userId: member.id, patch: { roleKey: event.target.value as RoleKey } })}>{roles.map((role) => <option key={role} value={role}>{t(`adminRole.${role}`)}</option>)}</select><button className={`rounded-lg px-2 py-1.5 text-xs ${member.isActive ? "bg-success/10 text-success" : "bg-muted text-mutedForeground"}`} disabled={member.id === currentUserId} onClick={() => updateMember.mutate({ userId: member.id, patch: { isActive: !member.isActive } })}>{member.isActive ? t("active") : t("inactive")}</button><button aria-label={t("removeUser")} title={t("removeUser")} className="rounded-lg p-2 text-destructive hover:bg-destructive/10 disabled:opacity-30" disabled={member.id === currentUserId} onClick={() => setRemoveTarget(member)}><Trash2 size={15} /></button></div>)}</div>
          </div>
        </section>
      </div>}
      {tab === "audit" && <section className="p-5"><div className="mb-3"><h3 className="text-sm font-semibold">{t("auditLog")}</h3><p className="mt-1 text-xs text-mutedForeground">{t("auditLogHelp")}</p></div><div className="overflow-hidden rounded-xl border border-border">{summary.data?.recentAudit.length === 0 && <p className="p-5 text-sm text-mutedForeground">{t("noAuditEvents")}</p>}{summary.data?.recentAudit.map((event) => <article key={event.id} className="grid gap-2 border-b border-border bg-editorBackground px-4 py-3 text-xs last:border-b-0 sm:grid-cols-[minmax(0,1fr)_9rem_11rem]"><div><div className="font-medium text-foreground">{event.action}</div><div className="mt-1 font-mono text-[10px] text-mutedForeground">{event.entityType} · {event.entityId}</div></div><span className="self-center text-mutedForeground">{event.workspaceId ? t("workspaceScope") : t("organizationScopeLabel")}</span><time className="self-center text-mutedForeground">{new Date(event.createdAt).toLocaleString()}</time></article>)}</div></section>}
      {tab === "feedback" && <section className="p-5"><div className="mb-3 flex items-center gap-2"><MessageSquareWarning size={16} /><div><h3 className="text-sm font-semibold">{t("pilotFeedbackInbox")}</h3><p className="text-xs text-mutedForeground">{t("pilotFeedbackInboxHelp")}</p></div><span className="ml-auto rounded-full bg-muted px-2 py-1 text-xs">{feedback.data?.length ?? 0}</span></div><div className="space-y-2">{feedback.data?.length === 0 && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-mutedForeground">{t("noPilotFeedback")}</p>}{feedback.data?.map((item) => <article key={item.id} data-testid={`pilot-feedback-item-${item.id}`} className="rounded-xl border border-border bg-editorBackground p-3"><div className="flex items-center gap-2"><span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{t(`feedbackCategory.${item.nextData.category ?? "bug"}`)}</span><span className="truncate text-xs text-mutedForeground">{item.actor?.displayName ?? t("unknownUser")} - {new Date(item.createdAt).toLocaleString()}</span></div><h4 className="mt-2 text-sm font-medium">{item.nextData.title}</h4><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-mutedForeground">{item.nextData.description}</p></article>)}</div></section>}
      </div>
      </div>
  </>;
  return <>
    {variant === "page" ? (
      <div data-testid="admin-panel" aria-labelledby="admin-panel-title" className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface">
        {body}
      </div>
    ) : (
      <ModalSurface onClose={onClose} labelledBy="admin-panel-title" testId="admin-panel" panelClassName="flex max-h-[88vh] w-full max-w-5xl flex-col">
        {body}
      </ModalSurface>
    )}
    {removeTarget && <ConfirmDialog
      title={t("removeUser")}
      description={t("removeUserConfirm", { name: removeTarget.displayName })}
      confirmLabel={t("removeUser")}
      cancelLabel={t("cancel")}
      destructive
      pending={removeMember.isPending}
      onClose={() => setRemoveTarget(null)}
      onConfirm={() => removeMember.mutate(removeTarget.id)}
    />}
  </>;
}

function AdminTab({ testId, active, onClick, icon, label }: { testId: string; active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button type="button" data-testid={testId} aria-current={active ? "page" : undefined} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm ${active ? "bg-surface text-primary shadow-sm" : "text-mutedForeground hover:bg-muted hover:text-foreground"}`} onClick={onClick}>{icon}{label}</button>;
}

function GovernanceRow({ label, value }: { label: string; value: number }) {
  return <div className="flex items-center justify-between rounded-lg bg-editorBackground px-3 py-2 text-xs"><span>{label}</span><span className="font-semibold tabular-nums">{value}</span></div>;
}

function Field({ name, label, value, onChange, type = "text", autoComplete }: { name: string; label: string; value: string; onChange: (value: string) => void; type?: string; autoComplete?: string }) {
  return <label className="mt-3 block text-xs text-mutedForeground">{label}<input required name={name} type={type} autoComplete={autoComplete} className="mt-1 w-full rounded-lg border border-border bg-editorBackground px-3 py-2 text-foreground" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
