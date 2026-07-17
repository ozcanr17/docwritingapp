import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { GridColumn } from "../lib/columns";
import { OperationImpactSummary } from "./OperationImpactSummary";

export interface BulkActionInput {
  action: "edit" | "move" | "copy" | "link";
  field?: string;
  value?: string;
  targetId?: string;
}

export function BulkActionsDialog({
  count,
  affectedCount,
  linkedReferenceCount,
  columns,
  onClose,
  onSubmit,
}: {
  count: number;
  affectedCount: number;
  linkedReferenceCount: number;
  columns: GridColumn[];
  onClose: () => void;
  onSubmit: (input: BulkActionInput) => void;
}) {
  const { t } = useTranslation();
  const [action, setAction] = useState<BulkActionInput["action"]>("edit");
  const [field, setField] = useState("description");
  const [value, setValue] = useState("");
  const [targetId, setTargetId] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({ action, field, value, targetId: targetId.trim() || undefined });
  };
  return (
    <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <form data-testid="bulk-actions-dialog" className="w-full max-w-md rounded-2xl border border-border bg-surfaceElevated p-5 shadow-2xl" onSubmit={submit}>
        <h2 className="font-semibold">{t("bulkActions")}</h2>
        <p className="mt-1 text-sm text-mutedForeground">{t("selectedRows", { count })}</p>
        <label className="mt-4 block text-sm">
          <span className="text-mutedForeground">{t("action")}</span>
          <select data-testid="bulk-action-select" className="mt-1.5 w-full rounded-lg border border-border bg-editorBackground px-3 py-2" value={action} onChange={(event) => setAction(event.target.value as BulkActionInput["action"])}>
            <option value="edit">{t("bulkEdit")}</option>
            <option value="move">{t("bulkMove")}</option>
            <option value="copy">{t("bulkCopy")}</option>
            <option value="link">{t("bulkLink")}</option>
          </select>
        </label>
        {action === "edit" && (
          <>
            <label className="mt-3 block text-sm">
              <span className="text-mutedForeground">{t("column")}</span>
              <select className="mt-1.5 w-full rounded-lg border border-border bg-editorBackground px-3 py-2" value={field} onChange={(event) => setField(event.target.value)}>
                {columns.filter((column) => column.editable).map((column) => (
                  <option key={column.key} value={column.key}>{column.kind === "custom" ? column.labelKey : t(column.labelKey)}</option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-sm">
              <span className="text-mutedForeground">{t("value")}</span>
              <textarea data-testid="bulk-value" className="mt-1.5 min-h-24 w-full rounded-lg border border-border bg-editorBackground px-3 py-2" value={value} onChange={(event) => setValue(event.target.value)} />
            </label>
          </>
        )}
        {action !== "edit" && (
          <label className="mt-3 block text-sm">
            <span className="text-mutedForeground">{action === "link" ? t("targetRowId") : t("targetParentId")}</span>
            <input data-testid="bulk-target" className="mt-1.5 w-full rounded-lg border border-border bg-editorBackground px-3 py-2" value={targetId} onChange={(event) => setTargetId(event.target.value)} />
          </label>
        )}
        <div className="mt-4">
          <OperationImpactSummary
            description={t(`bulkImpactDescription.${action}`)}
            metrics={[
              { key: "selected", label: t("selectedObjects"), value: count },
              { key: "affected", label: t("affectedObjects"), value: action === "edit" || action === "link" ? count : affectedCount },
              { key: "links", label: t(action === "link" ? "linksCreated" : "linkedReferences"), value: action === "link" ? count : linkedReferenceCount },
            ]}
            warning={action === "edit" ? t("bulkEditImpactWarning") : undefined}
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="rounded-lg px-3 py-2 text-sm hover:bg-muted" onClick={onClose}>{t("cancel")}</button>
          <button data-testid="bulk-action-submit" className="rounded-lg bg-primary px-3 py-2 text-sm text-primaryForeground">{t("apply")}</button>
        </div>
      </form>
    </div>
  );
}
