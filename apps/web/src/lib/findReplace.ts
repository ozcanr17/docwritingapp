import { OutlineRow } from "./api";
import { cellValue, GridColumn } from "./columns";

export interface FindReplaceOptions {
  find: string;
  replace: string;
  matchCase: boolean;
  wholeWord: boolean;
  regularExpression: boolean;
}

export interface TextReplacement {
  rowId: string;
  objectNumber: number;
  columnKey: string;
  columnLabel: string;
  before: string;
  after: string;
  occurrences: number;
}

function escapeExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildReplacements(rows: OutlineRow[], columns: GridColumn[], options: FindReplaceOptions): { replacements: TextReplacement[]; error: string | null } {
  if (!options.find) return { replacements: [], error: null };
  let expression: RegExp;
  try {
    const source = options.regularExpression ? options.find : escapeExpression(options.find);
    expression = new RegExp(options.wholeWord ? `\\b(?:${source})\\b` : source, options.matchCase ? "g" : "gi");
  } catch {
    return { replacements: [], error: "invalid" };
  }
  const replacements: TextReplacement[] = [];
  for (const row of rows) {
    for (const column of columns) {
      const before = cellValue(column, row);
      expression.lastIndex = 0;
      const occurrences = [...before.matchAll(expression)].length;
      expression.lastIndex = 0;
      if (occurrences === 0) continue;
      replacements.push({
        rowId: row.id,
        objectNumber: row.objectNumber,
        columnKey: column.key,
        columnLabel: column.labelKey,
        before,
        after: before.replace(expression, options.replace),
        occurrences,
      });
    }
  }
  return { replacements, error: null };
}
