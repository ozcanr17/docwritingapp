import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import i18n from "../lib/i18n";
import { WorkManagementPage } from "./WorkManagementPage";
import { useWorkViewsStore } from "../stores/workViews";
import { useAuthoringPreferencesStore } from "../stores/authoringPreferences";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return { ...actual, api: vi.fn() };
});

describe("WorkManagementPage projects", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    useWorkViewsStore.getState().reset();
    useAuthoringPreferencesStore.getState().reset();
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
          metrics: { total: 0, open: 0, completed: 0, completionRate: 0, myOpenBugCount: 0, unassigned: 0, criticalOpen: 0, activePlans: 0, requirements: 20, testCases: 4, plannedTests: 4, executions: 3, passedExecutions: 2, failedExecutions: 1, executionPassRate: 67, openDefects: 1, linkedEvidence: 24 },
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
        <MemoryRouter initialEntries={["/work/summary"]}><WorkManagementPage workspaceId="workspace" /></MemoryRouter>
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
    expect(await screen.findByTestId("engineering-lifecycle")).toHaveTextContent("20");
    expect(screen.getByTestId("engineering-lifecycle")).toHaveTextContent("%67");
    expect(screen.getByTestId("role-focus-summary")).toHaveTextContent(
      i18n.t("workspaceFocus.author.title"),
    );
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
          metrics: { total: 0, open: 0, completed: 0, completionRate: 0, myOpenBugCount: 0, unassigned: 0, criticalOpen: 0, activePlans: 0, requirements: 1, testCases: 0, plannedTests: 0, executions: 0, passedExecutions: 0, failedExecutions: 0, executionPassRate: 0, openDefects: 0, linkedEvidence: 0 },
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
        <MemoryRouter initialEntries={["/work/summary"]}><WorkManagementPage workspaceId="workspace" /></MemoryRouter>
      </QueryClientProvider>,
    );

    const openCreateItem = await screen.findByTestId("open-create-item");
    await waitFor(() => expect(openCreateItem).toBeEnabled());
    fireEvent.click(openCreateItem);
    fireEvent.change(screen.getByTestId("work-item-summary"), { target: { value: "Payment confirmation fails" } });
    fireEvent.click(screen.getByTestId("create-section-qa"));
    fireEvent.change(screen.getByTestId("work-item-steps"), { target: { value: "1. Submit a valid payment" } });
    fireEvent.change(screen.getByTestId("work-item-expected"), { target: { value: "Confirmation is displayed" } });
    fireEvent.change(screen.getByTestId("work-item-actual"), { target: { value: "An error page is displayed" } });
    fireEvent.change(screen.getByTestId("work-item-environment"), { target: { value: "Windows 11 / QA" } });
    fireEvent.change(screen.getByTestId("work-item-version"), { target: { value: "0.1.7" } });
    fireEvent.click(screen.getByTestId("create-section-relations"));
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

  it("keeps creation actions available while separating focused sections", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/workspaces/workspace/projects")
        return [{ id: "project", name: "System", code: "SYS", description: "Core" }];
      if (path.startsWith("/workspaces/workspace/work-items")) return [];
      if (path === "/workspaces/workspace/work-users") return [];
      if (path === "/workspaces/workspace/work-documents") return [];
      if (path === "/projects/project/test-plans") return [];
      if (path === "/projects/project/work-dashboard") {
        return {
          projectId: "project",
          myOpenBugs: [],
          recentItems: [],
          statusCounts: { backlog: 0, ready: 0, in_progress: 0, in_review: 0, done: 0, canceled: 0 },
          metrics: { total: 0, open: 0, completed: 0, completionRate: 0, myOpenBugCount: 0, unassigned: 0, criticalOpen: 0, activePlans: 0, requirements: 0, testCases: 0, plannedTests: 0, executions: 0, passedExecutions: 0, failedExecutions: 0, executionPassRate: 0, openDefects: 0, linkedEvidence: 0 },
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
        <MemoryRouter initialEntries={["/work/summary"]}><WorkManagementPage workspaceId="workspace" /></MemoryRouter>
      </QueryClientProvider>,
    );

    const openCreateItem = await screen.findByTestId("open-create-item");
    await waitFor(() => expect(openCreateItem).toBeEnabled());
    fireEvent.click(openCreateItem);
    const dialog = screen.getByTestId("create-work-item-dialog");
    expect(dialog.className).toContain("100dvh");
    expect(screen.getByTestId("create-work-item-submit")).toBeVisible();
    expect(screen.getByTestId("create-section-details")).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByTestId("work-item-steps")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("create-section-qa"));
    expect(screen.getByTestId("create-section-qa")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("work-item-steps")).toBeVisible();
    expect(screen.getByTestId("create-work-item-submit")).toBeVisible();

    fireEvent.click(screen.getByTestId("create-section-relations"));
    expect(screen.getByTestId("work-item-labels")).toBeVisible();
    expect(screen.queryByTestId("work-item-steps")).not.toBeInTheDocument();
  });

  it("saves and reapplies personal work filters", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/workspaces/workspace/projects")
        return [{ id: "project", name: "System", code: "SYS", description: "Core" }];
      if (path.startsWith("/workspaces/workspace/work-items")) return [];
      if (path === "/projects/project/test-plans") return [];
      if (path === "/projects/project/work-dashboard") {
        return {
          projectId: "project",
          myOpenBugs: [],
          recentItems: [],
          statusCounts: { backlog: 0, ready: 0, in_progress: 0, in_review: 0, done: 0, canceled: 0 },
          metrics: { total: 0, open: 0, completed: 0, completionRate: 0, myOpenBugCount: 0, unassigned: 0, criticalOpen: 0, activePlans: 0, requirements: 0, testCases: 0, plannedTests: 0, executions: 0, passedExecutions: 0, failedExecutions: 0, executionPassRate: 0, openDefects: 0, linkedEvidence: 0 },
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
        <MemoryRouter initialEntries={["/work/list"]}><WorkManagementPage workspaceId="workspace" /></MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.change(await screen.findByPlaceholderText(i18n.t("workHub.search")), {
      target: { value: "release" },
    });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("workHub.assignedToMe") }));
    fireEvent.click(screen.getByRole("button", { name: i18n.t("workHub.bugs") }));
    fireEvent.click(screen.getByTestId("save-work-view"));
    fireEvent.change(screen.getByTestId("work-view-name"), {
      target: { value: "Release defects" },
    });
    fireEvent.click(screen.getByTestId("confirm-save-work-view"));

    expect(await screen.findByTestId("work-view-selector")).toHaveValue(
      useWorkViewsStore.getState().views[0]?.id,
    );
    fireEvent.click(screen.getByRole("button", { name: i18n.t("workHub.assignedToMe") }));
    fireEvent.change(screen.getByTestId("work-view-selector"), {
      target: { value: useWorkViewsStore.getState().views[0]?.id },
    });

    expect(screen.getByPlaceholderText(i18n.t("workHub.search"))).toHaveValue("release");
    expect(screen.getByRole("button", { name: i18n.t("workHub.assignedToMe") })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: i18n.t("workHub.bugs") })).toHaveAttribute("aria-pressed", "true");
  });

  it("applies a workflow preset and saves transition role rules", async () => {
    const statuses = ["backlog", "ready", "in_progress", "in_review", "done", "canceled"];
    const types = ["epic", "story", "task", "bug", "risk"];
    const createSchemes = (restricted: boolean) => Object.fromEntries(types.map((type) => [type, {
      transitions: Object.fromEntries(statuses.map((status) => [status, status === "in_review" ? ["done"] : []])),
      requiredFields: Object.fromEntries(statuses.map((status) => [status, status === "done" ? ["description"] : []])),
      transitionRoles: Object.fromEntries(statuses.map((status) => [status, status === "in_review" && restricted ? { done: ["project_manager"] } : {}])),
    }]));
    let savedBody: Record<string, unknown> | null = null;
    vi.mocked(api).mockImplementation(async (path, options) => {
      if (path === "/workspaces/workspace/projects") return [{ id: "project", name: "System", code: "SYS", description: "Core", access: { canManage: true } }];
      if (path === "/workspaces/workspace/project-access") return { canManage: true };
      if (path.startsWith("/workspaces/workspace/work-items")) return [];
      if (path === "/projects/project/test-plans") return [];
      if (path === "/projects/project/work-dashboard") return {
        projectId: "project",
        myOpenBugs: [],
        recentItems: [],
        statusCounts: Object.fromEntries(statuses.map((status) => [status, 0])),
        metrics: { total: 0, open: 0, completed: 0, completionRate: 0, myOpenBugCount: 0, unassigned: 0, criticalOpen: 0, activePlans: 0, requirements: 0, testCases: 0, plannedTests: 0, executions: 0, passedExecutions: 0, failedExecutions: 0, executionPassRate: 0, openDefects: 0, linkedEvidence: 0 },
      };
      if (path === "/projects/project/workflow" && options?.method === "PUT") {
        savedBody = JSON.parse(String(options.body)) as Record<string, unknown>;
        return { projectId: "project", version: 2, customized: true, actorRoleKeys: ["organization_admin"], schemes: createSchemes(true) };
      }
      if (path === "/projects/project/workflow") return { projectId: "project", version: 1, customized: false, actorRoleKeys: ["organization_admin"], schemes: createSchemes(false) };
      if (path === "/projects/project/workflow-presets") return [{ key: "controlled", schemes: createSchemes(true) }];
      return [];
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/work/summary"]}><WorkManagementPage workspaceId="workspace" /></MemoryRouter></QueryClientProvider>);

    const workflowButton = await screen.findByTestId("open-workflow-editor");
    await waitFor(() => expect(workflowButton).toBeEnabled());
    fireEvent.click(workflowButton);
    fireEvent.click(await screen.findByTestId("workflow-preset-controlled"));
    const permissionLabel = i18n.t("workHub.transitionPermissionLabel", {
      from: i18n.t("workHub.statuses.in_review"),
      to: i18n.t("workHub.statuses.done"),
    });
    expect(screen.getByLabelText(permissionLabel)).toHaveValue("manager");
    fireEvent.click(screen.getByTestId("save-workflow"));
    await waitFor(() => expect(savedBody).not.toBeNull());
    expect(savedBody).toEqual(expect.objectContaining({
      expectedVersion: 1,
      schemes: expect.objectContaining({
        task: expect.objectContaining({
          transitionRoles: expect.objectContaining({
            in_review: { done: ["project_manager"] },
          }),
        }),
      }),
    }));
  });
});
