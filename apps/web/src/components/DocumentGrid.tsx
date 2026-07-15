import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Link2, Settings2, Trash2, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError, DashboardSummary, DocumentType, FieldDefinition, OutlineRow, SavedView } from "../lib/api";
import { cellValue, columnsForDocument, GridColumn, isCellEditable, totalWidth } from "../lib/columns";
import { insertOptions } from "../lib/outline";
import { useColumnStore } from "../stores/columns";
import { useSelectionStore } from "../stores/selection";
import { useToastStore } from "../stores/toasts";
import { ContextMenu, MenuItem } from "./ContextMenu";
import { BulkActionInput, BulkActionsDialog } from "./BulkActionsDialog";
import { ProductivityBar } from "./ProductivityBar";

interface GridProps {
  documentId: string;
  documentType: Exclude<DocumentType, "general_document">;
}

interface MenuState {
  x: number;
  y: number;
  row: OutlineRow | null;
}

interface EditState {
  rowId: string;
  columnKey: string;
  value: string;
}

const rowTypeLabelKeys: Record<OutlineRow["rowType"], string> = {
  heading: "typeHeading",
  requirement: "typeRequirement",
  test_case: "typeTestCase",
  test_step: "typeTestStep",
  note: "typeNote",
};

function buildPatchPayload(column: GridColumn, row: OutlineRow, value: string): Record<string, unknown> {
  const base = { expectedVersion: row.version };
  switch (column.kind) {
    case "title":
      return { ...base, title: value };
    case "description":
      return { ...base, description: value };
    case "requirementNo":
      return { ...base, requirementDetail: { requirementNo: value || null } };
    case "action":
      return { ...base, testStepDetail: { action: value } };
    case "expectedResult":
      return { ...base, testStepDetail: { expectedResult: value } };
    case "testResult":
      return { ...base, testStepDetail: { testResult: value } };
    case "custom":
      return { ...base, customFields: { [column.fieldKey as string]: coerceCustom(column, value) } };
    default:
      return base;
  }
}

function coerceCustom(column: GridColumn, value: string): unknown {
  const type = column.field?.fieldType;
  if (value === "") return null;
  if (type === "integer") return parseInt(value, 10);
  if (type === "decimal") return Number(value);
  if (type === "boolean") return value === "true";
  if (type === "multi_select") return value.split(",").map((v) => v.trim()).filter(Boolean);
  return value;
}

