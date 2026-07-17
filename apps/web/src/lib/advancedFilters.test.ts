import { describe, expect, it } from "vitest";
import { OutlineRow } from "./api";
import { AdvancedFilterConfig, applyAdvancedFilter } from "./advancedFilters";
import { builtInColumns } from "./columns";

const base = {
  objectNumber: 1,
  numberingStart: null,
  rank: "i",
  version: 1,
  description: null,
  customFields: {},
  status: null,
  priority: null,
  tags: [],
  action: null,
  expectedResult: null,
  testResult: null,
  requirementNo: null,
  linkedRequirements: [],
  linkedObjects: [],
  linkCount: 0,
  stepNumber: null,
  updatedAt: "2026-07-16T00:00:00.000Z",
  updatedById: "user",
  changeState: "saved_self" as const,
};

const rows: OutlineRow[] = [
  { ...base, id: "heading", parentId: null, depth: 0, rowType: "heading", title: "Safety", displayNumber: "1" },
  { ...base, id: "match", parentId: "heading", depth: 1, rowType: "requirement", title: "Emergency shutdown", displayNumber: "1.1", requirementNo: "REQ-1" },
  { ...base, id: "other", parentId: "heading", depth: 1, rowType: "requirement", title: "Normal operation", displayNumber: "1.2", requirementNo: "REQ-2" },
];

describe("advanced filters", () => {
  it("combines conditions and retains matching hierarchy context", () => {
    const config: AdvancedFilterConfig = {
      logic: "all",
      conditions: [
        { id: "1", field: "rowType", operator: "equals", value: "requirement" },
        { id: "2", field: "title", operator: "contains", value: "shutdown" },
      ],
      includeAncestors: true,
      includeDescendants: false,
      highlightMatches: true,
    };
    const result = applyAdvancedFilter(rows, builtInColumns("requirement"), config);
    expect([...result.matchedIds]).toEqual(["match"]);
    expect([...result.visibleIds]).toEqual(["match", "heading"]);
  });

  it("can include descendants of a matched heading", () => {
    const result = applyAdvancedFilter(rows, builtInColumns("requirement"), {
      logic: "any",
      conditions: [{ id: "1", field: "title", operator: "equals", value: "Safety" }],
      includeAncestors: false,
      includeDescendants: true,
      highlightMatches: false,
    });
    expect(result.visibleIds.size).toBe(3);
  });

  it("supports numeric, list, regular-expression and case-sensitive operators", () => {
    const linked = { ...rows[1]!, linkCount: 3, tags: ["Safety", "Release"] };
    expect(applyAdvancedFilter([linked], builtInColumns("requirement"), { logic: "all", conditions: [{ id: "1", field: "linkCount", operator: "greater_or_equal", value: "2" }], includeAncestors: false, includeDescendants: false, highlightMatches: true }).matchedIds.has(linked.id)).toBe(true);
    expect(applyAdvancedFilter([linked], builtInColumns("requirement"), { logic: "all", conditions: [{ id: "1", field: "tags", operator: "matches_regex", value: "safety|security" }], includeAncestors: false, includeDescendants: false, highlightMatches: true }).matchedIds.has(linked.id)).toBe(true);
    expect(applyAdvancedFilter([linked], builtInColumns("requirement"), { logic: "all", conditions: [{ id: "1", field: "title", operator: "starts_with", value: "emergency", caseSensitive: true }], includeAncestors: false, includeDescendants: false, highlightMatches: true }).matchedIds.has(linked.id)).toBe(false);
  });
});
