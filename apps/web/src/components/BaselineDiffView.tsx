import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

export interface BaselineDiffSnapshot {
  id: string;
  objectNumber: number;
  rowType: string;
  title: string;
  description: string | null;
  [key: string]: unknown;
}

export interface BaselineDiffRow {
  id: string;
  objectNumber: number;
  rowType: string;
  title: string;
  before: BaselineDiffSnapshot | null;
  after: BaselineDiffSnapshot | null;
  changedFields: string[];
}

export interface BaselineDiffData {
  revisionNumber: number;
  semanticVersion: string;
  label: string | null;
  added: BaselineDiffRow[];
  removed: BaselineDiffRow[];
  modified: BaselineDiffRow[];
  summary: { added: number; removed: number; modified: number };
}

type ChangeKind = "all" | "added" | "removed" | "modified";

const CORE_FIELDS = ["rowType", "title", "description", "requirementDetail", "testCaseDetail", "testStepDetail", "customFields"];

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0) || (typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length === 0);
}

function formatValue(value: unknown, emptyLabel: string): string {
  if (isEmpty(value)) return emptyLabel;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function fieldsForRow(row: BaselineDiffRow): string[] {
  if (!row.changedFields.includes("row")) return row.changedFields;
  return CORE_FIELDS.filter((field) => !isEmpty(row.before?.[field]) || !isEmpty(row.after?.[field]));
}

export function BaselineDiffView({ data, onOpenRow }: { data: BaselineDiffData; onOpenRow: (rowId: string) => void }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<ChangeKind>("all");
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const combined = [
      ...data.modified.map((row) => ({ ...row, kind: "modified" as const })),
      ...data.added.map((row) => ({ ...row, kind: "added" as const })),
      ...data.removed.map((row) => ({ ...row, kind: "removed" as const })),
    ];
    const normalized = query.trim().toLocaleLowerCase();
    return combined.filter((row) => (kind === "all" || row.kind === kind) && (!normalized || `${row.objectNumber} ${row.title} ${row.rowType}`.toLocaleLowerCase().includes(normalized)));
  }, [data, kind, query]);

  const filters: Array<{ kind: ChangeKind; count: number; label: string }> = [
    { kind: "all", count: data.summary.added + data.summary.removed + data.summary.modified, label: t("baselineDiffAll") },
    { kind: "added", count: data.summary.added, label: t("added") },
    { kind: "removed", count: data.summary.removed, label: t("removed") },
    { kind: "modified", count: data.summary.modified, label: t("modified") },
  ];

  return (
    <section data-testid="baseline-diff-view" aria-label={t("baselineComparison")} className="space-y-3 rounded-xl border border-border bg-editorBackground p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium">{t("baselineComparisonVersion", { version: data.semanticVersion })}</div>
          <div className="text-xs text-mutedForeground">{data.label || t("baselineNoLabel")}</div>
        </div>
        <label className="flex min-w-56 items-center gap-2 rounded-lg border border-border bg-panelBackground px-2 py-1.5">
          <Search size={14} aria-hidden="true" />
          <span className="sr-only">{t("searchBaselineChanges")}</span>
          <input data-testid="baseline-diff-search" className="min-w-0 flex-1 bg-transparent text-xs outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchBaselineChanges")} />
        </label>
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label={t("filterBaselineChanges")}>
        {filters.map((filter) => (
          <button key={filter.kind} data-testid={`baseline-diff-filter-${filter.kind}`} aria-pressed={kind === filter.kind} className={`rounded-lg px-2.5 py-1.5 text-xs ${kind === filter.kind ? "bg-primary text-primaryForeground" : "bg-muted text-mutedForeground hover:text-foreground"}`} onClick={() => setKind(filter.kind)}>
            {filter.label} <span className="tabular-nums">{filter.count}</span>
          </button>
        ))}
      </div>
      {rows.length === 0 ? <div className="rounded-lg border border-dashed border-border p-5 text-center text-xs text-mutedForeground">{t("noBaselineChanges")}</div> : (
        <div className="max-h-[48vh] space-y-2 overflow-auto pr-1">
          {rows.map((row) => {
            const fields = fieldsForRow(row);
            return (
              <article key={`${row.kind}-${row.id}`} data-testid={`baseline-diff-row-${row.id}`} className="overflow-hidden rounded-lg border border-border">
                <header className="flex items-center justify-between gap-3 bg-panelBackground px-3 py-2">
                  <div className="min-w-0"><span className={`mr-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${row.kind === "added" ? "bg-success/15 text-success" : row.kind === "removed" ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"}`}>{t(row.kind)}</span><span className="font-mono text-xs text-mutedForeground">ID {row.objectNumber}</span><span className="ml-2 text-xs font-medium">{row.title || t("untitled")}</span></div>
                  {row.after && <button className="shrink-0 text-xs text-primary hover:underline" onClick={() => onOpenRow(row.id)}>{t("openDetails")}</button>}
                </header>
                <div className="grid grid-cols-[minmax(7rem,0.32fr)_minmax(0,1fr)_minmax(0,1fr)] border-t border-border text-xs">
                  <div className="bg-muted/40 px-3 py-2 font-medium text-mutedForeground">{t("changedField")}</div>
                  <div className="border-l border-border bg-destructive/5 px-3 py-2 font-medium">{t("baselineValue")}</div>
                  <div className="border-l border-border bg-success/5 px-3 py-2 font-medium">{t("currentValue")}</div>
                  {fields.map((field) => (
                    <div key={field} className="contents">
                      <div className="border-t border-border bg-muted/20 px-3 py-2 font-medium text-mutedForeground">{t(`baselineField.${field}`, { defaultValue: field })}</div>
                      <div className="whitespace-pre-wrap break-words border-l border-t border-border px-3 py-2">{formatValue(row.before?.[field], t("emptyValue"))}</div>
                      <div className="whitespace-pre-wrap break-words border-l border-t border-border px-3 py-2">{formatValue(row.after?.[field], t("emptyValue"))}</div>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
