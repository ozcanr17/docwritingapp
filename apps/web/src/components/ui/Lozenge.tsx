export type LozengeAppearance = "neutral" | "info" | "success" | "warning" | "danger" | "primary";

const subtleClasses: Record<LozengeAppearance, string> = {
  neutral: "bg-muted text-mutedForeground",
  info: "bg-info/12 text-info",
  success: "bg-success/12 text-success",
  warning: "bg-warning/14 text-warning",
  danger: "bg-destructive/12 text-destructive",
  primary: "bg-primary/12 text-primary",
};

const boldClasses: Record<LozengeAppearance, string> = {
  neutral: "bg-mutedForeground text-surface",
  info: "bg-info text-surface",
  success: "bg-success text-surface",
  warning: "bg-warning text-surface",
  danger: "bg-destructive text-surface",
  primary: "bg-primary text-primaryForeground",
};

export interface LozengeProps {
  appearance?: LozengeAppearance;
  bold?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Lozenge({ appearance = "neutral", bold = false, className = "", children }: LozengeProps) {
  return (
    <span
      data-appearance={appearance}
      className={`inline-flex max-w-full items-center truncate rounded px-1.5 py-0.5 text-[11px] font-semibold leading-4 tracking-wide ${
        bold ? boldClasses[appearance] : subtleClasses[appearance]
      } ${className}`}
    >
      {children}
    </span>
  );
}
