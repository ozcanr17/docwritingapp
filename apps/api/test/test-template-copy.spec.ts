import { describe, expect, it } from "vitest";
import { testTemplateCopy } from "../src/rows/test-template-copy";

describe("testTemplateCopy", () => {
  it("returns the professional English test structure", () => {
    expect(testTemplateCopy("en")).toEqual({
      sectionTitles: ["Prerequisites", "Test Inputs", "Assumptions and Constraints", "Test Steps"],
      defaultContent: "None.",
    });
  });

  it("returns the Turkish test structure", () => {
    expect(testTemplateCopy("tr")).toEqual({
      sectionTitles: [
        "\u00d6n Ko\u015fullar",
        "Test Girdileri",
        "Varsay\u0131mlar ve K\u0131s\u0131tlamalar",
        "Test Ad\u0131mlar\u0131",
      ],
      defaultContent: "Yoktur.",
    });
  });
});
