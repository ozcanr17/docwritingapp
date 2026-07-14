import { describe, expect, it } from "vitest";
import { initialRank, rankBetween } from "../src/common/rank";

describe("rankBetween", () => {
  it("orders generated ranks correctly", () => {
    const first = initialRank();
    const after = rankBetween(first, null);
    const before = rankBetween(null, first);
    const between = rankBetween(first, after);
    expect(before < first).toBe(true);
    expect(first < between).toBe(true);
    expect(between < after).toBe(true);
  });

  it("supports many sequential inserts between two ranks", () => {
    let low = initialRank();
    const high = rankBetween(low, null);
    const generated: string[] = [low, high];
    for (let i = 0; i < 200; i += 1) {
      const mid = rankBetween(low, high);
      expect(low < mid).toBe(true);
      expect(mid < high).toBe(true);
      generated.push(mid);
      low = mid;
    }
    const sorted = [...generated].sort();
    expect(new Set(generated).size).toBe(generated.length);
    expect(sorted).toEqual([...generated].sort());
  });

  it("never generates ranks ending with the minimal digit", () => {
    let low: string | null = null;
    let high: string | null = initialRank();
    for (let i = 0; i < 100; i += 1) {
      const mid: string = rankBetween(low, high);
      expect(mid.endsWith("0")).toBe(false);
      high = mid;
    }
  });
});
