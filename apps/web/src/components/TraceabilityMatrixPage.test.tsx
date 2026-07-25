import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import i18n from "../lib/i18n";
import { TraceabilityMatrixPage } from "./TraceabilityMatrixPage";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return { ...actual, api: vi.fn() };
});

const documents = [{ id: "doc-req", title: "Requirements", documentType: "requirement", updatedAt: "2026-01-01T00:00:00Z" }];

const forwardRows = [
  {
    id: "req-1",
    objectNumber: 1,
    requirementNo: "GER-001",
    title: "Plate recognition",
    links: [
      { linkId: "l1", suspect: false, linkType: "verifies", sourceId: "test-1", sourceScenarioId: "test-1", sourceTitle: "KT-001", sourceType: "heading", sourceDocument: { id: "doc-test", title: "Tests", documentType: "test" } },
      { linkId: "l2", suspect: true, linkType: "verifies", sourceId: "test-2", sourceScenarioId: "test-2", sourceTitle: "KT-002", sourceType: "heading", sourceDocument: { id: "doc-test", title: "Tests", documentType: "test" } },
    ],
  },
  { id: "req-2", objectNumber: 2, requirementNo: "GER-002", title: "Barrier control", links: [] },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><TraceabilityMatrixPage workspaceId="workspace" /></QueryClientProvider>);
}

describe("TraceabilityMatrixPage", () => {
  beforeEach(() => vi.mocked(api).mockReset());

  it("builds a dot matrix with per-row link counts", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/workspaces/workspace/work-documents") return documents;
      if (path === "/documents/doc-req/traceability") return forwardRows;
      return [];
    });
    renderPage();

    expect(await screen.findByTestId("matrix-grid")).toBeInTheDocument();
    expect(screen.getByTestId("matrix-row-req-1")).toHaveTextContent("GER-001");
    expect(screen.getByTestId("matrix-row-req-1")).toHaveTextContent("2");
    expect(screen.getByTestId("matrix-row-req-2")).toHaveTextContent("GER-002");
    expect(screen.getByTestId("matrix-metrics")).toHaveTextContent("2");
  });

  it("narrows the matrix to suspect links only", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/workspaces/workspace/work-documents") return documents;
      if (path === "/documents/doc-req/traceability") return forwardRows;
      return [];
    });
    renderPage();

    await screen.findByTestId("matrix-grid");
    fireEvent.click(screen.getByTestId("matrix-suspect-only"));
    await waitFor(() => expect(screen.queryByTestId("matrix-row-req-2")).not.toBeInTheDocument());
    expect(screen.getByTestId("matrix-row-req-1")).toBeInTheDocument();
  });

  it("requests the reverse direction when the selector changes", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/workspaces/workspace/work-documents") return documents;
      if (path === "/documents/doc-req/traceability") return forwardRows;
      if (path === "/documents/doc-req/traceability?direction=test_to_requirement") {
        return [
          {
            id: "test-1",
            objectNumber: 7,
            title: "KT-001",
            document: { id: "doc-test", title: "Tests", documentType: "test" },
            requirements: [{ linkId: "l1", suspect: false, linkType: "verifies", requirementId: "req-1", requirementNo: "GER-001", requirementTitle: "Plate recognition", requirementDocument: { id: "doc-req", title: "Requirements", documentType: "requirement" } }],
          },
        ];
      }
      return [];
    });
    renderPage();

    await screen.findByTestId("matrix-grid");
    fireEvent.change(screen.getByTestId("matrix-direction"), { target: { value: "test_to_requirement" } });
    expect(await screen.findByTestId("matrix-row-test-1")).toHaveTextContent("ID 7");
  });

  it("explains an empty matrix when no links exist", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/workspaces/workspace/work-documents") return documents;
      return [];
    });
    renderPage();
    expect(await screen.findByText(i18n.t("noMatrixData"))).toBeInTheDocument();
  });
});
