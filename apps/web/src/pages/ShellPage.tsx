import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ClipboardCheck, Clock3, FileKey2, FlaskConical, PenLine, Star, Users } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { AppBar } from "../components/AppBar";
import { AppRail } from "../components/AppRail";
import { DocumentActionsMenu } from "../components/DocumentActionsMenu";
import { DocumentTabsBar } from "../components/DocumentTabsBar";
import { ResizeHandle } from "../components/ResizeHandle";
import { TrashPanel } from "../components/TrashPanel";
import { TreePanel } from "../components/TreePanel";
import { useDocumentEvents } from "../hooks/useDocumentEvents";
import { api, ApiError, DocumentSummary, DocumentType, setSessionToken, UserProfile } from "../lib/api";
import { openDocumentWindow } from "../lib/documentWindows";
import { DocumentTab, useDocumentTabsStore } from "../stores/documentTabs";
import { formatShortcut, isTextEditingTarget, matchesShortcut, SHORTCUT_COMMANDS, ShortcutCommandId } from "../lib/keyboardShortcuts";
import { useKeyboardShortcutsStore } from "../stores/keyboardShortcuts";
import { useEditHistoryStore } from "../stores/editHistory";
import { useLayoutStore } from "../stores/layout";
import { useSelectionStore } from "../stores/selection";
import { useOnboardingStore } from "../stores/onboarding";
import { SaveStatusIndicator } from "../components/SaveStatusIndicator";
import { Avatar, AvatarGroup } from "../components/ui";
import { useAuthoringPreferencesStore, WorkspaceFocus } from "../stores/authoringPreferences";
import { recordPilotEvent } from "../lib/pilotTelemetry";
import { resolveResponsiveLayout } from "../lib/responsiveLayout";

const DocumentGrid = lazy(() => import("../components/DocumentGrid").then((module) => ({ default: module.DocumentGrid })));
const GlobalSearchDialog = lazy(() => import("../components/GlobalSearchDialog").then((module) => ({ default: module.GlobalSearchDialog })));
const ReportsDialog = lazy(() => import("../components/ReportsDialog").then((module) => ({ default: module.ReportsDialog })));
const RichTextEditor = lazy(() => import("../components/RichTextEditor").then((module) => ({ default: module.RichTextEditor })));
const RowDetailPanel = lazy(() => import("../components/RowDetailPanel").then((module) => ({ default: module.RowDetailPanel })));
const WorkspaceSettingsDialog = lazy(() => import("../components/WorkspaceSettingsDialog").then((module) => ({ default: module.WorkspaceSettingsDialog })));
const ProfileDialog = lazy(() => import("../components/ProfileDialog").then((module) => ({ default: module.ProfileDialog })));
const HistoryDialog = lazy(() => import("../components/HistoryDialog").then((module) => ({ default: module.HistoryDialog })));
const CommandPalette = lazy(() => import("../components/CommandPalette").then((module) => ({ default: module.CommandPalette })));
const OnboardingDialog = lazy(() => import("../components/OnboardingDialog").then((module) => ({ default: module.OnboardingDialog })));
const DocumentOverviewPanel = lazy(() => import("../components/DocumentOverviewPanel").then((module) => ({ default: module.DocumentOverviewPanel })));
const AdminPanel = lazy(() => import("../components/AdminPanel").then((module) => ({ default: module.AdminPanel })));
const DocumentAccessDialog = lazy(() => import("../components/DocumentAccessDialog").then((module) => ({ default: module.DocumentAccessDialog })));
const PilotFeedbackDialog = lazy(() => import("../components/PilotFeedbackDialog").then((module) => ({ default: module.PilotFeedbackDialog })));
const PilotChecklistDialog = lazy(() => import("../components/PilotChecklistDialog").then((module) => ({ default: module.PilotChecklistDialog })));
const WorkManagementPage = lazy(() => import("../components/WorkManagementPage").then((module) => ({ default: module.WorkManagementPage })));

interface Organization {
  id: string;
  name: string;
}

interface Workspace {
  id: string;
  name: string;
}

type ShellView = "documents" | "work" | "trash" | "settings" | "admin";

function viewForPath(pathname: string): ShellView {
  if (pathname.startsWith("/work")) return "work";
  if (pathname.startsWith("/trash")) return "trash";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/admin")) return "admin";
  return "documents";
}

