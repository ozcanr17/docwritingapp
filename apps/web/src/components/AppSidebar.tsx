import { ChevronsUpDown, ClipboardCheck, FileText, PanelLeftClose, PanelLeftOpen, Settings, ShieldCheck, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Menu } from "./Menu";
import { Avatar, SidebarGroup, SidebarItem } from "./ui";

export type SidebarView = "documents" | "work" | "trash" | "settings" | "admin";

interface AppSidebarProps {
  view: SidebarView;
  collapsed: boolean;
  collapseDisabled: boolean;
  responsiveCollapsed?: boolean;
  width: number;
  canManage: boolean;
  profile: { displayName: string; email: string; isAdmin: boolean };
  contextLabel?: string;
  context?: React.ReactNode;
  onNavigate: (view: SidebarView) => void;
  onToggleCollapse: () => void;
  onOpenProfile: () => void;
  onLogout: () => void;
}

export function AppSidebar({
  view,
  collapsed,
  collapseDisabled,
  responsiveCollapsed = false,
  width,
  canManage,
  profile,
  contextLabel,
  context,
  onNavigate,
  onToggleCollapse,
  onOpenProfile,
  onLogout,
}: AppSidebarProps) {
  const { t } = useTranslation();
  return (
    <aside
      aria-label={t("primaryNavigation")}
      data-collapsed={collapsed}
      data-responsive-collapsed={responsiveCollapsed}
      className="app-sidebar flex h-full shrink-0 flex-col overflow-hidden border-r border-border bg-sidebarBackground text-sidebarForeground"
      style={{ width: collapsed ? 64 : width }}
    >
      <div className={`flex min-h-14 shrink-0 items-center gap-2.5 border-b border-border/70 ${collapsed ? "justify-center px-2" : "px-3"}`}>
        <img src="/docsys-icon.png" alt="" className="h-7 w-7 shrink-0 rounded-md" />
        {!collapsed && <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight">{t("appName")}</span>}
        {!collapseDisabled && !collapsed && (
          <button
            type="button"
            data-testid="toggle-sidebar"
            aria-label={t("collapseSidebar")}
            title={t("collapseSidebar")}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-mutedForeground hover:bg-muted hover:text-foreground"
            onClick={onToggleCollapse}
          >
            <PanelLeftClose size={16} />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        <SidebarGroup label={t("workspaceArea")} collapsed={collapsed}>
          <SidebarItem
            icon={<FileText size={16} />}
            label={t("documents")}
            active={view === "documents"}
            collapsed={collapsed}
            onClick={() => onNavigate("documents")}
            testId="nav-documents"
          />
          <SidebarItem
            icon={<ClipboardCheck size={16} />}
            label={t("workHub.navigation")}
            active={view === "work"}
            collapsed={collapsed}
            onClick={() => onNavigate("work")}
            testId="nav-work"
          />
        </SidebarGroup>

        {context && !collapsed && (
          <div className="mt-1 flex min-h-0 flex-col">
            {contextLabel && <div className="px-4 pb-1 pt-3 text-[11px] font-medium text-mutedForeground">{contextLabel}</div>}
            {context}
          </div>
        )}

        <SidebarGroup label={t("workspaceTools")} collapsed={collapsed} className="mt-1">
          {canManage && (
            <SidebarItem
              icon={<ShieldCheck size={16} />}
              label={t("adminPanel")}
              active={view === "admin"}
              collapsed={collapsed}
              onClick={() => onNavigate("admin")}
              testId="nav-admin"
            />
          )}
          <SidebarItem
            icon={<Trash2 size={16} />}
            label={t("trash")}
            active={view === "trash"}
            collapsed={collapsed}
            onClick={() => onNavigate("trash")}
            testId="nav-trash"
          />
          <SidebarItem
            icon={<Settings size={16} />}
            label={t("settings")}
            active={view === "settings"}
            collapsed={collapsed}
            onClick={() => onNavigate("settings")}
            testId="nav-settings"
          />
        </SidebarGroup>
      </div>

      <div className={`shrink-0 border-t border-border/70 ${collapsed ? "p-2" : "p-2"}`}>
        {collapseDisabled || !collapsed ? null : (
          <button
            type="button"
            data-testid="toggle-sidebar"
            aria-label={t("expandSidebar")}
            title={t("expandSidebar")}
            className="mb-1 flex h-9 w-full items-center justify-center rounded-md text-mutedForeground hover:bg-muted hover:text-foreground"
            onClick={onToggleCollapse}
          >
            <PanelLeftOpen size={16} />
          </button>
        )}
        <Menu
          testId="open-profile"
          label={profile.displayName}
          triggerClassName={`flex w-full items-center gap-2.5 rounded-lg border border-border bg-surface text-left shadow-sm outline-none transition-colors hover:bg-muted ${collapsed ? "justify-center p-1.5" : "px-2 py-2"}`}
          icon={
            <>
              <Avatar name={profile.displayName} size="md" />
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{profile.displayName}</span>
                    <span className="block truncate text-xs text-mutedForeground">
                      {profile.isAdmin ? t("administratorBadge") : profile.email}
                    </span>
                  </span>
                  <ChevronsUpDown size={14} className="shrink-0 text-mutedForeground" />
                </>
              )}
            </>
          }
          entries={[
            { key: "account-email", label: profile.email, disabled: true },
            { key: "account-sep", label: "", separator: true },
            { key: "profile", label: t("profile"), onSelect: onOpenProfile },
            { key: "settings", label: t("settings"), onSelect: () => onNavigate("settings") },
            { key: "logout-sep", label: "", separator: true },
            { key: "logout", label: t("logout"), danger: true, onSelect: onLogout },
          ]}
        />
      </div>
    </aside>
  );
}
