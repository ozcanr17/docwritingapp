import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, LogOut, Search, Settings, Trash2, Users } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { MenuBar } from "../components/MenuBar";
import { ResizeHandle } from "../components/ResizeHandle";
import { TrashPanel } from "../components/TrashPanel";
import { TreePanel } from "../components/TreePanel";
import { useDocumentEvents } from "../hooks/useDocumentEvents";
import { api, DocumentType, setSessionToken, UserProfile } from "../lib/api";
import { useLayoutStore } from "../stores/layout";
import { useSelectionStore } from "../stores/selection";

const DocumentGrid = lazy(() => import("../components/DocumentGrid").then((module) => ({ default: module.DocumentGrid })));
const GlobalSearchDialog = lazy(() => import("../components/GlobalSearchDialog").then((module) => ({ default: module.GlobalSearchDialog })));
const ReportsDialog = lazy(() => import("../components/ReportsDialog").then((module) => ({ default: module.ReportsDialog })));
const RichTextEditor = lazy(() => import("../components/RichTextEditor").then((module) => ({ default: module.RichTextEditor })));
const RowDetailPanel = lazy(() => import("../components/RowDetailPanel").then((module) => ({ default: module.RowDetailPanel })));
const WorkspaceSettingsDialog = lazy(() => import("../components/WorkspaceSettingsDialog").then((module) => ({ default: module.WorkspaceSettingsDialog })));
const ProfileDialog = lazy(() => import("../components/ProfileDialog").then((module) => ({ default: module.ProfileDialog })));

interface Organization {
  id: string;
  name: string;
}

interface Workspace {
  id: string;
  name: string;
}