export function ShellPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const view = viewForPath(location.pathname);
  const routeDocumentId = useMemo(
    () => /^\/docs\/([0-9a-fA-F-]{36})(?:\/|$)/.exec(location.pathname)?.[1] ?? null,
    [location.pathname],
  );
  const setView = useCallback((next: ShellView) => {
    if (next === "work" || next === "trash" || next === "settings" || next === "admin") {
      navigate(`/${next === "work" ? "work" : next}`);
      return;
    }
    const currentId = useSelectionStore.getState().selectedDocumentId;
    navigate(currentId ? `/docs/${currentId}` : "/docs");
  }, [navigate]);
  const reportTabs = ["readiness", "baselines", "coverage", "matrix", "reviews", "runs"] as const;
  const reportParam = new URLSearchParams(location.search).get("report");
  const report = (reportTabs as readonly string[]).includes(reportParam ?? "") ? reportParam as typeof reportTabs[number] : null;
  const setReport = useCallback((tab: "readiness" | "baselines" | "coverage" | "matrix" | "reviews" | "runs") => {
    navigate(`${location.pathname}?report=${tab}`);
  }, [location.pathname, navigate]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [documentAccessOpen, setDocumentAccessOpen] = useState(false);
  const [profileTarget, setProfileTarget] = useState<{ userId: string; allowEdit: boolean } | null>(null);
  const [historyMode, setHistoryMode] = useState<"row" | "document" | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [pilotFeedbackOpen, setPilotFeedbackOpen] = useState(false);
  const [pilotChecklistOpen, setPilotChecklistOpen] = useState(false);
  const [presenceOpen, setPresenceOpen] = useState(false);
  const [presenceProfileUserId, setPresenceProfileUserId] = useState<string | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() => typeof window === "undefined" ? 1440 : window.innerWidth);
  const presenceCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presenceTriggerRef = useRef<HTMLDivElement>(null);
  const closeReport = useCallback(() => navigate(location.pathname, { replace: true }), [location.pathname, navigate]);
  const tabs = useDocumentTabsStore((s) => s.tabs);
  const recentDocuments = useDocumentTabsStore((s) => s.recentDocuments);
  const favoriteDocuments = useDocumentTabsStore((s) => s.favoriteDocuments);
  const activeDocumentId = useDocumentTabsStore((s) => s.activeId);
  const secondaryDocumentId = useDocumentTabsStore((s) => s.secondaryId);
  const focusedDocumentId = useDocumentTabsStore((s) => s.focusedId);
  const openDocumentTab = useDocumentTabsStore((s) => s.open);
  const activateDocumentTab = useDocumentTabsStore((s) => s.activate);
  const closeDocumentTab = useDocumentTabsStore((s) => s.close);
  const setSecondaryDocument = useDocumentTabsStore((s) => s.setSecondary);
  const togglePinnedDocument = useDocumentTabsStore((s) => s.togglePin);
  const reorderDocumentTabs = useDocumentTabsStore((s) => s.reorder);
  const focusDocumentPane = useDocumentTabsStore((s) => s.focus);
  const resetDocumentTabs = useDocumentTabsStore((s) => s.reset);
  const shortcutBindings = useKeyboardShortcutsStore((s) => s.bindings);
  const selectedDocumentId = useSelectionStore((s) => s.selectedDocumentId);
  const selectedRowId = useSelectionStore((s) => s.selectedRowId);
  const onboardingCompleted = useOnboardingStore((s) => s.completed);
  const completeOnboarding = useOnboardingStore((s) => s.complete);
  const clearEditHistory = useEditHistoryStore((s) => s.clear);
  const resetEditHistory = useEditHistoryStore((s) => s.reset);
  const setSelectedDocumentId = useSelectionStore((s) => s.setDocument);
  const detailRowId = useSelectionStore((s) => s.detailRowId);
  const linkedRowId = useSelectionStore((s) => s.linkedRowId);
  const treeWidth = useLayoutStore((s) => s.treeWidth);
  const sidebarCollapsed = useLayoutStore((s) => s.sidebarCollapsed);
  const detailWidth = useLayoutStore((s) => s.detailWidth);
  const setTreeWidth = useLayoutStore((s) => s.setTreeWidth);
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
  const setDetailWidth = useLayoutStore((s) => s.setDetailWidth);
  const splitDirection = useLayoutStore((s) => s.splitDirection);
  const splitRatio = useLayoutStore((s) => s.splitRatio);
  const setSplitDirection = useLayoutStore((s) => s.setSplitDirection);
  const setSplitRatio = useLayoutStore((s) => s.setSplitRatio);
  const workspaceFocus = useAuthoringPreferencesStore((s) => s.workspaceFocus);
  const setWorkspaceFocus = useAuthoringPreferencesStore((s) => s.setWorkspaceFocus);
  const responsiveLayout = resolveResponsiveLayout(viewportWidth);
  const effectiveSidebarCollapsed = sidebarCollapsed || responsiveLayout.compactSidebar;
  const effectiveSplitDirection = responsiveLayout.stackSplit ? "vertical" : splitDirection;

  useEffect(() => {
    const updateViewport = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", updateViewport, { passive: true });
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    if (detailRowId || linkedRowId) setDetailPanelOpen(true);
  }, [detailRowId, linkedRowId]);

  const goToDocument = useCallback((id: string, replace = false) => {
    if (!location.pathname.startsWith(`/docs/${id}`)) navigate(`/docs/${id}`, { replace });
  }, [location.pathname, navigate]);

  const activateDocument = useCallback((id: string) => {
    activateDocumentTab(id);
    setSelectedDocumentId(id);
    goToDocument(id);
  }, [activateDocumentTab, goToDocument, setSelectedDocumentId]);

  const openDocument = useCallback((document: DocumentTab) => {
    openDocumentTab(document);
    setSelectedDocumentId(document.id);
    goToDocument(document.id);
  }, [goToDocument, openDocumentTab, setSelectedDocumentId]);

  const closeDocument = useCallback((id: string) => {
    clearEditHistory(id);
    closeDocumentTab(id);
    const nextId = useDocumentTabsStore.getState().focusedId;
    setSelectedDocumentId(nextId);
    navigate(nextId ? `/docs/${nextId}` : "/docs", { replace: true });
  }, [clearEditHistory, closeDocumentTab, navigate, setSelectedDocumentId]);

  const handleLogout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" });
    setSessionToken(null);
    resetDocumentTabs();
    resetEditHistory();
    queryClient.clear();
    navigate("/login");
  }, [navigate, queryClient, resetDocumentTabs, resetEditHistory]);

  const openWorkItemCreate = useCallback(() => {
    window.sessionStorage.setItem("docsys.openWorkCreate", "1");
    navigate("/work");
    window.dispatchEvent(new Event("docsys:open-work-create"));
  }, [navigate]);

  useEffect(() => {
    if (focusedDocumentId !== selectedDocumentId) setSelectedDocumentId(focusedDocumentId);
  }, [focusedDocumentId, selectedDocumentId, setSelectedDocumentId]);

  useEffect(() => {
    if (location.pathname === "/") navigate("/docs", { replace: true });
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (view !== "documents" || routeDocumentId || !selectedDocumentId) return;
    if (location.pathname === "/docs") goToDocument(selectedDocumentId, true);
  }, [goToDocument, location.pathname, routeDocumentId, selectedDocumentId, view]);

  const executeCommand = useCallback((commandId: ShortcutCommandId) => {
    if (commandId === "commandPalette") {
      setCommandPaletteOpen(true);
      return;
    }
    if (commandId === "globalSearch") {
      setSearchOpen(true);
      window.requestAnimationFrame(() => document.getElementById("docsys-global-search-input")?.focus());
      return;
    }
    if (commandId === "nextDocument" || commandId === "previousDocument") {
      const state = useDocumentTabsStore.getState();
      if (state.tabs.length < 2 || !state.focusedId) return;
      const index = state.tabs.findIndex((tab) => tab.id === state.focusedId);
      const offset = commandId === "previousDocument" ? -1 : 1;
      const next = state.tabs[(index + offset + state.tabs.length) % state.tabs.length];
      if (next) activateDocument(next.id);
      return;
    }
    if (commandId === "closeDocument") {
      const focusedId = useDocumentTabsStore.getState().focusedId;
      if (focusedId) closeDocument(focusedId);
      return;
    }
    if (commandId === "undo" || commandId === "redo") {
      const documentId = useDocumentTabsStore.getState().focusedId;
      if (documentId) window.dispatchEvent(new CustomEvent(commandId === "undo" ? "docsys:undo" : "docsys:redo", { detail: { documentId } }));
      return;
    }
    if (commandId === "selectedRowHistory") {
      if (selectedDocumentId && selectedRowId) setHistoryMode("row");
      return;
    }
    if (commandId === "documentHistory") {
      if (selectedDocumentId) setHistoryMode("document");
      return;
    }
    if (commandId === "openSettings") {
      setView("settings");
      return;
    }
    window.dispatchEvent(new CustomEvent("docsys:execute-document-command", { detail: { commandId, documentId: selectedDocumentId } }));
  }, [activateDocument, closeDocument, selectedDocumentId, selectedRowId]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const command = SHORTCUT_COMMANDS.find((definition) => matchesShortcut(event, shortcutBindings[definition.id]));
      if (!command) return;
      if (isTextEditingTarget(event.target) && command.id !== "commandPalette" && command.id !== "globalSearch") return;
      if (command.scope !== "global" && !selectedDocumentId) return;
      if (command.scope === "row" && !selectedRowId) return;
      const shortcut = shortcutBindings[command.id];
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!shortcut.includes("+") && !target?.closest('[data-testid="document-grid-scroll"]')) return;
      event.preventDefault();
      executeCommand(command.id);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [executeCommand, selectedDocumentId, selectedRowId, shortcutBindings]);

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

  useEffect(() => {
    const openDocumentRow = (event: Event) => {
      const detail = (event as CustomEvent<{ document: DocumentSummary; rowId: string }>).detail;
      openDocument({ id: detail.document.id, title: detail.document.title, documentType: detail.document.documentType });
      window.setTimeout(() => useSelectionStore.getState().openDetail(detail.rowId), 0);
    };
    window.addEventListener("docsys:open-document-row", openDocumentRow);
    return () => window.removeEventListener("docsys:open-document-row", openDocumentRow);
  }, [openDocument]);

  useEffect(() => {
    const openWorkHub = () => setView("work");
    window.addEventListener("docsys:open-work-hub", openWorkHub);
    return () => window.removeEventListener("docsys:open-work-hub", openWorkHub);
  }, []);

  const profile = useQuery({
    queryKey: ["me"],
    queryFn: () => api<UserProfile>("/auth/me"),
    retry: false,
  });

  useEffect(() => {
    if (!profile.isSuccess || !routeDocumentId) return;
    const tabsState = useDocumentTabsStore.getState();
    if (tabsState.focusedId === routeDocumentId) {
      if (useSelectionStore.getState().selectedDocumentId !== routeDocumentId) setSelectedDocumentId(routeDocumentId);
      return;
    }
    if (tabsState.tabs.some((tab) => tab.id === routeDocumentId)) {
      activateDocumentTab(routeDocumentId);
      setSelectedDocumentId(routeDocumentId);
      return;
    }
    void api<DocumentSummary>(`/documents/${routeDocumentId}`)
      .then((doc) => {
        openDocumentTab({ id: doc.id, title: doc.title, documentType: doc.documentType });
        setSelectedDocumentId(doc.id);
      })
      .catch(() => undefined);
  }, [activateDocumentTab, openDocumentTab, profile.isSuccess, routeDocumentId, setSelectedDocumentId]);

  const organizations = useQuery({
    queryKey: ["organizations"],
    queryFn: () => api<Organization[]>("/organizations"),
    enabled: profile.isSuccess,
  });

  const organizationId = organizations.data?.[0]?.id ?? null;

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ eventName: "import_previewed" | "import_completed"; metadata: Record<string, string | number | boolean> }>).detail;
      void recordPilotEvent(organizationId, detail.eventName, detail.metadata);
    };
    window.addEventListener("docsys:pilot-event", listener);
    return () => window.removeEventListener("docsys:pilot-event", listener);
  }, [organizationId]);

  const organizationAccess = useQuery({
    queryKey: ["organization-access", organizationId],
    queryFn: () => api<{ canManage: boolean }>(`/organizations/${organizationId}/me/access`),
    enabled: organizationId !== null,
  });

  const workspaces = useQuery({
    queryKey: ["workspaces", organizationId],
    queryFn: () => api<Workspace[]>(`/organizations/${organizationId}/workspaces`),
    enabled: organizationId !== null,
  });

  const workspaceId = workspaces.data?.[0]?.id ?? null;
  useEffect(() => {
    if (workspaceId && !onboardingCompleted) setOnboardingOpen(true);
  }, [onboardingCompleted, workspaceId]);
  const presence = useDocumentEvents(selectedDocumentId);
  const presenceProfile = useQuery({
    queryKey: ["user-profile", presenceProfileUserId],
    queryFn: () => api<UserProfile>(`/auth/users/${presenceProfileUserId}`),
    enabled: presenceProfileUserId !== null && presenceOpen,
  });

  const selectedDocument = useQuery({
    queryKey: ["document", selectedDocumentId],
    queryFn: () => api<DocumentSummary>(`/documents/${selectedDocumentId}`),
    enabled: selectedDocumentId !== null,
  });
  useEffect(() => {
    if (selectedDocument.data) useDocumentTabsStore.getState().update(selectedDocument.data);
  }, [selectedDocument.data]);
  useEffect(() => {
    if (selectedDocumentId) void recordPilotEvent(organizationId, "document_opened", { documentType: selectedDocument.data?.documentType ?? "unknown" });
  }, [organizationId, selectedDocument.data?.documentType, selectedDocumentId]);

  const paletteCommands = useMemo(() => SHORTCUT_COMMANDS.map((definition) => ({
    id: definition.id,
    label: t(definition.labelKey),
    category: t(`shortcutCategory.${definition.category}`),
    shortcut: formatShortcut(shortcutBindings[definition.id]),
    disabled: (definition.scope !== "global" && !selectedDocumentId)
      || (definition.scope === "row" && !selectedRowId)
      || (definition.id === "addTestStep" && selectedDocument.data?.documentType !== "test"),
    run: () => executeCommand(definition.id),
  })), [executeCommand, selectedDocument.data?.documentType, selectedDocumentId, selectedRowId, shortcutBindings, t]);

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
    return <ShellLoading label={t("loading")} />;
  }

  if (organizations.data && organizations.data.length === 0) {
    return <BootstrapForm onSubmit={(orgName, workspaceName) => bootstrap.mutate({ orgName, workspaceName })} />;
  }

  return (
    <div className="app-shell flex h-screen flex-col overflow-hidden bg-background">
      <AppBar
        workspaceName={workspaces.data?.[0]?.name}
        workspaceId={workspaceId}
        profile={{ id: profile.data.id, displayName: profile.data.displayName, email: profile.data.email }}
        isAdmin={Boolean(organizationAccess.data?.canManage)}
        onOpenSearch={() => setSearchOpen(true)}
        onCloseSearch={() => setSearchOpen(false)}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        searchOpen={searchOpen}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        commandPaletteShortcut={formatShortcut(shortcutBindings.commandPalette)}
        searchShortcut={formatShortcut(shortcutBindings.globalSearch)}
        onOpenOnboarding={() => setOnboardingOpen(true)}
        onOpenFeedback={() => setPilotFeedbackOpen(true)}
        onOpenPilotChecklist={() => setPilotChecklistOpen(true)}
        onOpenProfile={() => setProfileTarget({ userId: profile.data.id, allowEdit: true })}
        onOpenSettings={() => setView("settings")}
        onLogout={() => { void handleLogout(); }}
        onDocumentCreated={(document) => {
          void queryClient.invalidateQueries({ queryKey: ["tree", workspaceId] });
          openDocument({ id: document.id, title: document.title, documentType: document.documentType });
        }}
        onCreateWorkItem={openWorkItemCreate}
      />
      <Suspense fallback={null}>
        {onboardingOpen && <OnboardingDialog onComplete={() => { completeOnboarding(); setOnboardingOpen(false); }} />}
        {pilotFeedbackOpen && organizationId && <PilotFeedbackDialog organizationId={organizationId} documentId={selectedDocumentId} onClose={() => setPilotFeedbackOpen(false)} />}
        {pilotChecklistOpen && <PilotChecklistDialog onClose={() => setPilotChecklistOpen(false)} />}
        {commandPaletteOpen && workspaceId && <CommandPalette
          workspaceId={workspaceId}
          commands={paletteCommands}
          onClose={() => setCommandPaletteOpen(false)}
          onSelectResult={(result) => {
            openDocument({ id: result.document.id, title: result.document.title, documentType: result.document.documentType as DocumentType });
            setCommandPaletteOpen(false);
            if (result.rowId) window.setTimeout(() => useSelectionStore.getState().openDetail(result.rowId as string), 0);
          }}
        />}
        {report && selectedDocumentId && <ReportsDialog documentId={selectedDocumentId} tab={report} onClose={closeReport} />}
        {searchOpen && workspaceId && (
          <GlobalSearchDialog
            workspaceId={workspaceId}
            query={searchQuery}
            onClose={() => setSearchOpen(false)}
            onSelect={(document, rowId) => {
              openDocument({ id: document.id, title: document.title, documentType: document.documentType as DocumentType });
              setSearchOpen(false);
              if (rowId) window.setTimeout(() => useSelectionStore.getState().openDetail(rowId), 0);
            }}
          />
        )}
        {documentAccessOpen && selectedDocumentId && <DocumentAccessDialog documentId={selectedDocumentId} title={selectedDocument.data?.title ?? ""} onClose={() => setDocumentAccessOpen(false)} />}
        {profileTarget && <ProfileDialog userId={profileTarget.userId} currentUserId={profile.data.id} allowEdit={profileTarget.allowEdit} onClose={() => setProfileTarget(null)} />}
        {historyMode && selectedDocumentId && <HistoryDialog documentId={selectedDocumentId} rowId={useSelectionStore.getState().selectedRowId} mode={historyMode} onClose={() => setHistoryMode(null)} onOpenRow={(rowId) => { setHistoryMode(null); window.setTimeout(() => useSelectionStore.getState().openDetail(rowId), 0); }} />}
      </Suspense>
      <div className="relative flex flex-1 overflow-hidden">
      <aside
        aria-label={t("primaryNavigation")}
        data-collapsed={effectiveSidebarCollapsed}
        data-responsive-collapsed={responsiveLayout.compactSidebar}
        className="app-sidebar flex shrink-0 overflow-hidden bg-sidebarBackground text-sidebarForeground"
      >
        <AppRail
          view={view}
          canManage={Boolean(organizationAccess.data?.canManage)}
          panelCollapsed={effectiveSidebarCollapsed}
          panelToggleDisabled={responsiveLayout.compactSidebar}
          onNavigate={setView}
          onTogglePanel={toggleSidebar}
          onOpenAdmin={() => setView("admin")}
          onOpenSettings={() => setView("settings")}
        />
        {!effectiveSidebarCollapsed && (view === "documents" || view === "trash") && (
          <div className="flex flex-col overflow-hidden border-r border-border" style={{ width: treeWidth }}>
            <div className="flex min-h-12 items-center gap-2.5 border-b border-border/70 px-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
                <Building2 size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-mutedForeground">{t("workspaceArea")}</div>
                <div className="truncate text-sm font-semibold">{workspaces.data?.[0]?.name ?? "—"}</div>
              </div>
            </div>
            {view === "documents" && (favoriteDocuments.length > 0 || recentDocuments.length > 0) && (
              <div className="space-y-3 border-b border-border/70 px-2.5 py-2.5">
                <WorkspaceDocumentList title={t("favorites")} icon="favorite" documents={favoriteDocuments.slice(0, 5)} onOpen={openDocument} />
                <WorkspaceDocumentList title={t("recentDocuments")} icon="recent" documents={recentDocuments.filter((document) => !favoriteDocuments.some((favorite) => favorite.id === document.id)).slice(0, 5)} onOpen={openDocument} />
              </div>
            )}
            <section data-testid="tree-section" aria-label={t("documentTree")} className="min-h-0 flex-1 overflow-hidden bg-surface text-foreground">
              <div className="section-label border-b border-border/60 px-3 py-2">{view === "trash" ? t("trash") : t("explorer")}</div>
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
          </div>
        )}
      </aside>
      {!effectiveSidebarCollapsed && (view === "documents" || view === "trash") && <ResizeHandle side="left" ariaLabel={t("resizeDocumentTree")} value={treeWidth} min={200} max={520} onResize={(dx) => setTreeWidth(treeWidth + dx)} />}
      <main id="main-content" tabIndex={-1} className="app-main-surface flex min-w-0 flex-1 flex-col overflow-hidden bg-surface">
        {tabs.length > 0 && view === "documents" && <DocumentTabsBar
          tabs={tabs}
          activeId={selectedDocumentId}
          primaryId={activeDocumentId}
          secondaryId={secondaryDocumentId}
          onActivate={activateDocument}
          onClose={closeDocument}
          onSecondaryChange={setSecondaryDocument}
          onTogglePin={togglePinnedDocument}
          onReorder={reorderDocumentTabs}
          splitDirection={effectiveSplitDirection}
          onSplitDirectionChange={setSplitDirection}
          onOpenWindow={(id) => {
            const tab = tabs.find((item) => item.id === id);
            if (tab) void openDocumentWindow(id, tab.title);
          }}
        />}
        {selectedDocumentId && view === "documents" && <header className="relative z-30 flex min-h-11 min-w-0 items-center justify-between gap-2 border-b border-border bg-surface/85 px-2.5 py-1 text-sm backdrop-blur-xl">
          <div className="relative min-w-0 flex-1 self-stretch">
            {[activeDocumentId, secondaryDocumentId].filter((id): id is string => Boolean(id)).map((id) => (
              <div
                key={id}
                id={`docsys-toolbar-${id}`}
                aria-hidden={selectedDocumentId !== id}
                className={`absolute inset-0 min-w-0 items-center ${selectedDocumentId === id ? "z-10 flex" : "hidden"}`}
              />
            ))}
          </div>
          {selectedDocumentId && view === "documents" && (
            <div className="flex shrink-0 items-center gap-2 text-mutedForeground">
              <DocumentActionsMenu
                documentId={selectedDocumentId}
                documentType={selectedDocument.data?.documentType ?? null}
                canManageAccess={Boolean(selectedDocument.data?.access?.canManage)}
                onOpenReport={setReport}
                onOpenHistory={setHistoryMode}
                onOpenAccess={() => setDocumentAccessOpen(true)}
              />
              <SaveStatusIndicator documentId={selectedDocumentId} />
              <Users size={14} />
              <div
                ref={presenceTriggerRef}
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
              </div>
              <span className="flex pl-2" aria-label={t("onlineEditors")}>
                <AvatarGroup names={presence.map((p) => p.displayName)} max={4} size="sm" />
              </span>
            </div>
          )}
        </header>}
        {selectedDocumentId && presenceOpen && presenceTriggerRef.current && createPortal(
          <div
            data-testid="presence-popover"
            className="fixed z-[180] w-72 rounded-xl border border-border bg-surfaceElevated p-2 shadow-2xl"
            style={{ top: presenceTriggerRef.current.getBoundingClientRect().bottom + 6, right: Math.max(8, window.innerWidth - presenceTriggerRef.current.getBoundingClientRect().right) }}
            onMouseEnter={() => { if (presenceCloseTimer.current) clearTimeout(presenceCloseTimer.current); }}
            onMouseLeave={() => { presenceCloseTimer.current = setTimeout(() => { setPresenceOpen(false); setPresenceProfileUserId(null); }, 140); }}
          >
            <div className="px-2 pb-1.5 pt-1 text-xs font-medium text-mutedForeground">{t("onlineEditors")}</div>
            {presence.map((person) => (
              <div key={person.userId} className={`flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-muted ${presenceProfileUserId === person.userId ? "bg-muted" : ""}`} title={t("hoverProfilePreview")} onMouseEnter={() => setPresenceProfileUserId(person.userId)}>
                <Avatar name={person.displayName} size="md" />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{person.displayName}</span>
              </div>
            ))}
            {presenceProfile.data && (
              <div data-testid="presence-profile-preview" className="mt-1 rounded-lg border border-border bg-editorBackground p-3 text-xs">
                <div className="font-semibold text-foreground">{presenceProfile.data.displayName}</div>
                <div className="mt-0.5 truncate text-mutedForeground">{presenceProfile.data.email}</div>
                {(presenceProfile.data.jobTitle || presenceProfile.data.department) && <div className="mt-2 text-foreground">{[presenceProfile.data.jobTitle, presenceProfile.data.department].filter(Boolean).join(" · ")}</div>}
                {presenceProfile.data.bio && <div className="mt-2 line-clamp-3 text-mutedForeground">{presenceProfile.data.bio}</div>}
              </div>
            )}
          </div>,
          document.body,
        )}
        {view === "settings" && organizationId && workspaceId ? (
          <Suspense fallback={<PanelLoading />}>
            <WorkspaceSettingsDialog
              variant="page"
              organizationId={organizationId}
              workspaceId={workspaceId}
              documentId={selectedDocumentId}
              onClose={() => setView("documents")}
            />
          </Suspense>
        ) : view === "admin" ? (
          organizationAccess.data?.canManage && organizationId ? (
            <Suspense fallback={<PanelLoading />}>
              <AdminPanel
                variant="page"
                organizationId={organizationId}
                currentUserId={profile.data.id}
                onClose={() => setView("documents")}
              />
            </Suspense>
          ) : (
            <div className="p-8 text-sm text-mutedForeground">{t("fileAccessDeniedDescription")}</div>
          )
        ) : view === "work" && workspaceId ? (
          <Suspense fallback={<PanelLoading />}><WorkManagementPage workspaceId={workspaceId} contextDocumentId={selectedDocumentId} contextRowId={selectedRowId} /></Suspense>
        ) : view === "documents" && selectedDocumentId ? (
          <div
            data-testid="document-split-container"
            data-responsive-stacked={responsiveLayout.stackSplit}
            className={`min-h-0 flex-1 overflow-hidden ${secondaryDocumentId ? `flex bg-background p-1.5 ${effectiveSplitDirection === "horizontal" ? "flex-row" : "flex-col"}` : "flex"}`}
          >
            <div className="flex min-h-0 min-w-0" style={secondaryDocumentId ? { flex: `0 0 ${splitRatio * 100}%` } : { flex: "1 1 auto" }}>
              <DocumentPane
              tab={tabs.find((tab) => tab.id === activeDocumentId) ?? null}
              displayName={profile.data.displayName}
              focused={selectedDocumentId === activeDocumentId}
              split={Boolean(secondaryDocumentId)}
              position="primary"
              onFocus={() => {
                if (!activeDocumentId || selectedDocumentId === activeDocumentId) return;
                focusDocumentPane(activeDocumentId);
                setSelectedDocumentId(activeDocumentId);
                goToDocument(activeDocumentId, true);
              }}
              />
            </div>
            {secondaryDocumentId && (
              <>
                <SplitResizeHandle direction={effectiveSplitDirection} ratio={splitRatio} onChange={setSplitRatio} />
                <div className="flex min-h-0 min-w-0 flex-1">
                  <DocumentPane
                    tab={tabs.find((tab) => tab.id === secondaryDocumentId) ?? null}
                    displayName={profile.data.displayName}
                    focused={selectedDocumentId === secondaryDocumentId}
                    split
                    position="secondary"
                    onFocus={() => {
                      if (selectedDocumentId === secondaryDocumentId) return;
                      focusDocumentPane(secondaryDocumentId);
                      setSelectedDocumentId(secondaryDocumentId);
                      goToDocument(secondaryDocumentId, true);
                    }}
                  />
                </div>
              </>
            )}
          </div>
        ) : view === "documents" ? (
          <div data-testid="workspace-empty-state" className="flex min-h-0 flex-1 items-center justify-center p-8">
              <div className="w-full max-w-3xl rounded-2xl border border-border bg-surfaceElevated p-6 shadow-sm">
              <RoleWorkspaceHeader
                focus={workspaceFocus}
                onChange={setWorkspaceFocus}
                actionDisabled={workspaceFocus !== "tester" && recentDocuments.length === 0}
                onAction={() => {
                  if (workspaceFocus === "tester") {
                    setView("work");
                    return;
                  }
                  const recent = recentDocuments[0];
                  if (recent) openDocument(recent);
                }}
              />
              {(favoriteDocuments.length > 0 || recentDocuments.length > 0) && (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {favoriteDocuments.length > 0 && <WorkspaceDocumentList title={t("favorites")} icon="favorite" documents={favoriteDocuments.slice(0, 5)} onOpen={openDocument} />}
                  {recentDocuments.length > 0 && <WorkspaceDocumentList title={t("recentDocuments")} icon="recent" documents={recentDocuments.filter((document) => !favoriteDocuments.some((favorite) => favorite.id === document.id)).slice(0, 5)} onOpen={openDocument} />}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-8 text-sm text-mutedForeground">{t("trash")}</div>
        )}
      </main>
      {view === "documents" && selectedDocumentId && detailPanelOpen && (
        <>
          {!responsiveLayout.overlayDetails && <ResizeHandle side="right" ariaLabel={t("resizeDetailPanel")} value={detailWidth} min={280} max={640} onResize={(dx) => setDetailWidth(detailWidth + dx)} />}
          <aside
            data-testid="detail-panel"
            data-overlay={responsiveLayout.overlayDetails}
            aria-label={t("details")}
            className={`flex shrink-0 flex-col overflow-hidden bg-surface ${responsiveLayout.overlayDetails ? "absolute inset-y-2 right-2 z-40 rounded-lg border border-border shadow-2xl" : "border-l border-border"}`}
            style={{ width: responsiveLayout.overlayDetails ? `min(${detailWidth}px, calc(100% - 5rem))` : detailWidth }}
          >
            <Suspense fallback={<PanelLoading />}>
              {linkedRowId ? (
                <RowDetailPanel rowId={linkedRowId} documentId={selectedDocumentId} variant="linked" />
              ) : detailRowId && selectedRowId ? (
                <RowDetailPanel rowId={selectedRowId} documentId={selectedDocumentId} variant="primary" />
              ) : <DocumentOverviewPanel documentId={selectedDocumentId} onClose={() => setDetailPanelOpen(false)} />}
            </Suspense>
          </aside>
        </>
      )}
      </div>
    </div>
  );
}

function WorkspaceDocumentList({ title, icon, documents, onOpen }: { title: string; icon: "favorite" | "recent"; documents: DocumentTab[]; onOpen: (document: DocumentTab) => void }) {
  if (documents.length === 0) return null;
  return <section>
    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-mutedForeground">{title}</div>
    <div className="space-y-1">
      {documents.map((document) => <button key={document.id} type="button" data-testid={`workspace-document-${document.id}`} className="flex w-full items-center gap-2 rounded-lg border border-transparent px-2.5 py-2 text-left text-sm hover:border-border hover:bg-muted" onClick={() => onOpen(document)}>
        {icon === "favorite" ? <Star size={14} className="fill-warning text-warning" /> : <Clock3 size={14} className="text-mutedForeground" />}
        <span className="min-w-0 flex-1 truncate">{document.title}</span>
      </button>)}
    </div>
  </section>;
}

function RoleWorkspaceHeader({ focus, onChange, onAction, actionDisabled }: { focus: WorkspaceFocus; onChange: (focus: WorkspaceFocus) => void; onAction: () => void; actionDisabled: boolean }) {
  const { t } = useTranslation();
  const options: Array<{ value: WorkspaceFocus; icon: React.ReactNode }> = [
    { value: "author", icon: <PenLine size={15} /> },
    { value: "tester", icon: <FlaskConical size={15} /> },
    { value: "reviewer", icon: <ClipboardCheck size={15} /> },
  ];
  return <section aria-labelledby="workspace-focus-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div id="workspace-focus-title" className="text-base font-semibold text-foreground">{t(`workspaceFocus.${focus}.title`)}</div><p className="mt-1 max-w-2xl text-sm leading-6 text-mutedForeground">{t(`workspaceFocus.${focus}.description`)}</p><button type="button" data-testid="workspace-focus-action" disabled={actionDisabled} className="mt-3 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primaryForeground disabled:opacity-40" onClick={onAction}>{t(`workspaceFocus.${focus}.action`)}</button></div>
      <div className="flex rounded-xl border border-border bg-editorBackground p-1" role="tablist" aria-label={t("workspaceFocus.label")}>
        {options.map((option) => <button key={option.value} type="button" role="tab" data-testid={`workspace-focus-${option.value}`} aria-selected={focus === option.value} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium ${focus === option.value ? "bg-surface text-primary shadow-sm" : "text-mutedForeground hover:text-foreground"}`} onClick={() => onChange(option.value)}>{option.icon}{t(`workspaceFocus.${option.value}.label`)}</button>)}
      </div>
    </div>
    <div className="mt-4 grid gap-2 sm:grid-cols-3">
      {["primary", "secondary", "tertiary"].map((key) => <div key={key} className="rounded-xl border border-border bg-editorBackground p-3"><div className="text-sm font-medium">{t(`workspaceFocus.${focus}.${key}`)}</div></div>)}
    </div>
  </section>;
}

function DocumentPane({ tab, displayName, focused, split, position, onFocus }: { tab: DocumentTab | null; displayName: string; focused: boolean; split: boolean; position: "primary" | "secondary"; onFocus: () => void }) {
  const { t } = useTranslation();
  const document = useQuery({
    queryKey: ["document", tab?.id],
    queryFn: () => api<DocumentSummary>(`/documents/${tab?.id}`),
    enabled: Boolean(tab),
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 403) && failureCount < 1,
  });
  if (!tab || document.isLoading) return <PanelLoading />;
  if (document.error instanceof ApiError && document.error.status === 403) return <section data-testid={`document-pane-${position}`} className="flex min-w-0 flex-1 items-center justify-center rounded-lg bg-surface p-8"><div className="max-w-md text-center"><LockAccessIcon /><h2 className="mt-4 font-semibold">{t("fileAccessDenied")}</h2><p className="mt-2 text-sm text-mutedForeground">{t("fileAccessDeniedDescription")}</p></div></section>;
  const readOnly = !document.data?.access?.canWrite;
  const canManageAccess = Boolean(document.data?.access?.canManage);
  return (
    <section data-testid={`document-pane-${position}`} data-document-id={tab.id} data-focused={focused ? "true" : "false"} aria-label={`${tab.title}${split ? ` · ${focused ? t("focusedPane") : t("secondaryPane")}` : ""}`} className={`flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg bg-surface transition-shadow ${focused && split ? "ring-2 ring-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.18)]" : split ? "ring-1 ring-border" : ""}`} onMouseDownCapture={onFocus}>
      {(split || readOnly) && <DocumentAccessBanner title={tab.title} split={split} focused={focused} readOnly={readOnly} canManageAccess={canManageAccess} />}
      <Suspense fallback={<PanelLoading />}>
        {tab.documentType === "general_document" ? <RichTextEditor documentId={tab.id} displayName={displayName} readOnly={readOnly} /> : <DocumentGrid documentId={tab.id} documentType={tab.documentType === "test" ? "test" : "requirement"} advancedTargetId={`docsys-toolbar-${tab.id}`} showAdvancedControls readOnly={readOnly} />}
      </Suspense>
    </section>
  );
}

export function DocumentAccessBanner({ title, split, focused, readOnly, canManageAccess }: { title: string; split: boolean; focused: boolean; readOnly: boolean; canManageAccess: boolean }) {
  const { t } = useTranslation();
  return <div role="status" className={`flex min-h-9 shrink-0 items-center justify-between gap-3 border-b px-3 py-1.5 text-xs ${focused && split ? "border-primary bg-primary/10 text-foreground" : "border-border bg-editorBackground text-mutedForeground"}`}><span className="min-w-0 truncate font-semibold">{split ? title : t("readOnlyDocumentNotice")}</span><div className="flex shrink-0 items-center gap-2">{readOnly && <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">{t("readOnly")}</span>}{canManageAccess && split && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{t("accessManager")}</span>}{split && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${focused ? "bg-primary text-primaryForeground" : "bg-muted"}`}>{focused ? t("focusedPane") : t("secondaryPane")}</span>}</div></div>;
}

function LockAccessIcon() {
  return <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive"><FileKey2 size={22} /></span>;
}

export function SplitResizeHandle({ direction, ratio, onChange }: { direction: "horizontal" | "vertical"; ratio: number; onChange: (ratio: number) => void }) {
  const { t } = useTranslation();
  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const container = event.currentTarget.parentElement;
    if (!container) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      onChange(direction === "horizontal" ? (moveEvent.clientX - rect.left) / rect.width : (moveEvent.clientY - rect.top) / rect.height);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };
  const adjust = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      onChange(event.key === "Home" ? 0.2 : 0.8);
      return;
    }
    const backward = direction === "horizontal" ? event.key === "ArrowLeft" : event.key === "ArrowUp";
    const forward = direction === "horizontal" ? event.key === "ArrowRight" : event.key === "ArrowDown";
    if (!backward && !forward) return;
    event.preventDefault();
    onChange(ratio + (backward ? -0.05 : 0.05));
  };
  return (
    <div
      role="separator"
      aria-label={t("resizeSplitView")}
      aria-orientation={direction === "horizontal" ? "vertical" : "horizontal"}
      aria-valuemin={20}
      aria-valuemax={80}
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuetext={`${Math.round(ratio * 100)}%`}
      tabIndex={0}
      data-testid="split-resize-handle"
      className={`group relative shrink-0 touch-none rounded-full outline-none ${direction === "horizontal" ? "mx-1 w-1.5 cursor-col-resize" : "my-1 h-1.5 cursor-row-resize"}`}
      onPointerDown={startResize}
      onKeyDown={adjust}
    >
      <span className={`absolute rounded-full bg-border transition-colors group-hover:bg-primary group-focus:bg-primary ${direction === "horizontal" ? "inset-y-0 left-1/2 w-px -translate-x-1/2" : "inset-x-0 top-1/2 h-px -translate-y-1/2"}`} />
    </div>
  );
}

