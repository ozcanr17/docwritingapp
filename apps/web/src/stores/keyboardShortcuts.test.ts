import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SHORTCUTS } from "../lib/keyboardShortcuts";
import { useKeyboardShortcutsStore } from "./keyboardShortcuts";

describe("keyboard shortcuts", () => {
  beforeEach(() => useKeyboardShortcutsStore.getState().reset());

  it("customizes and restores a command binding", () => {
    useKeyboardShortcutsStore.getState().setBinding("globalSearch", "Mod+Shift+G");
    expect(useKeyboardShortcutsStore.getState().bindings.globalSearch).toBe("Mod+Shift+G");
    useKeyboardShortcutsStore.getState().resetBinding("globalSearch");
    expect(useKeyboardShortcutsStore.getState().bindings.globalSearch).toBe(DEFAULT_SHORTCUTS.globalSearch);
  });

  it("removes a conflicting binding from the previous command", () => {
    useKeyboardShortcutsStore.getState().setBinding("globalSearch", DEFAULT_SHORTCUTS.commandPalette);
    expect(useKeyboardShortcutsStore.getState().bindings.globalSearch).toBe(DEFAULT_SHORTCUTS.commandPalette);
    expect(useKeyboardShortcutsStore.getState().bindings.commandPalette).toBe("");
  });
});
