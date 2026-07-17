import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OutlineRow } from "../lib/api";
import { EditImpactDialog } from "./EditImpactDialog";

const row = {
  id: "row-1",
  objectNumber: 4,
  linkCount: 1,
  linkedObjects: [{ id: "linked-1", rowType: "test_step", requirementNo: null, title: "Login verification", description: null, action: "Submit valid credentials", expectedResult: "Dashboard opens", document: { id: "test-doc", title: "Verification Tests", documentType: "test" } }],
} as OutlineRow;

describe("EditImpactDialog", () => {
  it("compares the proposed value and confirms the linked edit", () => {
    const confirm = vi.fn();
    render(<EditImpactDialog row={row} fieldLabel="Content" beforeValue="Old statement" afterValue="New statement" pending={false} onCancel={vi.fn()} onConfirm={confirm} />);
    expect(screen.getByText("Old statement")).toBeInTheDocument();
    expect(screen.getByText("New statement")).toBeInTheDocument();
    expect(screen.getByText("Verification Tests · Submit valid credentials")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("confirm-impact-edit"));
    expect(confirm).toHaveBeenCalledOnce();
  });
});
