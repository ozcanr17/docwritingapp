import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DashboardSummary, DocumentSummary, OutlineRow } from "../lib/api";
import { DocumentOverviewPanel } from "./DocumentOverviewPanel";

const document: DocumentSummary = {
  id: "doc-1",
  title: "Flight Control Requirements",
  documentType: "requirement",
  version: 4,
  folderId: null,
  access: { restricted: true, accessLevel: "manage", canRead: true, canWrite: true, canManage: true },
};

const rows = [
  {
    id: "heading-1",
    rowType: "heading",
    linkCount: 0,
  },
  {
    id: "requirement-1",
    rowType: "requirement",
    linkCount: 1,
  },
] as OutlineRow[];

const dashboard: DashboardSummary = {
  requirements: 4,
  coveredRequirements: 3,
  suspectLinks: 1,
  incompleteTests: 2,
  qualityIssues: 1,
  qualityScore: 92,
  executions: { total: 3, passed: 2, failed: 1, blocked: 0 },
};

describe("DocumentOverviewPanel", () => {
  it("shows document context, coverage and quality when no row is selected", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["document", "doc-1"], document);
    client.setQueryData(["outline", "doc-1"], rows);
    client.setQueryData(["dashboard", "doc-1"], dashboard);
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <DocumentOverviewPanel documentId="doc-1" onClose={onClose} />
      </QueryClientProvider>,
    );

    expect(screen.getByText("Flight Control Requirements")).toBeInTheDocument();
    expect(screen.getByTestId("document-overview-version")).toHaveTextContent("4");
    expect(screen.getByTestId("document-overview-coverage")).toHaveAttribute("aria-valuenow", "75");
    expect(screen.getByText("92%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
