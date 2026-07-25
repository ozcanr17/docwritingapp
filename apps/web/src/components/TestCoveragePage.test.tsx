import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import i18n from "../lib/i18n";
import { TestCoveragePage } from "./TestCoveragePage";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return { ...actual, api: vi.fn() };
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><TestCoveragePage workspaceId="workspace" /></QueryClientProvider>);
}

describe("TestCoveragePage", () => {
  beforeEach(() => vi.mocked(api).mockReset());

  it("aggregates coverage across documents and lists uncovered items", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/workspaces/workspace/work-documents") {
        return [
          { id: "doc-a", title: "Requirements A", documentType: "requirement", updatedAt: "2026-01-01T00:00:00Z" },
          { id: "doc-b", title: "Requirements B", documentType: "requirement", updatedAt: "2026-01-01T00:00:00Z" },
          { id: "doc-general", title: "Notes", documentType: "general_document", updatedAt: "2026-01-01T00:00:00Z" },
        ];
      }
      if (path === "/documents/doc-a/coverage") {
        return { mode: "requirement", totalItems: 10, totalRequirements: 10, covered: 8, uncovered: 2, suspect: 1, uncoveredRows: [{ id: "row-1", objectNumber: 4, title: "Missing coverage" }] };
      }
      if (path === "/documents/doc-b/coverage") {
        return { mode: "requirement", totalItems: 5, totalRequirements: 5, covered: 5, uncovered: 0, suspect: 0, uncoveredRows: [] };
      }
      return [];
    });
    renderPage();

    expect(await screen.findByTestId("coverage-by-document")).toBeInTheDocument();
    expect(screen.queryByTestId("coverage-row-doc-general")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("coverage-metrics")).toHaveTextContent("15"));
    expect(screen.getByTestId("coverage-metrics")).toHaveTextContent("13");
    expect(await screen.findByTestId("uncovered-row-4")).toHaveTextContent("Missing coverage");
  });

  it("switches the detail card when another document row is chosen", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/workspaces/workspace/work-documents") {
        return [
          { id: "doc-a", title: "Requirements A", documentType: "requirement", updatedAt: "2026-01-01T00:00:00Z" },
          { id: "doc-b", title: "Requirements B", documentType: "requirement", updatedAt: "2026-01-01T00:00:00Z" },
        ];
      }
      if (path === "/documents/doc-a/coverage") {
        return { mode: "requirement", totalItems: 4, totalRequirements: 4, covered: 4, uncovered: 0, suspect: 0, uncoveredRows: [] };
      }
      if (path === "/documents/doc-b/coverage") {
        return { mode: "requirement", totalItems: 3, totalRequirements: 3, covered: 1, uncovered: 2, suspect: 0, uncoveredRows: [{ id: "row-9", objectNumber: 9, title: "Uncovered B" }] };
      }
      return [];
    });
    renderPage();

    await waitFor(() => expect(screen.getByTestId("coverage-detail")).toHaveTextContent(i18n.t("allCovered")));
    fireEvent.click(screen.getByTestId("coverage-row-doc-b"));
    expect(await screen.findByTestId("uncovered-row-9")).toHaveTextContent("Uncovered B");
  });

  it("explains the empty state when nothing can be analysed", async () => {
    vi.mocked(api).mockImplementation(async () => []);
    renderPage();
    expect(await screen.findByText(i18n.t("noRequirementDocuments"))).toBeInTheDocument();
  });
});
