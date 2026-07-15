import { CornerDownRight, LayoutDashboard, Pin, Plus, Save, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DashboardSummary, OutlineRow, SavedView } from "../lib/api";
import { GridColumn } from "../lib/columns";

interface ProductivityBarProps {
  columns: GridColumn[];
  query: string;
  rowTypeFilter: OutlineRow["rowType"] | "";
  sortKey: string;
  sortDirection: "asc" | "desc";
  frozenCount: number;
  views: SavedView[];
  dashboard?: DashboardSummary;
  onQueryChange: (value: string) => void;
  onRowTypeFilterChange: (value: OutlineRow["rowType"] | "") => void;
  onSortChange: (key: string, direction: "asc" | "desc") => void;
  onFrozenCountChange: (count: number) => void;
  onApplyView: (view: SavedView) => void;
  onSaveView: (name: string, scope: "personal" | "team") => void;
  onDeleteView: (id: string) => void;
  onAddObject: () => void;
  onAddObjectBelow: () => void;
  onAddBlankObject: () => void;
  onAddBlankObjectBelow: () => void;
  canAddObjectBelow: boolean;
}

export function ProductivityBar(props: ProductivityBarProps) {
  const { t } = useTranslation();
  const [saveOpen, setSaveOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [scope, setScope] = useState<"personal" | "team">("personal");
  const [activeViewId, setActiveViewId] = useState("");
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!saveOpen && !dashboardOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!barRef.current?.contains(event.target as Node)) {
        setSaveOpen(false);
        setDashboardOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSaveOpen(false);
        setDashboardOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [dashboardOpen, saveOpen]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!viewName.trim()) return;
    props.onSaveView(viewName.trim(), scope);
    setViewName("");
    setSaveOpen(false);
  };
  return (
    <div ref={barRef} className="relative z-20 flex flex-wrap items-center gap-2 border-b border-border bg-surface/90 px-3 py-2 text-xs backdrop-blur-xl">
      <div className="flex items-center rounded-lg border border-border bg-editorBackground p-0.5">
        <button
          data-testid="add-object"
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 font-medium hover:bg-muted"
          title={`${t("addObject")} · Insert`}
          onClick={props.onAddObject}
        >
          <Plus size={14} />
          {t("addObject")}
        </button>
        <button
          data-testid="add-blank-object"
          className="border-l border-border px-2 py-1.5 text-mutedForeground hover:bg-muted hover:text-foreground"
          title={t("addBlankObjectHelp")}
          onClick={props.onAddBlankObject}
        >
          {t("blankObject")}
        </button>
        <button
          data-testid="add-object-below"
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          title={`${t("addObjectBelow")} · Shift+Insert`}
          disabled={!props.canAddObjectBelow}
          onClick={props.onAddObjectBelow}
        >
          <CornerDownRight size={14} />
          {t("addObjectBelow")}
        </button>
        <button
          data-testid="add-blank-object-below"
          className="border-l border-border px-2 py-1.5 text-mutedForeground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          title={t("addBlankObjectBelowHelp")}
          disabled={!props.canAddObjectBelow}
          onClick={props.onAddBlankObjectBelow}
        >
          {t("blankObject")}
        </button>
      </div>
      <label className="flex min-w-52 flex-1 items-center gap-2 rounded-lg border border-border bg-editorBackground px-2.5 py-1.5">
        <Search size={14} className="text-mutedForeground" />
        <input
          data-testid="grid-search"
          className="min-w-0 flex-1 bg-transparent outline-none"
          value={props.query}
          placeholder={t("advancedSearch")}
          onChange={(event) => props.onQueryChange(event.target.value)}
        />
        {props.query && (
          <button aria-label={t("clearSearch")} onClick={() => props.onQueryChange("")}>
            <X size={13} />
          </button>
        )}
      </label>
      <select
        data-testid="grid-type-filter"
        aria-label={t("filterByType")}
        className="rounded-lg border border-border bg-editorBackground px-2 py-1.5"
        value={props.rowTypeFilter}
        onChange={(event) => props.onRowTypeFilterChange(event.target.value as OutlineRow["rowType"] | "")}
      >
        <option value="">{t("allObjectTypes")}</option>
        <option value="heading">{t("typeHeading")}</option>
        <option value="requirement">{t("typeRequirement")}</option>
        <option value="test_step">{t("typeTestStep")}</option>
        <option value="note">{t("typeNote")}</option>
      </select>
      <select
        data-testid="grid-sort"
        className="rounded-lg border border-border bg-editorBackground px-2 py-1.5"
        value={props.sortKey}
        onChange={(event) => props.onSortChange(event.target.value, props.sortDirection)}
      >
        <option value="">{t("outlineOrder")}</option>
        {props.columns.map((column) => (
          <option key={column.key} value={column.key}>{column.kind === "custom" ? column.labelKey : t(column.labelKey)}</option>
        ))}
      </select>
      <button
        data-testid="sort-direction"
        className="rounded-lg border border-border px-2 py-1.5 hover:bg-muted"
        onClick={() => props.onSortChange(props.sortKey, props.sortDirection === "asc" ? "desc" : "asc")}
      >
        {props.sortDirection === "asc" ? "A-Z" : "Z-A"}
      </button>
      <label className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5">
        <Pin size={13} />
        <span>{t("frozenColumns")}</span>
        <select
          data-testid="frozen-columns"
          className="bg-transparent outline-none"
          value={props.frozenCount}
          onChange={(event) => props.onFrozenCountChange(Number(event.target.value))}
        >
          {Array.from({ length: Math.min(5, props.columns.length) + 1 }, (_, index) => (
            <option key={index} value={index}>{index}</option>
          ))}
        </select>
      </label>
      <select
        data-testid="saved-view-select"
        className="max-w-44 rounded-lg border border-border bg-editorBackground px-2 py-1.5"
        value={activeViewId}
        onChange={(event) => {
          const view = props.views.find((candidate) => candidate.id === event.target.value);
          setActiveViewId(event.target.value);
          if (view) props.onApplyView(view);
        }}
      >
        <option value="">{t("savedViews")}</option>
        {props.views.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}
      </select>
      {activeViewId && <button className="rounded-lg border border-border p-1.5 text-destructive hover:bg-muted" title={t("deleteView")} onClick={() => { props.onDeleteView(activeViewId); setActiveViewId(""); }}><Trash2 size={14} /></button>}
      <button className="rounded-lg border border-border p-1.5 hover:bg-muted" title={t("saveView")} onClick={() => { setSaveOpen((current) => !current); setDashboardOpen(false); }}>
        <Save size={14} />
      </button>
      <button
        data-testid="dashboard-toggle"
        className="rounded-lg border border-border p-1.5 hover:bg-muted"
        title={t("dashboard")}
        onClick={() => { setDashboardOpen((current) => !current); setSaveOpen(false); }}
      >
        <LayoutDashboard size={14} />
      </button>
      {saveOpen && (
        <form className="absolute right-3 top-full z-40 mt-1 w-72 rounded-xl border border-border bg-surfaceElevated p-3 shadow-2xl" onSubmit={submit}>
          <div className="mb-2 flex items-center gap-2 font-medium"><SlidersHorizontal size={14} />{t("saveView")}</div>
          <input
            autoFocus
            data-testid="saved-view-name"
            className="w-full rounded-lg border border-border bg-editorBackground px-2.5 py-1.5"
            value={viewName}
            placeholder={t("viewName")}
            onChange={(event) => setViewName(event.target.value)}
          />
          <select className="mt-2 w-full rounded-lg border border-border bg-editorBackground px-2.5 py-1.5" value={scope} onChange={(event) => setScope(event.target.value as "personal" | "team")}>
            <option value="personal">{t("personalView")}</option>
            <option value="team">{t("teamView")}</option>
          </select>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="rounded-lg px-2.5 py-1.5 hover:bg-muted" onClick={() => setSaveOpen(false)}>{t("cancel")}</button>
            <button data-testid="saved-view-submit" className="rounded-lg bg-primary px-2.5 py-1.5 text-primaryForeground" disabled={!viewName.trim()}>{t("save")}</button>
          </div>
        </form>
      )}
      {dashboardOpen && props.dashboard && (
        <div data-testid="dashboard-widgets" className="absolute right-3 top-full z-40 mt-1 grid w-[34rem] grid-cols-3 gap-2 rounded-xl border border-border bg-surfaceElevated p-3 shadow-2xl">
          <Widget label={t("qualityScore")} value={`${props.dashboard.qualityScore}%`} />
          <Widget label={t("coverageReport")} value={`${props.dashboard.coveredRequirements}/${props.dashboard.requirements}`} />
          <Widget label={t("suspectLinks")} value={props.dashboard.suspectLinks} />
          <Widget label={t("incompleteTests")} value={props.dashboard.incompleteTests} />
          <Widget label={t("passedExecutions")} value={props.dashboard.executions.passed} />
          <Widget label={t("failedExecutions")} value={props.dashboard.executions.failed} />
        </div>
      )}
    </div>
  );
}

function Widget({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-editorBackground p-3">
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] text-mutedForeground">{label}</div>
    </div>
  );
}
