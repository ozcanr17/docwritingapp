import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, FileText, LogOut, Settings, Star, Trash2, Users } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { MenuBar } from "../components/MenuBar";
import { DocumentTabsBar } from "../components/DocumentTabsBar";
import { ResizeHandle } from "../components/ResizeHandle";
import { TrashPanel } from "../components/TrashPanel";
import { TreePanel } from "../components/TreePanel";
import { useDocumentEvents } from "../hooks/useDocumentEvents";
import { api, DocumentSummary, DocumentType, setSessionToken, UserProfile } from "../lib/api";
import { openDocumentWindow } from "../lib/documentWindows";
import { DocumentTab, useDocumentTabsStore } from "../stores/documentTabs";
import { formatShortcut, isTextEditingTarget, matchesShortcut, SHORTCUT_COMMANDS, ShortcutCommandId } from "../lib/keyboardShortcuts";
import { useKeyboardShortcutsStore } from "../stores/keyboardShortcuts";
import { useEditHistoryStore } from "../stores/editHistory";
import { useLayoutStore } from "../stores/layout";
import { useSelectionStore } from "../stores/selection";
import { useOnboardingStore } from "../stores/onboarding";

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
  const [report, setReport] = useState<"readiness" | "baselines" | "coverage" | "matrix" | "reviews" | "runs" | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileTarget, setProfileTarget] = useState<{ userId: string; allowEdit: boolean } | null>(null);
  const [historyMode, setHistoryMode] = useState<"row" | "document" | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [presenceOpen, setPresenceOpen] = useState(false);
  const [presenceProfileUserId, setPresenceProfileUserId] = useState<string | null>(null);
  const presenceCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presenceTriggerRef = useRef<HTMLDivElement>(null);
  const closeReport = useCallback(() => setReport(null), []);
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
  const detailWidth = useLayoutStore((s) => s.detailWidth);
  const setTreeWidth = useLayoutStore((s) => s.setTreeWidth);
  const setDetailWidth = useLayoutStore((s) => s.setDetailWidth);
  const splitDirection = useLayoutStore((s) => s.splitDirection);
  const splitRatio = useLayoutStore((s) => s.splitRatio);
  const setSplitDirection = useLayoutStore((s) => s.setSplitDirection);
  const setSplitRatio = useLayoutStore((s) => s.setSplitRatio);

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
    setSelectedDocumentId(useDocumentTabsStore.getState().focusedId);
  }, [clearEditHistory, closeDocumentTab, setSelectedDocumentId]);

  useEffect(() => {
    if (focusedDocumentId !== selectedDocumentId) setSelectedDocumentId(focusedDocumentId);
  }, [focusedDocumentId, selectedDocumentId, setSelectedDocumentId]);

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
      setSettingsOpen(true);
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
        onOpenHistory={setHistoryMode}
        onOpenSearch={() => setSearchOpen(true)}
        onCloseSearch={() => setSearchOpen(false)}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        searchOpen={searchOpen}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        commandPaletteShortcut={formatShortcut(shortcutBindings.commandPalette)}
        searchShortcut={formatShortcut(shortcutBindings.globalSearch)}
        onOpenOnboarding={() => setOnboardingOpen(true)}
      />
      <Suspense fallback={null}>
        {onboardingOpen && <OnboardingDialog onComplete={() => { completeOnboarding(); setOnboardingOpen(false); }} />}
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
        {settingsOpen && organizationId && workspaceId && <WorkspaceSettingsDialog organizationId={organizationId} workspaceId={workspaceId} documentId={selectedDocumentId} onClose={() => setSettingsOpen(false)} />}
        {profileTarget && <ProfileDialog userId={profileTarget.userId} currentUserId={profile.data.id} allowEdit={profileTarget.allowEdit} onClose={() => setProfileTarget(null)} />}
        {historyMode && selectedDocumentId && <HistoryDialog documentId={selectedDocumentId} rowId={useSelectionStore.getState().selectedRowId} mode={historyMode} onClose={() => setHistoryMode(null)} onOpenRow={(rowId) => { setHistoryMode(null); window.setTimeout(() => useSelectionStore.getState().openDetail(rowId), 0); }} />}
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
        </nav>
        <section data-testid="tree-section" aria-label={t("documentTree")} className="min-h-0 flex-1 overflow-hidden border-t border-white/10 bg-surface text-foreground">
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
        <div className="border-t border-white/10 p-2 text-sm">
          <SidebarItem icon={<Trash2 size={15} />} label={t("trash")} active={view === "trash"} onClick={() => setView("trash")} testId="nav-trash" />
          <SidebarItem icon={<Settings size={15} />} label={t("settings")} onClick={() => setSettingsOpen(true)} testId="nav-settings" />
        </div>
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
      <main id="main-content" tabIndex={-1} className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
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
          splitDirection={splitDirection}
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
                className={`absolute inset-0 flex min-w-0 items-center transition-opacity duration-100 ${selectedDocumentId === id ? "z-10 opacity-100" : "pointer-events-none invisible opacity-0"}`}
              />
            ))}
          </div>
          {selectedDocumentId && view === "documents" && (
            <div className="flex shrink-0 items-center gap-2 text-mutedForeground">
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
              <span className="flex gap-1">
                {presence.slice(0, 8).map((p) => (
                  <span
                    key={p.userId}
                    title={p.displayName}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-primary/30 bg-surface p-0.5 shadow-sm ring-1 ring-primary/15"
                  >
                    <span className="flex h-full w-full items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primaryForeground">{initials(p.displayName)}</span>
                  </span>
                ))}
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
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-surface p-0.5"><span className="flex h-full w-full items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primaryForeground">{initials(person.displayName)}</span></span>
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
        {view === "documents" && selectedDocumentId ? (
          <div
            data-testid="document-split-container"
            className={`min-h-0 flex-1 overflow-hidden ${secondaryDocumentId ? `flex bg-background p-1.5 ${splitDirection === "horizontal" ? "flex-row" : "flex-col"}` : "flex"}`}
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
              }}
              />
            </div>
            {secondaryDocumentId && (
              <>
                <SplitResizeHandle direction={splitDirection} ratio={splitRatio} onChange={setSplitRatio} />
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
                    }}
                  />
                </div>
              </>
            )}
          </div>
        ) : view === "documents" ? (
          <div data-testid="workspace-empty-state" className="flex min-h-0 flex-1 items-center justify-center p-8">
            <div className="w-full max-w-xl rounded-2xl border border-border bg-surfaceElevated p-6 shadow-sm">
              <div className="text-base font-semibold text-foreground">{t("workspaceStartTitle")}</div>
              <p className="mt-1 text-sm leading-6 text-mutedForeground">{t("workspaceStartDescription")}</p>
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

function DocumentPane({ tab, displayName, focused, split, position, onFocus }: { tab: DocumentTab | null; displayName: string; focused: boolean; split: boolean; position: "primary" | "secondary"; onFocus: () => void }) {
  const { t } = useTranslation();
  if (!tab) return <PanelLoading />;
  return (
    <section data-testid={`document-pane-${position}`} data-document-id={tab.id} data-focused={focused ? "true" : "false"} aria-label={tab.title} className={`flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg bg-surface transition-shadow ${focused && split ? "ring-1 ring-primary/50" : split ? "ring-1 ring-border" : ""}`} onMouseDownCapture={onFocus}>
      {split && <div className={`flex h-8 shrink-0 items-center justify-between border-b px-3 text-xs ${focused ? "border-primary/30 bg-primary/5" : "border-border bg-editorBackground"}`}><span className="truncate font-medium">{tab.title}</span><span className="text-[10px] uppercase tracking-wide text-mutedForeground">{focused ? t("focusedPane") : t("secondaryPane")}</span></div>}
      <Suspense fallback={<PanelLoading />}>
        {tab.documentType === "general_document" ? <RichTextEditor documentId={tab.id} displayName={displayName} /> : <DocumentGrid documentId={tab.id} documentType={tab.documentType === "test" ? "test" : "requirement"} advancedTargetId={`docsys-toolbar-${tab.id}`} showAdvancedControls />}
      </Suspense>
    </section>
  );
}

function SplitResizeHandle({ direction, ratio, onChange }: { direction: "horizontal" | "vertical"; ratio: number; onChange: (ratio: number) => void }) {
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
      aria-valuenow={Math.round(ratio * 100)}
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