function PanelLoading() {
  const { t } = useTranslation();
  return <div className="p-6 text-sm text-mutedForeground">{t("loading")}</div>;
}

function ShellLoading({ label }: { label: string }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background" role="status" aria-label={label}>
      <div className="h-12 border-b border-border bg-surface" />
      <div className="flex min-h-0 flex-1">
        <div className="w-72 animate-pulse border-r border-border bg-sidebarBackground p-3">
          <div className="mb-5 h-10 rounded-lg bg-muted" />
          <div className="mb-2 h-8 rounded-md bg-muted" />
          <div className="mb-5 h-8 rounded-md bg-muted" />
          <div className="space-y-2 border-t border-border pt-4">
            <div className="h-6 rounded bg-muted" />
            <div className="h-6 rounded bg-muted" />
            <div className="h-6 rounded bg-muted" />
          </div>
        </div>
        <div className="flex-1 animate-pulse bg-surface p-4">
          <div className="mb-4 h-10 rounded-lg bg-muted" />
          <div className="space-y-2">
            <div className="h-10 rounded-md bg-muted" />
            <div className="h-10 rounded-md bg-muted" />
            <div className="h-10 rounded-md bg-muted" />
          </div>
        </div>
      </div>
      <span className="sr-only">{label}</span>
    </div>
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
