import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError, FieldDefinition, OutlineRow } from "../lib/api";
import { BUILTIN_COLUMNS, cellValue, customColumns, GridColumn, isCellEditable, totalWidth } from "../lib/columns";
import { insertOptions } from "../lib/outline";
import { useColumnStore } from "../stores/columns";
import { useSelectionStore } from "../stores/selection";
import { useToastStore } from "../stores/toasts";
import { ContextMenu, MenuItem } from "./ContextMenu";

interface GridProps {
  documentId: string;
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
    case "status":
      return row.rowType === "test_case"
        ? { ...base, testCaseDetail: { status: value } }
        : { ...base, requirementDetail: { status: value } };
    case "action":
      return { ...base, testStepDetail: { action: value } };
    case "expectedResult":
      return { ...base, testStepDetail: { expectedResult: value } };
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

export function DocumentGrid({ documentId }: GridProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const setSelectedRow = useSelectionStore((s) => s.setRow);
  const openDetail = useSelectionStore((s) => s.openDetail);
  const selectedRowId = useSelectionStore((s) => s.selectedRowId);
  const isHidden = useColumnStore((s) => s.isHidden);
  const widthOf = useColumnStore((s) => s.widthOf);
  const setWidth = useColumnStore((s) => s.setWidth);
  const storedWidths = useColumnStore((s) => s.widths[documentId]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);

  const outlineKey = ["outline", documentId];
  const { data: rows = [], isLoading } = useQuery({
    queryKey: outlineKey,
    queryFn: () => api<OutlineRow[]>(`/documents/${documentId}/outline`),
  });
  const { data: fields = [] } = useQuery({
    queryKey: ["fields", documentId],
    queryFn: () => api<FieldDefinition[]>(`/documents/${documentId}/fields`),
  });

  const columns = useMemo(
    () =>
      [...BUILTIN_COLUMNS, ...customColumns(fields)]
        .filter((c) => !isHidden(documentId, c.key))
        .map((c) => ({ ...c, width: storedWidths?.[c.key] ?? c.width })),
    [fields, isHidden, documentId, storedWidths],
  );
  const template = columns.map((c) => `${c.width}px`).join(" ");
  const gridWidth = totalWidth(columns);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 20,
    initialRect: { width: 1000, height: 600 },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: outlineKey });

  const handleMutationError = (error: unknown) => {
    pushToast("error", error instanceof ApiError && error.status === 409 ? t("conflictError") : t("genericError"));
    void invalidate();
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
        { key: "requirement", label: t("addRequirement"), onSelect: () => addUnder("requirement", null) },
        { key: "testCase", label: t("addTestCase"), onSelect: () => addUnder("test_case", null) },
      ];
    }
    const sections = insertOptions(rows, row).map((option, index) => ({
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
      { key: "heading", label: t("addHeading"), onSelect: () => addUnder("heading", row.parentId, row.id) },
      { key: "testCase", label: t("addTestCase"), onSelect: () => addUnder("test_case", row.parentId, row.id) },
      { key: "testStep", label: t("addTestStep"), onSelect: () => addUnder("test_step", row.id) },
      { key: "indent", label: t("indent"), onSelect: () => indent(row) },
      { key: "outdent", label: t("outdent"), onSelect: () => outdent(row) },
      { key: "delete", label: t("deleteAction"), danger: true, onSelect: () => deleteRow.mutate(row) },
    ];
  };

  const moveSelection = (offset: number) => {
    const index = rows.findIndex((r) => r.id === selectedRowId);
    const next = rows[index === -1 ? (offset > 0 ? 0 : rows.length - 1) : index + offset];
    if (next) {
      setSelectedRow(next.id);
      virtualizer.scrollToIndex(rows.indexOf(next));
    }
  };

  const commitEdit = (row: OutlineRow, column: GridColumn) => {
    if (editing && editing.value !== cellValue(column, row)) {
      saveCell.mutate({ column, row, value: editing.value });
    }
    setEditing(null);
  };

  if (isLoading) {
    return <div className="p-6 text-sm text-mutedForeground">{t("loading")}</div>;
  }

  return (
    <div className="flex h-full flex-col bg-editorBackground">
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
          className="sticky top-0 z-10 grid gap-2 border-b border-border bg-editorBackground px-4 text-xs font-medium uppercase tracking-wide text-mutedForeground"
          style={{ gridTemplateColumns: template, width: gridWidth }}
        >
          {columns.map((column) => (
            <div key={column.key} className="relative flex items-center gap-1 overflow-hidden py-2 pr-2">
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
        {rows.length === 0 ? (
          <div data-testid="grid-empty" className="p-6 text-sm text-mutedForeground">
            {t("emptyDocument")}
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: gridWidth }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              if (!row) return null;
              return (
                <div
                  key={row.id}
                  data-testid={`grid-row-${row.displayNumber}`}
                  className={`absolute left-0 grid items-center gap-2 border-b border-border px-4 text-sm hover:bg-muted ${
                    selectedRowId === row.id ? "bg-selection" : ""
                  }`}
                  style={{ top: virtualRow.start, height: virtualRow.size, gridTemplateColumns: template, width: gridWidth }}
                  onClick={() => setSelectedRow(row.id)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setMenu({ x: event.clientX, y: event.clientY, row });
                  }}
                >
                  {columns.map((column) => (
                    <GridCell
                      key={column.key}
                      column={column}
                      row={row}
                      editing={editing?.rowId === row.id && editing.columnKey === column.key ? editing : null}
                      onStartEdit={() =>
                        isCellEditable(column, row) &&
                        setEditing({ rowId: row.id, columnKey: column.key, value: cellValue(column, row) })
                      }
                      onChange={(value) => setEditing({ rowId: row.id, columnKey: column.key, value })}
                      onCommit={() => commitEdit(row, column)}
                      onCancel={() => setEditing(null)}
                      typeLabel={t(rowTypeLabelKeys[row.rowType])}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.row)} onClose={() => setMenu(null)} />}
    </div>
  );
}

function GridCell({
  column,
  row,
  editing,
  onStartEdit,
  onChange,
  onCommit,
  onCancel,
  typeLabel,
}: {
  column: GridColumn;
  row: OutlineRow;
  editing: EditState | null;
  onStartEdit: () => void;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  typeLabel: string;
}) {
  if (column.kind === "number") {
    return <span className="tabular-nums text-mutedForeground">{row.displayNumber}</span>;
  }
  if (column.kind === "type") {
    return <span className="text-xs text-mutedForeground">{typeLabel}</span>;
  }

  const editable = isCellEditable(column, row);
  const display = cellValue(column, row);

  if (editing) {
    return (
      <input
        autoFocus
        data-testid={`cell-input-${column.key}`}
        className="w-full rounded border border-border bg-surface px-2 py-1"
        value={editing.value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit();
          if (e.key === "Escape") onCancel();
        }}
      />
    );
  }

  const placeholder = column.kind === "title" ? "—" : " ";
  return (
    <button
      data-testid={`cell-value-${column.key}`}
      className={`block w-full truncate text-left ${
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
