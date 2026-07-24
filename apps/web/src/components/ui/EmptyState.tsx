export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className = "" }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-10 text-center ${className}`}>
      {icon && (
        <span aria-hidden="true" className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted text-mutedForeground">
          {icon}
        </span>
      )}
      <div className="text-sm font-semibold text-foreground">{title}</div>
      {description && <p className="mt-1 max-w-sm text-sm leading-5 text-mutedForeground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