export function ShellPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [view, setView] = useState<"documents" | "trash">("documents");
  const [report, setReport] = useState<"baselines" | "coverage" | "matrix" | "reviews" | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const closeReport = useCallback(() => setReport(null), []);
  const selectedDocumentId = useSelectionStore((s) => s.selectedDocumentId);
  const setSelectedDocumentId = useSelectionStore((s) => s.setDocument);
  const detailRowId = useSelectionStore((s) => s.detailRowId);
  const linkedRowId = useSelectionStore((s) => s.linkedRowId);
  const treeWidth = useLayoutStore((s) => s.treeWidth);
  const detailWidth = useLayoutStore((s) => s.detailWidth);
  const setTreeWidth = useLayoutStore((s) => s.setTreeWidth);
  const setDetailWidth = useLayoutStore((s) => s.setDetailWidth);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const openProfile = (event: Event) => setProfileUserId((event as CustomEvent<{ userId: string }>).detail.userId);
    window.addEventListener("docsys:open-profile", openProfile);
    return () => window.removeEventListener("docsys:open-profile", openProfile);
  }, []);

  const profile = useQuery({
    queryKey: ["me"],
    queryFn: () => api<UserProfile>("/auth/me"),
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

  const selectedDocument = useQuery({
    queryKey: ["document", selectedDocumentId],
    queryFn: () => api<{ id: string; documentType: DocumentType }>(`/documents/${selectedDocumentId}`),
    enabled: selectedDocumentId !== null,
  });
  const isTextDocument = selectedDocument.data?.documentType === "general_document";

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

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <MenuBar
        documentId={selectedDocumentId}
        documentType={selectedDocument.data?.documentType ?? null}
        view={view}
        setView={setView}
        onOpenReport={setReport}
      />
      <Suspense fallback={null}>
        {report && selectedDocumentId && <ReportsDialog documentId={selectedDocumentId} tab={report} onClose={closeReport} />}
        {searchOpen && workspaceId && (
          <GlobalSearchDialog
            workspaceId={workspaceId}
            onClose={() => setSearchOpen(false)}
            onSelect={(documentId, rowId) => {
              setView("documents");
              setSelectedDocumentId(documentId);
              setSearchOpen(false);
              window.setTimeout(() => useSelectionStore.getState().openDetail(rowId), 0);
            }}
          />
        )}
        {settingsOpen && organizationId && workspaceId && <WorkspaceSettingsDialog organizationId={organizationId} workspaceId={workspaceId} onClose={() => setSettingsOpen(false)} />}
        {profileUserId && <ProfileDialog userId={profileUserId} currentUserId={profile.data.id} onClose={() => setProfileUserId(null)} />}
      </Suspense>
      <div className="flex flex-1 gap-1.5 overflow-hidden p-2 pt-1.5">
      <aside
        aria-label={t("primaryNavigation")}
        className="flex shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-sidebarBackground text-sidebarForeground shadow-sm"
        style={{ width: treeWidth }}
      >
        <div className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-sidebarForeground">
          {workspaces.data?.[0]?.name ?? "—"}
        </div>
        <nav aria-label={t("primaryNavigation")} className="px-2 pb-2 text-sm">
          <SidebarItem
            icon={<FileText size={15} />}
            label={t("documents")}
            active={view === "documents"}
            onClick={() => setView("documents")}
            testId="nav-documents"
          />
          <SidebarItem
            icon={<Trash2 size={15} />}
            label={t("trash")}
            active={view === "trash"}
            onClick={() => setView("trash")}
            testId="nav-trash"
          />
          <SidebarItem icon={<Settings size={15} />} label={t("settings")} onClick={() => setSettingsOpen(true)} />
        </nav>
        <section aria-label={t("documentTree")} className="min-h-0 flex-1 overflow-hidden border-t border-white/10 bg-surface text-foreground">
          {workspaceId &&
            (view === "trash" ? (
              <TrashPanel workspaceId={workspaceId} />
            ) : (
              <TreePanel
                workspaceId={workspaceId}
                selectedDocumentId={selectedDocumentId}
                onSelectDocument={setSelectedDocumentId}
              />
            ))}
        </section>
        <div className="border-t border-white/10 p-3 text-sm">
          <div className="flex items-center gap-1">
            <button data-testid="open-profile" className="min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-left hover:bg-white/10" onClick={() => setProfileUserId(profile.data.id)}>{profile.data.displayName}</button>
          <button
            data-testid="logout"
            aria-label={t("logout")}
            title={t("logout")}
            className="rounded-lg p-2 hover:bg-white/10"
            onClick={async () => {
              await api("/auth/logout", { method: "POST" });
              setSessionToken(null);
              queryClient.clear();
              navigate("/login");
            }}
          >
            <LogOut size={15} />
          </button>
          </div>
        </div>
      </aside>
      <ResizeHandle side="left" ariaLabel={t("resizeDocumentTree")} value={treeWidth} min={200} max={520} onResize={(dx) => setTreeWidth(treeWidth + dx)} />
      <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <header className="flex items-center justify-between border-b border-border bg-surface/85 px-4 py-2.5 text-sm backdrop-blur-xl">
          <button className="flex items-center gap-2 rounded-lg px-2 py-1 text-mutedForeground hover:bg-muted" onClick={() => setSearchOpen(true)}>
            <Search size={14} />{t("globalSearch")} <span className="rounded border border-border px-1.5 text-[10px]">⌘K</span>
          </button>
          {selectedDocumentId && view === "documents" && (
            <span className="flex items-center gap-2 text-mutedForeground">
              <Users size={14} />
              <span data-testid="presence-count">
                {t("onlineUsers")}: {presence.length}
              </span>
              <span className="flex gap-1">
                {presence.slice(0, 8).map((p) => (
                  <button
                    key={p.userId}
                    title={p.displayName}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primaryForeground"
                    onClick={() => setProfileUserId(p.userId)}
                  >
                    {p.displayName.charAt(0).toUpperCase()}
                  </button>
                ))}
              </span>
            </span>
          )}
        </header>
        {view === "documents" && selectedDocumentId ? (
          <Suspense fallback={<PanelLoading />}>
            {isTextDocument ? (
              <RichTextEditor documentId={selectedDocumentId} displayName={profile.data.displayName} />
            ) : (
              <DocumentGrid
                documentId={selectedDocumentId}
                documentType={selectedDocument.data?.documentType === "test" ? "test" : "requirement"}
              />
            )}
          </Suspense>
        ) : view === "documents" ? (
          <div className="p-8 text-sm text-mutedForeground">{t("selectDocument")}</div>
        ) : (
          <div className="p-8 text-sm text-mutedForeground">{t("trash")}</div>
        )}
      </main>
      {view === "documents" && selectedDocumentId && (detailRowId || linkedRowId) && (
        <>
          <ResizeHandle side="right" ariaLabel={t("resizeDetailPanel")} value={detailWidth} min={280} max={640} onResize={(dx) => setDetailWidth(detailWidth + dx)} />
          <aside className="flex shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm" style={{ width: detailWidth }}>
            <Suspense fallback={<PanelLoading />}>
              {linkedRowId ? (
                <RowDetailPanel rowId={linkedRowId} documentId={selectedDocumentId} variant="linked" />
              ) : detailRowId ? (
                <RowDetailPanel rowId={detailRowId} documentId={selectedDocumentId} variant="primary" />
              ) : null}
            </Suspense>
          </aside>
        </>
      )}
      </div>
    </div>
  );
}

function PanelLoading() {
  const { t } = useTranslation();
  return <div className="p-6 text-sm text-mutedForeground">{t("loading")}</div>;
}

function SidebarItem({
  icon,
  label,
  active,
  onClick,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  testId?: string;
}) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
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
