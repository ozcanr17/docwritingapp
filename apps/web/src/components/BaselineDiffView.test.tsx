import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BaselineDiffData, BaselineDiffView } from "./BaselineDiffView";

const baselineRow = {
  id: "modified",
  objectNumber: 7,
  rowType: "requirement",
  title: "Old content",
  description: null,
};

const data: BaselineDiffData = {
  revisionNumber: 1,
  semanticVersion: "1.0",
  label: "Release",
  summary: { added: 1, removed: 1, modified: 1 },
  modified: [{ id: "modified", objectNumber: 7, rowType: "requirement", title: "New content", before: baselineRow, after: { ...baselineRow, title: "New content" }, changedFields: ["title"] }],
  added: [{ id: "added", objectNumber: 8, rowType: "requirement", title: "Added content", before: null, after: { ...baselineRow, id: "added", objectNumber: 8, title: "Added content" }, changedFields: ["row"] }],
  removed: [{ id: "removed", objectNumber: 6, rowType: "requirement", title: "Removed content", before: { ...baselineRow, id: "removed", objectNumber: 6, title: "Removed content" }, after: null, changedFields: ["row"] }],
};

describe("BaselineDiffView", () => {
  it("shows side-by-side field changes and filters change kinds", () => {
    const onOpenRow = vi.fn();
    render(<BaselineDiffView data={data} onOpenRow={onOpenRow} />);
    expect(screen.getByText("Old content")).toBeInTheDocument();
    expect(screen.getAllByText("New content")).toHaveLength(2);
    expect(screen.getByTestId("baseline-diff-row-added")).toBeInTheDocument();
    expect(screen.getByTestId("baseline-diff-row-removed")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("baseline-diff-filter-modified"));
    expect(screen.queryByTestId("baseline-diff-row-added")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Detaylar\u0131 a\u00e7" }));
    expect(onOpenRow).toHaveBeenCalledWith("modified");
  });

  it("searches changes by object ID and content", () => {
    render(<BaselineDiffView data={data} onOpenRow={vi.fn()} />);
    fireEvent.change(screen.getByTestId("baseline-diff-search"), { target: { value: "8" } });
    expect(screen.getByTestId("baseline-diff-row-added")).toBeInTheDocument();
    expect(screen.queryByTestId("baseline-diff-row-modified")).not.toBeInTheDocument();
  });
});
