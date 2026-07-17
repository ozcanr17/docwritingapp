import { AlertTriangle, FileText, Link2 } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export interface TraceLink {
  linkId: string;
  suspect: boolean;
  linkType: string;
  sourceId: string;
  sourceScenarioId?: string;
  sourceObjectNumber?: number | null;
  sourceTitle: string;
  sourceType: string;
  sourceDocument: { id: string; title: string; documentType: string };
}

export interface TraceMatrixRow {
  id: string;
  objectNumber?: number;
  requirementNo?: string | null;
  title: string;
  links: TraceLink[];
}

export function TraceabilityGraph({ rows, query, suspectOnly, onOpenRequirement, onOpenSource }: { rows: TraceMatrixRow[]; query: string; suspectOnly: boolean; onOpenRequirement: (rowId: string) => void; onOpenSource: (link: TraceLink) => void }) {
  const { t } = useTranslation();
  const normalized = query.trim().toLocaleLowerCase();
  const filteredRows = useMemo(() => rows.map((row) => ({
    ...row,
    links: row.links.filter((link) => (!suspectOnly || link.suspect) && (!normalized || `${row.requirementNo ?? ""} ${row.title} ${link.sourceTitle} ${link.sourceDocument.title} ${link.linkType}`.toLocaleLowerCase().includes(normalized))),
  })).filter((row) => row.links.length > 0), [normalized, rows, suspectOnly]);
  const sources = useMemo(() => {
    const values = new Map<string, TraceLink>();
    for (const row of filteredRows) for (const link of row.links) values.set(link.sourceScenarioId ?? link.sourceId, link);
    return [...values.values()];
  }, [filteredRows]);
  const height = Math.max(sources.length, filteredRows.length) * 80 + 32;
  if (filteredRows.length === 0) return <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-mutedForeground">{t("noTraceResults")}</div>;
  return (
    <div data-testid="traceability-graph" className="overflow-auto rounded-xl border border-border bg-editorBackground">
      <div className="grid min-w-[760px] grid-cols-2 border-b border-border px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-mutedForeground"><span>{t("traceTests")}</span><span className="pl-20">{t("requirements")}</span></div>
      <div className="relative min-w-[760px]" style={{ height }}>
        <svg aria-hidden="true" className="absolute inset-0 h-full w-full" viewBox={`0 0 760 ${height}`} preserveAspectRatio="none">
          {filteredRows.flatMap((row, targetIndex) => row.links.map((link) => {
            const sourceIndex = sources.findIndex((source) => (source.sourceScenarioId ?? source.sourceId) === (link.sourceScenarioId ?? link.sourceId));
            const startY = sourceIndex * 80 + 48;
            const endY = targetIndex * 80 + 48;
            return <path key={link.linkId} d={`M 276 ${startY} C 360 ${startY}, 400 ${endY}, 484 ${endY}`} fill="none" stroke={link.suspect ? "rgb(245 158 11)" : "rgb(59 130 246)"} strokeWidth="2" strokeDasharray={link.suspect ? "6 4" : undefined} opacity="0.65" />;
          }))}
        </svg>
        {sources.map((source, index) => (
          <button key={source.sourceScenarioId ?? source.sourceId} className="absolute left-4 flex h-12 w-64 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-left shadow-sm transition hover:border-primary/40 hover:bg-muted" style={{ top: index * 80 + 24 }} onClick={() => onOpenSource(source)}>
            <FileText size={14} className="shrink-0 text-info" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{source.sourceTitle || source.sourceId.slice(0, 8)}</span><span className="block truncate text-[10px] text-mutedForeground">{source.sourceDocument.title}</span></span>
            {source.suspect && <AlertTriangle size={13} className="shrink-0 text-warning" />}
          </button>
        ))}
        {filteredRows.map((row, index) => (
          <button key={row.id} className="absolute right-4 flex h-12 w-64 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-left shadow-sm transition hover:border-primary/40 hover:bg-muted" style={{ top: index * 80 + 24 }} onClick={() => onOpenRequirement(row.id)}>
            <Link2 size={14} className="shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate font-mono text-xs font-medium">{row.requirementNo || `ID ${row.objectNumber ?? row.id.slice(0, 8)}`}</span><span className="rounded-full bg-primary/10 px-1.5 text-[10px] text-primary">{row.links.length}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