export function DocumentGrid({ documentId, documentType }: GridProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const setSelectedRow = useSelectionStore((s) => s.setRow);
  const selectOnly = useSelectionStore((s) => s.selectOnly);
  const toggleRow = useSelectionStore((s) => s.toggleRow);
  const selectRange = useSelectionStore((s) => s.selectRange);
  const selectAll = useSelectionStore((s) => s.selectAll);
  const clearRows = useSelectionStore((s) => s.clearRows);
  const openDetail = useSelectionStore((s) => s.openDetail);
  const selectedRowId = useSelectionStore((s) => s.selectedRowId);
  const selectedRowIds = useSelectionStore((s) => s.selectedRowIds);
  const isHidden = useColumnStore((s) => s.isHidden);
  const widthOf = useColumnStore((s) => s.widthOf);
  const setWidth = useColumnStore((s) => s.setWidth);
  const storedWidths = useColumnStore((s) => s.widths[documentId]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkActionsOpen, setBulkActionsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [frozenCount, setFrozenCount] = useState(1);
  const [viewVisibleColumns, setViewVisibleColumns] = useState<string[] | null>(null);
  const [linkProjection, setLinkProjection] = useState({
    fields: ["requirementNo", "title"],
    separator: " : ",
    sortBy: "requirementNo",
  });

  const outlineKey = ["outline", documentId];
  const { data: rows = [], isLoading } = useQuery({
    queryKey: outlineKey,
    queryFn: () => api<OutlineRow[]>(`/documents/${documentId}/outline`),
  });
  const { data: fields = [] } = useQuery({
    queryKey: ["fields", documentId],
    queryFn: () => api<FieldDefinition[]>(`/documents/${documentId}/fields`),
  });
  const { data: savedViews = [] } = useQuery({
    queryKey: ["saved-views", documentId],
    queryFn: () => api<SavedView[]>(`/documents/${documentId}/views`),
  });
  const { data: dashboard } = useQuery({
    queryKey: ["dashboard", documentId],
    queryFn: () => api<DashboardSummary>(`/documents/${documentId}/dashboard`),
  });

  const columns = useMemo(
    () =>
      columnsForDocument(documentType, fields)
        .filter((c) => !isHidden(documentId, c.key))
        .filter((c) => viewVisibleColumns === null || viewVisibleColumns.includes(c.key))
        .map((c) => ({ ...c, width: storedWidths?.[c.key] ?? c.width })),
    [documentType, fields, isHidden, documentId, storedWidths, viewVisibleColumns],
  );
  const displayedRows = useMemo(() => {
    const normalized = searchQuery.trim().toLocaleLowerCase();
    const filtered = normalized
      ? rows.filter((row) =>
          [
            row.displayNumber,
            row.requirementNo ?? "",
            row.title,
            row.description ?? "",
            row.action ?? "",
            row.expectedResult ?? "",
            row.testResult ?? "",
            JSON.stringify(row.customFields),
            ...(row.linkedRequirements ?? []).flatMap((linked) => [linked.requirementNo ?? "", linked.title, linked.description ?? ""]),
          ].some((value) => value.toLocaleLowerCase().includes(normalized)),
        )
      : rows;
    if (!sortKey) return filtered;
    const column = columns.find((candidate) => candidate.key === sortKey);
    if (!column) return filtered;
    return [...filtered].sort((a, b) => {
      const compared = cellValue(column, a).localeCompare(cellValue(column, b), undefined, { numeric: true, sensitivity: "base" });
      return sortDirection === "asc" ? compared : -compared;
    });
  }, [rows, searchQuery, sortKey, sortDirection, columns]);
  const template = columns.map((c) => `${c.width}px`).join(" ");
  const gridWidth = `${parseInt(totalWidth(columns), 10) + 40}px`;
  const gridTemplate = `40px ${template}`;
  const frozenOffsets = columns.map((_, index) => 40 + columns.slice(0, index).reduce((sum, column) => sum + column.width + 8, 0));
  const selectedRootRowIds = useMemo(() => {
    const selected = new Set(selectedRowIds);
    const byId = new Map(rows.map((row) => [row.id, row]));
    return selectedRowIds.filter((rowId) => {
      let parentId = byId.get(rowId)?.parentId;
      while (parentId) {
        if (selected.has(parentId)) return false;
        parentId = byId.get(parentId)?.parentId;
      }
      return true;
    });
  }, [rows, selectedRowIds]);

  const virtualizer = useVirtualizer({
    count: displayedRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 48,
    overscan: 20,
    initialRect: { width: 1000, height: 600 },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: outlineKey });

  const handleMutationError = (error: unknown) => {
    pushToast("error", error instanceof ApiError && error.status === 409 ? t("conflictError") : t("genericError"));
    void invalidate();
  };

  const saveView = useMutation({
    mutationFn: (input: { name: string; scope: "personal" | "team" }) =>
      api<SavedView>(`/documents/${documentId}/views`, {
        method: "POST",
        body: JSON.stringify({
          ...input,
          filters: searchQuery ? [{ field: "all", operator: "contains", value: searchQuery }] : [],
          sorting: sortKey ? [{ field: sortKey, direction: sortDirection }] : [],
          visibleColumns: columns.map((column) => column.key),
          frozenColumns: columns.slice(0, frozenCount).map((column) => column.key),
          linkProjection,
          isDefault: false,
        }),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["saved-views", documentId] }),
    onError: handleMutationError,
  });

  const deleteView = useMutation({
    mutationFn: (viewId: string) => api(`/views/${viewId}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["saved-views", documentId] }),
    onError: handleMutationError,
  });

  const applyView = (view: SavedView) => {
    const filter = view.filters[0];
    setSearchQuery(typeof filter?.value === "string" ? filter.value : "");
    const sorting = view.sorting[0];
    setSortKey(typeof sorting?.field === "string" ? sorting.field : "");
    setSortDirection(sorting?.direction === "desc" ? "desc" : "asc");
    setViewVisibleColumns(view.visibleColumns.length > 0 ? view.visibleColumns : null);
    setFrozenCount(view.frozenColumns.length);
    setLinkProjection({
      fields: view.linkProjection.fields ?? ["requirementNo", "title"],
      separator: view.linkProjection.separator ?? " : ",
      sortBy: view.linkProjection.sortBy ?? "requirementNo",
    });
  };

  const createRow = useMutation({
    mutationFn: (input: { parentId: string | null; afterRowId?: string; rowType: OutlineRow["rowType"] }) =>
      api<OutlineRow>(`/documents/${documentId}/rows`, {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ ...input, title: "" }),
      }),
    onSettled: invalidate,
    onError: handleMutationError,
  });

  const saveCell = useMutation({
    mutationFn: (input: { column: GridColumn; row: OutlineRow; value: string }) =>
      api<OutlineRow>(`/rows/${input.row.id}`, {
        method: "PATCH",
        body: JSON.stringify(buildPatchPayload(input.column, input.row, input.value)),
      }),
    onSettled: invalidate,
    onError: handleMutationError,
  });

  const moveRow = useMutation({
    mutationFn: (input: { row: OutlineRow; newParentId: string | null; afterRowId?: string }) =>
      api<OutlineRow>(`/rows/${input.row.id}/move`, {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({
          newParentId: input.newParentId,
          afterRowId: input.afterRowId,
          expectedVersion: input.row.version,
        }),
      }),
    onSettled: invalidate,
    onError: handleMutationError,
  });

  const deleteRow = useMutation({
    mutationFn: (row: OutlineRow) => api(`/rows/${row.id}`, { method: "DELETE", body: JSON.stringify({}) }),
    onSettled: invalidate,
    onError: handleMutationError,
  });

  const deleteRows = useMutation({
    mutationFn: async (rowIds: string[]) => {
      for (const rowId of rowIds) {
        await api(`/rows/${rowId}`, { method: "DELETE", body: JSON.stringify({}) });
      }
    },
    onSuccess: () => {
      clearRows();
      setConfirmBulkDelete(false);
    },
    onSettled: invalidate,
    onError: handleMutationError,
  });

  const runBulkAction = useMutation({
    mutationFn: async (input: BulkActionInput) => {
      if (input.action === "copy") {
        return api(`/documents/${documentId}/rows/copy`, {
          method: "POST",
          body: JSON.stringify({ rowIds: selectedRootRowIds, newParentId: input.targetId ?? null }),
        });
      }
      if (input.action === "link") {
        if (!input.targetId) throw new Error("target required");
        for (const rowId of selectedRowIds) {
          await api(`/rows/${rowId}/links`, {
            method: "POST",
            body: JSON.stringify({ targetRowId: input.targetId, linkType: "relates_to" }),
          });
        }
        return;
      }
      if (input.action === "move") {
        for (const rowId of selectedRootRowIds) {
          const row = rows.find((candidate) => candidate.id === rowId);
          if (row) {
            await api(`/rows/${row.id}/move`, {
              method: "POST",
              headers: { "idempotency-key": crypto.randomUUID() },
              body: JSON.stringify({ newParentId: input.targetId ?? null, expectedVersion: row.version }),
            });
          }
        }
        return;
      }
      const column = columns.find((candidate) => candidate.key === input.field);
      if (!column) return;
      for (const rowId of selectedRowIds) {
        const row = rows.find((candidate) => candidate.id === rowId);
        if (row && isCellEditable(column, row)) {
          await api(`/rows/${row.id}`, {
            method: "PATCH",
            body: JSON.stringify(buildPatchPayload(column, row, input.value ?? "")),
          });
        }
      }
    },
    onSuccess: () => {
      setBulkActionsOpen(false);
      clearRows();
      void invalidate();
      void queryClient.invalidateQueries({ queryKey: ["dashboard", documentId] });
    },
    onError: handleMutationError,
  });

  const indent = (row: OutlineRow) => {
    const siblings = rows.filter((r) => r.parentId === row.parentId);
    const index = siblings.findIndex((r) => r.id === row.id);
    const previousSibling = index > 0 ? siblings[index - 1] : undefined;
    if (previousSibling) moveRow.mutate({ row, newParentId: previousSibling.id });
  };

  const outdent = (row: OutlineRow) => {
    if (!row.parentId) return;
    const parent = rows.find((r) => r.id === row.parentId);
    if (parent) moveRow.mutate({ row, newParentId: parent.parentId, afterRowId: parent.id });
  };

  const menuItems = (row: OutlineRow | null): MenuItem[] => {
    const addUnder = (rowType: OutlineRow["rowType"], parentId: string | null, afterRowId?: string) =>
      createRow.mutate({ parentId, afterRowId, rowType });
    if (!row) {
      return [
        { key: "heading", label: t("addHeading"), onSelect: () => addUnder("heading", null) },
        documentType === "requirement"
          ? { key: "requirement", label: t("addRequirement"), onSelect: () => addUnder("requirement", null) }
          : { key: "testCase", label: t("addTestCase"), onSelect: () => addUnder("test_case", null) },
      ];
    }
    const sections = insertOptions(rows, row, documentType).map((option, index) => ({
      key: index === 0 ? "child" : index === 1 ? "siblingBelow" : `insert-${option.number}`,
      label: t("insertSection", { number: option.number, type: t(rowTypeLabelKeys[option.rowType]) }),
      onSelect: () => addUnder(option.rowType, option.parentId, option.afterRowId),
    }));
    return [
      {
        key: "detail",
        label: t("openDetails"),
        onSelect: () => {
          openDetail(row.id);
          void queryClient.invalidateQueries({ queryKey: ["row", row.id] });
        },
      },
      ...sections,
      ...(row.rowType === "heading"
        ? [
            { key: "subheading", label: t("addSubheading"), onSelect: () => addUnder("heading", row.id) },
            documentType === "requirement"
              ? { key: "requirement", label: t("addRequirement"), onSelect: () => addUnder("requirement", row.id) }
              : { key: "testCase", label: t("addTestCase"), onSelect: () => addUnder("test_case", row.id) },
          ]
        : []),
      ...(row.rowType === "test_case"
        ? [{ key: "testStep", label: t("addTestStep"), onSelect: () => addUnder("test_step", row.id) }]
        : []),
      { key: "heading", label: t("addHeadingBelow"), onSelect: () => addUnder("heading", row.parentId, row.id) },
      { key: "indent", label: t("indent"), onSelect: () => indent(row) },
      { key: "outdent", label: t("outdent"), onSelect: () => outdent(row) },
      { key: "delete", label: t("deleteAction"), danger: true, onSelect: () => deleteRow.mutate(row) },
    ];
  };

  const moveSelection = (offset: number) => {
    const index = displayedRows.findIndex((r) => r.id === selectedRowId);
    const next = displayedRows[index === -1 ? (offset > 0 ? 0 : displayedRows.length - 1) : index + offset];
    if (next) {
      setSelectedRow(next.id);
      virtualizer.scrollToIndex(displayedRows.indexOf(next));
    }
  };

  const commitEdit = (row: OutlineRow, column: GridColumn, explicitValue?: string) => {
    const value = explicitValue ?? editing?.value;
    if (value !== undefined && value !== cellValue(column, row)) {
      saveCell.mutate({ column, row, value });
    }
    setEditing(null);
  };

  if (isLoading) {
    return <div className="p-6 text-sm text-mutedForeground">{t("loading")}</div>;
  }

  return (
    <div className="relative flex h-full flex-col bg-editorBackground">
      <ProductivityBar
        columns={columns}
        query={searchQuery}
        sortKey={sortKey}
        sortDirection={sortDirection}
        frozenCount={frozenCount}
        views={savedViews}
        dashboard={dashboard}
        onQueryChange={setSearchQuery}
        onSortChange={(key, direction) => {
          setSortKey(key);
          setSortDirection(direction);
        }}
        onFrozenCountChange={setFrozenCount}
        onApplyView={applyView}
        onSaveView={(name, scope) => saveView.mutate({ name, scope })}
        onDeleteView={(id) => deleteView.mutate(id)}
      />
      {selectedRowIds.length > 1 && (
        <div className="flex items-center gap-3 border-b border-border bg-surface/95 px-4 py-2 text-sm shadow-sm backdrop-blur-xl">
          <span className="font-medium">{t("selectedRows", { count: selectedRowIds.length })}</span>
          <button className="rounded-md px-2 py-1 text-mutedForeground hover:bg-muted" onClick={clearRows}>
            {t("clearSelection")}
          </button>
          <button
            data-testid="bulk-actions"
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-mutedForeground hover:bg-muted"
            onClick={() => setBulkActionsOpen(true)}
          >
            <Settings2 size={14} />
            {t("bulkActions")}
          </button>
          <button
            data-testid="bulk-delete"
            className="ml-auto flex items-center gap-1.5 rounded-md px-2 py-1 text-destructive hover:bg-destructive/10"
            onClick={() => setConfirmBulkDelete(true)}
          >
            <Trash2 size={14} />
            {t("deleteSelected")}
          </button>
        </div>
      )}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto"
        tabIndex={0}
        onKeyDown={(event) => {
          if (editing || event.target !== event.currentTarget) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            moveSelection(1);
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            moveSelection(-1);
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          setMenu({ x: event.clientX, y: event.clientY, row: null });
        }}
      >
        <div
          role="row"
          className="sticky top-0 z-10 grid gap-2 border-b border-border bg-surface/95 px-4 text-xs font-medium uppercase tracking-wide text-mutedForeground backdrop-blur-xl"
          style={{ gridTemplateColumns: gridTemplate, width: gridWidth }}
        >
          <div role="columnheader" className="sticky left-0 z-20 flex items-center justify-center bg-surface/95">
            <input
              type="checkbox"
              data-testid="select-all-rows"
              aria-label={t("selectAllRows")}
              checked={displayedRows.length > 0 && displayedRows.every((row) => selectedRowIds.includes(row.id))}
              onChange={(event) => (event.target.checked ? selectAll(displayedRows.map((row) => row.id)) : clearRows())}
              className="h-4 w-4 rounded border-border accent-primary"
            />
          </div>
          {columns.map((column, columnIndex) => (
            <div
              role="columnheader"
              key={column.key}
              className={`relative flex items-center gap-1 overflow-hidden py-2 pr-2 ${columnIndex < frozenCount ? "sticky z-20 bg-surface/95" : ""}`}
              style={columnIndex < frozenCount ? { left: frozenOffsets[columnIndex] } : undefined}
            >
              <span className="truncate">{column.kind === "custom" ? column.labelKey : t(column.labelKey)}</span>
              <div
                role="separator"
                aria-orientation="vertical"
                data-testid={`col-resize-${column.key}`}
                className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize hover:bg-primary"
                onPointerDown={(event) => {
                  event.preventDefault();
                  const startX = event.clientX;
                  const startWidth = widthOf(documentId, column.key) ?? column.width;
                  const move = (e: PointerEvent) => setWidth(documentId, column.key, startWidth + e.clientX - startX);
                  const up = () => {
                    window.removeEventListener("pointermove", move);
                    window.removeEventListener("pointerup", up);
                  };
                  window.addEventListener("pointermove", move);
                  window.addEventListener("pointerup", up);
                }}
              />
            </div>
          ))}
        </div>
        {displayedRows.length === 0 ? (
          <div data-testid="grid-empty" className="p-6 text-sm text-mutedForeground">
            {t("emptyDocument")}
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: gridWidth }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = displayedRows[virtualRow.index];
              if (!row) return null;
              return (
                <div
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  key={row.id}
                  data-testid={`grid-row-${row.displayNumber}`}
                  draggable={editing?.rowId !== row.id}
                  className={`absolute left-0 grid min-h-12 items-stretch gap-2 border-b border-border px-4 py-1.5 text-sm transition-colors hover:bg-muted/70 ${
                    selectedRowIds.includes(row.id) ? "bg-selection" : ""
                  }`}
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                    gridTemplateColumns: gridTemplate,
                    width: gridWidth,
                    zIndex: editing?.rowId === row.id ? 20 : 0,
                  }}
                  onClick={(event) => {
                    if (event.shiftKey) selectRange(displayedRows.map((candidate) => candidate.id), row.id);
                    else if (event.metaKey || event.ctrlKey) toggleRow(row.id);
                    else selectOnly(row.id);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setMenu({ x: event.clientX, y: event.clientY, row });
                  }}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("application/x-docsys-row", row.id);
                  }}
                  onDragOver={(event) => {
                    if (event.dataTransfer.types.includes("application/x-docsys-row")) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const draggedId = event.dataTransfer.getData("application/x-docsys-row");
                    const dragged = rows.find((candidate) => candidate.id === draggedId);
                    if (dragged && dragged.id !== row.id) moveRow.mutate({ row: dragged, newParentId: row.parentId, afterRowId: row.id });
                  }}
                >
                  <div className="sticky left-0 z-10 flex items-center justify-center bg-inherit">
                    <input
                      type="checkbox"
                      data-testid={`select-row-${row.displayNumber}`}
                      aria-label={t("selectRowId", { id: row.displayNumber })}
                      checked={selectedRowIds.includes(row.id)}
                      onChange={() => toggleRow(row.id)}
                      onClick={(event) => event.stopPropagation()}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                  </div>
                  {columns.map((column, columnIndex) => (
                    <div
                      key={column.key}
                      className={columnIndex < frozenCount ? "sticky z-10 bg-inherit" : ""}
                      style={columnIndex < frozenCount ? { left: frozenOffsets[columnIndex] } : undefined}
                    >
                      <GridCell
                        column={column}
                        row={row}
                        editing={editing?.rowId === row.id && editing.columnKey === column.key ? editing : null}
                        linkProjection={linkProjection}
                        onStartEdit={() =>
                          isCellEditable(column, row) &&
                          setEditing({ rowId: row.id, columnKey: column.key, value: cellValue(column, row) })
                        }
                        onChange={(value) => setEditing({ rowId: row.id, columnKey: column.key, value })}
                        onCommit={(value) => commitEdit(row, column, value)}
                        onCancel={() => setEditing(null)}
                      />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.row)} onClose={() => setMenu(null)} />}
      {confirmBulkDelete && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-xl border border-border bg-surfaceElevated p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold">{t("deleteSelected")}</h2>
                <p className="mt-1 text-sm text-mutedForeground">{t("deleteSelectedConfirm", { count: selectedRowIds.length })}</p>
              </div>
              <button aria-label={t("close")} className="rounded-md p-1 hover:bg-muted" onClick={() => setConfirmBulkDelete(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-md px-3 py-1.5 text-sm hover:bg-muted" onClick={() => setConfirmBulkDelete(false)}>
                {t("cancel")}
              </button>
              <button
                data-testid="bulk-delete-confirm"
                className="rounded-md bg-destructive px-3 py-1.5 text-sm text-white"
                onClick={() => deleteRows.mutate(selectedRootRowIds)}
              >
                {t("deleteAction")}
              </button>
            </div>
          </div>
        </div>
      )}
      {bulkActionsOpen && (
        <BulkActionsDialog
          count={selectedRowIds.length}
          columns={columns}
          onClose={() => setBulkActionsOpen(false)}
          onSubmit={(input) => runBulkAction.mutate(input)}
        />
      )}
    </div>
  );
}

function GridCell({
  column,
  row,
  editing,
  linkProjection,
  onStartEdit,
  onChange,
  onCommit,
  onCancel,
}: {
  column: GridColumn;
  row: OutlineRow;
  editing: EditState | null;
  linkProjection: { fields: string[]; separator: string; sortBy: string };
  onStartEdit: () => void;
  onChange: (value: string) => void;
  onCommit: (value?: string) => void;
  onCancel: () => void;
}) {
  if (column.kind === "number") {
    return (
      <span className="flex items-center gap-1.5 self-center tabular-nums text-mutedForeground">
        {row.displayNumber}
        {(row.linkCount ?? 0) > 0 && (
          <span className="flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary" title={String(row.linkCount ?? 0)}>
            <Link2 size={10} />
            {row.linkCount ?? 0}
          </span>
        )}
      </span>
    );
  }
  const editable = isCellEditable(column, row);
  const display = column.kind === "linkedRequirements"
    ? [...row.linkedRequirements]
        .sort((a, b) => String(a[linkProjection.sortBy as keyof typeof a] ?? "").localeCompare(String(b[linkProjection.sortBy as keyof typeof b] ?? ""), undefined, { numeric: true }))
        .map((linked) => linkProjection.fields.map((field) => String(linked[field as keyof typeof linked] ?? "")).filter(Boolean).join(linkProjection.separator))
        .join("\n")
    : cellValue(column, row);

  if (editing) {
    if (column.kind === "custom" && (column.field?.fieldType === "single_select" || column.field?.fieldType === "multi_select")) {
      return (
        <ChoiceEditor
          value={editing.value}
          options={column.field.allowedValues}
          multiple={column.field.fieldType === "multi_select"}
          onCancel={onCancel}
          onSave={onCommit}
        />
      );
    }
    const multiline =
      column.kind === "description" ||
      column.kind === "action" ||
      column.kind === "expectedResult" ||
      column.kind === "testResult" ||
      column.field?.fieldType === "long_text";
    if (multiline) {
      return (
        <textarea
          autoFocus
          data-testid={`cell-input-${column.key}`}
          className="min-h-20 w-full resize-y rounded-md border border-border bg-surface px-2 py-1.5"
          value={editing.value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={(event) => onCommit(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onCancel();
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) event.currentTarget.blur();
          }}
        />
      );
    }
    return (
      <input
        autoFocus
        data-testid={`cell-input-${column.key}`}
        className="w-full rounded border border-border bg-surface px-2 py-1"
        value={editing.value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(event) => onCommit(event.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") onCancel();
        }}
      />
    );
  }

  const placeholder = column.kind === "title" ? "—" : " ";
  return (
    <button
      data-testid={`cell-value-${column.key}`}
      className={`block w-full whitespace-pre-wrap break-words py-1 text-left leading-5 ${
        column.kind === "title" && row.rowType === "heading" ? "font-semibold" : ""
      } ${editable ? "" : "cursor-default text-mutedForeground"}`}
      style={column.kind === "title" ? { paddingLeft: row.depth * 16 } : undefined}
      onDoubleClick={onStartEdit}
      onKeyDown={(e) => {
        if ((e.key === "F2" || e.key === "Enter") && editable) onStartEdit();
      }}
    >
      {display || placeholder}
    </button>
  );
}

function ChoiceEditor({
  value,
  options,
  multiple,
  onSave,
  onCancel,
}: {
  value: string;
  options: string[];
  multiple: boolean;
  onSave: (value: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(() => value.split(",").map((item) => item.trim()).filter(Boolean));
  const toggle = (option: string) => {
    if (!multiple) {
      setSelected([option]);
      return;
    }
    setSelected((current) =>
      current.includes(option) ? current.filter((item) => item !== option) : [...current, option],
    );
  };
  return (
    <div data-testid="choice-editor" className="relative z-30 self-start">
      <div className="absolute left-0 top-0 min-w-56 rounded-xl border border-border bg-surfaceElevated p-2 shadow-2xl">
        <div className="max-h-52 space-y-1 overflow-auto">
          {options.map((option) => (
            <label key={option} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted">
              <input
                data-testid={`choice-option-${options.indexOf(option)}`}
                type={multiple ? "checkbox" : "radio"}
                checked={selected.includes(option)}
                onChange={() => toggle(option)}
                className="accent-primary"
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
        <div className="mt-2 flex justify-end gap-1 border-t border-border pt-2">
          <button className="rounded-md px-2 py-1 text-xs hover:bg-muted" onClick={onCancel}>{t("cancel")}</button>
          <button
            data-testid="choice-save"
            className="rounded-md bg-primary px-2 py-1 text-xs text-primaryForeground"
            onClick={() => onSave(selected.join(", "))}
          >
            {t("done")}
          </button>
        </div>
      </div>
    </div>
  );
}
