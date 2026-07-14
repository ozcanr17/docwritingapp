import { OutlineRow, RowType } from "./api";

export interface InsertOption {
  number: string;
  rowType: RowType;
  parentId: string | null;
  afterRowId?: string;
}

function incrementLastSegment(displayNumber: string): string {
  const parts = displayNumber.split(".");
  const last = parseInt(parts[parts.length - 1] ?? "", 10);
  if (Number.isNaN(last)) return displayNumber;
  parts[parts.length - 1] = String(last + 1);
  return parts.join(".");
}

export function insertOptions(rows: OutlineRow[], row: OutlineRow): InsertOption[] {
  const options: InsertOption[] = [];
  const children = rows.filter((r) => r.parentId === row.id);
  const lastChild = children[children.length - 1];
  options.push({
    number: `${row.displayNumber}.${children.length + 1}`,
    rowType: row.rowType === "test_case" ? "test_step" : "requirement",
    parentId: row.id,
    afterRowId: lastChild?.id,
  });
  let current: OutlineRow | undefined = row;
  while (current) {
    options.push({
      number: incrementLastSegment(current.displayNumber),
      rowType: current.rowType,
      parentId: current.parentId,
      afterRowId: current.id,
    });
    current = rows.find((r) => r.id === current?.parentId);
  }
  return options;
}
