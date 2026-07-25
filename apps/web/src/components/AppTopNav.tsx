import { ChevronDown, HelpCircle, Plus, Search, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useThemeStore } from "../stores/theme";
import { useToastStore } from "../stores/toasts";
import { Menu, MenuEntry } from "./Menu";
import { NotificationCenter } from "./NotificationCenter";
import { Avatar } from "./ui";

export type TopNavArea = "documents" | "work" | "tests" | "trash" | "settings" | "admin" | "myWork" | "projects";

export interface TopNavProject {
  id: string;
  code: string;
  name: string;
}

export interface TopNavDocument {
  id: string;
  title: string;
}

interface AppTopNavProps {
  area: TopNavArea;
  canManage: boolean;
  profile: { displayName: string; email: string; isAdmin: boolean };
  projects: TopNavProject[];
  activeProjectId: string | null;
  recentDocuments: TopNavDocument[];
  favoriteDocuments: TopNavDocument[];
  savedViewNames: Array<{ id: string; name: string }>;
  searchQuery: string;
  searchOpen: boolean;
  searchShortcut?: string;
  commandPaletteShortcut?: string;
  onSearchQueryChange: (query: string) => void;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
  onNavigate: (path: string) => void;
  onSelectProject: (projectId: string) => void;
  onOpenDocument: (documentId: string) => void;
  onApplySavedView: (viewId: string) => void;
  onOpenCommandPalette: () => void;
  onOpenOnboarding: () => void;
  onOpenFeedback: () => void;
  onOpenPilotChecklist: () => void;
  onOpenProfile: () => void;
  onLogout: () => void;
  onCreateDocument: (documentType: "requirement" | "test") => void;
  onCreateWorkItem: () => void;
  onCreateProject: () => void;
  onCreateTestPlan: () => void;
}

function NavMenu({ label, testId, active, entries }: { label: string; testId: string; active: boolean; entries: MenuEntry[] }) {
  return (
    <Menu
      testId={testId}
      label={label}
      entries={entries}
      triggerClassName={`inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2.5 text-sm outline-none transition-colors ${
        active ? "bg-primary/10 font-medium text-primary" : "text-foreground/80 hover:bg-muted hover:text-foreground"
      }`}
      icon={<span className="inline-flex items-center gap-1">{label}<ChevronDown size={13} className="opacity-60" /></span>}
    />
  );
}

