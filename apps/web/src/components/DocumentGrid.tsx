import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronRight, Link2, Settings2, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError, CustomFieldType, DashboardSummary, DocumentType, FieldDefinition, OutlineRow, SavedView } from "../lib/api";
import { cellValue, columnsForDocument, GridColumn, isCellEditable, totalWidth } from "../lib/columns";
import { useColumnStore } from "../stores/columns";
import { useEditHistoryStore } from "../stores/editHistory";
import { useSelectionStore } from "../stores/selection";
import { useToastStore } from "../stores/toasts";
import { ContextMenu, MenuItem } from "./ContextMenu";
import { BulkActionInput, BulkActionsDialog } from "./BulkActionsDialog";
import { ProductivityBar } from "./ProductivityBar";
import { AddColumnDialog } from "./AddColumnDialog";

interface GridProps {
  documentId: string;
  documentType: Exclude<DocumentType, "general_document">;
}

interface MenuState {
  x: number;
  y: number;
  row: OutlineRow | null;
}

interface ColumnMenuState {
  x: number;
  y: number;
  column: GridColumn;
}

interface EditState {
  rowId: string;
  columnKey: string;
  value: string;
  numberingStart?: string;
}

const rowTypeLabelKeys: Record<OutlineRow["rowType"], string> = {
  heading: "typeHeading",
  requirement: "typeRequirement",
  test_case: "typeTestCase",
  test_step: "typeTestStep",
  note: "typeNote",
};

