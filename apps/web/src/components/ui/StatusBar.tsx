import { LozengeAppearance } from "./Lozenge";

/** Adds a violet beyond the Lozenge palette so blue-family outcomes stay distinguishable. */
export type StatusBarTone = LozengeAppearance | "violet";

const segmentClasses: Record<StatusBarTone, string> = {
  neutral: "bg-mutedForeground/35",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  primary: "bg-primary",
  violet: "bg-[#6E56CF]",
};

export interface StatusBarSegment {
  key: string;
  label: string;
  value: number;
  appearance: StatusBarTone;
}

export interface StatusBarProps {
  segments: StatusBarSegment[];
  total?: number;
  /** Legend entries carry the counts, so it is on by default. */
  legend?: boolean;
  className?: string;
  testId?: string;
}

/**
 * Proportional distribution bar: one segment per outcome, widths summing to the
 * total. Zero-value segments are dropped from the bar so a single hairline never
 * suggests a result that does not exist, but they stay in the legend.
 */
export function StatusBar({ segments, total, legend = true, className = "", testId }: StatusBarProps) {
  const sum = total ?? segments.reduce((carry, segment) => carry + segment.value, 0);
  const description = segments.map((segment) => `${segment.label}: ${segment.value}`).join(", ");
  return (
    <div className={className} data-testid={testId}>
      <div
        role="img"
        aria-label={sum ? description : undefined}
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
      >
        {sum > 0 &&
          segments
            .filter((segment) => segment.value > 0)
            .map((segment) => (
              <span
                key={segment.key}
                data-testid={testId ? `${testId}-${segment.key}` : undefined}
                title={`${segment.label}: ${segment.value}`}
                className={segmentClasses[segment.appearance]}
                style={{ width: `${(segment.value / sum) * 100}%` }}
              />
            ))}
      </div>
      {legend && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {segments.map((segment) => (
            <span key={segment.key} className="flex items-center gap-1.5 text-xs" data-testid={testId ? `${testId}-legend-${segment.key}` : undefined}>
              <span className={`h-2 w-2 shrink-0 rounded-full ${segmentClasses[segment.appearance]}`} />
              <span className="text-mutedForeground">{segment.label}</span>
              <span className="font-semibold tabular-nums">{segment.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