export function AppTopNav({
  area,
  canManage,
  profile,
  projects,
  activeProjectId,
  recentDocuments,
  favoriteDocuments,
  savedViewNames,
  searchQuery,
  searchOpen,
  searchShortcut = "",
  commandPaletteShortcut = "",
  onSearchQueryChange,
  onOpenSearch,
  onCloseSearch,
  onNavigate,
  onSelectProject,
  onOpenDocument,
  onApplySavedView,
  onOpenCommandPalette,
  onOpenOnboarding,
  onOpenFeedback,
  onOpenPilotChecklist,
  onOpenProfile,
  onLogout,
  onCreateDocument,
  onCreateWorkItem,
  onCreateProject,
  onCreateTestPlan,
}: AppTopNavProps) {
  const { t } = useTranslation();
  const pushToast = useToastStore((s) => s.push);
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);
  const isDark =
    themeMode === "dark" ||
    (themeMode === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  const myWorkEntries: MenuEntry[] = [
    { key: "my-work-assigned", label: t("workHub.assignedToMe"), onSelect: () => onNavigate("/work/list?assignee=me") },
    { key: "my-work-bugs", label: t("workHub.myOpenBugs"), onSelect: () => onNavigate("/work/list?assignee=me&type=bug") },
    { key: "my-work-inbox", label: t("myWork"), onSelect: () => onNavigate("/work/summary") },
    { key: "my-work-sep", label: "", separator: true },
    ...(recentDocuments.length > 0
      ? [
          { key: "my-work-recent-label", label: t("recentlyViewed"), disabled: true },
          ...recentDocuments.slice(0, 5).map((document) => ({
            key: `my-work-recent-${document.id}`,
            label: document.title,
            onSelect: () => onOpenDocument(document.id),
          })),
        ]
      : []),
    ...(favoriteDocuments.length > 0
      ? [
          { key: "my-work-fav-sep", label: "", separator: true },
          { key: "my-work-fav-label", label: t("favorites"), disabled: true },
          ...favoriteDocuments.slice(0, 5).map((document) => ({
            key: `my-work-fav-${document.id}`,
            label: document.title,
            onSelect: () => onOpenDocument(document.id),
          })),
        ]
      : []),
  ];

  const projectEntries: MenuEntry[] = [
    ...projects.slice(0, 8).map((project) => ({
      key: `project-${project.id}`,
      label: `${project.code} · ${project.name}`,
      checked: project.id === activeProjectId,
      onSelect: () => onSelectProject(project.id),
    })),
    ...(projects.length > 0 ? [{ key: "project-sep", label: "", separator: true }] : []),
    { key: "project-all", label: t("allProjects"), onSelect: () => onNavigate("/work/summary") },
    { key: "project-new", label: t("workHub.newProject"), onSelect: onCreateProject },
  ];

  const documentEntries: MenuEntry[] = [
    { key: "documents-all", label: t("documents"), onSelect: () => onNavigate("/docs") },
    ...(recentDocuments.length > 0
      ? [
          { key: "documents-recent-sep", label: "", separator: true },
          { key: "documents-recent-label", label: t("recentDocuments"), disabled: true },
          ...recentDocuments.slice(0, 6).map((document) => ({
            key: `documents-recent-${document.id}`,
            label: document.title,
            onSelect: () => onOpenDocument(document.id),
          })),
        ]
      : []),
    { key: "documents-create-sep", label: "", separator: true },
    { key: "documents-new-requirement", label: t("newRequirementDocument"), onSelect: () => onCreateDocument("requirement") },
    { key: "documents-new-test", label: t("newTestDocument"), onSelect: () => onCreateDocument("test") },
  ];

  const dashboardEntries: MenuEntry[] = [
    { key: "dashboard-work", label: t("workHub.dashboard"), onSelect: () => onNavigate("/work/summary") },
    { key: "dashboard-board", label: t("workHub.board"), onSelect: () => onNavigate("/work/board") },
    { key: "dashboard-list", label: t("workHub.list"), onSelect: () => onNavigate("/work/list") },
  ];

  const testEntries: MenuEntry[] = [
    { key: "tests-repository", label: t("testRepository"), onSelect: () => onNavigate("/tests/repository") },
    { key: "plans-all", label: t("workHub.testPlans"), onSelect: () => onNavigate("/work/plans") },
    { key: "tests-executions", label: t("testExecutions"), onSelect: () => onNavigate("/tests/executions") },
    { key: "tests-create-sep", label: "", separator: true },
    { key: "plans-new", label: t("workHub.newPlan"), onSelect: onCreateTestPlan },
    { key: "tests-sep", label: "", separator: true },
    { key: "tests-reports-label", label: t("testReports"), disabled: true },
    { key: "tests-coverage", label: t("testCoverageReport"), onSelect: () => onNavigate("/tests/coverage") },
    { key: "tests-traceability", label: t("traceabilityMatrix"), onSelect: () => onNavigate("/tests/traceability") },
    { key: "tests-execution-report", label: t("testExecutionReport"), onSelect: () => onNavigate("/tests/report") },
  ];

  const filterEntries: MenuEntry[] = [
    { key: "filters-open-bugs", label: t("openDefectsList"), onSelect: () => onNavigate("/work/list?type=bug") },
    { key: "filters-unassigned", label: t("workHub.unassignedOpen"), onSelect: () => onNavigate("/work/list?assignee=none") },
    ...(savedViewNames.length > 0
      ? [
          { key: "filters-saved-sep", label: "", separator: true },
          { key: "filters-saved-label", label: t("workHub.savedViews"), disabled: true },
          ...savedViewNames.map((view) => ({
            key: `filters-saved-${view.id}`,
            label: view.name,
            onSelect: () => onApplySavedView(view.id),
          })),
        ]
      : []),
  ];

  return (
    <header data-testid="app-top-nav" className="app-topbar relative z-50 flex min-h-14 shrink-0 items-center gap-1 border-b border-border px-3">
      <button
        type="button"
        data-testid="nav-home"
        className="mr-1 flex shrink-0 items-center gap-2 rounded-md px-1 py-1 outline-none hover:bg-muted"
        onClick={() => onNavigate("/docs")}
      >
        <img src="/docsys-icon.png" alt="" className="h-7 w-7 rounded-md" />
        <span className="app-wordmark text-[15px] font-semibold tracking-tight">{t("appName")}</span>
      </button>
      <nav aria-label={t("primaryNavigation")} className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <NavMenu label={t("navMyWork")} testId="nav-my-work" active={area === "myWork"} entries={myWorkEntries} />
        <NavMenu label={t("navProjects")} testId="nav-projects" active={area === "projects"} entries={projectEntries} />
        <NavMenu label={t("navDocuments")} testId="nav-documents" active={area === "documents" || area === "trash"} entries={documentEntries} />
        <NavMenu label={t("navDashboards")} testId="nav-dashboards" active={area === "work"} entries={dashboardEntries} />
        <NavMenu label={t("navTestManagement")} testId="nav-tests" active={area === "tests"} entries={testEntries} />
        <NavMenu label={t("navFilters")} testId="nav-filters" active={false} entries={filterEntries} />
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <Menu
          testId="global-create"
          label={t("create")}
          triggerClassName="inline-flex h-8 shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent bg-primary px-3 text-sm font-medium text-primaryForeground outline-none transition-colors hover:bg-primary/90"
          icon={<span className="inline-flex items-center gap-1.5"><Plus size={15} /><span className="hidden sm:inline">{t("create")}</span></span>}
          entries={[
            { key: "create-work-item", label: t("workHub.newItem"), onSelect: onCreateWorkItem },
            { key: "create-plan", label: t("workHub.newPlan"), onSelect: onCreateTestPlan },
            { key: "create-sep", label: "", separator: true },
            { key: "create-requirement-document", label: t("newRequirementDocument"), onSelect: () => onCreateDocument("requirement") },
            { key: "create-test-document", label: t("newTestDocument"), onSelect: () => onCreateDocument("test") },
            { key: "create-project-sep", label: "", separator: true },
            { key: "create-project", label: t("workHub.newProject"), onSelect: onCreateProject },
          ]}
        />
        <div
          id="docsys-global-search"
          data-testid="global-search-trigger"
          title={t("globalSearchHelp")}
          className={`global-search-trigger flex w-[clamp(7rem,13vw,13rem)] min-w-0 shrink-0 items-center gap-2 border border-border bg-editorBackground px-3 py-1.5 text-xs text-mutedForeground transition-colors focus-within:border-primary/55 focus-within:ring-2 focus-within:ring-primary/15 hover:border-primary/40 ${searchOpen ? "rounded-t-md rounded-b-none border-b-transparent bg-surfaceElevated" : "rounded-md"}`}
        >
          <Search size={14} className="shrink-0" />
          <input
            id="docsys-global-search-input"
            data-testid="global-search-input"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-mutedForeground"
            value={searchQuery}
            placeholder={t("searchPlaceholder")}
            onFocus={onOpenSearch}
            onChange={(event) => {
              onSearchQueryChange(event.target.value);
              onOpenSearch();
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                onCloseSearch();
                event.currentTarget.blur();
              }
            }}
          />
          {!searchQuery && <span className="hidden shrink-0 rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] xl:block">{searchShortcut}</span>}
        </div>
        <NotificationCenter />
        <Menu
          testId="appbar-help"
          label={t("menuHelp")}
          icon={<HelpCircle size={17} />}
          entries={[
            { key: "onboarding", label: t("openGettingStarted"), onSelect: onOpenOnboarding },
            { key: "pilot-checklist", label: t("pilotChecklist"), onSelect: onOpenPilotChecklist },
            { key: "pilot-feedback", label: t("pilotFeedback"), onSelect: onOpenFeedback },
            { key: "command-palette", label: t("commandPalette"), shortcut: commandPaletteShortcut, onSelect: onOpenCommandPalette },
            { key: "help-sep", label: "", separator: true },
            { key: "about", label: t("about"), onSelect: () => pushToast("info", `${t("appName")} — ${t("aboutText")}`) },
          ]}
        />
        <Menu
          testId="nav-settings-menu"
          label={t("settings")}
          icon={<Settings size={17} />}
          entries={[
            { key: "settings-workspace", label: t("workspaceSettings"), onSelect: () => onNavigate("/settings") },
            ...(canManage ? [{ key: "settings-admin", label: t("adminPanel"), onSelect: () => onNavigate("/admin") }] : []),
            { key: "settings-sep", label: "", separator: true },
            { key: "settings-trash", label: t("trash"), onSelect: () => onNavigate("/trash") },
            { key: "settings-theme-sep", label: "", separator: true },
            { key: "settings-theme", label: isDark ? t("themeLight") : t("themeDark"), onSelect: () => setThemeMode(isDark ? "light" : "dark") },
          ]}
        />
        <Menu
          testId="open-profile"
          label={profile.displayName}
          triggerClassName="flex h-8 w-8 shrink-0 items-center justify-center rounded-full outline-none transition-shadow hover:ring-2 hover:ring-primary/35"
          icon={<Avatar name={profile.displayName} size="md" />}
          entries={[
            { key: "account-email", label: profile.email, disabled: true },
            { key: "account-sep", label: "", separator: true },
            { key: "profile", label: t("profile"), onSelect: onOpenProfile },
            { key: "settings", label: t("workspaceSettings"), onSelect: () => onNavigate("/settings") },
            { key: "logout-sep", label: "", separator: true },
            { key: "logout", label: t("logout"), danger: true, onSelect: onLogout },
          ]}
        />
      </div>
    </header>
  );
}
