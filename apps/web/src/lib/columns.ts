import { DocumentType, FieldDefinition, OutlineRow, RowType } from "./api";

export type ColumnKind =
  | "number"
  | "stepNumber"
  | "requirementNo"
  | "title"
  | "description"
  | "action"
  | "expectedResult"
  | "testResult"
  | "linkedRequirements"
  | "custom";

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

const NUMBER_COLUMN: GridColumn = { key: "number", labelKey: "rowId", kind: "number", width: 96, editable: false };
const DESCRIPTION_COLUMN: GridColumn = { key: "description", labelKey: "description", kind: "description", width: 320, editable: true };

export function builtInColumns(documentType: Exclude<DocumentType, "general_document">): GridColumn[] {
  if (documentType === "requirement") {
    return [
      NUMBER_COLUMN,
      { key: "requirementNo", labelKey: "requirementNumber", kind: "requirementNo", width: 168, editable: true, appliesTo: ["requirement"] },
      { key: "title", labelKey: "requirementDescription", kind: "title", width: 480, editable: true },
      DESCRIPTION_COLUMN,
    ];
  }
  return [
    NUMBER_COLUMN,
    { key: "title", labelKey: "testTitle", kind: "title", width: 320, editable: true },
    { key: "stepNumber", labelKey: "stepNumber", kind: "stepNumber", width: 96, editable: true, appliesTo: ["test_step"] },
    { key: "action", labelKey: "testStep", kind: "action", width: 320, editable: true, appliesTo: ["test_step"] },
    { key: "expectedResult", labelKey: "expectedResult", kind: "expectedResult", width: 320, editable: true, appliesTo: ["test_step"] },
    { key: "linkedRequirements", labelKey: "linkedRequirements", kind: "linkedRequirements", width: 320, editable: true },
    { key: "testResult", labelKey: "testResult", kind: "testResult", width: 240, editable: true, appliesTo: ["test_step"] },
    DESCRIPTION_COLUMN,
  ];
}

export function columnsForDocument(documentType: Exclude<DocumentType, "general_document">, fields: FieldDefinition[]) {
  const builtIns = builtInColumns(documentType);
  const description = builtIns.find((column) => column.kind === "description") as GridColumn;
  const leading = builtIns.filter((column) => column.kind !== "description" && column.kind !== "testResult");
  const result = builtIns.find((column) => column.kind === "testResult");
  return [...leading, ...customColumns(fields), ...(result ? [result] : []), description];
}

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
      return String(row.objectNumber);
    case "stepNumber":
      return row.stepNumber === null ? "" : String(row.stepNumber);
    case "requirementNo":
      return row.requirementNo ?? "";
    case "title":
      return row.title;
    case "description":
      return row.description ?? "";
    case "action":
      return row.action ?? "";
    case "expectedResult":
      return row.expectedResult ?? "";
    case "testResult":
      return row.testResult ?? "";
    case "linkedRequirements":
      return (row.linkedRequirements ?? [])
        .map((requirement) => [requirement.requirementNo, requirement.title].filter(Boolean).join(" : "))
        .join("\n");
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
  void row;
  return true;
}
