import { Plus, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AdvancedFilterConfig, FilterCondition, FilterOperator } from "../lib/advancedFilters";
import { GridColumn } from "../lib/columns";

export function AdvancedFilterPopover({ config, columns, onChange, onClose }: { config: AdvancedFilterConfig; columns: GridColumn[]; onChange: (config: AdvancedFilterConfig) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const updateCondition = (id: string, patch: Partial<FilterCondition>) => onChange({
    ...config,
    conditions: config.conditions.map((condition) => condition.id === id ? { ...condition, ...patch } : condition),
  });
  const addCondition = () => onChange({
    ...config,
    conditions: [...config.conditions, { id: crypto.randomUUID(), field: "all", operator: "contains", value: "" }],
  });
  return (
    <div data-testid="advanced-filter-popover" className="absolute right-3 top-full z-40 mt-1 max-h-[min(42rem,calc(100vh-8rem))] w-[48rem] max-w-[calc(100vw-2rem)] overflow-auto rounded-2xl border border-border bg-surfaceElevated p-4 shadow-2xl">
      <div className="flex items-start justify-between gap-4">
        <div><h2 className="font-semibold">{t("advancedFilters")}</h2><p className="mt-0.5 text-xs text-mutedForeground">{t("advancedFiltersHelp")}</p></div>
        <button aria-label={t("close")} className="rounded-lg p-1.5 hover:bg-muted" onClick={onClose}><X size={15} /></button>
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs">
        <span className="text-mutedForeground">{t("match")}</span>
        <select data-testid="filter-logic" className="rounded-lg border border-border bg-editorBackground px-2 py-1.5" value={config.logic} onChange={(event) => onChange({ ...config, logic: event.target.value as "all" | "any" })}>
          <option value="all">{t("allConditions")}</option>
          <option value="any">{t("anyCondition")}</option>
        </select>
      </div>
      <div className="mt-3 space-y-2">
        {config.conditions.map((condition) => (
          <div key={condition.id} className="grid grid-cols-1 gap-2 rounded-xl border border-border/70 p-2 md:grid-cols-[minmax(0,1fr)_10rem_minmax(0,1fr)_auto]">
            <select aria-label={t("column")} className="min-w-0 rounded-lg border border-border bg-editorBackground px-2 py-1.5 text-xs" value={condition.field} onChange={(event) => updateCondition(condition.id, { field: event.target.value })}>
              <option value="all">{t("allTextFields")}</option>
              <option value="rowType">{t("objectType")}</option>
              <option value="status">{t("status")}</option>
              <option value="priority">{t("priority")}</option>
              <option value="tags">{t("tags")}</option>
              <option value="linkCount">{t("linkCountField")}</option>
              <option value="linkedRequirement">{t("linkedRequirements")}</option>
              <option value="updatedAt">{t("updatedAt")}</option>
              {columns.map((column) => <option key={column.key} value={column.key}>{column.kind === "custom" ? column.labelKey : t(column.labelKey)}</option>)}
            </select>
            <select aria-label={t("operator")} className="rounded-lg border border-border bg-editorBackground px-2 py-1.5 text-xs" value={condition.operator} onChange={(event) => updateCondition(condition.id, { operator: event.target.value as FilterOperator })}>
              <option value="contains">{t("filterContains")}</option>
              <option value="not_contains">{t("filterNotContains")}</option>
              <option value="equals">{t("filterEquals")}</option>
              <option value="not_equals">{t("filterNotEquals")}</option>
              <option value="starts_with">{t("filterStartsWith")}</option>
              <option value="not_starts_with">{t("filterNotStartsWith")}</option>
              <option value="ends_with">{t("filterEndsWith")}</option>
              <option value="one_of">{t("filterOneOf")}</option>
              <option value="matches_regex">{t("filterRegex")}</option>
              <option value="greater_than">{t("filterGreaterThan")}</option>
              <option value="greater_or_equal">{t("filterGreaterOrEqual")}</option>
              <option value="less_than">{t("filterLessThan")}</option>
              <option value="less_or_equal">{t("filterLessOrEqual")}</option>
              <option value="empty">{t("filterEmpty")}</option>
              <option value="not_empty">{t("filterNotEmpty")}</option>
            </select>
            <input aria-label={t("value")} disabled={condition.operator === "empty" || condition.operator === "not_empty"} className="min-w-0 rounded-lg border border-border bg-editorBackground px-2 py-1.5 text-xs disabled:opacity-40" value={condition.value} onChange={(event) => updateCondition(condition.id, { value: event.target.value })} />
            <button aria-label={t("removeFilter")} className="rounded-lg p-2 text-destructive hover:bg-muted" onClick={() => onChange({ ...config, conditions: config.conditions.filter((candidate) => candidate.id !== condition.id) })}><Trash2 size={14} /></button>
          </div>
        ))}
        {config.conditions.length === 0 && <div className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-mutedForeground">{t("noAdvancedFilters")}</div>}
      </div>
      {config.conditions.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{config.conditions.map((condition, index) => <label key={condition.id} className="flex items-center gap-1.5 rounded-lg bg-editorBackground px-2 py-1.5 text-[11px]"><input type="checkbox" checked={condition.caseSensitive === true} onChange={(event) => updateCondition(condition.id, { caseSensitive: event.target.checked })} className="accent-primary" />{t("caseSensitiveCondition", { index: index + 1 })}</label>)}</div>}
      <button data-testid="add-filter-condition" className="mt-3 flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted" onClick={addCondition}><Plus size={13} />{t("addCondition")}</button>
      <div className="mt-4 grid gap-2 border-t border-border pt-3 text-xs sm:grid-cols-3">
        <Toggle checked={config.includeAncestors} label={t("includeAncestors")} onChange={(value) => onChange({ ...config, includeAncestors: value })} />
        <Toggle checked={config.includeDescendants} label={t("includeDescendants")} onChange={(value) => onChange({ ...config, includeDescendants: value })} />
        <Toggle checked={config.highlightMatches} label={t("highlightMatches")} onChange={(value) => onChange({ ...config, highlightMatches: value })} />
      </div>
      <div className="mt-4 flex justify-between">
        <button className="rounded-lg px-3 py-1.5 text-xs text-mutedForeground hover:bg-muted" onClick={() => onChange({ logic: "all", conditions: [], includeAncestors: true, includeDescendants: false, highlightMatches: true })}>{t("clearFilters")}</button>
        <button className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primaryForeground" onClick={onClose}>{t("done")}</button>
      </div>
    </div>
  );
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
  return <label className="flex items-center gap-2 rounded-lg bg-editorBackground px-2.5 py-2"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="accent-primary" /><span>{label}</span></label>;
}
