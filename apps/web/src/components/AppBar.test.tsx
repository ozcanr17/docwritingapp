import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import i18n from "../lib/i18n";
import { AppBar } from "./AppBar";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return { ...actual, api: vi.fn(async () => []) };
});

function renderBar(overrides: Partial<React.ComponentProps<typeof AppBar>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props: React.ComponentProps<typeof AppBar> = {
    title: "Documents",
    workspaceId: "workspace-1",
    onOpenSearch: vi.fn(),
    onCloseSearch: vi.fn(),
    searchQuery: "",
    onSearchQueryChange: vi.fn(),
    searchOpen: false,
    onDocumentCreated: vi.fn(),
    onCreateWorkItem: vi.fn(),
    ...overrides,
  };
  render(
    <QueryClientProvider client={client}>
      <AppBar {...props} />
    </QueryClientProvider>,
  );
  return props;
}

describe("AppBar", () => {
  it("names the current area and workspace as the page identity", () => {
    renderBar({ title: "Documents", subtitle: "Main Workspace" });
    expect(screen.getByRole("heading", { name: "Documents" })).toBeInTheDocument();
    expect(screen.getByText("Main Workspace")).toBeInTheDocument();
  });

  it("opens workspace search on focus and reports typed queries", () => {
    const props = renderBar();
    fireEvent.focus(screen.getByTestId("global-search-input"));
    expect(props.onOpenSearch).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByTestId("global-search-input"), { target: { value: "REQ-42" } });
    expect(props.onSearchQueryChange).toHaveBeenCalledWith("REQ-42");
  });

  it("offers document creation and work item creation under global create", () => {
    const props = renderBar();
    fireEvent.click(screen.getByTestId("global-create"));
    expect(screen.getByTestId("menuitem-create-requirement-document")).toBeInTheDocument();
    expect(screen.getByTestId("menuitem-create-test-document")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("menuitem-create-work-item"));
    expect(props.onCreateWorkItem).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId("global-create"));
    fireEvent.click(screen.getByTestId("menuitem-create-requirement-document"));
    expect(screen.getByTestId("create-document-dialog")).toBeInTheDocument();
    expect(screen.getByText(i18n.t("newRequirementDocument"))).toBeInTheDocument();
  });

  it("exposes onboarding, checklist and feedback through the help menu", () => {
    const props = renderBar({ onOpenPilotChecklist: vi.fn() });
    fireEvent.click(screen.getByTestId("appbar-help"));
    fireEvent.click(screen.getByTestId("menuitem-pilot-checklist"));
    expect(props.onOpenPilotChecklist).toHaveBeenCalledOnce();
  });

  it("offers a direct theme toggle", () => {
    renderBar();
    expect(screen.getByTestId("toggle-theme")).toBeInTheDocument();
  });
});
