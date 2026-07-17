import { OutlineRow } from "./api";
import { cellValue, GridColumn } from "./columns";

export type FilterOperator = "contains" | "not_contains" | "equals" | "not_equals" | "starts_with" | "not_starts_with" | "ends_with" | "one_of" | "matches_regex" | "greater_than" | "greater_or_equal" | "less_than" | "less_or_equal" | "empty" | "not_empty";

export interface FilterCondition {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
  caseSensitive?: boolean;
}

export interface AdvancedFilterConfig {
  logic: "all" | "any";
  conditions: FilterCondition[];
  includeAncestors: boolean;
  includeDescendants: boolean;
  highlightMatches: boolean;
}

export const EMPTY_ADVANCED_FILTER: AdvancedFilterConfig = {
  logic: "all",
  conditions: [],
  includeAncestors: true,
  includeDescendants: false,
  highlightMatches: true,
};

function valueFor(row: OutlineRow, columns: GridColumn[], field: string): string {
  if (field === "rowType") return row.rowType;
  if (field === "status") return row.status ?? "";
  if (field === "priority") return row.priority ?? "";
  if (field === "tags") return row.tags.join("\n");
  if (field === "linkCount") return String(row.linkCount ?? 0);
  if (field === "updatedAt") return row.updatedAt;
  if (field === "linkedRequirement") return row.linkedRequirements.map((linked) => `${linked.requirementNo ?? ""} ${linked.title} ${linked.description ?? ""}`).join("\n");
  if (field === "all") {
    return columns.map((column) => cellValue(column, row)).join("\n");
  }
  const column = columns.find((candidate) => candidate.key === field);
  return column ? cellValue(column, row) : "";
}

function matchesCondition(row: OutlineRow, columns: GridColumn[], condition: FilterCondition): boolean {
  const rawValue = valueFor(row, columns, condition.field);
  const actual = condition.caseSensitive ? rawValue : rawValue.toLocaleLowerCase();
  const expected = condition.caseSensitive ? condition.value : condition.value.toLocaleLowerCase();
  if (condition.operator === "empty") return rawValue.trim().length === 0;
  if (condition.operator === "not_empty") return rawValue.trim().length > 0;
  if (condition.operator === "contains") return actual.includes(expected);
  if (condition.operator === "not_contains") return !actual.includes(expected);
  if (condition.operator === "equals") return actual === expected;
  if (condition.operator === "not_equals") return actual !== expected;
  if (condition.operator === "starts_with") return actual.startsWith(expected);
  if (condition.operator === "not_starts_with") return !actual.startsWith(expected);
  if (condition.operator === "ends_with") return actual.endsWith(expected);
  if (condition.operator === "one_of") return expected.split(/[;,\n]/).map((value) => value.trim()).filter(Boolean).includes(actual.trim());
  if (condition.operator === "matches_regex") {
    try {
      return new RegExp(condition.value, condition.caseSensitive ? "" : "i").test(rawValue);
    } catch {
      return false;
    }
  }
  const actualComparable = Number.isFinite(Number(actual)) && actual.trim() ? Number(actual) : Date.parse(actual);
  const expectedComparable = Number.isFinite(Number(expected)) && expected.trim() ? Number(expected) : Date.parse(expected);
  if (!Number.isFinite(actualComparable) || !Number.isFinite(expectedComparable)) return false;
  if (condition.operator === "greater_than") return actualComparable > expectedComparable;
  if (condition.operator === "greater_or_equal") return actualComparable >= expectedComparable;
  if (condition.operator === "less_than") return actualComparable < expectedComparable;
  return actualComparable <= expectedComparable;
}

export function applyAdvancedFilter(rows: OutlineRow[], columns: GridColumn[], config: AdvancedFilterConfig) {
  const activeConditions = config.conditions.filter((condition) => condition.operator === "empty" || condition.operator === "not_empty" || condition.value.trim());
  if (activeConditions.length === 0) return { visibleIds: new Set(rows.map((row) => row.id)), matchedIds: new Set<string>() };
  const matchedIds = new Set(rows.filter((row) => {
    const results = activeConditions.map((condition) => matchesCondition(row, columns, condition));
    return config.logic === "all" ? results.every(Boolean) : results.some(Boolean);
  }).map((row) => row.id));
  const visibleIds = new Set(matchedIds);
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (config.includeAncestors) {
    for (const rowId of matchedIds) {
      let parentId = byId.get(rowId)?.parentId;
      while (parentId) {
        visibleIds.add(parentId);
        parentId = byId.get(parentId)?.parentId ?? null;
      }
    }
  }
  if (config.includeDescendants) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const row of rows) {
        if (row.parentId && visibleIds.has(row.parentId) && !visibleIds.has(row.id)) {
          visibleIds.add(row.id);
          changed = true;
        }
      }
    }
  }
  return { visibleIds, matchedIds };
}

export function parseAdvancedFilter(filters: Array<Record<string, unknown>>): AdvancedFilterConfig {
  const stored = filters.find((filter) => filter.kind === "advanced");
  if (!stored || !Array.isArray(stored.conditions)) return EMPTY_ADVANCED_FILTER;
  const conditions = stored.conditions.filter((condition): condition is FilterCondition => {
    if (!condition || typeof condition !== "object") return false;
    const value = condition as Record<string, unknown>;
    return typeof value.id === "string" && typeof value.field === "string" && typeof value.operator === "string" && typeof value.value === "string";
  });
  return {
    logic: stored.logic === "any" ? "any" : "all",
    conditions,
    includeAncestors: stored.includeAncestors !== false,
    includeDescendants: stored.includeDescendants === true,
    highlightMatches: stored.highlightMatches !== false,
  };
}
