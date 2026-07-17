import { describe, expect, it } from "vitest";
import { matchesShortcut, shortcutFromEvent } from "./keyboardShortcuts";

describe("keyboard shortcut matching", () => {
  it("normalizes modifier combinations", () => {
    const event = new KeyboardEvent("keydown", { key: "p", metaKey: true, shiftKey: true });
    const expected = /Mac|iPhone|iPad/.test(navigator.platform) ? "Mod+Shift+P" : "Shift+P";
    expect(shortcutFromEvent(event)).toBe(expected);
  });

  it("matches plain authoring keys", () => {
    expect(matchesShortcut(new KeyboardEvent("keydown", { key: "Insert" }), "Insert")).toBe(true);
    expect(matchesShortcut(new KeyboardEvent("keydown", { key: "Delete" }), "Insert")).toBe(false);
  });
});
