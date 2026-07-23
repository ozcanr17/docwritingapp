import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { WorkManagementPage } from "./WorkManagementPage";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return { ...actual, api: vi.fn() };
});

describe("WorkManagementPage projects", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
  });

  it("creates the prerequisite project and selects it", async () => {
    let projectCreated = false;
    vi.mocked(api).mockImplementation(async (path, options) => {
      if (path === "/workspaces/workspace/projects" && options?.method === "POST") {
        projectCreated = true;
        return { id: "project", name: "System", code: "SYS", description: "Core" };
      }
      if (path === "/workspaces/workspace/projects") {
        return projectCreated
          ? [{ id: "project", name: "System", code: "SYS", description: "Core" }]
          : [];
      }
      if (path.startsWith("/workspaces/workspace/work-items")) return [];
      if (path === "/projects/project/test-plans") return [];
      if (path === "/projects/project/work-dashboard") {
        return {
          projectId: "project",
          myOpenBugs: [],
          recentItems: [],
          statusCounts: { backlog: 0, ready: 0, in_progress: 0, in_review: 0, done: 0, canceled: 0 },
          metrics: { total: 0, open: 0, completed: 0, completionRate: 0, myOpenBugCount: 0, unassigned: 0, criticalOpen: 0, activePlans: 0 },
        };
      }
      if (path === "/projects/project/workflow") {
        return {
          projectId: "project",
          version: 1,
          customized: false,
          schemes: Object.fromEntries(["epic", "story", "task", "bug", "risk"].map((type) => [type, {
            transitions: Object.fromEntries(["backlog", "ready", "in_progress", "in_review", "done", "canceled"].map((status) => [status, []])),
            requiredFields: Object.fromEntries(["backlog", "ready", "in_progress", "in_review", "done", "canceled"].map((status) => [status, []])),
          }])),
        };
      }
      return [];
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <WorkManagementPage workspaceId="workspace" />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByTestId("empty-create-project"));
    fireEvent.change(screen.getByTestId("project-name"), { target: { value: "System" } });
    fireEvent.change(screen.getByTestId("project-code"), { target: { value: "sys" } });
    fireEvent.click(screen.getByTestId("create-project"));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "/workspaces/workspace/projects",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "System", code: "SYS", description: "" }),
        }),
      ),
    );
    expect(await screen.findByTestId("project-selector")).toHaveValue("project");
  });

  it("creates a QA defect with reporter, labels, and document links", async () => {
    let createdBody: Record<string, unknown> | null = null;
    vi.mocked(api).mockImplementation(async (path, options) => {
      if (path === "/workspaces/workspace/projects") return [{ id: "project", name: "System", code: "SYS", description: "Core" }];
      if (path.startsWith("/workspaces/workspace/work-items")) return [];
      if (path === "/workspaces/workspace/work-users") return [{ id: "reporter", displayName: "QA Reporter" }];
      if (path === "/workspaces/workspace/work-documents") return [{ id: "requirements", title: "Payment Requirements", documentType: "requirement", updatedAt: "2026-07-24T10:00:00.000Z" }];
      if (path === "/projects/project/test-plans") return [];
      if (path === "/projects/project/work-dashboard") {
        return {
          projectId: "project",
          myOpenBugs: [],
          recentItems: [],
          statusCounts: { backlog: 0, ready: 0, in_progress: 0, in_review: 0, done: 0, canceled: 0 },
          metrics: { total: 0, open: 0, completed: 0, completionRate: 0, myOpenBugCount: 0, unassigned: 0, criticalOpen: 0, activePlans: 0 },
        };
      }
      if (path === "/projects/project/workflow") {
        return {
          projectId: "project",
          version: 1,
          customized: false,
          schemes: Object.fromEntries(["epic", "story", "task", "bug", "risk"].map((type) => [type, {
            transitions: Object.fromEntries(["backlog", "ready", "in_progress", "in_review", "done", "canceled"].map((status) => [status, []])),
            requiredFields: Object.fromEntries(["backlog", "ready", "in_progress", "in_review", "done", "canceled"].map((status) => [status, []])),
          }])),
        };
      }
      if (path === "/projects/project/work-items" && options?.method === "POST") {
        createdBody = JSON.parse(String(options.body)) as Record<string, unknown>;
        return { id: "defect" };
      }
      return [];
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <WorkManagementPage workspaceId="workspace" />
      </QueryClientProvider>,
    );

    const openCreateItem = await screen.findByTestId("open-create-item");
    await waitFor(() => expect(openCreateItem).toBeEnabled());
    fireEvent.click(openCreateItem);
    fireEvent.change(screen.getByTestId("work-item-summary"), { target: { value: "Payment confirmation fails" } });
    fireEvent.change(screen.getByTestId("work-item-steps"), { target: { value: "1. Submit a valid payment" } });
    fireEvent.change(screen.getByTestId("work-item-expected"), { target: { value: "Confirmation is displayed" } });
    fireEvent.change(screen.getByTestId("work-item-actual"), { target: { value: "An error page is displayed" } });
    fireEvent.change(screen.getByTestId("work-item-environment"), { target: { value: "Windows 11 / QA" } });
    fireEvent.change(screen.getByTestId("work-item-version"), { target: { value: "0.1.7" } });
    expect((await screen.findAllByRole("option", { name: "QA Reporter" })).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByTestId("work-item-reporter"), { target: { value: "reporter" } });
    fireEvent.change(screen.getByTestId("work-item-labels"), { target: { value: "payment, regression" } });
    fireEvent.click(await screen.findByTestId("work-document-requirements"));
    fireEvent.click(screen.getByTestId("create-work-item-submit"));

    await waitFor(() => expect(createdBody).not.toBeNull());
    expect(createdBody).toEqual(expect.objectContaining({
      type: "bug",
      reporterId: "reporter",
      labels: ["payment", "regression"],
      stepsToReproduce: "1. Submit a valid payment",
      expectedResult: "Confirmation is displayed",
      actualResult: "An error page is displayed",
      environment: "Windows 11 / QA",
      affectedVersion: "0.1.7",
      artifacts: [{ documentId: "requirements", role: "affects" }],
    }));
  });
});
