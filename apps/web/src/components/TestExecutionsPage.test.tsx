import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { TestExecutionsPage } from "./TestExecutionsPage";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return { ...actual, api: vi.fn() };
});

const document = { id: "doc-1", title: "Verification Tests", key: "SYS-17" };

const executions = {
  executions: [
    {
      id: "exec-failed",
      key: "SYS-33",
      status: "failed",
      environment: "Staging",
      buildReference: "2.0.0",
      iteration: "Sprint 12",
      notes: null,
      startedAt: "2026-07-25T10:00:00Z",
      completedAt: "2026-07-25T10:30:00Z",
      createdAt: "2026-07-25T10:00:00Z",
      executedBy: { id: "user-1", displayName: "Tester" },
      testCaseRow: { id: "row-2", title: "Workspace authoring", objectNumber: 27, document },
      project: { id: "project-1", code: "SYS", name: "System" },
      testPlan: { id: "plan-1", key: "SYS-31", name: "Release plan" },
      stepTotals: { total: 5, passed: 4, failed: 1, blocked: 0, skipped: 0, notRun: 0 },
    },
    {
      id: "exec-adhoc",
      key: "SYS-30",
      status: "running",
      environment: null,
      buildReference: null,
      iteration: null,
      notes: null,
      startedAt: "2026-07-25T09:00:00Z",
      completedAt: null,
      createdAt: "2026-07-25T09:00:00Z",
      executedBy: { id: "user-1", displayName: "Tester" },
      testCaseRow: { id: "row-1", title: "Requirement governance", objectNumber: 14, document },
      project: { id: "project-1", code: "SYS", name: "System" },
      testPlan: null,
      stepTotals: { total: 5, passed: 0, failed: 0, blocked: 0, skipped: 0, notRun: 5 },
    },
  ],
  totals: { planned: 2, executed: 2, passed: 0, failed: 1, blocked: 0, skipped: 0, running: 1, notRun: 0, passRate: 0, completionRate: 50 },
};

const scenarios = [
  { id: "row-1", title: "Requirement governance", objectNumber: 14, stepCount: 5, document },
  { id: "row-9", title: "Payment flow", objectNumber: 44, stepCount: 3, document: { id: "doc-2", title: "Acceptance", key: "SYS-19" } },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TestExecutionsPage workspaceId="workspace" />
    </QueryClientProvider>,
  );
}

describe("TestExecutionsPage", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    vi.mocked(api).mockImplementation(async (path) => {
      if (path.startsWith("/workspaces/workspace/test-executions")) return executions;
      if (path === "/workspaces/workspace/test-scenarios") return scenarios;
      if (path === "/workspaces/workspace/projects") return [{ id: "project-1", code: "SYS", name: "System" }];
      return [];
    });
  });

  it("lists executions with their key, plan and step outcome", async () => {
    renderPage();

    const failed = await screen.findByTestId("execution-SYS-33");
    expect(failed).toHaveTextContent("SYS-33");
    expect(failed).toHaveTextContent("4 / 5");
    expect(failed).toHaveTextContent("SYS-31");
    expect(screen.getByTestId("execution-SYS-30")).toHaveTextContent("SYS-30");
  });

  it("marks a plan-less execution as ad hoc", async () => {
    renderPage();

    expect(await screen.findByTestId("execution-SYS-30")).toHaveTextContent("Plans\u0131z");
  });

  it("renders one bar segment per non-zero outcome", async () => {
    renderPage();

    expect(await screen.findByTestId("executions-status-bar")).toBeInTheDocument();
    expect(screen.getByTestId("executions-status-bar-failed")).toBeInTheDocument();
    expect(screen.getByTestId("executions-status-bar-running")).toBeInTheDocument();
    expect(screen.queryByTestId("executions-status-bar-passed")).not.toBeInTheDocument();
    expect(screen.getByTestId("executions-status-bar-legend-passed")).toBeInTheDocument();
  });

  it("sends the selected status filters to the API", async () => {
    renderPage();
    await screen.findByTestId("execution-SYS-33");

    fireEvent.click(screen.getByTestId("execution-status-filter-failed"));
    fireEvent.click(screen.getByTestId("execution-status-filter-blocked"));

    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith("/workspaces/workspace/test-executions?status=failed%2Cblocked"),
    );
  });

  it("creates an execution for the chosen scenario with run metadata", async () => {
    renderPage();
    await screen.findByTestId("execution-SYS-33");

    fireEvent.click(screen.getByTestId("open-create-execution"));
    expect(await screen.findByTestId("execution-candidate-44")).toHaveTextContent("3 ad\u0131m");

    fireEvent.click(screen.getByTestId("execution-candidate-44"));
    fireEvent.change(screen.getByTestId("execution-environment"), { target: { value: "Staging" } });
    fireEvent.change(screen.getByTestId("execution-build"), { target: { value: "2.1.0" } });
    fireEvent.change(screen.getByTestId("execution-iteration"), { target: { value: "Sprint 13" } });
    fireEvent.click(screen.getByTestId("submit-create-execution"));

    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith("/rows/row-9/executions", {
        method: "POST",
        body: JSON.stringify({ environment: "Staging", buildReference: "2.1.0", iteration: "Sprint 13" }),
      }),
    );
  });

  it("keeps the start button disabled until a scenario is chosen", async () => {
    renderPage();
    await screen.findByTestId("execution-SYS-33");

    fireEvent.click(screen.getByTestId("open-create-execution"));
    await screen.findByTestId("execution-candidate-14");
    expect(screen.getByTestId("submit-create-execution")).toBeDisabled();

    fireEvent.click(screen.getByTestId("execution-candidate-14"));
    expect(screen.getByTestId("submit-create-execution")).toBeEnabled();
  });
});
