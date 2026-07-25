import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { TestPlanExecutionReportPage } from "./TestPlanExecutionReportPage";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return { ...actual, api: vi.fn() };
});

const document = { id: "doc-1", title: "Verification Tests", key: "SYS-17" };

function totals(overrides: Partial<Record<string, number>> = {}) {
  return { planned: 0, executed: 0, passed: 0, failed: 0, blocked: 0, skipped: 0, running: 0, notRun: 0, passRate: 0, completionRate: 0, ...overrides };
}

const report = {
  plan: {
    id: "plan-1",
    key: "SYS-31",
    name: "Execution report check",
    description: null,
    status: "active",
    environment: "Staging",
    buildReference: "2.0.0",
    startsAt: null,
    endsAt: null,
    owner: { id: "user-1", displayName: "Owner" },
    project: { id: "project-1", code: "SYS", name: "System" },
  },
  totals: totals({ planned: 4, executed: 3, passed: 1, failed: 1, running: 1, notRun: 1, passRate: 50, completionRate: 50 }),
  iterations: [
    { iteration: "Sprint 12", ...totals({ planned: 2, executed: 2, passed: 1, failed: 1, passRate: 50, completionRate: 100 }) },
    { iteration: "Sprint 13", ...totals({ planned: 2, executed: 1, running: 1, notRun: 1 }) },
  ],
  assignees: [{ id: "user-2", displayName: "Tester", totals: totals({ planned: 4, passed: 1, failed: 1, running: 1, notRun: 1, passRate: 50 }) }],
  items: [
    {
      id: "item-passed",
      iteration: "Sprint 12",
      environment: "Staging",
      assignee: { id: "user-2", displayName: "Tester" },
      testCaseRow: { id: "row-1", title: "Requirement governance", objectNumber: 14, document },
      status: "passed",
      executionCount: 1,
      latestExecution: {
        id: "exec-1", key: "SYS-32", status: "passed", environment: "Staging", buildReference: "2.0.0", iteration: "Sprint 12",
        notes: null, startedAt: null, completedAt: null, createdAt: "2026-07-25T10:00:00Z",
        executedBy: { id: "user-2", displayName: "Tester" },
        testCaseRow: { id: "row-1", title: "Requirement governance", objectNumber: 14, document },
        project: { id: "project-1", code: "SYS", name: "System" },
        testPlan: { id: "plan-1", key: "SYS-31", name: "Execution report check" },
        stepTotals: { total: 5, passed: 5, failed: 0, blocked: 0, skipped: 0, notRun: 0 },
      },
      defects: [],
    },
    {
      id: "item-failed",
      iteration: "Sprint 12",
      environment: "Staging",
      assignee: null,
      testCaseRow: { id: "row-2", title: "Workspace authoring", objectNumber: 27, document },
      status: "failed",
      executionCount: 2,
      latestExecution: {
        id: "exec-2", key: "SYS-33", status: "failed", environment: "Staging", buildReference: "2.0.0", iteration: "Sprint 12",
        notes: null, startedAt: null, completedAt: null, createdAt: "2026-07-25T10:10:00Z",
        executedBy: { id: "user-2", displayName: "Tester" },
        testCaseRow: { id: "row-2", title: "Workspace authoring", objectNumber: 27, document },
        project: { id: "project-1", code: "SYS", name: "System" },
        testPlan: { id: "plan-1", key: "SYS-31", name: "Execution report check" },
        stepTotals: { total: 5, passed: 4, failed: 1, blocked: 0, skipped: 0, notRun: 0 },
      },
      defects: [{ id: "defect-1", key: "SYS-34", title: "Step 1 regression", status: "backlog", priority: "high", type: "bug" }],
    },
    {
      id: "item-not-run",
      iteration: "Sprint 13",
      environment: null,
      assignee: null,
      testCaseRow: { id: "row-3", title: "Interoperability", objectNumber: 40, document },
      status: null,
      executionCount: 0,
      latestExecution: null,
      defects: [],
    },
  ],
  defects: [{ id: "defect-1", key: "SYS-34", title: "Step 1 regression", status: "backlog", priority: "high", type: "bug" }],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TestPlanExecutionReportPage workspaceId="workspace" />
    </QueryClientProvider>,
  );
}

describe("TestPlanExecutionReportPage", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/workspaces/workspace/projects") return [{ id: "project-1", code: "SYS", name: "System" }];
      if (path === "/projects/project-1/test-plans") return [{ id: "plan-1", key: "SYS-31", name: "Execution report check" }];
      if (path === "/test-plans/plan-1/execution-report") return report;
      return { ok: true };
    });
  });

  it("summarises planned, passed, failed and open counts", async () => {
    renderPage();

    const metrics = await screen.findByTestId("report-metrics");
    expect(metrics).toHaveTextContent("Planlanan testler");
    expect(metrics).toHaveTextContent("50%");
    expect(screen.getByTestId("report-completion")).toHaveTextContent("50%");
  });

  it("draws a bar segment only for outcomes that occurred", async () => {
    renderPage();

    expect(await screen.findByTestId("report-status-bar")).toBeInTheDocument();
    expect(screen.getByTestId("report-status-bar-passed")).toBeInTheDocument();
    expect(screen.getByTestId("report-status-bar-failed")).toBeInTheDocument();
    expect(screen.getByTestId("report-status-bar-not_run")).toBeInTheDocument();
    expect(screen.queryByTestId("report-status-bar-blocked")).not.toBeInTheDocument();
  });

  it("breaks the plan down per iteration", async () => {
    renderPage();

    expect(await screen.findByTestId("report-iterations")).toBeInTheDocument();
    expect(screen.getByTestId("report-iteration-Sprint 12")).toHaveTextContent("Sprint 12");
    expect(screen.getByTestId("report-iteration-Sprint 13")).toHaveTextContent("Sprint 13");
  });

  it("shows each planned test with its latest run, defects and never-executed state", async () => {
    renderPage();

    const passed = await screen.findByTestId("report-item-14");
    expect(passed).toHaveTextContent("SYS-32");
    expect(passed).toHaveTextContent("5 / 5");

    const failed = screen.getByTestId("report-item-27");
    expect(failed).toHaveTextContent("4 / 5");
    expect(failed).toHaveTextContent("SYS-34");

    const notRun = screen.getByTestId("report-item-40");
    expect(notRun).toHaveTextContent("Ko\u015fulmad\u0131");
    expect(screen.getByTestId("report-start-40")).toHaveTextContent("Ko\u015fumu ba\u015flat");
    expect(screen.getByTestId("report-start-27")).toHaveTextContent("Yeniden test et");
  });

  it("lists the plan defects", async () => {
    renderPage();

    expect(await screen.findByTestId("report-defect-SYS-34")).toHaveTextContent("Step 1 regression");
  });

  it("starts an execution for a planned test", async () => {
    renderPage();
    await screen.findByTestId("report-item-40");

    fireEvent.click(screen.getByTestId("report-start-40"));

    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith("/test-plan-items/item-not-run/executions", { method: "POST" }),
    );
  });

  it("shows the per-assignee breakdown when tests are assigned", async () => {
    renderPage();

    expect(await screen.findByTestId("report-assignees")).toHaveTextContent("Tester");
  });
});
