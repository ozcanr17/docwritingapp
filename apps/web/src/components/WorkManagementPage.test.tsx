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
});
