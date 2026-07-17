import { renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useEscapeClose } from "./useEscapeClose";

describe("useEscapeClose", () => {
  it("closes only the topmost active layer", async () => {
    const lower = vi.fn();
    const upper = vi.fn();
    const lowerHook = renderHook(() => useEscapeClose(lower));
    const upperHook = renderHook(() => useEscapeClose(upper));
    await userEvent.keyboard("{Escape}");
    expect(upper).toHaveBeenCalledOnce();
    expect(lower).not.toHaveBeenCalled();
    upperHook.unmount();
    await userEvent.keyboard("{Escape}");
    expect(lower).toHaveBeenCalledOnce();
    lowerHook.unmount();
  });
});
