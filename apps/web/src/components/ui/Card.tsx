export interface CardProps {
  className?: string;
  children: React.ReactNode;
  testId?: string;
}

export function Card({ className = "", children, testId }: CardProps) {
  return (
    <section data-testid={testId} className={`overflow-hidden rounded-xl border border-border bg-surface ${className}`}>
      {children}
    </section>
  );
}

export interface CardHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  divided?: boolean;
  className?: string;
}

export function CardHeader({ title, subtitle, icon, badge, actions, divided = true, className = "" }: CardHeaderProps) {
  return (
    <header className={`flex items-start justify-between gap-3 px-4 py-3 ${divided ? "border-b border-border/70" : ""} ${className}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {icon && <span aria-hidden="true" className="flex shrink-0 items-center text-mutedForeground">{icon}</span>}
          <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
        </div>
        {subtitle && <p className="mt-0.5 text-xs leading-5 text-mutedForeground">{subtitle}</p>}
      </div>
      {(badge || actions) && (
        <div className="flex shrink-0 items-center gap-2">
          {badge}
          {actions}
        </div>
      )}
    </header>
  );
}

export function CardBody({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}

export function CardFooter({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`border-t border-border/70 px-4 py-2.5 text-xs text-mutedForeground ${className}`}>{children}</div>;
}
