import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
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
import { useAuthoringPreferencesStore } from "../stores/authoringPreferences";
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
    linkedObjects: [],
    linkCount: 0,
    stepNumber: null,
    updatedAt: "2026-07-15T12:00:00.000Z",
    updatedById: "user-1",
    changeState: "saved_self",
    ...partial,
  };
}

const rows: OutlineRow[] = [
  makeRow({ id: "r1", objectNumber: 1, parentId: null, depth: 0, rowType: "heading", title: "Giris", displayNumber: "1" }),
  makeRow({ id: "r2", objectNumber: 2, parentId: "r1", depth: 1, rowType: "requirement", title: "Gereksinim A", displayNumber: "1.1" }),
  makeRow({ id: "r3", objectNumber: 3, parentId: "r1", rank: "r", depth: 1, rowType: "requirement", title: "Gereksinim B", displayNumber: "1.2" }),
];

function renderGrid(seed: OutlineRow[], documentType: "requirement" | "test" = "requirement") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["outline", "doc-1"], seed);
  client.setQueryData(["fields", "doc-1"], []);
  return render(
    <QueryClientProvider client={client}>
      <div style={{ height: 600 }}>
        <DocumentGrid documentId="doc-1" documentType={documentType} />
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

  it("scrolls the ID column normally while freezing only content columns", () => {
    renderGrid(rows);
    expect(screen.getByRole("columnheader", { name: "ID" })).not.toHaveClass("sticky");
    expect(screen.getByRole("columnheader", { name: "Gereksinim No" })).toHaveClass("sticky");
  });

  it("applies the preferred document typeface and text size", () => {
    act(() => {
      useAuthoringPreferencesStore.getState().setDocumentFontSize(18);
      useAuthoringPreferencesStore.getState().setDocumentFontFamily("serif");
    });
    renderGrid(rows);
    expect(screen.getByTestId("grid-row-1")).toHaveStyle({ fontSize: "18px", fontFamily: "Georgia, 'Times New Roman', serif" });
    act(() => useAuthoringPreferencesStore.getState().reset());
  });

  it("shows the empty state for a document without rows", () => {
    renderGrid([]);
    expect(screen.getByTestId("grid-empty")).toBeInTheDocument();
  });

  it("supports selecting multiple rows with modifier keys", () => {
    renderGrid(rows);
    fireEvent.click(screen.getByTestId("grid-row-1"));
    fireEvent.click(screen.getByTestId("grid-row-1.1"), { ctrlKey: true });
    expect(screen.getByTestId("bulk-delete")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /select/i })).not.toBeInTheDocument();
  });

  it("shows a saved change indicator on the row edge", () => {
    renderGrid(rows);
    expect(screen.getByTestId("row-change-state-1")).toHaveClass("bg-primary");
  });

  it("collapses and expands a hierarchy from the heading affordance", () => {
    renderGrid(rows);
    fireEvent.click(screen.getByTestId("toggle-row-1"));
    expect(screen.queryByTestId("grid-row-1.1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("toggle-row-1"));
    expect(screen.getByTestId("grid-row-1.1")).toBeInTheDocument();
  });

  it("collapses and expands every group from the document toolbar", () => {
    renderGrid(rows);
    fireEvent.click(screen.getByTestId("collapse-all"));
    expect(screen.queryByTestId("grid-row-1.1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("expand-all"));
    expect(screen.getByTestId("grid-row-1.1")).toBeInTheDocument();
  });

  it("filters by object type and shows a compact link count", () => {
    renderGrid([{ ...rows[0]!, linkCount: 2 }, rows[1]!, rows[2]!]);
    expect(screen.getByLabelText("2 ba\u011flant\u0131")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("grid-type-filter"), { target: { value: "heading" } });
    expect(screen.getByText("1 Giris")).toBeInTheDocument();
    expect(screen.queryByText("Gereksinim A")).not.toBeInTheDocument();
  });

  it("quick-filters test steps by populated Test step content, regardless of technical row type", () => {
    const contentStep = makeRow({ id: "content-step", objectNumber: 4, parentId: null, depth: 0, rowType: "heading", title: "Imported row", action: "Verify imported behavior", displayNumber: "2" });
    renderGrid([rows[0]!, contentStep], "test");
    fireEvent.change(screen.getByTestId("grid-type-filter"), { target: { value: "test_step" } });
    expect(screen.getByText("Verify imported behavior")).toBeInTheDocument();
    expect(screen.queryByText("1 Giris")).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Test ba\u015fl\u0131\u011f\u0131" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Gereksinim" })).not.toBeInTheDocument();
  });

  it("opens linked object previews from the compact link count", () => {
    renderGrid([{
      ...rows[0]!,
      linkCount: 1,
      linkedObjects: [{
        id: "linked-step",
        rowType: "test_step",
        requirementNo: null,
        title: "",
        description: null,
        action: "Open the login page and submit valid credentials.",
        expectedResult: "The user dashboard opens.",
        document: { id: "test-document", title: "Verification Tests", documentType: "test" },
      }],
    }, rows[1]!, rows[2]!]);
    fireEvent.click(screen.getByTestId("link-count-1"));
    expect(screen.getByTestId("link-preview")).toBeInTheDocument();
    expect(screen.getByText("Verification Tests")).toBeInTheDocument();
    expect(screen.getByText(/Open the login page/)).toBeInTheDocument();
  });

  it("combines advanced filters and preserves matching hierarchy context", () => {
    renderGrid(rows);
    fireEvent.click(screen.getByTestId("advanced-filter-toggle"));
    fireEvent.click(screen.getByTestId("add-filter-condition"));
    fireEvent.change(screen.getByLabelText("S\u00fctun"), { target: { value: "title" } });
    fireEvent.change(screen.getByLabelText("De\u011fer"), { target: { value: "Gereksinim A" } });
    expect(screen.getByTestId("grid-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("grid-row-1.1")).toHaveClass("ring-primary/40");
    expect(screen.queryByTestId("grid-row-1.2")).not.toBeInTheDocument();
  });

  it("previews scoped find and replace without changing rows", () => {
    renderGrid(rows);
    fireEvent.click(screen.getByTestId("find-replace-toggle"));
    fireEvent.change(screen.getByTestId("find-text"), { target: { value: "Gereksinim" } });
    fireEvent.change(screen.getByTestId("replace-text"), { target: { value: "\u0130ster" } });
    expect(screen.getByText("2 h\u00fccrede 2 e\u015fle\u015fme")).toBeInTheDocument();
    expect(screen.getByText("\u0130ster A")).toBeInTheDocument();
    expect(screen.getAllByText("Gereksinim A").length).toBeGreaterThanOrEqual(2);
  });

  it("opens the reusable template library without leaving the document", () => {
    renderGrid(rows);
    fireEvent.click(screen.getByTestId("template-library-toggle"));
    expect(screen.getByTestId("template-library")).toBeInTheDocument();
    expect(screen.getByTestId("template-name")).toBeInTheDocument();
  });

  it("offers the main row operations as compact toolbar commands", () => {
    renderGrid(rows);
    fireEvent.click(screen.getByTestId("grid-row-1.1"));
    expect(screen.getByTestId("add-object")).toHaveAccessibleName(/Nesne ekle/);
    expect(screen.getByTestId("toolbar-indent")).toBeEnabled();
    expect(screen.getByTestId("toolbar-outdent")).toBeEnabled();
    expect(screen.getByTestId("toolbar-open-details")).toBeEnabled();
    expect(screen.getByTestId("toolbar-delete")).toBeEnabled();
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

  it("edits heading numbering together with content", () => {
    renderGrid(rows);
    fireEvent.doubleClick(screen.getAllByTestId("cell-value-title")[0] as HTMLElement);
    expect(screen.getByTestId("cell-input-title")).toHaveValue("Giris");
    expect(screen.getByTestId("inline-numbering-start")).toHaveValue(1);
    fireEvent.click(screen.getByTestId("inline-numbering-start"));
    expect(screen.getByTestId("cell-input-title")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("cell-input-title"), { target: { value: "Changed" } });
    fireEvent.keyDown(screen.getByTestId("cell-input-title"), { key: "Escape" });
    expect(screen.queryByTestId("cell-input-title")).not.toBeInTheDocument();
    expect(screen.getByText("1 Giris")).toBeInTheDocument();
  });

  it("offers another test step from a test step and edits its step number", () => {
    const step = makeRow({ id: "step-1", parentId: null, depth: 0, rowType: "test_step", title: "", displayNumber: "1", stepNumber: 3 });
    renderGrid([step], "test");
    fireEvent.contextMenu(screen.getByTestId("grid-row-1"), { clientX: 10, clientY: 10 });
    expect(screen.getByTestId("menu-testStepAfter")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.doubleClick(screen.getByTestId("cell-value-stepNumber"));
    expect(screen.getByTestId("cell-input-stepNumber")).toHaveValue("3");
  });

  it("hides a column from the active view immediately", () => {
    renderGrid(rows);
    fireEvent.contextMenu(screen.getByRole("columnheader", { name: "Gereksinim No" }));
    fireEvent.click(screen.getByTestId("menu-hide"));
    expect(screen.queryByRole("button", { name: "Gereksinim No" })).not.toBeInTheDocument();
  });
});
