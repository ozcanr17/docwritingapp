import { describe, expect, it } from "vitest";
import { wordingQualityRules } from "../src/lifecycle/requirement-quality";

describe("wordingQualityRules", () => {
  it("detects ambiguous and weak English wording", () => {
    expect(wordingQualityRules("The system should normally respond in approximately two seconds.")).toEqual([
      "ambiguous_wording",
      "weak_obligation",
    ]);
  });

  it("detects ambiguous and weak Turkish wording", () => {
    expect(wordingQualityRules("Sistem gerekti\u011finde kullan\u0131c\u0131ya bildirim sa\u011flayabilir.")).toEqual([
      "ambiguous_wording",
      "weak_obligation",
    ]);
  });

  it("does not flag measurable normative statements", () => {
    expect(wordingQualityRules("The system shall lock the account after five failed attempts.")).toEqual([]);
    expect(wordingQualityRules("Sistem be\u015f hatal\u0131 denemeden sonra hesab\u0131 kilitlemelidir.")).toEqual([]);
  });
});
