import { describe, expect, it } from "vitest";
import { OutlineRow } from "./api";
import { builtInColumns } from "./columns";
import { buildReplacements } from "./findReplace";

const row = {
  id: "row",
  objectNumber: 1,
  parentId: null,
  numberingStart: null,
  rank: "i",
  depth: 0,
  rowType: "requirement",
  title: "System shall stop the system",
  description: null,
  customFields: {},
  status: null,
  priority: null,
  tags: [],
  action: null,
  expectedResult: null,
  testResult: null,
  requirementNo: "REQ-1",
  linkedRequirements: [],
  linkedObjects: [],
  linkCount: 0,
  stepNumber: null,
  displayNumber: "1",
  version: 1,
  updatedAt: "2026-07-16T00:00:00.000Z",
  updatedById: "user",
  changeState: "saved_self",
} as OutlineRow;

describe("find and replace", () => {
  it("previews every occurrence before applying", () => {
    const result = buildReplacements([row], builtInColumns("requirement").filter((column) => column.key === "title"), {
      find: "system",
      replace: "controller",
      matchCase: false,
      wholeWord: true,
      regularExpression: false,
    });
    expect(result.replacements[0]).toMatchObject({ occurrences: 2, after: "controller shall stop the controller" });
  });

  it("reports invalid regular expressions without changing content", () => {
    const result = buildReplacements([row], builtInColumns("requirement"), {
      find: "(",
      replace: "",
      matchCase: false,
      wholeWord: false,
      regularExpression: true,
    });
    expect(result).toEqual({ replacements: [], error: "invalid" });
  });
});
