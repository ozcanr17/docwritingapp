import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReportsDialog } from "./ReportsDialog";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    api: vi.fn(async (path: string) => {
      if (path.includes("direction=test_to_requirement")) return [{
        id: "test-heading",
        objectNumber: 4,
        title: "Authentication verification",
        document: { id: "test-document", title: "Verification Tests", documentType: "test" },
        requirements: [{
          linkId: "link-1",
          suspect: false,
          linkType: "verifies",
          requirementId: "requirement-1",
          requirementNo: "GER-001",
          requirementTitle: "Authorized users",
          requirementDescription: "Authorized users can sign in.",
          requirementDocument: { id: "requirement-document", title: "System Requirements", documentType: "requirement" },
        }],
      }];
      if (path.endsWith("/traceability")) return [{ id: "requirement-1", objectNumber: 2, requirementNo: "GER-001", title: "Authorized users", links: [] }];
      return [];
    }),
  };
});

describe("ReportsDialog traceability", () => {
  it("switches from requirement-to-test to one-row-per-test reverse matrix", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><ReportsDialog documentId="document-1" tab="matrix" onClose={vi.fn()} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Tablo" }));
    await waitFor(() => expect(screen.getByText("GER-001")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("trace-test-to-requirement"));
    await waitFor(() => expect(screen.getByTestId("reverse-matrix-table")).toBeInTheDocument());
    expect(screen.getByText("Authentication verification")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "XLSX d\u0131\u015fa aktar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Word (DOCX) olarak d\u0131\u015fa aktar" })).toBeInTheDocument();
  });
});
