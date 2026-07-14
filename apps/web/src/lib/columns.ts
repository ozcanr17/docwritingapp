import { FieldDefinition, OutlineRow, RowType } from "./api";

export type ColumnKind = "number" | "type" | "title" | "description" | "status" | "action" | "expectedResult" | "custom";

export interface GridColumn {
  key: string;
  labelKey: string;
  kind: ColumnKind;
  width: string;
  editable: boolean;
  fieldKey?: string;
  field?: FieldDefinition;
  appliesTo?: RowType[];
}

export const BUILTIN_COLUMNS: GridColumn[] = [
  { key: "number", labelKey: "rowNumber", kind: "number", width: "6rem", editable: false },
  { key: "type", labelKey: "rowType", kind: "type", width: "8rem", editable: false },
  { key: "title", labelKey: "title", kind: "title", width: "minmax(16rem, 2fr)", editable: true },
  { key: "description", labelKey: "description", kind: "description", width: "minmax(14rem, 1.5fr)", editable: true },
  {
    key: "status",
    labelKey: "status",
    kind: "status",
    width: "9rem",
    editable: true,
    appliesTo: ["requirement", "test_case"],
  },
  {
    key: "action",
    labelKey: "testStep",
    kind: "action",
    width: "minmax(12rem, 1.5fr)",
    editable: true,
    appliesTo: ["test_step"],
  },
  {
    key: "expectedResult",
    labelKey: "expectedResult",
    kind: "expectedResult",
    width: "minmax(12rem, 1.5fr)",
    editable: true,
    appliesTo: ["test_step"],
  },
];

export function customColumns(fields: FieldDefinition[]): GridColumn[] {
  return [...fields]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((field) => ({
      key: `custom:${field.fieldKey}`,
      labelKey: field.displayName,
      kind: "custom" as const,
      width: "minmax(10rem, 1fr)",
      editable: true,
      fieldKey: field.fieldKey,
      field,
    }));
}

export function cellValue(column: GridColumn, row: OutlineRow): string {
  switch (column.kind) {
    case "number":
      return row.displayNumber;
    case "title":
      return row.title;
    case "description":
      return row.description ?? "";
    case "status":
      return row.status ?? "";
    case "action":
      return row.action ?? "";
    case "expectedResult":
      return row.expectedResult ?? "";
    case "custom": {
      const value = column.fieldKey ? row.customFields[column.fieldKey] : undefined;
      if (value === null || value === undefined) return "";
      return Array.isArray(value) ? value.join(", ") : String(value);
    }
    default:
      return "";
  }
}

export function isCellEditable(column: GridColumn, row: OutlineRow): boolean {
  if (!column.editable) return false;
  if (column.appliesTo && !column.appliesTo.includes(row.rowType)) return false;
  return true;
}
