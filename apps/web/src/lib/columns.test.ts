import { describe, expect, it } from "vitest";
import { columnsForDocument } from "./columns";

describe("document columns", () => {
  it("uses requirement-specific columns without a type column", () => {
    const columns = columnsForDocument("requirement", []);
    expect(columns.map((column) => column.key)).toEqual(["number", "requirementNo", "title", "description"]);
    expect(columns[0]?.labelKey).toBe("rowId");
    expect(columns[1]?.labelKey).toBe("requirementNumber");
    expect(columns[2]?.labelKey).toBe("requirementDescription");
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
