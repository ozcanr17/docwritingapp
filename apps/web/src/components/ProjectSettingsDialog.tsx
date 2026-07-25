import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, RotateCcw, Settings2, Trash2, UserPlus, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { ConfirmDialog, ModalSurface } from "./TransientSurface";

export interface ManagedProject {
  id: string;
  name: string;
  code: string;
  description: string | null;
  deletedAt?: string | null;
  access: { canManage: boolean };
}

interface ProjectMember {
  id: string;
  displayName: string;
  email: string;
  roleKey: string | null;
}

interface ProjectMemberResponse {
  access: { canManage: boolean };
  members: ProjectMember[];
  availableUsers: Array<{ id: string; displayName: string; email: string }>;
}

type SettingsTab = "general" | "members" | "archive";
const projectRoles = ["project_manager", "editor", "reviewer", "viewer"] as const;

export function ProjectSettingsDialog({
  workspaceId,
  project,
  onProjectChanged,
  onProjectArchived,
  onClose,
}: {
  workspaceId: string;
  project: ManagedProject | null;
  onProjectChanged: (project: ManagedProject) => void;
  onProjectArchived: (projectId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<SettingsTab>(project ? "general" : "archive");
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [userId, setUserId] = useState("");
  const [roleKey, setRoleKey] = useState<(typeof projectRoles)[number]>("editor");
  const [confirmArchive, setConfirmArchive] = useState(false);
  const members = useQuery({
    queryKey: ["project-members", project?.id],
    queryFn: () => api<ProjectMemberResponse>(`/projects/${project?.id}/members`),
    enabled: Boolean(project && tab === "members"),
  });
  const archived = useQuery({
    queryKey: ["projects", workspaceId, "archived"],
    queryFn: () => api<ManagedProject[]>(`/workspaces/${workspaceId}/projects?includeArchived=true`),
    enabled: tab === "archive",
  });
  const archivedProjects = archived.data?.filter((item) => item.deletedAt) ?? [];
  const unassignedUsers = useMemo(() => {
    const assigned = new Set(members.data?.members.map((member) => member.id) ?? []);
    return members.data?.availableUsers.filter((user) => !assigned.has(user.id)) ?? [];
  }, [members.data]);
  useEffect(() => {
    if (!userId && unassignedUsers[0]) setUserId(unassignedUsers[0].id);
  }, [unassignedUsers, userId]);

  const updateProject = useMutation({
    mutationFn: () => api<ManagedProject>(`/projects/${project?.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name, description }),
    }),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: ["projects", workspaceId] });
      onProjectChanged(updated);
    },
  });
  const archiveProject = useMutation({
    mutationFn: () => api(`/projects/${project?.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects", workspaceId] });
      setConfirmArchive(false);
      if (project) onProjectArchived(project.id);
      setTab("archive");
    },
  });
  const restoreProject = useMutation({
    mutationFn: (projectId: string) => api<ManagedProject>(`/projects/${projectId}/restore`, { method: "POST" }),
    onSuccess: async (restored) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects", workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ["projects", workspaceId, "archived"] }),
      ]);
      onProjectChanged(restored);
    },
  });
  const putMember = useMutation({
    mutationFn: (input: { userId: string; roleKey: string }) => api(`/projects/${project?.id}/members`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["project-members", project?.id] });
      setUserId("");
    },
  });
  const removeMember = useMutation({
    mutationFn: (memberId: string) => api(`/projects/${project?.id}/members/${memberId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project-members", project?.id] }),
  });

  return (
    <>
      <ModalSurface
        onClose={onClose}
        labelledBy="project-settings-title"
        testId="project-settings-dialog"
        panelClassName="flex max-h-[88vh] w-full max-w-3xl flex-col"
      >
        <header className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <h2 id="project-settings-title" className="flex items-center gap-2 text-base font-semibold">
              <Settings2 size={18} />
              {t("workHub.projectSettings")}
            </h2>
            <p className="mt-1 text-sm text-mutedForeground">
              {project ? `${project.code} · ${project.name}` : t("workHub.projectSettingsHelp")}
            </p>
          </div>
          <button type="button" className="rounded-lg p-1.5 hover:bg-muted" aria-label={t("close")} onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <nav className="flex gap-1 border-b border-border px-5 pt-3" aria-label={t("workHub.projectSettings")}>
          {project && (
            <>
              <Tab active={tab === "general"} onClick={() => setTab("general")} label={t("workHub.projectGeneral")} />
              <Tab active={tab === "members"} onClick={() => setTab("members")} label={t("workHub.projectMembers")} />
            </>
          )}
          <Tab active={tab === "archive"} onClick={() => setTab("archive")} label={t("workHub.archivedProjects")} />
        </nav>
        <div className="min-h-0 flex-1 overflow-auto p-5">
          {tab === "general" && project && (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                updateProject.mutate();
              }}
            >
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium">{t("workHub.projectName")}</span>
                <input data-testid="project-settings-name" className="input" required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium">{t("workHub.descriptionLabel")}</span>
                <textarea className="input min-h-28 resize-y" maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} />
              </label>
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-5 text-mutedForeground">
                {t("workHub.projectCodeImmutable", { code: project.code })}
              </div>
              {updateProject.isError && <p role="alert" className="text-sm text-destructive">{t("workHub.projectUpdateError")}</p>}
              {updateProject.isSuccess && <p role="status" className="text-sm text-success">{t("workHub.projectUpdated")}</p>}
              <div className="flex justify-between gap-3">
                <button type="button" className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive hover:bg-destructive/10" onClick={() => setConfirmArchive(true)}>
                  <Archive size={15} className="mr-1.5 inline" />
                  {t("workHub.archiveProject")}
                </button>
                <button type="submit" data-testid="save-project-settings" disabled={updateProject.isPending || !name.trim()} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primaryForeground disabled:opacity-50">
                  {t("save")}
                </button>
              </div>
            </form>
          )}
          {tab === "members" && project && (
            <section>
              <div className="flex items-center gap-2">
                <Users size={17} />
                <h3 className="font-semibold">{t("workHub.projectMembers")}</h3>
              </div>
              <p className="mt-1 text-sm text-mutedForeground">{t("workHub.projectMembersHelp")}</p>
              {members.isLoading ? (
                <p className="mt-5 text-sm text-mutedForeground">{t("workHub.loading")}</p>
              ) : (
                <>
                  <div className="mt-4 divide-y divide-border rounded-xl border border-border">
                    {members.data?.members.map((member) => (
                      <div key={member.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{member.displayName}</p>
                          <p className="truncate text-xs text-mutedForeground">{member.email}</p>
                        </div>
                        <select
                          className="rounded-lg border border-border bg-editorBackground px-2 py-1.5 text-sm"
                          aria-label={t("workHub.projectMemberRole", { name: member.displayName })}
                          value={member.roleKey ?? ""}
                          onChange={(event) => putMember.mutate({ userId: member.id, roleKey: event.target.value })}
                        >
                          {!member.roleKey && <option value="" disabled>{t("workHub.inheritedAccess")}</option>}
                          {projectRoles.map((role) => <option key={role} value={role}>{t(`workHub.projectRoles.${role}`)}</option>)}
                        </select>
                        <button type="button" className="rounded-lg p-2 text-destructive hover:bg-destructive/10" aria-label={t("workHub.removeProjectMember", { name: member.displayName })} onClick={() => removeMember.mutate(member.id)}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                  {unassignedUsers.length > 0 && (
                    <form
                      className="mt-4 flex flex-wrap gap-2 rounded-xl border border-border bg-muted/20 p-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (userId) putMember.mutate({ userId, roleKey });
                      }}
                    >
                      <select className="min-w-52 flex-1 rounded-lg border border-border bg-editorBackground px-2 py-2 text-sm" value={userId} onChange={(event) => setUserId(event.target.value)}>
                        {unassignedUsers.map((user) => <option key={user.id} value={user.id}>{user.displayName} · {user.email}</option>)}
                      </select>
                      <select className="rounded-lg border border-border bg-editorBackground px-2 py-2 text-sm" value={roleKey} onChange={(event) => setRoleKey(event.target.value as typeof roleKey)}>
                        {projectRoles.map((role) => <option key={role} value={role}>{t(`workHub.projectRoles.${role}`)}</option>)}
                      </select>
                      <button type="submit" disabled={putMember.isPending || !userId} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primaryForeground disabled:opacity-50">
                        <UserPlus size={15} className="mr-1.5 inline" />
                        {t("workHub.addProjectMember")}
                      </button>
                    </form>
                  )}
                  {(putMember.isError || removeMember.isError) && <p role="alert" className="mt-3 text-sm text-destructive">{t("workHub.projectMemberError")}</p>}
                </>
              )}
            </section>
          )}
          {tab === "archive" && (
            <section>
              <h3 className="font-semibold">{t("workHub.archivedProjects")}</h3>
              <p className="mt-1 text-sm text-mutedForeground">{t("workHub.archivedProjectsHelp")}</p>
              {archived.isLoading ? (
                <p className="mt-5 text-sm text-mutedForeground">{t("workHub.loading")}</p>
              ) : archived.isError ? (
                <p role="alert" className="mt-5 text-sm text-destructive">{t("workHub.archivedProjectsError")}</p>
              ) : archivedProjects.length === 0 ? (
                <p className="mt-5 rounded-xl border border-dashed border-border p-5 text-center text-sm text-mutedForeground">{t("workHub.noArchivedProjects")}</p>
              ) : (
                <div className="mt-4 divide-y divide-border rounded-xl border border-border">
                  {archivedProjects.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 px-3 py-3">
                      <Archive size={16} className="text-mutedForeground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.code} · {item.name}</p>
                        <p className="text-xs text-mutedForeground">{item.deletedAt ? new Date(item.deletedAt).toLocaleString() : ""}</p>
                      </div>
                      <button type="button" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted" disabled={restoreProject.isPending} onClick={() => restoreProject.mutate(item.id)}>
                        <RotateCcw size={14} className="mr-1.5 inline" />
                        {t("workHub.restoreProject")}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </ModalSurface>
      {confirmArchive && project && (
        <ConfirmDialog
          title={t("workHub.archiveProject")}
          description={t("workHub.archiveProjectConfirm", { code: project.code, name: project.name })}
          confirmLabel={t("workHub.archiveProject")}
          cancelLabel={t("cancel")}
          pending={archiveProject.isPending}
          destructive
          onConfirm={() => archiveProject.mutate()}
          onClose={() => setConfirmArchive(false)}
        />
      )}
    </>
  );
}

function Tab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`border-b-2 px-3 py-2 text-sm ${active ? "border-primary font-medium text-foreground" : "border-transparent text-mutedForeground hover:text-foreground"}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
