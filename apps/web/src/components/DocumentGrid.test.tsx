import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: { count: number }) => ({
    getTotalSize: () => options.count * 36,
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, index) => ({ index, start: index * 36, size: 36, key: index })),
    measureElement: vi.fn(),
    scrollToIndex: vi.fn(),
  }),
}));
import { OutlineRow } from "../lib/api";
import { DocumentGrid } from "./DocumentGrid";

function makeRow(partial: Partial<OutlineRow> & Pick<OutlineRow, "id" | "parentId" | "depth" | "rowType" | "title" | "displayNumber">): OutlineRow {
  return {
    objectNumber: 1,
    numberingStart: null,
    rank: "i",
    version: 1,
    description: null,
    customFields: {},
    status: null,
    priority: null,
    tags: [],
    action: null,
    expectedResult: null,
    testResult: null,
    requirementNo: null,
    linkedRequirements: [],
    linkCount: 0,
    stepNumber: null,
    ...partial,
  };
}

const rows: OutlineRow[] = [
  makeRow({ id: "r1", objectNumber: 1, parentId: null, depth: 0, rowType: "heading", title: "Giris", displayNumber: "1" }),
  makeRow({ id: "r2", objectNumber: 2, parentId: "r1", depth: 1, rowType: "requirement", title: "Gereksinim A", displayNumber: "1.1" }),
  makeRow({ id: "r3", objectNumber: 3, parentId: "r1", rank: "r", depth: 1, rowType: "requirement", title: "Gereksinim B", displayNumber: "1.2" }),
];

function renderGrid(seed: OutlineRow[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["outline", "doc-1"], seed);
  client.setQueryData(["fields", "doc-1"], []);
  return render(
    <QueryClientProvider client={client}>
      <div style={{ height: 600 }}>
        <DocumentGrid documentId="doc-1" documentType="requirement" />
      </div>
    </QueryClientProvider>,
  );
}

describe("DocumentGrid", () => {
  it("renders hierarchical rows with derived display numbers", () => {
    renderGrid(rows);
    expect(screen.getByText("1 Giris")).toBeInTheDocument();
    expect(screen.getByText("Gereksinim A")).toBeInTheDocument();
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
  });

  it("shows the empty state for a document without rows", () => {
    renderGrid([]);
    expect(screen.getByTestId("grid-empty")).toBeInTheDocument();
  });

  it("supports selecting multiple rows with row checkboxes", () => {
    renderGrid(rows);
    fireEvent.click(screen.getByTestId("select-row-1"));
    fireEvent.click(screen.getByTestId("select-row-1.1"));
    expect(screen.getByTestId("bulk-delete")).toBeInTheDocument();
  });

  it("filters by object type and shows a compact link count", () => {
    renderGrid([{ ...rows[0]!, linkCount: 2 }, rows[1]!, rows[2]!]);
    expect(screen.getByLabelText("2 ba\u011flant\u0131")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("grid-type-filter"), { target: { value: "heading" } });
    expect(screen.getByText("1 Giris")).toBeInTheDocument();
    expect(screen.queryByText("Gereksinim A")).not.toBeInTheDocument();
  });

  it("opens numbering controls for a heading", () => {
    renderGrid(rows);
    fireEvent.contextMenu(screen.getByTestId("grid-row-1"), { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByTestId("menu-numbering"));
    expect(screen.getByTestId("numbering-start")).toHaveValue(1);
    expect(screen.getByRole("button", { name: "Otomatik kullan" })).toBeInTheDocument();
  });

  it("offers subtree deletion or child promotion for a heading", () => {
    renderGrid(rows);
    fireEvent.contextMenu(screen.getByTestId("grid-row-1"), { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByTestId("menu-delete"));
    expect(screen.getByTestId("delete-promote-children")).toBeInTheDocument();
    expect(screen.getByTestId("delete-subtree")).toBeInTheDocument();
  });
});
