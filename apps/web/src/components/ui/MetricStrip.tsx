export type MetricTone = "primary" | "success" | "warning" | "danger" | "info" | "purple";

const badgeTones: Record<MetricTone, string> = {
  primary: "bg-primary text-primaryForeground",
  success: "bg-success text-white",
  warning: "bg-warning text-white",
  danger: "bg-destructive text-white",
  info: "bg-info text-white",
  purple: "bg-[#6E56CF] text-white",
};

export function MetricStrip({ children, className = "", testId }: { children: React.ReactNode; className?: string; testId?: string }) {
  return (
    <div
      data-testid={testId}
      className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-5 xl:gap-0 xl:divide-x xl:divide-border xl:rounded-xl xl:border xl:border-border xl:bg-surface ${className}`}
    >
      {children}
    </div>
  );
}

export interface MetricProps {
  label: string;
  value: string | number;
  caption?: string;
  delta?: string;
  deltaTone?: "positive" | "negative" | "neutral";
  icon?: React.ReactNode;
  tone?: MetricTone;
  testId?: string;
}

export function Metric({ label, value, caption, delta, deltaTone = "neutral", icon, tone = "primary", testId }: MetricProps) {
  return (
    <div
      data-testid={testId}
      className="rounded-xl border border-border bg-surface p-4 xl:rounded-none xl:border-0 xl:bg-transparent"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium text-mutedForeground">{label}</span>
        {icon && (
          <span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${badgeTones[tone]}`}>
            {icon}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-semibold leading-none tabular-nums tracking-tight text-foreground">{value}</span>
        {delta && (
          <span
            className={`text-xs font-medium ${
              deltaTone === "positive" ? "text-success" : deltaTone === "negative" ? "text-destructive" : "text-mutedForeground"
            }`}
          >
            {delta}
          </span>
        )}
      </div>
      {caption && <p className="mt-1.5 truncate text-xs text-mutedForeground">{caption}</p>}
    </div>
  );
}
