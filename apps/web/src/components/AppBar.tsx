import { useMutation } from "@tanstack/react-query";
import { HelpCircle, Plus, Search, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, DocumentSummary, DocumentType } from "../lib/api";
import { useToastStore } from "../stores/toasts";
import { Menu } from "./Menu";
import { NotificationCenter } from "./NotificationCenter";
import { ModalSurface } from "./TransientSurface";
import { Avatar, Button } from "./ui";

export interface AppBarProfile {
  id: string;
  displayName: string;
  email: string;
}

interface AppBarProps {
  workspaceName?: string;
  workspaceId: string | null;
  profile: AppBarProfile;
  isAdmin?: boolean;
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
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  onDocumentCreated: (document: DocumentSummary) => void;
  onCreateWorkItem: () => void;
}

export function AppBar({
  workspaceName = "",
  workspaceId,
  profile,
  isAdmin = false,
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
  onOpenProfile,
  onOpenSettings,
  onLogout,
  onDocumentCreated,
  onCreateWorkItem,
}: AppBarProps) {
  const { t } = useTranslation();
  const pushToast = useToastStore((s) => s.push);
  const [createDocumentType, setCreateDocumentType] = useState<DocumentType | null>(null);

  return (
    <>
      <div className="app-topbar relative z-50 flex min-h-12 items-center px-2.5 py-1.5">
        <div data-testid="menubar-leading-actions" className="flex min-w-0 items-center gap-1">
          <span className="app-wordmark shrink-0 px-2 text-sm font-semibold">{t("appName")}</span>
          {workspaceName && (
            <div className="workspace-crumb hidden min-w-0 items-center gap-2 border-l border-border pl-3 md:flex">
              <span className="max-w-48 truncate text-sm font-medium text-foreground">{workspaceName}</span>
            </div>
          )}
        </div>
        <div
          id="docsys-global-search"
          data-testid="global-search-trigger"
          title={t("globalSearchHelp")}
          className={`global-search-trigger absolute left-1/2 flex w-[clamp(11rem,34vw,32rem)] min-w-0 -translate-x-1/2 items-center gap-2 border border-border bg-editorBackground/80 px-3 py-1.5 text-xs text-mutedForeground shadow-sm transition-[border-color,background-color,width] focus-within:border-primary/55 focus-within:ring-2 focus-within:ring-primary/15 hover:border-primary/40 hover:bg-muted ${searchOpen ? "rounded-t-lg rounded-b-none border-b-transparent bg-surfaceElevated" : "rounded-md"}`}
        >
          <Search size={14} className="shrink-0" />
          <input
            id="docsys-global-search-input"
            data-testid="global-search-input"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-mutedForeground"
            value={searchQuery}
            placeholder={t("globalSearchHelp")}
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
          {!searchQuery && <span className="shrink-0 rounded border border-border bg-surface px-1.5 py-0.5 text-[10px]">{searchShortcut}</span>}
        </div>
        <div data-testid="menubar-trailing-actions" className="ml-auto flex min-w-0 items-center justify-end gap-1.5">
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
          <Menu
            testId="open-profile"
            label={profile.displayName}
            triggerClassName="inline-flex h-8 w-8 items-center justify-center rounded-full outline-none transition-shadow hover:ring-2 hover:ring-primary/35"
            icon={<Avatar name={profile.displayName} size="md" />}
            entries={[
              { key: "account-name", label: profile.email, disabled: true },
              { key: "account-sep", label: "", separator: true },
              { key: "profile", label: `${t("profile")}${isAdmin ? ` · ${t("administratorBadge")}` : ""}`, onSelect: onOpenProfile },
              { key: "settings", label: t("settings"), onSelect: onOpenSettings },
              { key: "logout-sep", label: "", separator: true },
              { key: "logout", label: t("logout"), danger: true, onSelect: onLogout },
            ]}
          />
        </div>
      </div>
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
