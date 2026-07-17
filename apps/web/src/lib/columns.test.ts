import { describe, expect, it } from "vitest";
import { columnsForDocument } from "./columns";

describe("document columns", () => {
  it("uses requirement-specific columns with an attribute column", () => {
    const columns = columnsForDocument("requirement", []);
    expect(columns.map((column) => column.key)).toEqual(["number", "requirementNo", "title", "rowType", "description"]);
    expect(columns[0]?.labelKey).toBe("rowId");
    expect(columns[1]?.labelKey).toBe("requirementNumber");
    expect(columns[2]?.labelKey).toBe("testTitle");
    expect(columns[3]?.labelKey).toBe("attribute");
  });

  it("keeps test result immediately before description", () => {
    const columns = columnsForDocument("test", [
      {
        id: "field-1",
        fieldKey: "owner_note",
        displayName: "Owner note",
        fieldType: "text",
        allowedValues: [],
        displayOrder: 0,
      },
    ]);
    expect(columns.map((column) => column.key)).toEqual([
      "number",
      "title",
      "stepNumber",
      "action",
      "expectedResult",
      "linkedRequirements",
      "custom:owner_note",
      "testResult",
      "description",
    ]);
  });
});