function buildPatchPayload(column: GridColumn, row: OutlineRow, value: string, numberingStart?: string | null): Record<string, unknown> {
  const base = { expectedVersion: row.version };
  switch (column.kind) {
    case "title":
      return { ...base, title: value, ...(numberingStart !== undefined ? { numberingStart: numberingStart === null ? null : Number(numberingStart) } : {}) };
    case "stepNumber":
      return { ...base, testStepDetail: { stepNumber: value.trim() ? Number(value) : null } };
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
  const pushHistory = useEditHistoryStore((s) => s.push);
  const setSelectedRow = useSelectionStore((s) => s.setRow);
  const selectOnly = useSelectionStore((s) => s.selectOnly);
  const toggleRow = useSelectionStore((s) => s.toggleRow);
  const selectRange = useSelectionStore((s) => s.selectRange);
  const selectAll = useSelectionStore((s) => s.selectAll);
  const clearRows = useSelectionStore((s) => s.clearRows);
  const openDetail = useSelectionStore((s) => s.openDetail);
  const selectedRowId = useSelectionStore((s) => s.selectedRowId);
  const selectedRowIds = useSelectionStore((s) => s.selectedRowIds);
  const hiddenByDocument = useColumnStore((s) => s.hidden);
  const storedHidden = hiddenByDocument[documentId] ?? [];
  const widthOf = useColumnStore((s) => s.widthOf);
  const setWidth = useColumnStore((s) => s.setWidth);
  const hideColumn = useColumnStore((s) => s.hide);
  const showColumn = useColumnStore((s) => s.show);
  const placeColumn = useColumnStore((s) => s.place);
  const storedWidths = useColumnStore((s) => s.widths[documentId]);
  const orderByDocument = useColumnStore((s) => s.order);
  const storedOrder = orderByDocument[documentId] ?? [];
  const scrollRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [columnMenu, setColumnMenu] = useState<ColumnMenuState | null>(null);
  const [addColumnAt, setAddColumnAt] = useState<{ anchor: GridColumn; side: "left" | "right" } | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OutlineRow | null>(null);
  const [numberingTarget, setNumberingTarget] = useState<OutlineRow | null>(null);
  const [numberingStart, setNumberingStart] = useState("");
  const [templateParentId, setTemplateParentId] = useState<string | null | undefined>(undefined);
  const [templateName, setTemplateName] = useState("");
  const [bulkActionsOpen, setBulkActionsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [rowTypeFilter, setRowTypeFilter] = useState<OutlineRow["rowType"] | "">("");
  const [sortKey, setSortKey] = useState("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [frozenCount, setFrozenCount] = useState(1);
  const [viewVisibleColumns, setViewVisibleColumns] = useState<string[] | null>(null);
  const [linkProjection, setLinkProjection] = useState({
    fields: ["requirementNo", "title"],
    separator: " : ",
    sortBy: "requirementNo",
  });
  const [collapsedRowIds, setCollapsedRowIds] = useState<string[]>([]);

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
      [...columnsForDocument(documentType, fields)]
        .sort((a, b) => {
          const ai = storedOrder.indexOf(a.key);
          const bi = storedOrder.indexOf(b.key);
          if (ai === -1 && bi === -1) return 0;
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        })
        .filter((c) => !storedHidden.includes(c.key))
        .filter((c) => viewVisibleColumns === null || viewVisibleColumns.includes(c.key))
        .map((c) => ({ ...c, width: storedWidths?.[c.key] ?? c.width })),
    [documentType, fields, storedHidden, storedWidths, storedOrder, viewVisibleColumns],
  );
  const allColumnKeys = useMemo(() => columnsForDocument(documentType, fields).map((column) => column.key), [documentType, fields]);
  const collapsedRows = useMemo(() => new Set(collapsedRowIds), [collapsedRowIds]);
  const displayedRows = useMemo(() => {
    const normalized = searchQuery.trim().toLocaleLowerCase();
    const byId = new Map(rows.map((row) => [row.id, row]));
    const hierarchyRows = normalized
      ? rows
      : rows.filter((row) => {
          let parentId = row.parentId;
          while (parentId) {
            if (collapsedRows.has(parentId)) return false;
            parentId = byId.get(parentId)?.parentId ?? null;
          }
          return true;
        });
    const byType = rowTypeFilter ? hierarchyRows.filter((row) => row.rowType === rowTypeFilter) : hierarchyRows;
    const filtered = normalized
      ? byType.filter((row) =>
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
      : byType;
    if (!sortKey) return filtered;
    const column = columns.find((candidate) => candidate.key === sortKey);
    if (!column) return filtered;
    return [...filtered].sort((a, b) => {
      const compared = cellValue(column, a).localeCompare(cellValue(column, b), undefined, { numeric: true, sensitivity: "base" });
      return sortDirection === "asc" ? compared : -compared;
    });
  }, [rows, rowTypeFilter, searchQuery, sortKey, sortDirection, columns, collapsedRows]);
  const template = columns.map((c) => `${c.width}px`).join(" ");
  const gridWidth = totalWidth(columns);
  const gridTemplate = template;
  const frozenOffsets = columns.map((_, index) => columns.slice(0, index).reduce((sum, column) => sum + column.width + 8, 0));
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
  const selectedGridRow = rows.find((row) => row.id === selectedRowId);

  const virtualizer = useVirtualizer({
    count: displayedRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 56,
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
          filters: [
            ...(searchQuery ? [{ field: "all", operator: "contains", value: searchQuery }] : []),
            ...(rowTypeFilter ? [{ field: "rowType", operator: "equals", value: rowTypeFilter }] : []),
          ],
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
    const searchFilter = view.filters.find((filter) => filter.field === "all");
    const typeFilter = view.filters.find((filter) => filter.field === "rowType");
    setSearchQuery(typeof searchFilter?.value === "string" ? searchFilter.value : "");
    setRowTypeFilter(
      typeof typeFilter?.value === "string" && typeFilter.value in rowTypeLabelKeys
        ? typeFilter.value as OutlineRow["rowType"]
        : "",
    );
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
    onSuccess: (created) => pushHistory(documentId, { kind: "create", rowId: created.id }),
    onSettled: invalidate,
    onError: handleMutationError,
  });

  const saveCell = useMutation({
    mutationFn: (input: { column: GridColumn; row: OutlineRow; value: string; numberingStart?: string | null }) =>
      api<OutlineRow>(`/rows/${input.row.id}`, {
        method: "PATCH",
        body: JSON.stringify(buildPatchPayload(input.column, input.row, input.value, input.numberingStart)),
      }),
    onSuccess: (_, input) => pushHistory(documentId, {
      kind: "cell",
      rowId: input.row.id,
      columnKey: input.column.key,
      beforeValue: cellValue(input.column, input.row),
      afterValue: input.value,
      ...(input.numberingStart !== undefined
        ? {
            beforeNumbering: input.row.numberingStart === null ? null : String(input.row.numberingStart),
            afterNumbering: input.numberingStart,
          }
        : {}),
    }),
    onSettled: invalidate,
    onError: handleMutationError,
  });

  const createTestTemplate = useMutation({
    mutationFn: (input: { name: string; parentId: string | null }) =>
      api<{ root: { id: string } }>(`/documents/${documentId}/test-templates`, {
        method: "POST",
        body: JSON.stringify({
          name: input.name,
          parentId: input.parentId,
          sectionTitles: [t("preconditions"), t("testInputs"), t("assumptionsAndConstraints"), t("testStepsHeading")],
          defaultContent: t("noneDefault"),
        }),
      }),
    onSuccess: (created) => {
      pushHistory(documentId, { kind: "create", rowId: created.root.id });
      setTemplateParentId(undefined);
      setTemplateName("");
      void invalidate();
    },
    onError: handleMutationError,
  });

  const addColumn = useMutation({
    mutationFn: (input: { displayName: string; fieldType: CustomFieldType; allowedValues: string[] }) =>
      api<FieldDefinition>(`/documents/${documentId}/fields`, {
        method: "POST",
        body: JSON.stringify({
          fieldKey: `field_${Date.now().toString(36)}`,
          displayName: input.displayName,
          fieldType: input.fieldType,
          allowedValues: input.allowedValues,
        }),
      }),
    onSuccess: async (field) => {
      if (addColumnAt) {
        const key = `custom:${field.fieldKey}`;
        showColumn(documentId, key);
        placeColumn(documentId, key, addColumnAt.anchor.key, addColumnAt.side, [...allColumnKeys, key]);
      }
      setAddColumnAt(null);
      await queryClient.invalidateQueries({ queryKey: ["fields", documentId] });
    },
    onError: handleMutationError,
  });

  const updateStepStatus = useMutation({
    mutationFn: (input: { rowId: string; status: string }) => api(`/test-steps/${input.rowId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: input.status }),
    }),
    onSuccess: (_, input) => {
      const row = rows.find((candidate) => candidate.id === input.rowId);
      if (row) pushHistory(documentId, {
        kind: "status",
        rowId: row.id,
        beforeStatus: row.testResult ?? "not_run",
        afterStatus: input.status,
      });
    },
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
    onSuccess: (_, input) => {
      const siblings = rows.filter((candidate) => candidate.parentId === input.row.parentId);
      const index = siblings.findIndex((candidate) => candidate.id === input.row.id);
      pushHistory(documentId, {
        kind: "move",
        rowId: input.row.id,
        beforeParentId: input.row.parentId,
        beforeAfterRowId: index > 0 ? siblings[index - 1]?.id : undefined,
        afterParentId: input.newParentId,
        afterAfterRowId: input.afterRowId,
      });
    },
    onSettled: invalidate,
    onError: handleMutationError,
  });

  const deleteRow = useMutation({
    mutationFn: (input: { row: OutlineRow; childStrategy: "delete_subtree" | "promote_children" }) =>
      api(`/rows/${input.row.id}`, { method: "DELETE", body: JSON.stringify({ childStrategy: input.childStrategy }) }),
    onSuccess: (_, input) => {
      if (input.childStrategy === "delete_subtree") pushHistory(documentId, { kind: "delete", rowId: input.row.id });
      setDeleteTarget(null);
    },
    onSettled: invalidate,
    onError: handleMutationError,
  });

  const updateNumbering = useMutation({
    mutationFn: (input: { row: OutlineRow; numberingStart: number | null }) =>
      api(`/rows/${input.row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ expectedVersion: input.row.version, numberingStart: input.numberingStart }),
      }),
    onSuccess: (_, input) => {
      pushHistory(documentId, {
        kind: "cell",
        rowId: input.row.id,
        columnKey: "title",
        beforeValue: input.row.title,
        afterValue: input.row.title,
        beforeNumbering: input.row.numberingStart === null ? null : String(input.row.numberingStart),
        afterNumbering: input.numberingStart === null ? null : String(input.numberingStart),
      });
      setNumberingTarget(null);
    },
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

  const addObject = (row = rows.find((candidate) => candidate.id === selectedRowId)) => {
    if (!row) {
      createRow.mutate({ parentId: null, rowType: "heading" });
      return;
    }
    createRow.mutate({ parentId: row.parentId, afterRowId: row.id, rowType: "heading" });
  };

  const addObjectBelow = (row = rows.find((candidate) => candidate.id === selectedRowId)) => {
    if (!row) {
      createRow.mutate({ parentId: null, rowType: "heading" });
      return;
    }
    if (row.rowType !== "heading" && row.rowType !== "test_case") return;
    const children = rows.filter((candidate) => candidate.parentId === row.id);
    createRow.mutate({ parentId: row.id, afterRowId: children.at(-1)?.id, rowType: "heading" });
  };

  const addBlankObject = (row = rows.find((candidate) => candidate.id === selectedRowId)) => {
    createRow.mutate({ parentId: row?.parentId ?? null, afterRowId: row?.id, rowType: "note" });
  };

  const addBlankObjectBelow = (row = rows.find((candidate) => candidate.id === selectedRowId)) => {
    if (!row || (row.rowType !== "heading" && row.rowType !== "test_case")) return;
    const children = rows.filter((candidate) => candidate.parentId === row.id);
    createRow.mutate({ parentId: row.id, afterRowId: children.at(-1)?.id, rowType: "note" });
  };

  const openNumbering = (row: OutlineRow) => {
    setNumberingTarget(row);
    setNumberingStart(String(row.numberingStart ?? Number(row.displayNumber.split(".").at(-1) ?? 1)));
  };

  const toggleCollapsed = (rowId: string) => {
    setCollapsedRowIds((current) => current.includes(rowId) ? current.filter((id) => id !== rowId) : [...current, rowId]);
  };

  const executeHistory = async (direction: "undo" | "redo") => {
    const history = useEditHistoryStore.getState();
    if (history.busy[documentId]) return;
    history.setBusy(documentId, true);
    const command = direction === "undo" ? history.takeUndo(documentId) : history.takeRedo(documentId);
    if (!command) {
      history.setBusy(documentId, false);
      return;
    }
    try {
      const currentRows = await api<OutlineRow[]>(`/documents/${documentId}/outline`);
      const currentRow = currentRows.find((row) => row.id === command.rowId);
      if (command.kind === "cell") {
        if (!currentRow) throw new Error("row unavailable");
        const column = columns.find((candidate) => candidate.key === command.columnKey);
        if (!column) throw new Error("column unavailable");
        const expectedValue = direction === "undo" ? command.afterValue : command.beforeValue;
        if (cellValue(column, currentRow) !== expectedValue) throw new Error("row changed");
        const value = direction === "undo" ? command.beforeValue : command.afterValue;
        const numberingStart = direction === "undo" ? command.beforeNumbering : command.afterNumbering;
        await api(`/rows/${command.rowId}`, {
          method: "PATCH",
          body: JSON.stringify(buildPatchPayload(column, currentRow, value, numberingStart)),
        });
      }
      if (command.kind === "create") {
        if (direction === "undo") {
          if (!currentRow) throw new Error("row unavailable");
          await api(`/rows/${command.rowId}`, { method: "DELETE", body: JSON.stringify({ childStrategy: "delete_subtree" }) });
        } else {
          await api(`/rows/${command.rowId}/restore`, { method: "POST" });
        }
      }
      if (command.kind === "delete") {
        if (direction === "undo") await api(`/rows/${command.rowId}/restore`, { method: "POST" });
        else {
          if (!currentRow) throw new Error("row unavailable");
          await api(`/rows/${command.rowId}`, { method: "DELETE", body: JSON.stringify({ childStrategy: "delete_subtree" }) });
        }
      }
      if (command.kind === "status") {
        if (!currentRow) throw new Error("row unavailable");
        const expectedStatus = direction === "undo" ? command.afterStatus : command.beforeStatus;
        if ((currentRow.testResult ?? "not_run") !== expectedStatus) throw new Error("status changed");
        await api(`/test-steps/${command.rowId}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: direction === "undo" ? command.beforeStatus : command.afterStatus }),
        });
      }
      if (command.kind === "move") {
        if (!currentRow) throw new Error("row unavailable");
        const expectedParentId = direction === "undo" ? command.afterParentId : command.beforeParentId;
        if (currentRow.parentId !== expectedParentId) throw new Error("row moved");
        await api(`/rows/${command.rowId}/move`, {
          method: "POST",
          headers: { "idempotency-key": crypto.randomUUID() },
          body: JSON.stringify({
            newParentId: direction === "undo" ? command.beforeParentId : command.afterParentId,
            afterRowId: direction === "undo" ? command.beforeAfterRowId : command.afterAfterRowId,
            expectedVersion: currentRow.version,
          }),
        });
      }
      await invalidate();
    } catch (error) {
      const current = useEditHistoryStore.getState();
      if (direction === "undo") current.rollbackUndo(documentId, command);
      else current.rollbackRedo(documentId, command);
      handleMutationError(error);
    } finally {
      useEditHistoryStore.getState().setBusy(documentId, false);
    }
  };

  useEffect(() => {
    const onUndo = (event: Event) => {
      if ((event as CustomEvent<{ documentId: string }>).detail.documentId === documentId) void executeHistory("undo");
    };
    const onRedo = (event: Event) => {
      if ((event as CustomEvent<{ documentId: string }>).detail.documentId === documentId) void executeHistory("redo");
    };
    window.addEventListener("docsys:undo", onUndo);
    window.addEventListener("docsys:redo", onRedo);
    return () => {
      window.removeEventListener("docsys:undo", onUndo);
      window.removeEventListener("docsys:redo", onRedo);
    };
  });

  useEffect(() => {
    const requestDelete = () => {
      const row = rows.find((candidate) => candidate.id === selectedRowId);
      if (row) setDeleteTarget(row);
    };
    window.addEventListener("docsys:delete-selected-row", requestDelete);
    return () => window.removeEventListener("docsys:delete-selected-row", requestDelete);
  }, [rows, selectedRowId]);

  useEffect(() => {
    const requestTemplate = (event: Event) => {
      const detail = (event as CustomEvent<{ parentId?: string | null }>).detail;
      setTemplateParentId(detail?.parentId ?? null);
    };
    window.addEventListener("docsys:add-test-template", requestTemplate);
    return () => window.removeEventListener("docsys:add-test-template", requestTemplate);
  }, []);

  const menuItems = (row: OutlineRow | null): MenuItem[] => {
    const addUnder = (rowType: OutlineRow["rowType"], parentId: string | null, afterRowId?: string) =>
      createRow.mutate({ parentId, afterRowId, rowType });
    if (!row) {
      return [
        { key: "heading", label: t("addHeading"), onSelect: () => addUnder("heading", null) },
        { key: "blank", label: t("addBlankObject"), onSelect: () => addUnder("note", null) },
        documentType === "requirement"
          ? { key: "requirement", label: t("addRequirement"), onSelect: () => addUnder("requirement", null) }
          : { key: "testStep", label: t("addTestStep"), onSelect: () => addUnder("test_step", null) },
        ...(documentType === "test" ? [{ key: "testTemplate", label: t("addTestTemplate"), onSelect: () => setTemplateParentId(null) }] : []),
      ];
    }
    return [
      {
        key: "detail",
        label: t("openDetails"),
        onSelect: () => {
          openDetail(row.id);
          void queryClient.invalidateQueries({ queryKey: ["row", row.id] });
        },
      },
      { key: "addObject", label: t("addObject"), shortcut: "Insert", onSelect: () => addObject(row) },
      { key: "addBlankObject", label: t("addBlankObject"), onSelect: () => addBlankObject(row) },
      {
        key: "addObjectBelow",
        label: t("addObjectBelow"),
        shortcut: "Shift+Insert",
        disabled: row.rowType !== "heading" && row.rowType !== "test_case",
        onSelect: () => addObjectBelow(row),
      },
      {
        key: "addBlankObjectBelow",
        label: t("addBlankObjectBelow"),
        disabled: row.rowType !== "heading" && row.rowType !== "test_case",
        onSelect: () => addBlankObjectBelow(row),
      },
      ...(row.rowType === "heading"
        ? [
            { key: "subheading", label: t("addChildHeading"), onSelect: () => addUnder("heading", row.id) },
            documentType === "requirement"
              ? { key: "requirement", label: t("addRequirement"), onSelect: () => addUnder("requirement", row.id) }
              : { key: "testStep", label: t("addTestStep"), onSelect: () => addUnder("test_step", row.id) },
            ...(documentType === "test" ? [{ key: "testTemplate", label: t("addTestTemplateBelow"), onSelect: () => setTemplateParentId(row.id) }] : []),
          ]
        : []),
      ...(row.rowType === "test_case"
        ? [{ key: "testStep", label: t("addTestStep"), onSelect: () => addUnder("test_step", row.id) }]
        : []),
      ...(row.rowType === "test_step"
        ? [{ key: "testStepAfter", label: t("addTestStepAfter"), onSelect: () => addUnder("test_step", row.parentId, row.id) }]
        : []),
      { key: "heading", label: t("addSiblingHeading"), onSelect: () => addUnder("heading", row.parentId, row.id) },
      ...((row.rowType === "heading" || row.rowType === "test_case")
        ? [{ key: "numbering", label: t("setNumbering"), onSelect: () => openNumbering(row) }]
        : []),
      ...(rows.some((candidate) => candidate.parentId === row.id)
        ? [{ key: "collapse", label: t(collapsedRows.has(row.id) ? "expandObject" : "collapseObject"), onSelect: () => toggleCollapsed(row.id) }]
        : []),
      ...(row.rowType === "test_step"
        ? (["not_run", "running", "passed", "failed", "blocked", "skipped"] as const).map((status) => ({
            key: `status-${status}`,
            label: `${t("testResult")}: ${t(`executionStatus.${status}`)}`,
            onSelect: () => updateStepStatus.mutate({ rowId: row.id, status }),
          }))
        : []),
      { key: "indent", label: t("indent"), onSelect: () => indent(row) },
      { key: "outdent", label: t("outdent"), onSelect: () => outdent(row) },
      { key: "delete", label: t("deleteAction"), danger: true, onSelect: () => setDeleteTarget(row) },
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
    if (value !== undefined && (value !== cellValue(column, row) || editing?.numberingStart !== undefined)) {
      saveCell.mutate({ column, row, value, numberingStart: editing?.numberingStart });
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
        rowTypeFilter={rowTypeFilter}
        sortKey={sortKey}
        sortDirection={sortDirection}
        frozenCount={frozenCount}
        views={savedViews}
        dashboard={dashboard}
        onQueryChange={setSearchQuery}
        onRowTypeFilterChange={setRowTypeFilter}
        onSortChange={(key, direction) => {
          setSortKey(key);
          setSortDirection(direction);
        }}
        onFrozenCountChange={setFrozenCount}
        onApplyView={applyView}
        onSaveView={(name, scope) => saveView.mutate({ name, scope })}
        onDeleteView={(id) => deleteView.mutate(id)}
        onAddObject={() => addObject()}
        onAddObjectBelow={() => addObjectBelow()}
        onAddBlankObject={() => addBlankObject()}
        onAddBlankObjectBelow={() => addBlankObjectBelow()}
        canAddObjectBelow={!selectedGridRow || selectedGridRow.rowType === "heading" || selectedGridRow.rowType === "test_case"}
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
          const selected = rows.find((row) => row.id === selectedRowId);
          if (event.key === "ArrowLeft" && selected && rows.some((row) => row.parentId === selected.id)) {
            event.preventDefault();
            setCollapsedRowIds((current) => current.includes(selected.id) ? current : [...current, selected.id]);
          }
          if (event.key === "ArrowRight" && selected && collapsedRows.has(selected.id)) {
            event.preventDefault();
            setCollapsedRowIds((current) => current.filter((id) => id !== selected.id));
          }
          if (event.key === "Insert") {
            event.preventDefault();
            if (event.shiftKey) addObjectBelow(selected);
            else addObject(selected);
          }
          if (event.key === "Tab" && selected) {
            event.preventDefault();
            if (event.shiftKey) outdent(selected);
            else indent(selected);
          }
          if (event.key === "Delete" && selectedRowIds.length > 0) {
            event.preventDefault();
            if (selectedRowIds.length === 1 && selected) setDeleteTarget(selected);
            else setConfirmBulkDelete(true);
          }
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
            event.preventDefault();
            document.querySelector<HTMLInputElement>('[data-testid="grid-search"]')?.focus();
          }
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
            event.preventDefault();
            selectAll(displayedRows.map((row) => row.id));
          }
          if (event.key === "Escape") clearRows();
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
          {columns.map((column, columnIndex) => (
            <div
              role="columnheader"
              key={column.key}
              className={`relative flex items-center gap-1 overflow-hidden py-2 pr-2 ${columnIndex < frozenCount ? "sticky z-20 bg-surface/95" : ""}`}
              style={columnIndex < frozenCount ? { left: frozenOffsets[columnIndex] } : undefined}
            >
              <button
                className="min-w-0 flex-1 truncate text-left"
                onClick={(event) => {
                  const bounds = event.currentTarget.getBoundingClientRect();
                  setColumnMenu({ x: bounds.left, y: bounds.bottom + 2, column });
                }}
              >
                {column.kind === "custom" ? column.labelKey : t(column.labelKey)}
              </button>
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
              const activeColumn = editing?.rowId === row.id ? columns.find((column) => column.key === editing.columnKey) : undefined;
              const hasUnsavedChange = Boolean(
                editing &&
                activeColumn &&
                (editing.value !== cellValue(activeColumn, row) || editing.numberingStart !== undefined),
              );
              const visibleChangeState = hasUnsavedChange ? "unsaved" : row.changeState ?? "saved_other";
              const hasChildren = rows.some((candidate) => candidate.parentId === row.id);
              return (
                <div
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  key={row.id}
                  data-testid={`grid-row-${row.displayNumber}`}
                  draggable={editing?.rowId !== row.id}
                  className={`absolute left-0 grid min-h-14 items-stretch gap-2 border-b border-border px-4 py-1.5 text-sm transition-colors hover:bg-muted/70 ${
                    selectedRowIds.includes(row.id) ? "bg-selection" : ""
                  }`}
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                    gridTemplateColumns: gridTemplate,
                    width: gridWidth,
                    zIndex: editing?.rowId === row.id ? 20 : 0,
                  }}
                  onClick={(event) => {
                    const target = event.target as HTMLElement;
                    if (!target.closest("input, textarea, select, [data-cell-editor]")) scrollRef.current?.focus({ preventScroll: true });
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
                  <div
                    data-testid={`row-change-state-${row.objectNumber}`}
                    title={t(`rowChangeState.${visibleChangeState}`)}
                    className={`absolute inset-y-0 left-0 z-30 w-1 ${
                      hasUnsavedChange
                        ? "bg-warning"
                        : row.changeState === "baseline"
                          ? "bg-success"
                          : row.changeState === "saved_other"
                            ? "bg-orange-500"
                            : "bg-primary"
                    }`}
                  />
                  {columns.map((column, columnIndex) => (
                    <div
                      key={column.key}
                      className={`relative ${columnIndex < frozenCount ? "sticky z-10 bg-inherit" : ""}`}
                      style={columnIndex < frozenCount ? { left: frozenOffsets[columnIndex] } : undefined}
                    >
                      {column.kind === "title" && hasChildren && (
                        <button
                          type="button"
                          draggable={false}
                          data-testid={`toggle-row-${row.objectNumber}`}
                          aria-label={t(collapsedRows.has(row.id) ? "expandObject" : "collapseObject")}
                          className="absolute top-2 z-20 rounded p-0.5 text-mutedForeground hover:bg-muted hover:text-foreground"
                          style={{ left: row.depth * 18 + 2 }}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleCollapsed(row.id);
                          }}
                        >
                          {collapsedRows.has(row.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        </button>
                      )}
                      <GridCell
                        column={column}
                        row={row}
                        editing={editing?.rowId === row.id && editing.columnKey === column.key ? editing : null}
                        linkProjection={linkProjection}
                        selected={selectedRowIds.includes(row.id)}
                        titleLeadingOffset={hasChildren ? 18 : 0}
                        onStartEdit={() => {
                          if (column.kind === "linkedRequirements") {
                            openDetail(row.id);
                            return;
                          }
                          if (isCellEditable(column, row)) setEditing({ rowId: row.id, columnKey: column.key, value: cellValue(column, row) });
                        }}
                        onChange={(value) => setEditing((current) => current ? { ...current, value } : current)}
                        onNumberingChange={(value) => setEditing((current) => current ? { ...current, numberingStart: value } : current)}
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
      {columnMenu && <ContextMenu x={columnMenu.x} y={columnMenu.y} onClose={() => setColumnMenu(null)} items={[
        { key: "left", label: t("addColumnLeft"), onSelect: () => setAddColumnAt({ anchor: columnMenu.column, side: "left" }) },
        { key: "right", label: t("addColumnRight"), onSelect: () => setAddColumnAt({ anchor: columnMenu.column, side: "right" }) },
        { key: "hide", label: t("hideColumn"), disabled: columnMenu.column.key === "number", onSelect: () => hideColumn(documentId, columnMenu.column.key) },
      ]} />}
      {confirmBulkDelete && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/45 backdrop-blur-sm">
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
      {deleteTarget && (
        <DeleteRowDialog
          row={deleteTarget}
          hasChildren={rows.some((row) => row.parentId === deleteTarget.id)}
          pending={deleteRow.isPending}
          onClose={() => setDeleteTarget(null)}
          onDelete={(childStrategy) => deleteRow.mutate({ row: deleteTarget, childStrategy })}
        />
      )}
      {numberingTarget && (
        <NumberingDialog
          value={numberingStart}
          pending={updateNumbering.isPending}
          onChange={setNumberingStart}
          onClose={() => setNumberingTarget(null)}
          onAutomatic={() => updateNumbering.mutate({ row: numberingTarget, numberingStart: null })}
          onSave={() => updateNumbering.mutate({ row: numberingTarget, numberingStart: Number(numberingStart) })}
        />
      )}
      {bulkActionsOpen && (
        <BulkActionsDialog
          count={selectedRowIds.length}
          columns={columns}
          onClose={() => setBulkActionsOpen(false)}
          onSubmit={(input) => runBulkAction.mutate(input)}
        />
      )}
      {templateParentId !== undefined && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
          <form className="w-full max-w-sm rounded-xl border border-border bg-surfaceElevated p-5 shadow-2xl" onSubmit={(event) => { event.preventDefault(); if (templateName.trim()) createTestTemplate.mutate({ name: templateName.trim(), parentId: templateParentId }); }}>
            <h2 className="font-semibold">{t("addTestTemplate")}</h2>
            <p className="mt-1 text-sm text-mutedForeground">{t("testTemplateHelp")}</p>
            <label className="mt-4 block text-sm">{t("testName")}<input autoFocus className="mt-1 w-full rounded-lg border border-border bg-editorBackground px-3 py-2" value={templateName} onChange={(event) => setTemplateName(event.target.value)} /></label>
            <div className="mt-5 flex justify-end gap-2"><button type="button" className="rounded-lg px-3 py-2 text-sm hover:bg-muted" onClick={() => setTemplateParentId(undefined)}>{t("cancel")}</button><button disabled={!templateName.trim() || createTestTemplate.isPending} className="rounded-lg bg-primary px-3 py-2 text-sm text-primaryForeground disabled:opacity-50">{t("create")}</button></div>
          </form>
        </div>
      )}
      {addColumnAt && <AddColumnDialog onClose={() => setAddColumnAt(null)} onSubmit={(input) => addColumn.mutate(input)} />}
    </div>
  );
}

function DeleteRowDialog({
  row,
  hasChildren,
  pending,
  onClose,
  onDelete,
}: {
  row: OutlineRow;
  hasChildren: boolean;
  pending: boolean;
  onClose: () => void;
  onDelete: (strategy: "delete_subtree" | "promote_children") => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="delete-row-title" className="w-full max-w-md rounded-xl border border-border bg-surfaceElevated p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="delete-row-title" className="font-semibold">{t("deleteHeadingTitle")}</h2>
            <p className="mt-1 text-sm text-mutedForeground">{t(hasChildren ? "deleteHeadingWithChildren" : "deleteRowConfirm", { title: row.title || row.displayNumber })}</p>
          </div>
          <button aria-label={t("close")} className="rounded-md p-1 hover:bg-muted" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="mt-5 flex flex-col gap-2">
          {hasChildren && (
            <button data-testid="delete-promote-children" disabled={pending} className="rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50" onClick={() => onDelete("promote_children")}>{t("deleteOnlyAndPromote")}</button>
          )}
          <button data-testid="delete-subtree" disabled={pending} className="rounded-lg bg-destructive px-3 py-2 text-left text-sm text-white disabled:opacity-50" onClick={() => onDelete("delete_subtree")}>{t(hasChildren ? "deleteWithAllContent" : "deleteAction")}</button>
          <button disabled={pending} className="rounded-lg px-3 py-2 text-sm hover:bg-muted" onClick={onClose}>{t("cancel")}</button>
        </div>
      </div>
    </div>
  );
}

function NumberingDialog({
  value,
  pending,
  onChange,
  onClose,
  onAutomatic,
  onSave,
}: {
  value: string;
  pending: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onAutomatic: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const valid = Number.isInteger(Number(value)) && Number(value) > 0;
  return (
    <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="numbering-title"
        className="w-full max-w-sm rounded-xl border border-border bg-surfaceElevated p-5 shadow-2xl"
        onSubmit={(event) => { event.preventDefault(); if (valid) onSave(); }}
      >
        <h2 id="numbering-title" className="font-semibold">{t("setNumbering")}</h2>
        <p className="mt-1 text-sm text-mutedForeground">{t("numberingHelp")}</p>
        <label className="mt-4 block text-sm">
          {t("numberingStart")}
          <input data-testid="numbering-start" autoFocus type="number" min={1} step={1} className="mt-1 w-full rounded-lg border border-border bg-editorBackground px-3 py-2" value={value} onChange={(event) => onChange(event.target.value)} />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={pending} className="rounded-lg px-3 py-2 text-sm hover:bg-muted" onClick={onClose}>{t("cancel")}</button>
          <button type="button" disabled={pending} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted" onClick={onAutomatic}>{t("automaticNumbering")}</button>
          <button disabled={!valid || pending} className="rounded-lg bg-primary px-3 py-2 text-sm text-primaryForeground disabled:opacity-50">{t("apply")}</button>
        </div>
      </form>
    </div>
  );
}

function GridCell({
  column,
  row,
  editing,
  linkProjection,
  selected,
  titleLeadingOffset,
  onStartEdit,
  onChange,
  onNumberingChange,
  onCommit,
  onCancel,
}: {
  column: GridColumn;
  row: OutlineRow;
  editing: EditState | null;
  linkProjection: { fields: string[]; separator: string; sortBy: string };
  selected: boolean;
  titleLeadingOffset: number;
  onStartEdit: () => void;
  onChange: (value: string) => void;
  onNumberingChange: (value: string) => void;
  onCommit: (value?: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  if (column.kind === "number") {
    return (
      <span className="flex items-center gap-1.5 self-center tabular-nums text-mutedForeground">
        {row.objectNumber}
        {(row.linkCount ?? 0) > 0 && (
          <span
            className="flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
            title={t("linkCount", { count: row.linkCount })}
            aria-label={t("linkCount", { count: row.linkCount })}
          >
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
    if (column.kind === "title" && (row.rowType === "heading" || row.rowType === "test_case")) {
      const displayedSegment = row.displayNumber.split(".").at(-1) ?? "1";
      return (
        <div
          data-cell-editor
          className="flex min-h-10 items-start gap-2"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onCommit(editing.value);
          }}
        >
          <input
            data-testid="inline-numbering-start"
            aria-label={t("numberingStart")}
            type="number"
            min={1}
            step={1}
            className="min-h-10 w-20 rounded border border-border bg-surface px-2 py-2 tabular-nums"
            value={editing.numberingStart ?? displayedSegment}
            onChange={(event) => onNumberingChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onCancel();
              if (event.key === "Enter") onCommit(editing.value);
              if (event.key === "Tab") {
                event.preventDefault();
                onCommit(editing.value);
              }
            }}
          />
          <input
            autoFocus
            data-testid={`cell-input-${column.key}`}
            className="min-h-10 min-w-0 flex-1 rounded border border-border bg-surface px-2 py-2"
            value={editing.value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onCancel();
              if (event.key === "Enter") onCommit(event.currentTarget.value);
              if (event.key === "Tab") {
                event.preventDefault();
                onCommit(event.currentTarget.value);
              }
            }}
          />
        </div>
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
          data-cell-editor
          data-testid={`cell-input-${column.key}`}
          className="min-h-24 w-full resize-y rounded-md border border-border bg-surface px-2 py-2"
          value={editing.value}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onChange(event.target.value)}
          onBlur={(event) => onCommit(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onCancel();
            if (event.key === "Tab") {
              event.preventDefault();
              onCommit(event.currentTarget.value);
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onCommit(event.currentTarget.value);
            }
          }}
        />
      );
    }
    return (
      <input
        autoFocus
        data-cell-editor
        data-testid={`cell-input-${column.key}`}
        className="min-h-10 w-full rounded border border-border bg-surface px-2 py-2"
        value={editing.value}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(event) => onCommit(event.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit(e.currentTarget.value);
          if (e.key === "Tab") {
            e.preventDefault();
            onCommit(e.currentTarget.value);
          }
          if (e.key === "Escape") onCancel();
        }}
      />
    );
  }

  const placeholder = "";
  const numberedTitle = column.kind === "title" && (row.rowType === "heading" || row.rowType === "test_case");
  const columnLabel = column.kind === "custom" ? column.labelKey : t(column.labelKey);
  const cellHelp = column.kind === "linkedRequirements"
    ? t("editLinkedRequirements")
    : t("editCellValue", { column: columnLabel });
  return (
    <button
      data-testid={`cell-value-${column.key}`}
      title={editable ? cellHelp : columnLabel}
      aria-label={!display && editable ? cellHelp : undefined}
      className={`relative block min-h-10 w-full whitespace-pre-wrap break-words py-2 text-left leading-5 ${
        numberedTitle ? "font-semibold text-foreground" : ""
      } ${editable ? "rounded px-1 transition-colors hover:bg-primary/5 hover:ring-1 hover:ring-primary/20" : "cursor-default text-mutedForeground"}`}
      style={column.kind === "title" ? { paddingLeft: row.depth * 18 + 4 + titleLeadingOffset } : undefined}
      onClick={() => {
        if (selected && editable) onStartEdit();
      }}
      onDoubleClick={onStartEdit}
      onKeyDown={(e) => {
        if ((e.key === "F2" || e.key === "Enter") && editable) onStartEdit();
      }}
    >
      {column.kind === "title" && row.depth > 0 && Array.from({ length: row.depth }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-1 border-l border-primary/15"
          style={{ left: index * 18 + 9 }}
        />
      ))}
      {column.kind === "stepNumber" && display ? `${display}.` : numberedTitle ? `${row.displayNumber} ${display || placeholder}` : display || placeholder}
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
    <div data-cell-editor data-testid="choice-editor" className="relative z-30 min-h-10 self-start" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
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
