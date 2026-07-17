import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useKeyboardShortcutsStore } from "../stores/keyboardShortcuts";
import { KeyboardShortcutsSettings } from "./KeyboardShortcutsSettings";

describe("KeyboardShortcutsSettings", () => {
  beforeEach(() => useKeyboardShortcutsStore.getState().reset());

  it("records a user-defined shortcut", () => {
    render(<KeyboardShortcutsSettings />);
    const button = screen.getByTestId("shortcut-commandPalette");
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: "j", ctrlKey: true, shiftKey: true });
    expect(useKeyboardShortcutsStore.getState().bindings.commandPalette).toContain("Shift+J");
  });

  it("filters the visible command list", () => {
    render(<KeyboardShortcutsSettings />);
    fireEvent.change(screen.getByTestId("shortcut-search"), { target: { value: "arama" } });
    expect(screen.getByTestId("shortcut-globalSearch")).toBeInTheDocument();
    expect(screen.queryByTestId("shortcut-addObject")).not.toBeInTheDocument();
  });
});
