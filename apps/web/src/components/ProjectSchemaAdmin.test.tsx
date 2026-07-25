import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { ProjectSchemaAdmin } from "./ProjectSchemaAdmin";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return { ...actual, api: vi.fn() };
});

const schema = {
  types: [
    { id: "type-task", key: "task", name: "Task", baseType: "task", color: null, isSystem: true, displayOrder: 2 },
    { id: "type-change", key: "change_request", name: "Change Request", baseType: "task", color: null, isSystem: false, displayOrder: 5 },
  ],
  fields: [
    { id: "field-impact", key: "impact_area", label: "Impact area", fieldType: "single_select", required: true, options: ["API", "Web"], appliesToKeys: ["change_request"], displayOrder: 0 },
  ],
};

function renderAdmin(canManage = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ProjectSchemaAdmin projectId="project-1" canManage={canManage} />
    </QueryClientProvider>,
  );
}

describe("ProjectSchemaAdmin", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    vi.mocked(api).mockImplementation(async (path) => (path === "/projects/project-1/work-item-schema" ? schema : { ok: true }));
  });

  it("lists types and fields with their configuration", async () => {
    renderAdmin();

    expect(await screen.findByTestId("schema-type-change_request")).toBeInTheDocument();
    expect(screen.getByTestId("schema-type-task")).toHaveTextContent("Task");
    const field = screen.getByTestId("schema-field-impact_area");
    expect(field).toHaveTextContent("Impact area");
    expect(field).toHaveTextContent("API, Web");
    expect(field).toHaveTextContent("change_request");
  });

  it("hides archive controls for built-in types", async () => {
    renderAdmin();

    expect(await screen.findByTestId("archive-type-change_request")).toBeInTheDocument();
    expect(screen.queryByTestId("archive-type-task")).not.toBeInTheDocument();
  });

  it("creates a custom type with the selected base behaviour", async () => {
    renderAdmin();
    await screen.findByTestId("schema-type-task");

    fireEvent.change(screen.getByTestId("new-type-name"), { target: { value: "Spike" } });
    fireEvent.change(screen.getByTestId("new-type-base"), { target: { value: "story" } });
    fireEvent.click(screen.getByTestId("submit-new-type"));

    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith("/projects/project-1/work-item-types", {
        method: "POST",
        body: JSON.stringify({ name: "Spike", baseType: "story" }),
      }),
    );
  });

  it("sends options and type scoping when creating a select field", async () => {
    renderAdmin();
    await screen.findByTestId("schema-type-task");

    fireEvent.change(screen.getByTestId("new-field-label"), { target: { value: "Rollout wave" } });
    fireEvent.change(screen.getByTestId("new-field-type"), { target: { value: "single_select" } });
    fireEvent.click(screen.getByTestId("new-field-required"));
    fireEvent.change(screen.getByTestId("new-field-options"), { target: { value: "Wave 1\n Wave 2 \n\n" } });
    fireEvent.click(screen.getByTestId("applies-to-change_request"));
    fireEvent.click(screen.getByTestId("submit-new-field"));

    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith("/projects/project-1/work-item-fields", {
        method: "POST",
        body: JSON.stringify({
          label: "Rollout wave",
          fieldType: "single_select",
          required: true,
          options: ["Wave 1", "Wave 2"],
          appliesToKeys: ["change_request"],
        }),
      }),
    );
  });

  it("renders read-only for members without project management rights", async () => {
    renderAdmin(false);

    expect(await screen.findByTestId("schema-type-change_request")).toBeInTheDocument();
    expect(screen.queryByTestId("new-type-name")).not.toBeInTheDocument();
    expect(screen.queryByTestId("new-field-label")).not.toBeInTheDocument();
    expect(screen.queryByTestId("archive-field-impact_area")).not.toBeInTheDocument();
  });
});
