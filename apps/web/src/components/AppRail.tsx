import { ClipboardCheck, FileText, PanelLeftClose, PanelLeftOpen, Settings, ShieldCheck, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface AppRailProps {
  view: "documents" | "work" | "trash" | "settings" | "admin";
  canManage: boolean;
  panelCollapsed: boolean;
  panelToggleDisabled: boolean;
  onNavigate: (view: "documents" | "work" | "trash") => void;
  onTogglePanel: () => void;
  onOpenAdmin: () => void;
  onOpenSettings: () => void;
}

function RailButton({ label, active, onClick, testId, children }: { label: string; active?: boolean; onClick: () => void; testId?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      title={label}
      aria-current={active ? "page" : undefined}
      className={`relative flex h-10 w-10 items-center justify-center rounded-md outline-none transition-colors ${
        active ? "bg-primary/12 text-primary" : "text-mutedForeground hover:bg-muted hover:text-foreground"
      }`}
      onClick={onClick}
    >
      {active && <span aria-hidden="true" className="absolute -left-1.5 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />}
      {children}
    </button>
  );
}

export function AppRail({ view, canManage, panelCollapsed, panelToggleDisabled, onNavigate, onTogglePanel, onOpenAdmin, onOpenSettings }: AppRailProps) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("primaryNavigation")} className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-sidebarBackground py-2">
      <RailButton label={t("documents")} active={view === "documents"} onClick={() => onNavigate("documents")} testId="nav-documents">
        <FileText size={18} />
      </RailButton>
      <RailButton label={t("workHub.navigation")} active={view === "work"} onClick={() => onNavigate("work")} testId="nav-work">
        <ClipboardCheck size={18} />
      </RailButton>
      <div className="mt-auto flex flex-col items-center gap-1">
        {!panelToggleDisabled && (
          <RailButton label={panelCollapsed ? t("expandSidebar") : t("collapseSidebar")} onClick={onTogglePanel} testId="toggle-sidebar">
            {panelCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </RailButton>
        )}
        <RailButton label={t("trash")} active={view === "trash"} onClick={() => onNavigate("trash")} testId="nav-trash">
          <Trash2 size={17} />
        </RailButton>
        {canManage && (
          <RailButton label={t("adminPanel")} active={view === "admin"} onClick={onOpenAdmin} testId="nav-admin">
            <ShieldCheck size={17} />
          </RailButton>
        )}
        <RailButton label={t("settings")} active={view === "settings"} onClick={onOpenSettings} testId="nav-settings">
          <Settings size={17} />
        </RailButton>
      </div>
    </nav>
  );
}
