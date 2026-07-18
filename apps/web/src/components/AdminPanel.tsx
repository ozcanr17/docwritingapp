import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareWarning, ShieldCheck, Trash2, UserPlus, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEscapeClose } from "../hooks/useEscapeClose";
import { api } from "../lib/api";

type RoleKey = "organization_admin" | "workspace_admin" | "project_manager" | "editor" | "reviewer" | "viewer";
interface Member { id: string; email: string; displayName: string; isActive: boolean; roleKey: RoleKey; }
interface PilotFeedback { id: string; createdAt: string; actor: { displayName: string; email: string } | null; nextData: { category?: string; title?: string; description?: string }; }

const roles: RoleKey[] = ["organization_admin", "workspace_admin", "project_manager", "editor", "reviewer", "viewer"];

export function AdminPanel({ organizationId, currentUserId, onClose }: { organizationId: string; currentUserId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ displayName: "", email: "", password: "", roleKey: "editor" as RoleKey });
  useEscapeClose(onClose, true);
  const members = useQuery({ queryKey: ["organization-members", organizationId], queryFn: () => api<Member[]>(`/organizations/${organizationId}/members`) });
  const feedback = useQuery({ queryKey: ["pilot-feedback", organizationId], queryFn: () => api<PilotFeedback[]>(`/organizations/${organizationId}/pilot-feedback`) });
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
    onSuccess: () => void refresh(),
  });
  const submit = (event: FormEvent) => { event.preventDefault(); createUser.mutate(); };
  return <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/55 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="admin-panel-title">
    <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-surfaceElevated shadow-2xl">
      <header className="flex items-center justify-between border-b border-border px-5 py-4"><div className="flex items-center gap-3"><span className="rounded-xl bg-primary/10 p-2 text-primary"><ShieldCheck size={20} /></span><div><h2 id="admin-panel-title" className="font-semibold">{t("adminPanel")}</h2><p className="text-xs text-mutedForeground">{t("adminPanelDescription")}</p></div></div><button aria-label={t("close")} className="rounded-lg p-2 hover:bg-muted" onClick={onClose}><X size={17} /></button></header>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[20rem_1fr]">
        <form autoComplete="off" className="border-b border-border p-5 lg:border-b-0 lg:border-r" onSubmit={submit}>
          <h3 className="flex items-center gap-2 text-sm font-semibold"><UserPlus size={16} />{t("createUser")}</h3>
          <Field name="managed-display-name" label={t("displayName")} autoComplete="off" value={form.displayName} onChange={(value) => setForm({ ...form, displayName: value })} />
          <Field name="managed-email" label={t("email")} type="email" autoComplete="off" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
          <Field name="managed-new-password" label={t("password")} type="password" autoComplete="new-password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} />
          <label className="mt-3 block text-xs text-mutedForeground">{t("role")}<select className="mt-1 w-full rounded-lg border border-border bg-editorBackground px-3 py-2 text-foreground" value={form.roleKey} onChange={(event) => setForm({ ...form, roleKey: event.target.value as RoleKey })}>{roles.map((role) => <option key={role} value={role}>{t(`adminRole.${role}`)}</option>)}</select></label>
          <button className="mt-4 w-full rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primaryForeground disabled:opacity-50" disabled={createUser.isPending || !form.displayName || !form.email || form.password.length < 10}>{t("createUser")}</button>
          {createUser.isError && <p className="mt-2 text-xs text-destructive">{t("operationFailed")}</p>}
        </form>
        <section className="min-h-0 space-y-6 overflow-auto p-5"><div><div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-semibold">{t("usersAndRoles")}</h3><p className="text-xs text-mutedForeground">{t("usersAndRolesDescription")}</p></div><span className="rounded-full bg-muted px-2 py-1 text-xs">{members.data?.length ?? 0}</span></div>
          <div className="space-y-2">{members.data?.map((member) => <div key={member.id} className="grid items-center gap-3 rounded-xl border border-border bg-editorBackground p-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto_auto]"><div className="min-w-0"><div className="truncate text-sm font-medium">{member.displayName}{member.id === currentUserId && <span className="ml-2 text-xs text-primary">{t("you")}</span>}</div><div className="truncate text-xs text-mutedForeground">{member.email}</div></div><select aria-label={t("role")} className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs" value={member.roleKey} disabled={member.id === currentUserId || updateMember.isPending} onChange={(event) => updateMember.mutate({ userId: member.id, patch: { roleKey: event.target.value as RoleKey } })}>{roles.map((role) => <option key={role} value={role}>{t(`adminRole.${role}`)}</option>)}</select><button className={`rounded-lg px-2 py-1.5 text-xs ${member.isActive ? "bg-success/10 text-success" : "bg-muted text-mutedForeground"}`} disabled={member.id === currentUserId} onClick={() => updateMember.mutate({ userId: member.id, patch: { isActive: !member.isActive } })}>{member.isActive ? t("active") : t("inactive")}</button><button aria-label={t("removeUser")} title={t("removeUser")} className="rounded-lg p-2 text-destructive hover:bg-destructive/10 disabled:opacity-30" disabled={member.id === currentUserId} onClick={() => { if (window.confirm(t("removeUserConfirm", { name: member.displayName }))) removeMember.mutate(member.id); }}><Trash2 size={15} /></button></div>)}</div>
          </div><div><div className="mb-3 flex items-center gap-2"><MessageSquareWarning size={16} /><div><h3 className="text-sm font-semibold">{t("pilotFeedbackInbox")}</h3><p className="text-xs text-mutedForeground">{t("pilotFeedbackInboxHelp")}</p></div><span className="ml-auto rounded-full bg-muted px-2 py-1 text-xs">{feedback.data?.length ?? 0}</span></div><div className="space-y-2">{feedback.data?.length === 0 && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-mutedForeground">{t("noPilotFeedback")}</p>}{feedback.data?.map((item) => <article key={item.id} className="rounded-xl border border-border bg-editorBackground p-3"><div className="flex items-center gap-2"><span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{t(`feedbackCategory.${item.nextData.category ?? "bug"}`)}</span><span className="truncate text-xs text-mutedForeground">{item.actor?.displayName ?? t("unknownUser")} - {new Date(item.createdAt).toLocaleString()}</span></div><h4 className="mt-2 text-sm font-medium">{item.nextData.title}</h4><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-mutedForeground">{item.nextData.description}</p></article>)}</div></div>
        </section>
      </div>
    </div>
  </div>;
}

function Field({ name, label, value, onChange, type = "text", autoComplete }: { name: string; label: string; value: string; onChange: (value: string) => void; type?: string; autoComplete?: string }) {
  return <label className="mt-3 block text-xs text-mutedForeground">{label}<input required name={name} type={type} autoComplete={autoComplete} className="mt-1 w-full rounded-lg border border-border bg-editorBackground px-3 py-2 text-foreground" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
