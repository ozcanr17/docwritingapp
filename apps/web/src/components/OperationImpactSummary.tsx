import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface OperationImpactMetric {
  key: string;
  label: string;
  value: number;
}

export function OperationImpactSummary({ description, metrics, warning }: {
  description: string;
  metrics: OperationImpactMetric[];
  warning?: string;
}) {
  const { t } = useTranslation();
  return <section data-testid="operation-impact-summary" aria-label={t("operationImpact")} className="rounded-xl border border-border bg-editorBackground p-3">
    <div className="flex items-start gap-2">
      <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-mutedForeground">{t("operationImpact")}</div>
        <p className="mt-1 text-xs leading-5 text-foreground">{description}</p>
      </div>
    </div>
    <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {metrics.map((metric) => <div key={metric.key} className="rounded-lg border border-border bg-surface px-2.5 py-2">
        <dt className="text-[10px] uppercase tracking-wide text-mutedForeground">{metric.label}</dt>
        <dd className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{metric.value}</dd>
      </div>)}
    </dl>
    {warning && <p className="mt-2 text-xs leading-5 text-warning">{warning}</p>}
  </section>;
}
