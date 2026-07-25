import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useTranslation } from "react-i18next";

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
  onToggleCollapse: () => void;
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
  onToggleCollapse,
}: AppSidebarProps) {
  const { t } = useTranslation();
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
    </aside>
  );
}
