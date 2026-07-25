export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  leading?: React.ReactNode;
  className?: string;
  testId?: string;
}

export function PageHeader({ title, subtitle, icon, actions, leading, className = "", testId }: PageHeaderProps) {
  return (
    <header
      data-testid={testId}
      className={`flex min-h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 ${className}`}
    >
      {leading}
      {icon && (
        <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surfaceSubtle text-mutedForeground">
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <h1 className="truncate text-[15px] font-semibold leading-5 text-foreground">{title}</h1>
        {subtitle && <p className="truncate text-xs leading-4 text-mutedForeground">{subtitle}</p>}
      </div>
      {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function TableHead({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <thead className={`text-[11px] font-semibold uppercase tracking-[0.06em] text-mutedForeground ${className}`}>
      {children}
    </thead>
  );
}

export function ProgressBar({ value, label, className = "" }: { value: number; label?: string; className?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <span role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clamped)} className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-primary/15">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${clamped}%` }} />
      </span>
      {label && <span className="shrink-0 text-xs tabular-nums text-mutedForeground">{label}</span>}
    </span>
  );
}
