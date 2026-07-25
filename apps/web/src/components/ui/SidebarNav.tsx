export interface SidebarGroupProps {
  label?: string;
  collapsed?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function SidebarGroup({ label, collapsed = false, className = "", children }: SidebarGroupProps) {
  return (
    <div className={`px-2 ${className}`}>
      {label && !collapsed && (
        <div className="px-2 pb-1 pt-3 text-[11px] font-medium text-mutedForeground">{label}</div>
      )}
      {label && collapsed && <div className="mx-2 my-2 border-t border-border/70" />}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export interface SidebarItemProps {
  icon?: React.ReactNode;
  label: string;
  active?: boolean;
  collapsed?: boolean;
  disabled?: boolean;
  depth?: number;
  trailing?: React.ReactNode;
  onClick?: () => void;
  testId?: string;
}

export function SidebarItem({
  icon,
  label,
  active = false,
  collapsed = false,
  disabled = false,
  depth = 0,
  trailing,
  onClick,
  testId,
}: SidebarItemProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={`flex w-full items-center gap-2.5 rounded-md text-left text-sm outline-none transition-colors disabled:pointer-events-none disabled:opacity-40 ${
        collapsed ? "h-9 justify-center px-0" : "px-2.5 py-2"
      } ${
        active
          ? "border border-border bg-surface font-medium text-foreground shadow-sm"
          : "border border-transparent text-foreground/75 hover:bg-muted hover:text-foreground"
      }`}
      style={!collapsed && depth > 0 ? { paddingLeft: 10 + depth * 14 } : undefined}
      onClick={onClick}
    >
      {icon && <span aria-hidden="true" className={`flex shrink-0 items-center ${active ? "text-foreground" : "text-mutedForeground"}`}>{icon}</span>}
      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {!collapsed && trailing}
    </button>
  );
}
