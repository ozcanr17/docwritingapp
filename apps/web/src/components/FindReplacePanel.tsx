import { Replace, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { OutlineRow } from "../lib/api";
import { GridColumn } from "../lib/columns";
import { buildReplacements, FindReplaceOptions, TextReplacement } from "../lib/findReplace";

export type ReplaceScope = "document" | "column" | "selection" | "subtree";

export function FindReplacePanel({ rows, columns, selectedRowIds, selectedRowId, pending, onApply, onClose }: { rows: OutlineRow[]; columns: GridColumn[]; selectedRowIds: string[]; selectedRowId: string | null; pending: boolean; onApply: (replacements: TextReplacement[]) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [options, setOptions] = useState<FindReplaceOptions>({ find: "", replace: "", matchCase: false, wholeWord: false, regularExpression: false });
  const [scope, setScope] = useState<ReplaceScope>("document");
  const [columnKey, setColumnKey] = useState(columns.find((column) => column.key === "title")?.key ?? columns[0]?.key ?? "");
  const replaceableColumns = useMemo(() => columns.filter((column) => column.editable && column.kind !== "linkedRequirements" && column.kind !== "stepNumber" && !["single_select", "multi_select", "number", "boolean", "date"].includes(column.field?.fieldType ?? "")), [columns]);
  const scopedRows = useMemo(() => {
    if (scope === "selection") return rows.filter((row) => selectedRowIds.includes(row.id));
    if (scope === "subtree" && selectedRowId) {
      const included = new Set([selectedRowId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const row of rows) {
          if (row.parentId && included.has(row.parentId) && !included.has(row.id)) {
            included.add(row.id);
            changed = true;
          }
        }
      }
      return rows.filter((row) => included.has(row.id));
    }
    return rows;
  }, [rows, scope, selectedRowId, selectedRowIds]);
  const scopedColumns = scope === "column" ? replaceableColumns.filter((column) => column.key === columnKey) : replaceableColumns;
  const preview = useMemo(() => buildReplacements(scopedRows, scopedColumns, options), [options, scopedColumns, scopedRows]);
  const occurrenceCount = preview.replacements.reduce((sum, replacement) => sum + replacement.occurrences, 0);
  return (
    <section data-testid="find-replace-panel" aria-label={t("findReplace")} className="border-b border-border bg-surface px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-44 flex-1 text-xs text-mutedForeground">{t("find")}<input autoFocus data-testid="find-text" className="mt-1 w-full rounded-lg border border-border bg-editorBackground px-2.5 py-2 text-foreground" value={options.find} onChange={(event) => setOptions({ ...options, find: event.target.value })} /></label>
        <label className="min-w-44 flex-1 text-xs text-mutedForeground">{t("replaceWith")}<input data-testid="replace-text" className="mt-1 w-full rounded-lg border border-border bg-editorBackground px-2.5 py-2 text-foreground" value={options.replace} onChange={(event) => setOptions({ ...options, replace: event.target.value })} /></label>
        <label className="text-xs text-mutedForeground">{t("scope")}<select data-testid="replace-scope" className="mt-1 block rounded-lg border border-border bg-editorBackground px-2.5 py-2 text-foreground" value={scope} onChange={(event) => setScope(event.target.value as ReplaceScope)}><option value="document">{t("wholeDocument")}</option><option value="column">{t("oneColumn")}</option><option value="selection" disabled={selectedRowIds.length === 0}>{t("selectedRowsScope")}</option><option value="subtree" disabled={!selectedRowId}>{t("selectedSubtree")}</option></select></label>
        {scope === "column" && <label className="text-xs text-mutedForeground">{t("column")}<select className="mt-1 block max-w-44 rounded-lg border border-border bg-editorBackground px-2.5 py-2 text-foreground" value={columnKey} onChange={(event) => setColumnKey(event.target.value)}>{replaceableColumns.map((column) => <option key={column.key} value={column.key}>{column.kind === "custom" ? column.labelKey : t(column.labelKey)}</option>)}</select></label>}
        <button data-testid="replace-all" disabled={pending || preview.replacements.length === 0 || Boolean(preview.error)} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs text-primaryForeground disabled:opacity-40" onClick={() => onApply(preview.replacements)}><Replace size={13} />{t("replaceAll")}</button>
        <button aria-label={t("close")} className="rounded-lg p-2 hover:bg-muted" onClick={onClose}><X size={15} /></button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs">
        <Toggle checked={options.matchCase} label={t("matchCase")} onChange={(value) => setOptions({ ...options, matchCase: value })} />
        <Toggle checked={options.wholeWord} label={t("wholeWord")} onChange={(value) => setOptions({ ...options, wholeWord: value })} />
        <Toggle checked={options.regularExpression} label={t("regularExpression")} onChange={(value) => setOptions({ ...options, regularExpression: value })} />
        <span className={preview.error ? "text-destructive" : "text-mutedForeground"}>{preview.error ? t("invalidRegularExpression") : t("replacePreviewSummary", { cells: preview.replacements.length, occurrences: occurrenceCount })}</span>
      </div>
      {preview.replacements.length > 0 && <div className="mt-2 max-h-32 overflow-auto rounded-lg border border-border bg-editorBackground"><table className="w-full text-xs"><tbody>{preview.replacements.slice(0, 50).map((replacement) => <tr key={`${replacement.rowId}:${replacement.columnKey}`} className="border-b border-border last:border-0"><td className="w-20 px-2 py-1.5 tabular-nums text-mutedForeground">#{replacement.objectNumber}</td><td className="w-32 px-2 py-1.5 text-mutedForeground">{replacement.columnLabel}</td><td className="max-w-0 truncate px-2 py-1.5"><span className="line-through opacity-60">{replacement.before}</span><span className="mx-2">→</span><span>{replacement.after}</span></td></tr>)}</tbody></table></div>}
    </section>
  );
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
  return <label className="flex items-center gap-1.5"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="accent-primary" />{label}</label>;
}
