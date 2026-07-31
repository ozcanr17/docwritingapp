import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import i18n from "../lib/i18n";
import { ProjectPlanningAdmin } from "./ProjectPlanningAdmin";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return { ...actual, api: vi.fn() };
});

const release = {
  id: "release-1",
  projectId: "project",
  name: "1.0",
  description: null,
  status: "planned",
  releaseDate: "2026-09-01T00:00:00.000Z",
  workItemCount: 4,
  completedCount: 1,
};

const iteration = {
  id: "iteration-1",
  projectId: "project",
  name: "Sprint 1",
  goal: null,
  status: "active",
  startDate: "2026-08-01T00:00:00.000Z",
  endDate: "2026-08-14T00:00:00.000Z",
  workItemCount: 2,
  completedCount: 2,
};

function renderAdmin(canManage: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ProjectPlanningAdmin projectId="project" canManage={canManage} /></QueryClientProvider>);
}

describe("ProjectPlanningAdmin", () => {
  beforeEach(() => vi.mocked(api).mockReset());

  it("lists releases and iterations with their progress", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/projects/project/releases") return [release];
      if (path === "/projects/project/iterations") return [iteration];
      return [];
    });
    renderAdmin(true);

    expect(await screen.findByTestId("release-row-release-1")).toHaveTextContent("1.0");
    expect(screen.getByTestId("release-row-release-1")).toHaveTextContent("1 / 4");
    expect(screen.getByTestId("iteration-row-iteration-1")).toHaveTextContent("Sprint 1");
    expect(screen.getByTestId("iteration-row-iteration-1")).toHaveTextContent("2 / 2");
  });

  it("creates an iteration with its date range", async () => {
    let created: Record<string, unknown> | null = null;
    vi.mocked(api).mockImplementation(async (path, options) => {
      if (path === "/projects/project/iterations" && options?.method === "POST") {
        created = JSON.parse(String(options.body)) as Record<string, unknown>;
        return iteration;
      }
      if (path === "/projects/project/releases") return [release];
      if (path === "/projects/project/iterations") return [];
      return [];
    });
    renderAdmin(true);

    fireEvent.change(await screen.findByTestId("iteration-name"), { target: { value: "Sprint 2" } });
    fireEvent.change(screen.getByTestId("iteration-start"), { target: { value: "2026-08-15" } });
    fireEvent.change(screen.getByTestId("iteration-end"), { target: { value: "2026-08-28" } });
    fireEvent.click(screen.getByTestId("create-iteration"));

    await waitFor(() => expect(created).not.toBeNull());
    expect(created).toEqual({ name: "Sprint 2", startDate: "2026-08-15", endDate: "2026-08-28" });
  });

  it("hides every mutation control from a member who cannot manage the project", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/projects/project/releases") return [release];
      if (path === "/projects/project/iterations") return [iteration];
      return [];
    });
    renderAdmin(false);

    expect(await screen.findByTestId("release-row-release-1")).toHaveTextContent(i18n.t("planning.releaseStatuses.planned"));
    expect(screen.queryByTestId("create-release")).toBeNull();
    expect(screen.queryByTestId("create-iteration")).toBeNull();
    expect(screen.queryByTestId("archive-release-release-1")).toBeNull();
    expect(screen.queryByTestId("archive-iteration-iteration-1")).toBeNull();
  });
});
