import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ContextMenu } from "./ContextMenu";

describe("ContextMenu", () => {
  it("renders items and fires the selected action, then closes", async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <ContextMenu
        x={10}
        y={10}
        onClose={onClose}
        items={[{ key: "add", label: "Alt satir ekle", onSelect }]}
      />,
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "Alt satir ekle" }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<ContextMenu x={0} y={0} onClose={onClose} items={[]} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("opens upward when the menu would exceed the viewport", () => {
    const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      toJSON: () => ({}),
    });
    render(<ContextMenu x={20} y={700} onClose={vi.fn()} items={[{ key: "one", label: "One", onSelect: vi.fn() }]} />);
    expect(screen.getByTestId("context-menu")).toHaveStyle({ top: "500px" });
    bounds.mockRestore();
  });
});
