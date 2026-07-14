import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Languages, LogOut, Moon, Settings, Sun, SunMoon, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { DocumentGrid } from "../components/DocumentGrid";
import { TreePanel } from "../components/TreePanel";
import { useDocumentEvents } from "../hooks/useDocumentEvents";
import { api } from "../lib/api";
import { setLanguage, storedLanguage } from "../lib/i18n";
import { ThemeMode, useThemeStore } from "../stores/theme";

interface Organization {
  id: string;
  name: string;
}

interface Workspace {
  id: string;
  name: string;
}

interface Profile {
  id: string;
  email: string;
  displayName: string;
}

export function ShellPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);

  const profile = useQuery({
    queryKey: ["me"],
    queryFn: () => api<Profile>("/auth/me"),
    retry: false,
  });

  const organizations = useQuery({
    queryKey: ["organizations"],
    queryFn: () => api<Organization[]>("/organizations"),
    enabled: profile.isSuccess,
  });

  const organizationId = organizations.data?.[0]?.id ?? null;

  const workspaces = useQuery({
    queryKey: ["workspaces", organizationId],
    queryFn: () => api<Workspace[]>(`/organizations/${organizationId}/workspaces`),
    enabled: organizationId !== null,
  });

  const workspaceId = workspaces.data?.[0]?.id ?? null;
  const presence = useDocumentEvents(selectedDocumentId);

  const bootstrap = useMutation({
    mutationFn: async (input: { orgName: string; workspaceName: string }) => {
      const slugBase = `org-${Date.now()}`;
      const org = await api<Organization>("/organizations", {
        method: "POST",
        body: JSON.stringify({ name: input.orgName, slug: slugBase }),
      });
      await api(`/organizations/${org.id}/workspaces`, {
        method: "POST",
        body: JSON.stringify({ name: input.workspaceName, slug: "main" }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["organizations"] });
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });

  if (profile.isError) {
    navigate("/login");
    return null;
  }
  if (!profile.data || organizations.isLoading) {
    return <div className="p-8 text-sm text-mutedForeground">{t("loading")}</div>;
  }

  if (organizations.data && organizations.data.length === 0) {
    return <BootstrapForm onSubmit={(orgName, workspaceName) => bootstrap.mutate({ orgName, workspaceName })} />;
  }

  const themeOrder: ThemeMode[] = ["light", "dark", "system"];
  const nextTheme = themeOrder[(themeOrder.indexOf(themeMode) + 1) % themeOrder.length] as ThemeMode;
  const themeIcon = themeMode === "light" ? <Sun size={16} /> : themeMode === "dark" ? <Moon size={16} /> : <SunMoon size={16} />;
  const themeLabel = themeMode === "light" ? t("themeLight") : themeMode === "dark" ? t("themeDark") : t("themeSystem");

  return (
    <div className="flex h-screen">
      <aside className="flex w-60 flex-col bg-sidebarBackground text-sidebarForeground">
        <div className="border-b border-white/10 px-4 py-3 font-semibold">{t("appName")}</div>
        <div className="px-4 py-2 text-xs uppercase tracking-wide opacity-60">
          {workspaces.data?.[0]?.name ?? "—"}
        </div>
        <nav className="flex-1 px-2 text-sm">
          <SidebarItem icon={<FileText size={15} />} label={t("documents")} active />
          <SidebarItem icon={<Trash2 size={15} />} label={t("trash")} />
          <SidebarItem icon={<Settings size={15} />} label={t("settings")} />
        </nav>
        <div className="border-t border-white/10 p-3 text-sm">
          <div className="mb-2 truncate opacity-80">{profile.data.displayName}</div>
          <button
            className="mb-1 flex w-full items-center gap-2 rounded px-2 py-1 hover:bg-white/10"
            onClick={() => setThemeMode(nextTheme)}
          >
            {themeIcon}
            {themeLabel}
          </button>
          <button
            data-testid="language-toggle"
            className="mb-1 flex w-full items-center gap-2 rounded px-2 py-1 hover:bg-white/10"
            onClick={() => setLanguage(storedLanguage() === "tr" ? "en" : "tr")}
          >
            <Languages size={15} />
            {t("language")}: {storedLanguage().toUpperCase()}
          </button>
          <button
            className="flex w-full items-center gap-2 rounded px-2 py-1 hover:bg-white/10"
            onClick={async () => {
              await api("/auth/logout", { method: "POST" });
              queryClient.clear();
              navigate("/login");
            }}
          >
            <LogOut size={15} />
            {t("logout")}
          </button>
        </div>
      </aside>
      <section className="w-72 border-r border-border bg-surface">
        {workspaceId && (
          <TreePanel
            workspaceId={workspaceId}
            selectedDocumentId={selectedDocumentId}
            onSelectDocument={setSelectedDocumentId}
          />
        )}
      </section>
      <main className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-2 text-sm">
          <span className="text-mutedForeground">{t("documents")}</span>
          {selectedDocumentId && (
            <span className="flex items-center gap-2 text-mutedForeground">
              <Users size={14} />
              <span data-testid="presence-count">
                {t("onlineUsers")}: {presence.length}
              </span>
              <span className="flex gap-1">
                {presence.slice(0, 8).map((p) => (
                  <span
                    key={p.userId}
                    title={p.displayName}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primaryForeground"
                  >
                    {p.displayName.charAt(0).toUpperCase()}
                  </span>
                ))}
              </span>
            </span>
          )}
        </header>
        {selectedDocumentId ? (
          <DocumentGrid documentId={selectedDocumentId} />
        ) : (
          <div className="p-8 text-sm text-mutedForeground">{t("selectDocument")}</div>
        )}
      </main>
    </div>
  );
}

function SidebarItem({ icon, label, active }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <button
      className={`mb-0.5 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-white/10 ${
        active ? "bg-white/10" : ""
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function BootstrapForm({ onSubmit }: { onSubmit: (orgName: string, workspaceName: string) => void }) {
  const { t } = useTranslation();
  const [orgName, setOrgName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  return (
    <div className="flex min-h-screen items-center justify-center">
      <form
        className="w-96 rounded border border-border bg-surface p-8 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(orgName, workspaceName);
        }}
      >
        <h1 className="mb-6 text-xl font-semibold">{t("createOrganization")}</h1>
        <label className="mb-3 block text-sm">
          {t("organizationName")}
          <input
            data-testid="bootstrap-org-name"
            className="mt-1 w-full rounded border border-border bg-surface px-3 py-2"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            required
          />
        </label>
        <label className="mb-4 block text-sm">
          {t("workspaceName")}
          <input
            data-testid="bootstrap-workspace-name"
            className="mt-1 w-full rounded border border-border bg-surface px-3 py-2"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            required
          />
        </label>
        <button
          data-testid="bootstrap-submit"
          type="submit"
          className="w-full rounded bg-primary px-4 py-2 text-primaryForeground"
        >
          {t("createOrganization")}
        </button>
      </form>
    </div>
  );
}
