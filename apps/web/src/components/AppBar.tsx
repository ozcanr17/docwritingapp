import { useMutation } from "@tanstack/react-query";
import { HelpCircle, Moon, Plus, Search, Sun, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, DocumentSummary, DocumentType } from "../lib/api";
import { useThemeStore } from "../stores/theme";
import { useToastStore } from "../stores/toasts";
import { Menu } from "./Menu";
import { NotificationCenter } from "./NotificationCenter";
import { ModalSurface } from "./TransientSurface";
import { Button } from "./ui";

interface AppBarProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  workspaceId: string | null;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  searchOpen: boolean;
  searchShortcut?: string;
  onOpenCommandPalette?: () => void;
  commandPaletteShortcut?: string;
  onOpenOnboarding?: () => void;
  onOpenFeedback?: () => void;
  onOpenPilotChecklist?: () => void;
  onDocumentCreated: (document: DocumentSummary) => void;
  onCreateWorkItem: () => void;
  actions?: React.ReactNode;
}

export function AppBar({
  title,
  subtitle,
  icon,
  workspaceId,
  onOpenSearch,
  onCloseSearch,
  searchQuery,
  onSearchQueryChange,
  searchOpen,
  searchShortcut = "",
  onOpenCommandPalette = () => undefined,
  commandPaletteShortcut = "",
  onOpenOnboarding = () => undefined,
  onOpenFeedback = () => undefined,
  onOpenPilotChecklist = () => undefined,
  onDocumentCreated,
  onCreateWorkItem,
  actions,
}: AppBarProps) {
  const { t } = useTranslation();
  const pushToast = useToastStore((s) => s.push);
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);
  const [createDocumentType, setCreateDocumentType] = useState<DocumentType | null>(null);
  const isDark =
    themeMode === "dark" ||
    (themeMode === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <>
      <header className="app-topbar relative z-50 flex min-h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        {icon && (
          <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surfaceSubtle text-mutedForeground">
            {icon}
          </span>
        )}
        <div className="min-w-0 shrink-0">
          <h1 className="truncate text-[15px] font-semibold leading-5 tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="truncate text-xs leading-4 text-mutedForeground">{subtitle}</p>}
        </div>
        <div
          id="docsys-global-search"
          data-testid="global-search-trigger"
          title={t("globalSearchHelp")}
          className={`global-search-trigger ml-auto flex w-[clamp(9rem,26vw,22rem)] min-w-0 items-center gap-2 border border-border bg-editorBackground px-3 py-1.5 text-xs text-mutedForeground transition-colors focus-within:border-primary/55 focus-within:ring-2 focus-within:ring-primary/15 hover:border-primary/40 ${searchOpen ? "rounded-t-md rounded-b-none border-b-transparent bg-surfaceElevated" : "rounded-md"}`}
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
          {!searchQuery && <span className="hidden shrink-0 rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] lg:block">{searchShortcut}</span>}
        </div>
        {actions}
        <div data-testid="menubar-trailing-actions" className="flex shrink-0 items-center gap-1.5">
          <Menu
            testId="global-create"
            label={t("create")}
            triggerClassName="inline-flex h-8 shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent bg-primary px-3 text-sm font-medium text-primaryForeground outline-none transition-colors hover:bg-primary/90"
            icon={<span className="inline-flex items-center gap-1.5"><Plus size={15} /><span className="hidden sm:inline">{t("create")}</span></span>}
            entries={[
              { key: "create-requirement-document", label: t("newRequirementDocument"), disabled: !workspaceId, onSelect: () => setCreateDocumentType("requirement") },
              { key: "create-test-document", label: t("newTestDocument"), disabled: !workspaceId, onSelect: () => setCreateDocumentType("test") },
              { key: "create-sep", label: "", separator: true },
              { key: "create-work-item", label: t("workHub.newItem"), onSelect: onCreateWorkItem },
            ]}
          />
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
          <NotificationCenter />
          <button
            type="button"
            data-testid="toggle-theme"
            aria-label={isDark ? t("themeLight") : t("themeDark")}
            title={isDark ? t("themeLight") : t("themeDark")}
            className="flex h-8 w-8 items-center justify-center rounded-md text-mutedForeground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => setThemeMode(isDark ? "light" : "dark")}
          >
            {isDark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </header>
      {createDocumentType && workspaceId && (
        <CreateDocumentDialog
          workspaceId={workspaceId}
          documentType={createDocumentType}
          onClose={() => setCreateDocumentType(null)}
          onCreated={(document) => {
            setCreateDocumentType(null);
            onDocumentCreated(document);
          }}
        />
      )}
    </>
  );
}

function CreateDocumentDialog({
  workspaceId,
  documentType,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  documentType: DocumentType;
  onClose: () => void;
  onCreated: (document: DocumentSummary) => void;
}) {
  const { t } = useTranslation();
  const pushToast = useToastStore((s) => s.push);
  const [title, setTitle] = useState("");
  const create = useMutation({
    mutationFn: () => api<DocumentSummary>(`/workspaces/${workspaceId}/documents`, {
      method: "POST",
      body: JSON.stringify({ title: title.trim(), documentType, folderId: null }),
    }),
    onSuccess: (document) => onCreated(document),
    onError: () => pushToast("error", t("genericError")),
  });
  const heading = documentType === "test" ? t("newTestDocument") : t("newRequirementDocument");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || create.isPending) return;
    create.mutate();
  };
  return (
    <ModalSurface onClose={onClose} labelledBy="create-document-title" testId="create-document-dialog" panelClassName="w-full max-w-md p-5">
      <form onSubmit={submit}>
        <div className="flex items-center justify-between">
          <h2 id="create-document-title" className="font-semibold">{heading}</h2>
          <button type="button" aria-label={t("close")} className="rounded-md p-1.5 hover:bg-muted" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <label className="mt-4 block text-sm">
          <span className="text-mutedForeground">{t("name")}</span>
          <input
            autoFocus
            data-testid="create-document-name"
            className="mt-1.5 w-full rounded-md border border-border bg-editorBackground px-3 py-2"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="subtle" onClick={onClose}>{t("cancel")}</Button>
          <Button variant="primary" type="submit" data-testid="create-document-submit" disabled={!title.trim() || create.isPending}>
            {t("create")}
          </Button>
        </div>
      </form>
    </ModalSurface>
  );
}
