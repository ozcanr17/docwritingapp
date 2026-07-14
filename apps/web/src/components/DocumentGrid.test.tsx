import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: { count: number }) => ({
    getTotalSize: () => options.count * 36,
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, index) => ({ index, start: index * 36, size: 36, key: index })),
  }),
}));
import { OutlineRow } from "../lib/api";
import { DocumentGrid } from "./DocumentGrid";

function makeRow(partial: Partial<OutlineRow> & Pick<OutlineRow, "id" | "parentId" | "depth" | "rowType" | "title" | "displayNumber">): OutlineRow {
  return {
    rank: "i",
    version: 1,
    description: null,
    customFields: {},
    status: null,
    priority: null,
    tags: [],
    action: null,
    expectedResult: null,
    ...partial,
  };
}

const rows: OutlineRow[] = [
  makeRow({ id: "r1", parentId: null, depth: 0, rowType: "heading", title: "Giris", displayNumber: "1" }),
  makeRow({ id: "r2", parentId: "r1", depth: 1, rowType: "requirement", title: "Gereksinim A", displayNumber: "1.1" }),
  makeRow({ id: "r3", parentId: "r1", rank: "r", depth: 1, rowType: "requirement", title: "Gereksinim B", displayNumber: "1.2" }),
];

function renderGrid(seed: OutlineRow[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["outline", "doc-1"], seed);
  client.setQueryData(["fields", "doc-1"], []);
  return render(
    <QueryClientProvider client={client}>
      <div style={{ height: 600 }}>
        <DocumentGrid documentId="doc-1" />
      </div>
    </QueryClientProvider>,
  );
}

describe("DocumentGrid", () => {
  it("renders hierarchical rows with derived display numbers", () => {
    renderGrid(rows);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Gereksinim A")).toBeInTheDocument();
    expect(screen.getByText("1.2")).toBeInTheDocument();
  });

  it("shows the empty state for a document without rows", () => {
    renderGrid([]);
    expect(screen.getByTestId("grid-empty")).toBeInTheDocument();
  });
});
