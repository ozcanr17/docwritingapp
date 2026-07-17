import { AlertTriangle, ArrowRight, Link2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OutlineRow } from "../lib/api";

export function EditImpactDialog({ row, fieldLabel, beforeValue, afterValue, pending, onCancel, onConfirm }: {
  row: OutlineRow;
  fieldLabel: string;
  beforeValue: string;
  afterValue: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return <div className="absolute inset-0 z-[205] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
    <div data-testid="edit-impact-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-impact-title" className="w-full max-w-xl rounded-2xl border border-border bg-surfaceElevated p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3"><span className="rounded-xl bg-warning/10 p-2 text-warning"><AlertTriangle size={18} /></span><div><h2 id="edit-impact-title" className="font-semibold">{t("editImpactTitle")}</h2><p className="mt-1 text-sm text-mutedForeground">{t("editImpactHelp", { count: row.linkCount })}</p></div></div>
        <button type="button" aria-label={t("close")} className="rounded-lg p-1.5 hover:bg-muted" onClick={onCancel}><X size={16} /></button>
      </div>
      <div className="mt-4 rounded-xl border border-border bg-editorBackground p-3">
        <div className="text-xs font-medium text-mutedForeground">{fieldLabel}</div>
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 text-sm"><div className="max-h-28 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-2">{beforeValue || t("emptyValue")}</div><ArrowRight size={15} className="mt-2 text-mutedForeground" /><div className="max-h-28 overflow-auto whitespace-pre-wrap rounded-lg bg-primary/5 p-2">{afterValue || t("emptyValue")}</div></div>
      </div>
      <div className="mt-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-mutedForeground"><Link2 size={13} />{t("affectedLinkedObjects")}</div>
        <ul className="mt-2 max-h-48 divide-y divide-border overflow-auto rounded-xl border border-border">
          {row.linkedObjects.map((linked) => <li key={linked.id} className="px-3 py-2.5"><div className="truncate text-sm font-medium">{linked.requirementNo || linked.title || `ID ${linked.id.slice(0, 8)}`}</div><div className="mt-0.5 truncate text-xs text-mutedForeground">{linked.document.title} · {linked.action || linked.description || linked.expectedResult || linked.title}</div></li>)}
        </ul>
      </div>
      <div className="mt-4 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning">{t("editImpactWarning")}</div>
      <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={pending} className="rounded-lg px-3 py-2 text-sm hover:bg-muted" onClick={onCancel}>{t("cancel")}</button><button type="button" data-testid="confirm-impact-edit" disabled={pending} className="rounded-lg bg-primary px-3 py-2 text-sm text-primaryForeground disabled:opacity-50" onClick={onConfirm}>{t("saveAndMarkSuspect")}</button></div>
    </div>
  </div>;
}
