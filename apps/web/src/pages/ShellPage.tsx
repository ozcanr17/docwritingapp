import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, LogOut, Redo2, Search, Settings, Trash2, Undo2, Users } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { MenuBar } from "../components/MenuBar";
import { DocumentTabsBar } from "../components/DocumentTabsBar";
import { ResizeHandle } from "../components/ResizeHandle";
import { TrashPanel } from "../components/TrashPanel";
import { TreePanel } from "../components/TreePanel";
import { useDocumentEvents } from "../hooks/useDocumentEvents";
import { api, DocumentSummary, DocumentType, setSessionToken, UserProfile } from "../lib/api";
import { openDocumentWindow } from "../lib/documentWindows";
import { DocumentTab, useDocumentTabsStore } from "../stores/documentTabs";
import { useEditHistoryStore } from "../stores/editHistory";
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

function initials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.charAt(0) ?? "?"}${parts.length > 1 ? parts.at(-1)?.charAt(0) ?? "" : ""}`.toLocaleUpperCase();
}

export function ShellPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [view, setView] = useState<"documents" | "trash">("documents");
  const [report, setReport] = useState<"baselines" | "coverage" | "matrix" | "reviews" | "runs" | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileTarget, setProfileTarget] = useState<{ userId: string; allowEdit: boolean } | null>(null);
  const [presenceOpen, setPresenceOpen] = useState(false);
  const presenceCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeReport = useCallback(() => setReport(null), []);
  const tabs = useDocumentTabsStore((s) => s.tabs);
  const activeDocumentId = useDocumentTabsStore((s) => s.activeId);
  const secondaryDocumentId = useDocumentTabsStore((s) => s.secondaryId);
  const openDocumentTab = useDocumentTabsStore((s) => s.open);
  const activateDocumentTab = useDocumentTabsStore((s) => s.activate);
  const closeDocumentTab = useDocumentTabsStore((s) => s.close);
  const setSecondaryDocument = useDocumentTabsStore((s) => s.setSecondary);
  const togglePinnedDocument = useDocumentTabsStore((s) => s.togglePin);
  const reorderDocumentTabs = useDocumentTabsStore((s) => s.reorder);
  const focusDocumentPane = useDocumentTabsStore((s) => s.focus);
  const resetDocumentTabs = useDocumentTabsStore((s) => s.reset);
  const selectedDocumentId = useSelectionStore((s) => s.selectedDocumentId);
  const undoCount = useEditHistoryStore((s) => selectedDocumentId ? s.documents[selectedDocumentId]?.undo.length ?? 0 : 0);
  const redoCount = useEditHistoryStore((s) => selectedDocumentId ? s.documents[selectedDocumentId]?.redo.length ?? 0 : 0);
  const historyBusy = useEditHistoryStore((s) => selectedDocumentId ? Boolean(s.busy[selectedDocumentId]) : false);
  const clearEditHistory = useEditHistoryStore((s) => s.clear);
  const resetEditHistory = useEditHistoryStore((s) => s.reset);
  const setSelectedDocumentId = useSelectionStore((s) => s.setDocument);
  const detailRowId = useSelectionStore((s) => s.detailRowId);
  const linkedRowId = useSelectionStore((s) => s.linkedRowId);
  const treeWidth = useLayoutStore((s) => s.treeWidth);
  const detailWidth = useLayoutStore((s) => s.detailWidth);
  const setTreeWidth = useLayoutStore((s) => s.setTreeWidth);
  const setDetailWidth = useLayoutStore((s) => s.setDetailWidth);

  const activateDocument = useCallback((id: string) => {
    activateDocumentTab(id);
    setSelectedDocumentId(id);
    setView("documents");
  }, [activateDocumentTab, setSelectedDocumentId]);

  const openDocument = useCallback((document: DocumentTab) => {
    openDocumentTab(document);
    setSelectedDocumentId(document.id);
    setView("documents");
  }, [openDocumentTab, setSelectedDocumentId]);

  const closeDocument = useCallback((id: string) => {
    clearEditHistory(id);
    closeDocumentTab(id);
    setSelectedDocumentId(useDocumentTabsStore.getState().activeId);
  }, [clearEditHistory, closeDocumentTab, setSelectedDocumentId]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Tab") {
        event.preventDefault();
        const state = useDocumentTabsStore.getState();
        if (state.tabs.length < 2 || !state.activeId) return;
        const index = state.tabs.findIndex((tab) => tab.id === state.activeId);
        const next = state.tabs[(index + (event.shiftKey ? -1 : 1) + state.tabs.length) % state.tabs.length];
        if (next) activateDocument(next.id);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "w") {
        const target = event.target as HTMLElement | null;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
        const activeId = useDocumentTabsStore.getState().activeId;
        if (activeId) {
          event.preventDefault();
          closeDocument(activeId);
        }
      }
      const target = event.target as HTMLElement | null;
      const editingText = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
      if (!editingText && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        const documentId = useDocumentTabsStore.getState().activeId;
        if (documentId) window.dispatchEvent(new CustomEvent(event.shiftKey ? "docsys:redo" : "docsys:undo", { detail: { documentId } }));
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [activateDocument, closeDocument]);

  useEffect(() => {
    setPresenceOpen(false);
    return () => {
      if (presenceCloseTimer.current) clearTimeout(presenceCloseTimer.current);
    };
  }, [selectedDocumentId]);

  useEffect(() => {
    const openProfile = (event: Event) => setProfileTarget({ userId: (event as CustomEvent<{ userId: string }>).detail.userId, allowEdit: false });
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
    queryFn: () => api<DocumentSummary>(`/documents/${selectedDocumentId}`),
    enabled: selectedDocumentId !== null,
  });
  useEffect(() => {
    if (selectedDocument.data) useDocumentTabsStore.getState().update(selectedDocument.data);
  }, [selectedDocument.data]);

  useEffect(() => {
    if (!profile.isSuccess) return;
    const documentId = new URLSearchParams(window.location.search).get("document");
    if (!documentId || useDocumentTabsStore.getState().tabs.some((tab) => tab.id === documentId)) return;
    void api<DocumentSummary>(`/documents/${documentId}`).then(openDocument).catch(() => undefined);
  }, [profile.isSuccess, openDocument]);
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

  useEffect(() => {
    if (profile.isError) {
      resetEditHistory();
      navigate("/login", { replace: true });
    }
  }, [navigate, profile.isError, resetEditHistory]);

  if (profile.isError) {
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
            onSelect={(document, rowId) => {
              openDocument({ id: document.id, title: document.title, documentType: document.documentType as DocumentType });
              setSearchOpen(false);
              window.setTimeout(() => useSelectionStore.getState().openDetail(rowId), 0);
            }}
          />
        )}
        {settingsOpen && organizationId && workspaceId && <WorkspaceSettingsDialog organizationId={organizationId} workspaceId={workspaceId} onClose={() => setSettingsOpen(false)} />}
        {profileTarget && <ProfileDialog userId={profileTarget.userId} currentUserId={profile.data.id} allowEdit={profileTarget.allowEdit} onClose={() => setProfileTarget(null)} />}
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
                onSelectDocument={openDocument}
              />
            ))}
        </section>
        <div className="border-t border-white/10 p-3 text-sm">
          <div className="flex items-center gap-1">
            <button data-testid="open-profile" className="min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-left hover:bg-white/10" onClick={() => setProfileTarget({ userId: profile.data.id, allowEdit: true })}>{profile.data.displayName}</button>
          <button
            data-testid="logout"
            aria-label={t("logout")}
            title={t("logout")}
            className="rounded-lg p-2 hover:bg-white/10"
            onClick={async () => {
              await api("/auth/logout", { method: "POST" });
              setSessionToken(null);
              resetDocumentTabs();
              resetEditHistory();
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
        <DocumentTabsBar
          tabs={tabs}
          activeId={activeDocumentId}
          secondaryId={secondaryDocumentId}
          onActivate={activateDocument}
          onClose={closeDocument}
          onSecondaryChange={setSecondaryDocument}
          onTogglePin={togglePinnedDocument}
          onReorder={reorderDocumentTabs}
          onOpenWindow={(id) => {
            const tab = tabs.find((item) => item.id === id);
            if (tab) void openDocumentWindow(id, tab.title);
          }}
        />
        <header className="relative z-20 flex items-center justify-between border-b border-border bg-surface/85 px-4 py-2.5 text-sm backdrop-blur-xl">
          <div className="flex items-center gap-1">
            <button title={t("globalSearchHelp")} className="flex items-center gap-2 rounded-lg px-2 py-1 text-mutedForeground hover:bg-muted" onClick={() => setSearchOpen(true)}>
              <Search size={14} />{t("globalSearch")} <span className="rounded border border-border px-1.5 text-[10px]">⌘K</span>
            </button>
            <span className="mx-1 h-5 border-l border-border" />
            <button data-testid="undo-action" title={`${t("undoLastChange")} · Ctrl/Cmd+Z`} aria-label={t("undoLastChange")} disabled={!selectedDocumentId || undoCount === 0 || historyBusy} className="rounded-lg p-1.5 text-mutedForeground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35" onClick={() => selectedDocumentId && window.dispatchEvent(new CustomEvent("docsys:undo", { detail: { documentId: selectedDocumentId } }))}>
              <Undo2 size={15} />
            </button>
            <button data-testid="redo-action" title={`${t("redoLastChange")} · Ctrl/Cmd+Shift+Z`} aria-label={t("redoLastChange")} disabled={!selectedDocumentId || redoCount === 0 || historyBusy} className="rounded-lg p-1.5 text-mutedForeground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35" onClick={() => selectedDocumentId && window.dispatchEvent(new CustomEvent("docsys:redo", { detail: { documentId: selectedDocumentId } }))}>
              <Redo2 size={15} />
            </button>
          </div>
          {selectedDocumentId && view === "documents" && (
            <div className="flex items-center gap-2 text-mutedForeground">
              <Users size={14} />
              <div
                className="relative"
                onMouseEnter={() => {
                  if (presenceCloseTimer.current) clearTimeout(presenceCloseTimer.current);
                  setPresenceOpen(true);
                }}
                onMouseLeave={() => {
                  presenceCloseTimer.current = setTimeout(() => setPresenceOpen(false), 140);
                }}
              >
                <span data-testid="presence-count" title={t("showOnlineUsers")} className="block rounded-md px-1.5 py-1">{t("onlineUsers")}: {presence.length}</span>
                {presenceOpen && (
                  <div data-testid="presence-popover" className="absolute right-0 top-full z-50 mt-1.5 w-64 rounded-xl border border-border bg-surfaceElevated p-2 shadow-2xl">
                    <div className="px-2 pb-1.5 pt-1 text-xs font-medium text-mutedForeground">{t("onlineEditors")}</div>
                    {presence.map((person) => (
                      <button key={person.userId} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-muted" title={t("openUserProfile", { name: person.displayName })} onClick={() => { setPresenceOpen(false); setProfileTarget({ userId: person.userId, allowEdit: false }); }}>
                        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-surface p-0.5"><span className="flex h-full w-full items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primaryForeground">{initials(person.displayName)}</span></span>
                        <span className="min-w-0 flex-1 truncate font-medium text-foreground">{person.displayName}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span className="flex gap-1">
                {presence.slice(0, 8).map((p) => (
                  <button
                    key={p.userId}
                    title={p.displayName}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-primary/30 bg-surface p-0.5 shadow-sm ring-1 ring-primary/15"
                    onClick={() => setProfileTarget({ userId: p.userId, allowEdit: false })}
                  >
                    <span className="flex h-full w-full items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primaryForeground">{initials(p.displayName)}</span>
                  </button>
                ))}
              </span>
            </div>
          )}
        </header>
        {view === "documents" && selectedDocumentId ? (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <DocumentPane tab={tabs.find((tab) => tab.id === selectedDocumentId) ?? null} displayName={profile.data.displayName} active onFocus={() => undefined} />
            {secondaryDocumentId && (
              <DocumentPane
                tab={tabs.find((tab) => tab.id === secondaryDocumentId) ?? null}
                displayName={profile.data.displayName}
                active={false}
                onFocus={() => {
                  focusDocumentPane(secondaryDocumentId);
                  setSelectedDocumentId(secondaryDocumentId);
                }}
              />
            )}
          </div>
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

function DocumentPane({ tab, displayName, active, onFocus }: { tab: DocumentTab | null; displayName: string; active: boolean; onFocus: () => void }) {
  const { t } = useTranslation();
  if (!tab) return <PanelLoading />;
  return (
    <section aria-label={tab.title} className={`flex min-w-0 flex-1 flex-col overflow-hidden ${active ? "" : "border-l border-border"}`} onMouseDownCapture={onFocus}>
      {!active && <div className="flex h-8 shrink-0 items-center justify-between border-b border-border bg-editorBackground px-3 text-xs"><span className="truncate font-medium">{tab.title}</span><span className="text-[10px] uppercase tracking-wide text-mutedForeground">{t("secondaryPane")}</span></div>}
      <Suspense fallback={<PanelLoading />}>
        {tab.documentType === "general_document" ? <RichTextEditor documentId={tab.id} displayName={displayName} /> : <DocumentGrid documentId={tab.id} documentType={tab.documentType === "test" ? "test" : "requirement"} />}
      </Suspense>
    </section>
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
