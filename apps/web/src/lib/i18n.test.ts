import { describe, expect, it } from "vitest";
import { resolveAppLanguage } from "./i18n";

describe("resolveAppLanguage", () => {
  it("normalizes English variants and defaults other values to Turkish", () => {
    expect(resolveAppLanguage("en")).toBe("en");
    expect(resolveAppLanguage("en-US")).toBe("en");
    expect(resolveAppLanguage("tr")).toBe("tr");
    expect(resolveAppLanguage(undefined)).toBe("tr");
  });
});
