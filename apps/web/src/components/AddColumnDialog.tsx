import { X } from "lucide-react";
import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { CustomFieldType } from "../lib/api";

const FIELD_TYPES: CustomFieldType[] = [
  "text",
  "long_text",
  "integer",
  "decimal",
  "boolean",
  "date",
  "datetime",
  "single_select",
  "multi_select",
  "url",
];

export function AddColumnDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: { displayName: string; fieldType: CustomFieldType; allowedValues: string[] }) => void;
}) {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState("");
  const [fieldType, setFieldType] = useState<CustomFieldType>("text");
  const [options, setOptions] = useState("");
  const hasOptions = fieldType === "single_select" || fieldType === "multi_select";
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!displayName.trim()) return;
    onSubmit({
      displayName: displayName.trim(),
      fieldType,
      allowedValues: hasOptions
        ? options.split(/[,\n]/).map((option) => option.trim()).filter(Boolean)
        : [],
    });
  };
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <form
        data-testid="add-column-dialog"
        className="w-full max-w-md rounded-2xl border border-border bg-surfaceElevated p-5 shadow-2xl"
        onSubmit={submit}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{t("addColumn")}</h2>
          <button type="button" aria-label={t("close")} className="rounded-lg p-1.5 hover:bg-muted" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <label className="mt-4 block text-sm">
          <span className="text-mutedForeground">{t("columnName")}</span>
          <input
            autoFocus
            data-testid="column-name-input"
            className="mt-1.5 w-full rounded-lg border border-border bg-editorBackground px-3 py-2"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>
        <label className="mt-4 block text-sm">
          <span className="text-mutedForeground">{t("columnTypeLabel")}</span>
          <select
            data-testid="column-type-select"
            className="mt-1.5 w-full rounded-lg border border-border bg-editorBackground px-3 py-2"
            value={fieldType}
            onChange={(event) => setFieldType(event.target.value as CustomFieldType)}
          >
            {FIELD_TYPES.map((type) => (
              <option key={type} value={type}>{t(`fieldType_${type}`)}</option>
            ))}
          </select>
        </label>
        {hasOptions && (
          <label className="mt-4 block text-sm">
            <span className="text-mutedForeground">{t("columnOptions")}</span>
            <textarea
              data-testid="column-options-input"
              className="mt-1.5 min-h-28 w-full resize-y rounded-lg border border-border bg-editorBackground px-3 py-2"
              placeholder={t("columnOptionsHint")}
              value={options}
              onChange={(event) => setOptions(event.target.value)}
            />
          </label>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="rounded-lg px-3 py-2 text-sm hover:bg-muted" onClick={onClose}>{t("cancel")}</button>
          <button
            type="submit"
            data-testid="column-create-submit"
            className="rounded-lg bg-primary px-3 py-2 text-sm text-primaryForeground disabled:opacity-50"
            disabled={!displayName.trim()}
          >
            {t("create")}
          </button>
        </div>
      </form>
    </div>
  );
}
