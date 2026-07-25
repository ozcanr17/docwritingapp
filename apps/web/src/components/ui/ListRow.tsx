export interface ListRowProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  onClick?: () => void;
  testId?: string;
  className?: string;
}

export function ListRow({ icon, title, subtitle, badge, meta, trailing, onClick, testId, className = "" }: ListRowProps) {
  const content = (
    <>
      {icon && (
        <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surfaceSubtle text-mutedForeground">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-sm font-medium text-foreground">{title}</span>
          {badge}
        </span>
        {subtitle && <span className="mt-0.5 block truncate text-xs text-mutedForeground">{subtitle}</span>}
      </span>
      {meta && <span className="shrink-0 text-xs tabular-nums text-mutedForeground">{meta}</span>}
      {trailing}
    </>
  );
  const base = `flex w-full items-center gap-3 px-4 py-2.5 text-left ${className}`;
  if (!onClick) return <div className={base} data-testid={testId}>{content}</div>;
  return (
    <button type="button" data-testid={testId} className={`${base} outline-none transition-colors hover:bg-muted`} onClick={onClick}>
      {content}
    </button>
  );
}
