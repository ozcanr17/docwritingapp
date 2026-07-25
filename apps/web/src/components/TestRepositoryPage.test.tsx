import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import i18n from "../lib/i18n";
import { TestRepositoryPage } from "./TestRepositoryPage";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return { ...actual, api: vi.fn() };
});

const scenario = {
  id: "scenario-1",
  objectNumber: 1,
  displayNumber: "1.1",
  depth: 1,
  parentId: null,
  rowType: "heading",
  title: "KT-001 Plate recognition",
  description: null,
  action: null,
  expectedResult: null,
  stepNumber: null,
  linkCount: 1,
  linkedRequirements: [{ id: "req-1", requirementNo: "GER-001", title: "Plate must be recognized" }],
  customFields: {},
};

const step = {
  ...scenario,
  id: "step-1",
  displayNumber: "1.1.1",
  depth: 2,
  parentId: "scenario-1",
  rowType: "test_step",
  title: "",
  action: "Drive the vehicle to the gate",
  stepNumber: 1,
  linkedRequirements: [],
};

describe("TestRepositoryPage", () => {
  beforeEach(() => vi.mocked(api).mockReset());

  it("lists test documents with scenario counts and inspects coverage", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/workspaces/workspace/work-documents") {
        return [
          { id: "doc-test", title: "Acceptance Tests", documentType: "test", updatedAt: "2026-01-01T00:00:00Z" },
          { id: "doc-req", title: "System Requirements", documentType: "requirement", updatedAt: "2026-01-01T00:00:00Z" },
        ];
      }
      if (path === "/documents/doc-test/outline") return [scenario, step];
      if (path === "/documents/doc-test/executions") return [];
      return [];
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><TestRepositoryPage workspaceId="workspace" /></QueryClientProvider>);

    expect(await screen.findByTestId("repository-document-doc-test")).toBeInTheDocument();
    expect(screen.queryByTestId("repository-document-doc-req")).not.toBeInTheDocument();

    fireEvent.click(await screen.findByTestId("repository-scenario-1.1"));
    await waitFor(() => expect(screen.getByTestId("test-repository-detail")).toBeInTheDocument());
    expect(screen.getByText("GER-001")).toBeInTheDocument();
    expect(screen.getByText(i18n.t("notExecuted"))).toBeInTheDocument();
  });

  it("reveals nested steps only after expanding a scenario", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/workspaces/workspace/work-documents") {
        return [{ id: "doc-test", title: "Acceptance Tests", documentType: "test", updatedAt: "2026-01-01T00:00:00Z" }];
      }
      if (path === "/documents/doc-test/outline") return [scenario, step];
      if (path === "/documents/doc-test/executions") return [];
      return [];
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><TestRepositoryPage workspaceId="workspace" /></QueryClientProvider>);

    await screen.findByTestId("repository-scenario-1.1");
    expect(screen.queryByTestId("repository-step-1.1.1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("expandAllGroups") }));
    expect(await screen.findByTestId("repository-step-1.1.1")).toHaveTextContent("Drive the vehicle to the gate");
  });

  it("explains the empty repository when no test document exists", async () => {
    vi.mocked(api).mockImplementation(async () => []);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><TestRepositoryPage workspaceId="workspace" /></QueryClientProvider>);
    expect(await screen.findByText(i18n.t("noTestDocuments"))).toBeInTheDocument();
  });
});
