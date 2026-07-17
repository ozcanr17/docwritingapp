import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Phone, UserRound, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, UserProfile } from "../lib/api";
import { useToastStore } from "../stores/toasts";
import { useEscapeClose } from "../hooks/useEscapeClose";

export function ProfileDialog({ userId, currentUserId, allowEdit = true, onClose }: { userId: string; currentUserId: string; allowEdit?: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  useEscapeClose(onClose);
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const editable = allowEdit && userId === currentUserId;
  const [form, setForm] = useState<Omit<UserProfile, "id">>({ email: "", displayName: "", firstName: null, lastName: null, jobTitle: null, department: null, phone: null, bio: null });
  const profile = useQuery({ queryKey: ["user-profile", userId], queryFn: () => api<UserProfile>(`/auth/users/${userId}`) });

  useEffect(() => {
    if (profile.data) {
      const { id: _id, ...value } = profile.data;
      setForm(value);
    }
  }, [profile.data]);

  const save = useMutation({
    mutationFn: () => api<UserProfile>("/auth/me", { method: "PATCH", body: JSON.stringify(form) }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["user-profile", userId], updated);
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      pushToast("success", t("profileSaved"));
    },
    onError: () => pushToast("error", t("genericError")),
  });

  const update = (key: keyof Omit<UserProfile, "id">, value: string) => setForm((current) => ({ ...current, [key]: value || null }));
  const submit = (event: FormEvent) => { event.preventDefault(); if (editable && form.email && form.displayName) save.mutate(); };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form role="dialog" aria-modal="true" aria-labelledby="profile-title" className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl border border-border bg-surfaceElevated p-6 shadow-2xl" onSubmit={submit}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primaryForeground">{form.displayName.charAt(0).toUpperCase() || <UserRound size={20} />}</div>
            <div><h2 id="profile-title" className="font-semibold">{editable ? t("editProfile") : t("profile")}</h2><p className="text-sm text-mutedForeground">{form.displayName}</p></div>
          </div>
          <button type="button" aria-label={t("close")} className="rounded-lg p-1.5 hover:bg-muted" onClick={onClose}><X size={17} /></button>
        </div>
        {profile.isLoading ? <p className="mt-6 text-sm text-mutedForeground">{t("loading")}</p> : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <ProfileField label={t("displayName")} value={form.displayName} editable={editable} required onChange={(value) => update("displayName", value)} />
            <ProfileField label={t("email")} value={form.email} editable={editable} required type="email" icon={<Mail size={13} />} onChange={(value) => update("email", value)} />
            <ProfileField label={t("firstName")} value={form.firstName ?? ""} editable={editable} onChange={(value) => update("firstName", value)} />
            <ProfileField label={t("lastName")} value={form.lastName ?? ""} editable={editable} onChange={(value) => update("lastName", value)} />
            <ProfileField label={t("jobTitle")} value={form.jobTitle ?? ""} editable={editable} onChange={(value) => update("jobTitle", value)} />
            <ProfileField label={t("department")} value={form.department ?? ""} editable={editable} onChange={(value) => update("department", value)} />
            <ProfileField label={t("phone")} value={form.phone ?? ""} editable={editable} type="tel" icon={<Phone size={13} />} onChange={(value) => update("phone", value)} />
            <label className="sm:col-span-2 text-sm"><span className="text-mutedForeground">{t("bio")}</span>{editable ? <textarea className="mt-1 min-h-24 w-full rounded-lg border border-border bg-editorBackground px-3 py-2 text-foreground" value={form.bio ?? ""} onChange={(event) => update("bio", event.target.value)} /> : <div className="mt-1 whitespace-pre-wrap rounded-lg bg-editorBackground px-3 py-2">{form.bio || "—"}</div>}</label>
          </div>
        )}
        {editable && <><p className="mt-4 text-xs text-mutedForeground">{t("profileVisibilityHelp")}</p><div className="mt-5 flex justify-end gap-2"><button type="button" className="rounded-lg px-3 py-2 text-sm hover:bg-muted" onClick={onClose}>{t("cancel")}</button><button disabled={save.isPending || !form.email || !form.displayName} className="rounded-lg bg-primary px-4 py-2 text-sm text-primaryForeground disabled:opacity-50">{t("save")}</button></div></>}
      </form>
    </div>
  );
}

function ProfileField({ label, value, editable, required, type = "text", icon, onChange }: { label: string; value: string; editable: boolean; required?: boolean; type?: string; icon?: React.ReactNode; onChange: (value: string) => void }) {
  return <label className="text-sm"><span className="flex items-center gap-1 text-mutedForeground">{icon}{label}</span>{editable ? <input required={required} type={type} className="mt-1 w-full rounded-lg border border-border bg-editorBackground px-3 py-2 text-foreground" value={value} onChange={(event) => onChange(event.target.value)} /> : <div className="mt-1 rounded-lg bg-editorBackground px-3 py-2">{value || "—"}</div>}</label>;
}
