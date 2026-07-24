export interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, breadcrumbs, actions, className = "" }: PageHeaderProps) {
  return (
    <header className={`flex flex-wrap items-start justify-between gap-x-4 gap-y-2 ${className}`}>
      <div className="min-w-0">
        {breadcrumbs && <div className="mb-0.5 flex items-center gap-1 text-xs text-mutedForeground">{breadcrumbs}</div>}
        <h1 className="truncate text-lg font-semibold leading-7 text-foreground">{title}</h1>
        {description && <p className="mt-0.5 max-w-3xl text-sm leading-5 text-mutedForeground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
