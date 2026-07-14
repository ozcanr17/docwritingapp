import { describe, expect, it } from "vitest";
import { OutlineRow } from "./api";
import { insertOptions } from "./outline";

function row(partial: Pick<OutlineRow, "id" | "parentId" | "depth" | "rowType" | "displayNumber">): OutlineRow {
  return {
    rank: "i",
    version: 1,
    title: "",
    description: null,
    customFields: {},
    status: null,
    priority: null,
    tags: [],
    action: null,
    expectedResult: null,
    ...partial,
  };
}

const rows: OutlineRow[] = [
  row({ id: "a", parentId: null, depth: 0, rowType: "heading", displayNumber: "2" }),
  row({ id: "b", parentId: "a", depth: 1, rowType: "heading", displayNumber: "2.3" }),
  row({ id: "c", parentId: "b", depth: 2, rowType: "requirement", displayNumber: "2.3.4" }),
];

describe("insertOptions", () => {
  it("offers child, sibling, and one option per ancestor level", () => {
    const options = insertOptions(rows, rows[2]!);
    expect(options.map((o) => o.number)).toEqual(["2.3.4.1", "2.3.5", "2.4", "3"]);
    expect(options[0]).toMatchObject({ parentId: "c", rowType: "requirement" });
    expect(options[1]).toMatchObject({ parentId: "b", afterRowId: "c", rowType: "requirement" });
    expect(options[2]).toMatchObject({ parentId: "a", afterRowId: "b", rowType: "heading" });
    expect(options[3]).toMatchObject({ parentId: null, afterRowId: "a", rowType: "heading" });
  });

  it("numbers a new child after existing children", () => {
    const withChild = [...rows, row({ id: "d", parentId: "c", depth: 3, rowType: "requirement", displayNumber: "2.3.4.1" })];
    const options = insertOptions(withChild, withChild[2]!);
    expect(options[0]).toMatchObject({ number: "2.3.4.2", parentId: "c", afterRowId: "d" });
  });

  it("suggests a test step child under a test case", () => {
    const tc = [row({ id: "t", parentId: null, depth: 0, rowType: "test_case", displayNumber: "1" })];
    expect(insertOptions(tc, tc[0]!)[0]).toMatchObject({ number: "1.1", rowType: "test_step" });
  });
});
