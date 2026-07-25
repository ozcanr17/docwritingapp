import { ChevronsUpDown, PanelLeftClose, PanelLeftOpen, Settings, ShieldCheck, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useThemeStore } from "../stores/theme";
import { Menu } from "./Menu";
import { Avatar } from "./ui";

export type SidebarView = "documents" | "work" | "tests" | "trash" | "settings" | "admin";

interface AppSidebarProps {
  collapsed: boolean;
  collapseDisabled: boolean;
  responsiveCollapsed?: boolean;
  width: number;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  view: SidebarView;
  canManage: boolean;
  profile: { displayName: string; email: string; isAdmin: boolean };
  onToggleCollapse: () => void;
  onNavigate: (path: string) => void;
  onOpenProfile: () => void;
  onLogout: () => void;
}

export function AppSidebar({
  collapsed,
  collapseDisabled,
  responsiveCollapsed = false,
  width,
  title,
  subtitle,
  icon,
  children,
  view,
  canManage,
  profile,
  onToggleCollapse,
  onNavigate,
  onOpenProfile,
  onLogout,
}: AppSidebarProps) {
  const { t } = useTranslation();
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);
  const isDark =
    themeMode === "dark" ||
    (themeMode === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const footerButton = (active: boolean) =>
    `flex items-center gap-2.5 rounded-md text-left text-sm outline-none transition-colors ${collapsed ? "h-9 w-9 justify-center" : "w-full px-2.5 py-2"} ${
      active ? "bg-primary/10 font-medium text-primary" : "text-foreground/75 hover:bg-muted hover:text-foreground"
    }`;
  return (
    <aside
      aria-label={t("primaryNavigation")}
      data-collapsed={collapsed}
      data-responsive-collapsed={responsiveCollapsed}
      className="app-sidebar flex h-full shrink-0 flex-col overflow-hidden border-r border-border bg-sidebarBackground text-sidebarForeground"
      style={{ width: collapsed ? 48 : width }}
    >
      <div className={`flex min-h-12 shrink-0 items-center gap-2.5 border-b border-border/70 ${collapsed ? "justify-center px-1" : "px-3"}`}>
        {icon && !collapsed && (
          <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-mutedForeground">
            {icon}
          </span>
        )}
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{title}</div>
            {subtitle && <div className="truncate text-[11px] text-mutedForeground">{subtitle}</div>}
          </div>
        )}
        {!collapseDisabled && (
          <button
            type="button"
            data-testid="toggle-sidebar"
            aria-label={collapsed ? t("expandSidebar") : t("collapseSidebar")}
            title={collapsed ? t("expandSidebar") : t("collapseSidebar")}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-mutedForeground hover:bg-muted hover:text-foreground"
            onClick={onToggleCollapse}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        )}
      </div>
      {!collapsed && <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2">{children}</div>}
      {collapsed && <div className="flex-1" />}
      <div className={`shrink-0 space-y-0.5 border-t border-border/70 p-2 ${collapsed ? "flex flex-col items-center" : ""}`}>
        <button
          type="button"
          data-testid="nav-trash"
          title={collapsed ? t("trash") : undefined}
          aria-label={collapsed ? t("trash") : undefined}
          className={footerButton(view === "trash")}
          onClick={() => onNavigate("/trash")}
        >
          <Trash2 size={16} className="shrink-0" />
          {!collapsed && <span className="min-w-0 flex-1 truncate">{t("trash")}</span>}
        </button>
        {canManage && (
          <button
            type="button"
            data-testid="nav-admin"
            title={collapsed ? t("adminPanel") : undefined}
            aria-label={collapsed ? t("adminPanel") : undefined}
            className={footerButton(view === "admin")}
            onClick={() => onNavigate("/admin")}
          >
            <ShieldCheck size={16} className="shrink-0" />
            {!collapsed && <span className="min-w-0 flex-1 truncate">{t("adminPanel")}</span>}
          </button>
        )}
        <button
          type="button"
          data-testid="nav-settings"
          title={collapsed ? t("settings") : undefined}
          aria-label={collapsed ? t("settings") : undefined}
          className={footerButton(view === "settings")}
          onClick={() => onNavigate("/settings")}
        >
          <Settings size={16} className="shrink-0" />
          {!collapsed && <span className="min-w-0 flex-1 truncate">{t("settings")}</span>}
        </button>
        <Menu
          testId="open-profile"
          label={profile.displayName}
          triggerClassName={`mt-1 flex items-center gap-2.5 rounded-lg border border-border bg-surface text-left shadow-sm outline-none transition-colors hover:bg-muted ${collapsed ? "h-9 w-9 justify-center" : "w-full px-2 py-2"}`}
          icon={
            <>
              <Avatar name={profile.displayName} size={collapsed ? "sm" : "md"} />
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{profile.displayName}</span>
                    <span className="block truncate text-xs text-mutedForeground">{profile.isAdmin ? t("administratorBadge") : profile.email}</span>
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
            { key: "settings", label: t("workspaceSettings"), onSelect: () => onNavigate("/settings") },
            { key: "theme", label: isDark ? t("themeLight") : t("themeDark"), onSelect: () => setThemeMode(isDark ? "light" : "dark") },
            { key: "logout-sep", label: "", separator: true },
            { key: "logout", label: t("logout"), danger: true, onSelect: onLogout },
          ]}
        />
      </div>
    </aside>
  );
}
