import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./CommandPalette";

describe("CommandPalette", () => {
  it("runs a matching command from the keyboard", () => {
    const run = vi.fn();
    const onClose = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><CommandPalette workspaceId="workspace" commands={[{ id: "settings", label: "Open settings", category: "Workspace", shortcut: "Ctrl + ,", run }]} onClose={onClose} onSelectResult={vi.fn()} /></QueryClientProvider>);
    fireEvent.change(screen.getByTestId("command-palette-input"), { target: { value: ">settings" } });
    fireEvent.keyDown(screen.getByTestId("command-palette-input"), { key: "Enter" });
    expect(run).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
