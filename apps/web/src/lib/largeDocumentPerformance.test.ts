import { describe, expect, it } from "vitest";
import { OutlineRow } from "./api";
import { applyAdvancedFilter } from "./advancedFilters";
import { builtInColumns } from "./columns";
import { matchesQuickTypeFilter } from "./outline";

function makeRows(count: number): OutlineRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `row-${index}`,
    objectNumber: index + 1,
    numberingStart: null,
    parentId: index % 20 === 0 ? null : `row-${index - (index % 20)}`,
    depth: index % 20 === 0 ? 0 : 1,
    rank: `i${index}`,
    rowType: index % 20 === 0 ? "heading" : "requirement",
    version: 1,
    title:
      index % 997 === 0
        ? `Safety critical requirement ${index}`
        : `System requirement ${index}`,
    description: `The system shall process input ${index}.`,
    customFields: {},
    status: index % 2 === 0 ? "draft" : "approved",
    priority: index % 3 === 0 ? "high" : "medium",
    tags: [],
    action: null,
    expectedResult: null,
    testResult: null,
    requirementNo: index % 20 === 0 ? null : `REQ-${index}`,
    linkedRequirements: [],
    linkedObjects: [],
    linkCount: index % 4,
    stepNumber: null,
    displayNumber: String(index + 1),
    updatedAt: "2026-07-24T12:00:00.000Z",
    updatedById: "performance-user",
    changeState: "baseline",
  }));
}

describe("large document client budgets", () => {
  it("filters, updates and derives a virtual window for 10,000 rows within the interaction budget", () => {
    const rows = makeRows(10_000);
    const columns = builtInColumns("requirement");
    const startedAt = performance.now();
    const filtered = applyAdvancedFilter(rows, columns, {
      logic: "all",
      conditions: [
        {
          id: "quality",
          field: "all",
          operator: "contains",
          value: "safety critical",
        },
      ],
      includeAncestors: true,
      includeDescendants: false,
      highlightMatches: true,
    });
    const quickMatches = rows.filter((row) =>
      matchesQuickTypeFilter(row, "requirement"),
    );
    const editedRows = rows.map((row) =>
      row.id === "row-5000"
        ? { ...row, title: "Edited system requirement", version: row.version + 1 }
        : row,
    );
    const visibleWindow = editedRows.slice(4_960, 5_040);
    const elapsedMs = performance.now() - startedAt;

    expect(filtered.matchedIds.size).toBeGreaterThan(5);
    expect(quickMatches).toHaveLength(9_500);
    expect(visibleWindow).toHaveLength(80);
    expect(visibleWindow[40]?.title).toBe("Edited system requirement");
    expect(elapsedMs).toBeLessThan(750);
  });
});
