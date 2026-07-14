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

const rows: OutlineRow[] = [
  { id: "r1", parentId: null, rank: "i", depth: 0, rowType: "heading", title: "Giris", version: 1, displayNumber: "1" },
  { id: "r2", parentId: "r1", rank: "i", depth: 1, rowType: "requirement", title: "Gereksinim A", version: 1, displayNumber: "1.1" },
  { id: "r3", parentId: "r1", rank: "r", depth: 1, rowType: "requirement", title: "Gereksinim B", version: 1, displayNumber: "1.2" },
];

function renderGrid(seed: OutlineRow[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["outline", "doc-1"], seed);
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
