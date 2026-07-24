import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ModalSurface } from "./TransientSurface";

function SurfaceHarness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false);
  return <>
    <button onClick={() => setOpen(true)}>Open</button>
    {open && <ModalSurface label="Example" onClose={() => { setOpen(false); onClose(); }}>
      <button>First</button>
      <button>Last</button>
    </ModalSurface>}
  </>;
}

describe("ModalSurface", () => {
  it("closes only the active layer with Escape and restores trigger focus", async () => {
    const onClose = vi.fn();
    render(<SurfaceHarness onClose={onClose} />);
    const trigger = screen.getByRole("button", { name: "Open" });
    trigger.focus();
    fireEvent.click(trigger);
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "First" })).toHaveFocus());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(trigger).toHaveFocus());
  });

  it("traps keyboard focus and closes from the backdrop", async () => {
    const onClose = vi.fn();
    render(<SurfaceHarness onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });
    await vi.waitFor(() => expect(first).toHaveFocus());
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(first).toHaveFocus();
    fireEvent.mouseDown(screen.getByRole("dialog").parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
