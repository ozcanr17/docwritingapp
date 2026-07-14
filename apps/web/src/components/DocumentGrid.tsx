import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError, OutlineRow } from "../lib/api";
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

const rowTypeLabelKeys: Record<OutlineRow["rowType"], string> = {
  heading: "typeHeading",
  requirement: "typeRequirement",
  test_case: "typeTestCase",
  test_step: "typeTestStep",
  note: "typeNote",
};

export function DocumentGrid({ documentId }: GridProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [editing, setEditing] = useState<{ rowId: string; value: string } | null>(null);

  const outlineKey = ["outline", documentId];
  const { data: rows = [], isLoading } = useQuery({
    queryKey: outlineKey,
    queryFn: () => api<OutlineRow[]>(`/documents/${documentId}/outline`),
  });

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 20,
    initialRect: { width: 800, height: 600 },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: outlineKey });

  const handleMutationError = (error: unknown) => {
    if (error instanceof ApiError && error.status === 409) {
      pushToast("error", t("conflictError"));
    } else {
      pushToast("error", t("genericError"));
    }
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

  const updateTitle = useMutation({
    mutationFn: (input: { row: OutlineRow; title: string }) =>
      api<OutlineRow>(`/rows/${input.row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ expectedVersion: input.row.version, title: input.title }),
      }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: outlineKey });
      const previous = queryClient.getQueryData<OutlineRow[]>(outlineKey);
      queryClient.setQueryData<OutlineRow[]>(outlineKey, (current = []) =>
        current.map((r) => (r.id === input.row.id ? { ...r, title: input.title } : r)),
      );
      return { previous };
    },
    onError: (error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(outlineKey, context.previous);
      handleMutationError(error);
    },
    onSettled: invalidate,
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
    onMutate: async (row) => {
      await queryClient.cancelQueries({ queryKey: outlineKey });
      const previous = queryClient.getQueryData<OutlineRow[]>(outlineKey);
      queryClient.setQueryData<OutlineRow[]>(outlineKey, (current = []) =>
        current.filter((r) => r.id !== row.id && !isDescendant(current, row.id, r)),
      );
      return { previous };
    },
    onError: (error, _row, context) => {
      if (context?.previous) queryClient.setQueryData(outlineKey, context.previous);
      handleMutationError(error);
    },
    onSettled: invalidate,
  });

  const indent = (row: OutlineRow) => {
    const siblings = rows.filter((r) => r.parentId === row.parentId);
    const index = siblings.findIndex((r) => r.id === row.id);
    const previousSibling = index > 0 ? siblings[index - 1] : undefined;
    if (!previousSibling) return;
    moveRow.mutate({ row, newParentId: previousSibling.id });
  };

  const outdent = (row: OutlineRow) => {
    if (!row.parentId) return;
    const parent = rows.find((r) => r.id === row.parentId);
    if (!parent) return;
    moveRow.mutate({ row, newParentId: parent.parentId, afterRowId: parent.id });
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
    return [
      { key: "child", label: t("addChild"), onSelect: () => addUnder("requirement", row.id) },
      {
        key: "siblingBelow",
        label: t("addSiblingBelow"),
        onSelect: () => addUnder(row.rowType === "heading" ? "requirement" : row.rowType, row.parentId, row.id),
      },
      { key: "heading", label: t("addHeading"), onSelect: () => addUnder("heading", row.parentId, row.id) },
      { key: "indent", label: t("indent"), onSelect: () => indent(row) },
      { key: "outdent", label: t("outdent"), onSelect: () => outdent(row) },
      { key: "delete", label: t("deleteAction"), danger: true, onSelect: () => deleteRow.mutate(row) },
    ];
  };

  const commitEdit = (row: OutlineRow) => {
    if (editing && editing.value !== row.title) {
      updateTitle.mutate({ row, title: editing.value });
    }
    setEditing(null);
  };

  if (isLoading) {
    return <div className="p-6 text-sm text-mutedForeground">{t("loading")}</div>;
  }

  return (
    <div className="flex h-full flex-col bg-editorBackground">
      <div className="grid grid-cols-[7rem_9rem_1fr] gap-2 border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-mutedForeground">
        <span>{t("rowNumber")}</span>
        <span>{t("rowType")}</span>
        <span>{t("title")}</span>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto"
        onContextMenu={(event) => {
          event.preventDefault();
          setMenu({ x: event.clientX, y: event.clientY, row: null });
        }}
      >
        {rows.length === 0 ? (
          <div className="p-6 text-sm text-mutedForeground">{t("emptyDocument")}</div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              if (!row) return null;
              return (
                <div
                  key={row.id}
                  data-testid={`grid-row-${row.displayNumber}`}
                  className="absolute left-0 grid w-full grid-cols-[7rem_9rem_1fr] items-center gap-2 border-b border-border px-4 text-sm hover:bg-muted"
                  style={{ top: virtualRow.start, height: virtualRow.size }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setMenu({ x: event.clientX, y: event.clientY, row });
                  }}
                >
                  <span className="tabular-nums text-mutedForeground">{row.displayNumber}</span>
                  <span className="text-xs text-mutedForeground">{t(rowTypeLabelKeys[row.rowType])}</span>
                  {editing?.rowId === row.id ? (
                    <input
                      autoFocus
                      className="rounded border border-border bg-surface px-2 py-1"
                      value={editing.value}
                      onChange={(event) => setEditing({ rowId: row.id, value: event.target.value })}
                      onBlur={() => commitEdit(row)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") commitEdit(row);
                        if (event.key === "Escape") setEditing(null);
                      }}
                    />
                  ) : (
                    <button
                      className={`truncate text-left ${row.rowType === "heading" ? "font-semibold" : ""}`}
                      style={{ paddingLeft: row.depth * 16 }}
                      onDoubleClick={() => setEditing({ rowId: row.id, value: row.title })}
                      onKeyDown={(event) => {
                        if (event.key === "F2" || event.key === "Enter") {
                          setEditing({ rowId: row.id, value: row.title });
                        }
                      }}
                    >
                      {row.title || "—"}
                    </button>
                  )}
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

function isDescendant(rows: OutlineRow[], ancestorId: string, candidate: OutlineRow): boolean {
  let current = candidate;
  while (current.parentId) {
    if (current.parentId === ancestorId) return true;
    const parent = rows.find((r) => r.id === current.parentId);
    if (!parent) return false;
    current = parent;
  }
  return false;
}
