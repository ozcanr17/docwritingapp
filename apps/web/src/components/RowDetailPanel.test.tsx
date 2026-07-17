import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RowDetail } from "../lib/api";
import { RowDetailPanel } from "./RowDetailPanel";

const row = vi.hoisted(() => ({
  id: "row",
  objectNumber: 7,
  numberingStart: null,
  documentId: "document",
  parentId: null,
  rowType: "requirement",
  title: "System requirement",
  description: "The system shall respond.",
  version: 1,
  customFields: {},
  document: { id: "document", title: "Requirements", documentType: "requirement" },
  requirementDetail: { requirementNo: "REQ-007", status: "draft", priority: null, rationale: null },
  testCaseDetail: null,
  testStepDetail: null,
  outgoingLinks: [],
  incomingLinks: [],
  rowProjects: [],
} satisfies RowDetail));

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    api: vi.fn(async (path: string) => path === "/rows/row" ? row : []),
  };
});

describe("RowDetailPanel", () => {
  it("keeps content, links, comments and attachments in separate detail tabs", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><RowDetailPanel rowId="row" documentId="document" variant="primary" /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByTestId("detail-description")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("detail-tab-links"));
    expect(screen.getByTestId("link-target")).toBeInTheDocument();
    expect(screen.queryByTestId("detail-description")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("detail-tab-comments"));
    expect(screen.getByTestId("comment-input")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("detail-tab-attachments"));
    expect(screen.getByTestId("attachment-input")).toBeInTheDocument();
  });
});
