import { ChevronsDown, ChevronsUp, CornerDownRight, FilePlus2, Filter, IndentDecrease, IndentIncrease, LayoutDashboard, Layers3, Link2, ListPlus, MoreHorizontal, PanelRightOpen, Pin, Plus, Redo2, Replace, Save, Search, SlidersHorizontal, Trash2, Undo2, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { DashboardSummary, OutlineRow, SavedView } from "../lib/api";
import { AdvancedFilterConfig } from "../lib/advancedFilters";
import { GridColumn } from "../lib/columns";
import { AdvancedFilterPopover } from "./AdvancedFilterPopover";

interface ProductivityBarProps {
  columns: GridColumn[];
  query: string;
  rowTypeFilter: OutlineRow["rowType"] | "";
  rowTypeOptions: OutlineRow["rowType"][];
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
  onSaveView: (name: string, scope: "personal" | "team", isDefault: boolean) => void;
  onDeleteView: (id: string) => void;
  onAddObject: () => void;
  onAddObjectBelow: () => void;
  onAddBlankObject: () => void;
  onAddBlankObjectBelow: () => void;
  canAddObjectBelow: boolean;
  canModifySelected: boolean;
  selectedRowType?: OutlineRow["rowType"];
  onIndent: () => void;
  onOutdent: () => void;
  onOpenDetails: () => void;
  onOpenLinks: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onDeleteSelected: () => void;
  onAddTestStep?: () => void;
  onAddTestTemplate?: () => void;
  advancedFilter: AdvancedFilterConfig;
  onAdvancedFilterChange: (config: AdvancedFilterConfig) => void;
  onToggleFindReplace: () => void;
  onToggleTemplates: () => void;
  advancedTargetId?: string;
  showAdvancedControls?: boolean;
  undoDisabled: boolean;
  redoDisabled: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export function ProductivityBar(props: ProductivityBarProps) {
  const { t } = useTranslation();
  const [saveOpen, setSaveOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [scope, setScope] = useState<"personal" | "team">("personal");
  const [isDefault, setIsDefault] = useState(false);
  const [activeViewId, setActiveViewId] = useState("");
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [advancedTarget, setAdvancedTarget] = useState<HTMLElement | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setAdvancedTarget(props.advancedTargetId ? document.getElementById(props.advancedTargetId) : null);
  }, [props.advancedTargetId]);
  useEffect(() => {
    if (!saveOpen && !dashboardOpen && !filterOpen && !overflowOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!barRef.current?.contains(event.target as Node) && !toolbarRef.current?.contains(event.target as Node)) {
        setSaveOpen(false);
        setDashboardOpen(false);
        setFilterOpen(false);
        setOverflowOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSaveOpen(false);
        setDashboardOpen(false);
        setFilterOpen(false);
        setOverflowOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [dashboardOpen, filterOpen, overflowOpen, saveOpen]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!viewName.trim()) return;
    props.onSaveView(viewName.trim(), scope, isDefault);
    setViewName("");
    setIsDefault(false);
    setSaveOpen(false);
  };
  const advancedControls = (
    <div ref={barRef} className="relative min-w-0 flex-1 overflow-visible text-xs">
      <div className="w-full min-w-0 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
      <div className="flex min-w-max items-center gap-1.5 pr-1">
      <label className="flex min-w-40 flex-1 items-center gap-2 rounded-lg border border-border bg-editorBackground px-2.5 py-1.5 xl:max-w-sm">
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
      <button
        data-testid="advanced-filter-toggle"
        className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 hover:bg-muted ${props.advancedFilter.conditions.length > 0 ? "border-primary/40 bg-primary/10 text-primary" : "border-border"}`}
        onClick={() => { setFilterOpen((current) => !current); setSaveOpen(false); setDashboardOpen(false); }}
      >
        <Filter size={13} /><span className="hidden 2xl:inline">{t("filters")}</span>{props.advancedFilter.conditions.length > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] text-primaryForeground">{props.advancedFilter.conditions.length}</span>}
      </button>
      <button data-testid="find-replace-toggle" className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 hover:bg-muted" title={`${t("findReplace")} · Ctrl/Cmd+H`} onClick={props.onToggleFindReplace}><Replace size={13} /><span className="hidden 2xl:inline">{t("findReplace")}</span></button>
      <button data-testid="template-library-toggle" className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 hover:bg-muted" title={t("templateLibrary")} onClick={props.onToggleTemplates}><Layers3 size={13} /><span className="hidden 2xl:inline">{t("templates")}</span></button>
      <select
        data-testid="grid-type-filter"
        aria-label={t("filterByType")}
        className="max-w-40 rounded-lg border border-border bg-editorBackground px-2 py-1.5"
        value={props.rowTypeFilter}
        onChange={(event) => props.onRowTypeFilterChange(event.target.value as OutlineRow["rowType"] | "")}
      >
        <option value="">{t("allObjectTypes")}</option>
        {props.rowTypeOptions.map((rowType) => <option key={rowType} value={rowType}>{t(rowType === "heading" ? "typeHeading" : rowType === "requirement" ? "typeRequirement" : rowType === "test_case" ? "typeTestCase" : rowType === "test_step" ? "typeTestStep" : "typeNote")}</option>)}
      </select>
      <select
        data-testid="grid-sort"
        className="max-w-44 rounded-lg border border-border bg-editorBackground px-2 py-1.5"
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
        className="max-w-36 rounded-lg border border-border bg-editorBackground px-2 py-1.5 2xl:max-w-44"
        value={activeViewId}
        onChange={(event) => {
          const view = props.views.find((candidate) => candidate.id === event.target.value);
          setActiveViewId(event.target.value);
          if (view) props.onApplyView(view);
        }}
      >
        <option value="">{t("savedViews")}</option>
        {props.views.map((view) => <option key={view.id} value={view.id}>{view.isDefault ? "★ " : ""}{view.name} · {t(view.scope === "team" ? "teamView" : "personalView")}</option>)}
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
      </div>
      </div>
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
          <label className="mt-2 flex items-center gap-2 rounded-lg bg-editorBackground px-2.5 py-2 text-xs"><input type="checkbox" checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} className="accent-primary" />{t("makeDefaultView")}</label>
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
      {filterOpen && <AdvancedFilterPopover config={props.advancedFilter} columns={props.columns} onChange={props.onAdvancedFilterChange} onClose={() => setFilterOpen(false)} />}
    </div>
  );
  return (
    <>
      <div ref={toolbarRef} className="relative z-20 min-w-0 border-b border-border bg-surface/90 px-2.5 py-1 text-xs backdrop-blur-xl">
        <div className="overflow-x-auto [scrollbar-width:thin]">
        <div className="flex min-w-max items-center gap-1">
          <ToolbarButton testId="add-object" label={`${t("addObject")} · Insert`} onClick={props.onAddObject}><Plus size={16} /></ToolbarButton>
          <ToolbarButton testId="add-object-below" label={`${t("addObjectBelow")} · Shift+Insert`} disabled={!props.canAddObjectBelow} onClick={props.onAddObjectBelow}><CornerDownRight size={16} /></ToolbarButton>
          {props.onAddTestStep && props.selectedRowType && <ToolbarButton testId="toolbar-add-test-step" label={t("addTestStep")} onClick={props.onAddTestStep}><ListPlus size={16} /></ToolbarButton>}
          <span className="mx-1 h-5 w-px bg-border" />
          <ToolbarButton testId="toolbar-open-details" label={t("openDetails")} disabled={!props.canModifySelected} onClick={props.onOpenDetails}><PanelRightOpen size={16} /></ToolbarButton>
          <ToolbarButton testId="toolbar-open-links" label={t("openLinks")} disabled={!props.canModifySelected} onClick={props.onOpenLinks}><Link2 size={16} /></ToolbarButton>
          <ToolbarButton testId="toolbar-more" label={t("moreActions")} onClick={() => setOverflowOpen((current) => !current)}><MoreHorizontal size={16} /></ToolbarButton>
        </div>
        </div>
        {overflowOpen && <div data-testid="toolbar-overflow" className="absolute left-2 top-full z-50 mt-1 grid w-64 grid-cols-2 gap-1 rounded-xl border border-border bg-surfaceElevated p-2 shadow-2xl" onClick={() => setOverflowOpen(false)}>
          <OverflowAction testId="add-blank-object" label={t("addBlankObjectHelp")} onClick={props.onAddBlankObject}><FilePlus2 size={14} /></OverflowAction>
          <OverflowAction testId="add-blank-object-below" label={t("addBlankObjectBelowHelp")} disabled={!props.canAddObjectBelow} onClick={props.onAddBlankObjectBelow}><FilePlus2 size={14} /></OverflowAction>
          {props.onAddTestTemplate && <OverflowAction testId="toolbar-add-test-template" label={t("addTestTemplate")} onClick={props.onAddTestTemplate}><Layers3 size={14} /></OverflowAction>}
          <OverflowAction testId="toolbar-indent" label={t("indent")} disabled={!props.canModifySelected} onClick={props.onIndent}><IndentIncrease size={14} /></OverflowAction>
          <OverflowAction testId="toolbar-outdent" label={t("outdent")} disabled={!props.canModifySelected} onClick={props.onOutdent}><IndentDecrease size={14} /></OverflowAction>
          <OverflowAction testId="expand-all" label={t("expandAllGroups")} onClick={props.onExpandAll}><ChevronsDown size={14} /></OverflowAction>
          <OverflowAction testId="collapse-all" label={t("collapseAllGroups")} onClick={props.onCollapseAll}><ChevronsUp size={14} /></OverflowAction>
          <OverflowAction testId="undo-action" label={`${t("undoLastChange")} · Ctrl/Cmd+Z`} disabled={props.undoDisabled} onClick={props.onUndo}><Undo2 size={14} /></OverflowAction>
          <OverflowAction testId="redo-action" label={`${t("redoLastChange")} · Ctrl/Cmd+Shift+Z`} disabled={props.redoDisabled} onClick={props.onRedo}><Redo2 size={14} /></OverflowAction>
          <OverflowAction testId="toolbar-delete" label={t("deleteAction")} disabled={!props.canModifySelected} danger onClick={props.onDeleteSelected}><Trash2 size={14} /></OverflowAction>
        </div>}
      </div>
      {(props.showAdvancedControls ?? true) && (advancedTarget ? createPortal(advancedControls, advancedTarget) : advancedControls)}
    </>
  );
}

function OverflowAction({ testId, label, disabled, danger, onClick, children }: { testId: string; label: string; disabled?: boolean; danger?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" data-testid={testId} disabled={disabled} className={`flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-35 ${danger ? "text-destructive" : "text-foreground"}`} onClick={onClick}>{children}<span className="truncate">{label}</span></button>;
}

function ToolbarButton({ testId, label, disabled, danger, onClick, children }: { testId: string; label: string; disabled?: boolean; danger?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      data-testid={testId}
      title={label}
      aria-label={label}
      disabled={disabled}
      className={`rounded-lg p-2 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-35 ${danger ? "text-destructive" : "text-mutedForeground hover:text-foreground"}`}
      onClick={onClick}
    >
      {children}
    </button>
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
