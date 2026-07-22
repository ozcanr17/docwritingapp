import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, TestExecution } from "../lib/api";
import { ExecutionStepCard } from "./ExecutionStepCard";

vi.mock("../lib/api", async () => {
  const actual =
    await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return { ...actual, api: vi.fn(async () => ({})) };
});

const step: TestExecution["steps"][number] = {
  id: "execution-step",
  status: "running",
  actualResult: null,
  evidence: [],
  testStepRow: {
    id: "step-row",
    title: "Open application",
    testStepDetail: { action: "Open", expectedResult: "Ready" },
  },
};

describe("ExecutionStepCard", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    vi.mocked(api).mockResolvedValue({});
  });

  it("stores an actual result and links a defect to the execution step", async () => {
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const onChanged = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <ExecutionStepCard
          executionId="execution"
          step={step}
          editable
          onChanged={onChanged}
        />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByTestId("actual-result-step-row"), {
      target: { value: "Application opened" },
    });
    fireEvent.click(screen.getByTestId("save-actual-result-step-row"));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "/executions/execution/steps/step-row",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            status: "running",
            actualResult: "Application opened",
          }),
        }),
      ),
    );

    fireEvent.click(screen.getByTestId("evidence-toggle-step-row"));
    fireEvent.change(screen.getByTestId("defect-reference-step-row"), {
      target: { value: "BUG-42" },
    });
    fireEvent.change(screen.getByTestId("defect-url-step-row"), {
      target: { value: "https://issues.example.test/BUG-42" },
    });
    fireEvent.click(screen.getByTestId("add-defect-step-row"));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "/executions/execution/steps/step-row/evidence",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("creates an internal work item from a failed execution step", async () => {
    vi.mocked(api).mockImplementation(async (path) =>
      path.endsWith("/defect-projects")
        ? [{ id: "project", name: "Delivery", code: "DEL" }]
        : path.endsWith("/internal-defect")
          ? { key: "DEL-7" }
          : {},
    );
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const failedStep = { ...step, status: "failed" as const };
    render(
      <QueryClientProvider client={client}>
        <ExecutionStepCard
          executionId="execution"
          step={failedStep}
          editable
          onChanged={vi.fn()}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByTestId("evidence-toggle-step-row"));
    await screen.findByText("DEL - Delivery");
    fireEvent.change(screen.getByTestId("internal-defect-title-step-row"), {
      target: { value: "Login accepts invalid password" },
    });
    fireEvent.click(screen.getByTestId("create-internal-defect-step-row"));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "/executions/execution/steps/step-row/internal-defect",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            projectId: "project",
            title: "Login accepts invalid password",
            priority: "high",
          }),
        }),
      ),
    );
  });
});
