import { History, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { RowDetail, RowHistoryEntry } from "../lib/api";

const FIELDS = ["title", "description", "numberingStart", "customFields", "requirementDetail", "testCaseDetail", "testStepDetail"] as const;

function format(value: unknown, empty: string): string {
  if (value === null || value === undefined || value === "") return empty;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function RowHistoryPanel({ row, entries, pending, onRestore }: { row: RowDetail; entries: RowHistoryEntry[]; pending: boolean; onRestore: (entry: RowHistoryEntry) => void }) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(entries[0]?.id ?? null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const selected = entries.find((entry) => entry.id === selectedId) ?? entries[0] ?? null;
  const current = useMemo(() => ({
    title: row.title,
    description: row.description,
    numberingStart: row.numberingStart,
    customFields: row.customFields,
    requirementDetail: row.requirementDetail,
    testCaseDetail: row.testCaseDetail,
    testStepDetail: row.testStepDetail,
  }), [row]);
  const changedFields = selected ? FIELDS.filter((field) => JSON.stringify(selected.snapshot[field]) !== JSON.stringify(current[field])) : [];

  return (
    <section data-testid="row-history-panel" className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs uppercase text-mutedForeground"><History size={13} />{t("rowHistory")}</div>
      {entries.length === 0 ? <div className="rounded-lg border border-dashed border-border p-3 text-xs text-mutedForeground">{t("noRowHistory")}</div> : (
        <div className="grid gap-2 xl:grid-cols-[11rem_minmax(0,1fr)]">
          <div className="max-h-52 space-y-1 overflow-auto">
            {entries.map((entry) => (
              <button key={entry.id} data-testid={`row-history-${entry.version}`} className={`w-full rounded-lg border px-2 py-1.5 text-left text-xs ${selected?.id === entry.id ? "border-primary bg-primary/10" : "border-border bg-editorBackground hover:bg-muted"}`} onClick={() => { setSelectedId(entry.id); setConfirmId(null); }}>
                <span className="flex items-center justify-between"><span className="font-medium">v{entry.version}</span>{entry.current && <span className="rounded bg-success/15 px-1.5 py-0.5 text-[10px] text-success">{t("currentVersion")}</span>}</span>
                <span className="mt-0.5 block truncate text-[10px] text-mutedForeground">{entry.actor?.displayName ?? t("systemUser")}</span>
                <span className="block text-[10px] text-mutedForeground">{new Date(entry.createdAt).toLocaleString()}</span>
              </button>
            ))}
          </div>
          {selected && (
            <div className="min-w-0 rounded-lg border border-border bg-editorBackground p-2">
              <div className="mb-2 grid grid-cols-[7rem_1fr_1fr] gap-px overflow-hidden rounded border border-border bg-border text-[10px]">
                <div className="bg-muted p-1.5 font-medium">{t("changedField")}</div><div className="bg-muted p-1.5 font-medium">{t("historicalValue")}</div><div className="bg-muted p-1.5 font-medium">{t("currentValue")}</div>
                {(changedFields.length ? changedFields : ["title"] as const).map((field) => <div className="contents" key={field}><div className="bg-surface p-1.5 font-medium text-mutedForeground">{t(`baselineField.${field}`)}</div><div className="break-words bg-surface p-1.5">{format(selected.snapshot[field], t("emptyValue"))}</div><div className="break-words bg-surface p-1.5">{format(current[field], t("emptyValue"))}</div></div>)}
              </div>
              {!selected.current && confirmId !== selected.id && <button data-testid="restore-row-version" className="flex items-center gap-1 rounded-lg border border-primary px-2 py-1 text-xs text-primary" onClick={() => setConfirmId(selected.id)}><RotateCcw size={12} />{t("restoreThisVersion")}</button>}
              {confirmId === selected.id && <div className="rounded-lg border border-warning/30 bg-warning/10 p-2 text-xs"><div>{t("restoreVersionImpact")}</div><div className="mt-2 flex gap-2"><button data-testid="confirm-restore-row-version" className="rounded bg-primary px-2 py-1 text-primaryForeground disabled:opacity-50" disabled={pending} onClick={() => onRestore(selected)}>{t("restore")}</button><button className="rounded px-2 py-1 text-mutedForeground" onClick={() => setConfirmId(null)}>{t("cancel")}</button></div></div>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
