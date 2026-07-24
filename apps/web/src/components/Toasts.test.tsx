import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useToastStore } from "../stores/toasts";
import { Toasts } from "./Toasts";

describe("Toasts", () => {
  beforeEach(() => useToastStore.setState({ toasts: [] }));

  it("announces outcomes, runs safe actions and can be dismissed", () => {
    const onAction = vi.fn();
    render(<Toasts />);
    act(() => useToastStore.getState().push("success", "Object deleted", { label: "Undo", onAction }));
    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent("Object deleted");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    act(() => useToastStore.getState().push("error", "Permission denied"));
    expect(screen.getByRole("alert")).toHaveTextContent("Permission denied");
    fireEvent.click(screen.getByRole("button", { name: /kapat|close/i }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
