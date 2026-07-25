import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OutlineRow } from "../lib/api";
import { DocumentOutlinePanel } from "./DocumentOutlinePanel";

const baseRow: Omit<OutlineRow, "id" | "rowType" | "title" | "displayNumber" | "depth"> = {
  objectNumber: 1,
  numberingStart: null,
  parentId: null,
  rank: "i",
  description: null,
  requirementNo: null,
  action: null,
  expectedResult: null,
  testResult: null,
  stepNumber: null,
  customFields: {},
  linkCount: 0,
  linkedRequirements: [],
  changeState: "baselined",
  version: 1,
} as unknown as Omit<OutlineRow, "id" | "rowType" | "title" | "displayNumber" | "depth">;

function row(id: string, rowType: OutlineRow["rowType"], title: string, displayNumber: string, depth: number): OutlineRow {
  return { ...baseRow, id, rowType, title, displayNumber, depth } as OutlineRow;
}

describe("DocumentOutlinePanel", () => {
  it("lists only sections and navigates on selection", () => {
    const onSelect = vi.fn();
    const rows = [
      row("h1", "heading", "Introduction", "1", 0),
      row("r1", "requirement", "Login requirement", "1.1", 1),
      row("h2", "heading", "Scope", "2", 0),
    ];
    render(<DocumentOutlinePanel rows={rows} selectedRowId="h2" onSelect={onSelect} onClose={vi.fn()} />);
    expect(screen.getByTestId("outline-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("outline-row-2")).toHaveAttribute("aria-current", "true");
    expect(screen.queryByTestId("outline-row-1.1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("outline-row-1"));
    expect(onSelect).toHaveBeenCalledWith(rows[0]);
  });

  it("closes from its header and explains the empty state", () => {
    const onClose = vi.fn();
    render(<DocumentOutlinePanel rows={[]} selectedRowId={null} onSelect={vi.fn()} onClose={onClose} />);
    expect(screen.getByTestId("document-outline")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("close-outline"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
