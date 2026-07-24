import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResizeHandle } from "./ResizeHandle";

describe("ResizeHandle", () => {
  it("supports arrow, Home and End keyboard resizing", () => {
    const onResize = vi.fn();
    render(
      <ResizeHandle
        ariaLabel="Panel width"
        max={600}
        min={200}
        onResize={onResize}
        side="left"
        value={320}
      />,
    );

    const separator = screen.getByRole("separator", { name: "Panel width" });
    expect(separator).toHaveAttribute("aria-valuetext", "320 px");

    fireEvent.keyDown(separator, { key: "ArrowRight" });
    fireEvent.keyDown(separator, { key: "Home" });
    fireEvent.keyDown(separator, { key: "End" });

    expect(onResize).toHaveBeenNthCalledWith(1, 16);
    expect(onResize).toHaveBeenNthCalledWith(2, -120);
    expect(onResize).toHaveBeenNthCalledWith(3, 280);
  });
});
