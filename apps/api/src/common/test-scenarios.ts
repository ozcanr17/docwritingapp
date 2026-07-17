export interface TestHierarchyRow {
  id: string;
  parentId: string | null;
  rowType: string;
  title: string;
  customFields?: unknown;
}

export function resolveTestScenario(rowId: string, rowsById: Map<string, TestHierarchyRow>): TestHierarchyRow | null {
  const row = rowsById.get(rowId);
  if (!row) return null;
  if (row.rowType === "test_case") return row;
  if (row.rowType !== "test_step" || !row.parentId) return row;
  const parent = rowsById.get(row.parentId);
  if (!parent) return row;
  if (parent.rowType === "test_case") return parent;
  const grandparent = parent.parentId ? rowsById.get(parent.parentId) : null;
  if (grandparent && (grandparent.rowType === "heading" || grandparent.rowType === "test_case")) return grandparent;
  return parent;
}
