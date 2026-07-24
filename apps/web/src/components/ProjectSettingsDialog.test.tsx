import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { ManagedProject, ProjectSettingsDialog } from "./ProjectSettingsDialog";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return { ...actual, api: vi.fn() };
});

const project: ManagedProject = {
  id: "project-1",
  code: "SYS",
  name: "System project",
  description: "Initial",
  access: { canManage: true },
};

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onProjectChanged = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ProjectSettingsDialog
        workspaceId="workspace-1"
        project={project}
        onProjectChanged={onProjectChanged}
        onProjectArchived={vi.fn()}
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return { onProjectChanged };
}

describe("ProjectSettingsDialog", () => {
  it("updates project details without changing the stable key", async () => {
    vi.mocked(api).mockResolvedValueOnce({ ...project, name: "Renamed project" });
    const { onProjectChanged } = renderDialog();
    fireEvent.change(screen.getByTestId("project-settings-name"), { target: { value: "Renamed project" } });
    fireEvent.click(screen.getByTestId("save-project-settings"));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/projects/project-1", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ name: "Renamed project", description: "Initial" }),
    })));
    expect(onProjectChanged).toHaveBeenCalledWith(expect.objectContaining({ name: "Renamed project" }));
    expect(screen.getAllByText(/SYS/)).toHaveLength(2);
  });

  it("lists project members and assigns an organization user", async () => {
    vi.mocked(api)
      .mockResolvedValueOnce({
        access: { canManage: true },
        members: [{ id: "member-1", displayName: "Existing User", email: "existing@example.com", roleKey: "viewer" }],
        availableUsers: [
          { id: "member-1", displayName: "Existing User", email: "existing@example.com" },
          { id: "member-2", displayName: "New User", email: "new@example.com" },
        ],
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        access: { canManage: true },
        members: [],
        availableUsers: [],
      });
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "\u00dcyeler" }));
    await screen.findByText("Existing User");
    fireEvent.click(screen.getByRole("button", { name: "\u00dcye ekle" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/projects/project-1/members", expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ userId: "member-2", roleKey: "editor" }),
    })));
  });
});
