import { FieldDefinition, OutlineRow, RowType } from "./api";

export type ColumnKind = "number" | "type" | "title" | "description" | "status" | "action" | "expectedResult" | "custom";

export interface GridColumn {
  key: string;
  labelKey: string;
  kind: ColumnKind;
  width: number;
  editable: boolean;
  fieldKey?: string;
  field?: FieldDefinition;
  appliesTo?: RowType[];
}

export const MIN_COLUMN_WIDTH = 64;

export const BUILTIN_COLUMNS: GridColumn[] = [
  { key: "number", labelKey: "rowNumber", kind: "number", width: 96, editable: false },
  { key: "type", labelKey: "rowType", kind: "type", width: 128, editable: false },
  { key: "title", labelKey: "title", kind: "title", width: 352, editable: true },
  { key: "description", labelKey: "description", kind: "description", width: 320, editable: true },
  { key: "status", labelKey: "status", kind: "status", width: 144, editable: true, appliesTo: ["requirement", "test_case"] },
  { key: "action", labelKey: "testStep", kind: "action", width: 288, editable: true, appliesTo: ["test_step"] },
  { key: "expectedResult", labelKey: "expectedResult", kind: "expectedResult", width: 288, editable: true, appliesTo: ["test_step"] },
];

export function customColumns(fields: FieldDefinition[]): GridColumn[] {
  return [...fields]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((field) => ({
      key: `custom:${field.fieldKey}`,
      labelKey: field.displayName,
      kind: "custom" as const,
      width: 224,
      editable: true,
      fieldKey: field.fieldKey,
      field,
    }));
}

export function totalWidth(columns: GridColumn[]): string {
  const px = columns.reduce((sum, column) => sum + column.width, 0);
  return `${px + 32}px`;
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
