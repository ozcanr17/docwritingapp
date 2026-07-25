import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import i18n from "../lib/i18n";
import { AppBar } from "./AppBar";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return { ...actual, api: vi.fn(async () => []) };
});

const profile = { id: "user-1", displayName: "Ada Lovelace", email: "ada@example.com" };

function renderBar(overrides: Partial<React.ComponentProps<typeof AppBar>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props: React.ComponentProps<typeof AppBar> = {
    workspaceId: "workspace-1",
    profile,
    onOpenSearch: vi.fn(),
    onCloseSearch: vi.fn(),
    searchQuery: "",
    onSearchQueryChange: vi.fn(),
    searchOpen: false,
    onOpenProfile: vi.fn(),
    onOpenSettings: vi.fn(),
    onLogout: vi.fn(),
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
  it("keeps global search geometrically centered and opens it on focus", () => {
    const props = renderBar();
    expect(screen.getByTestId("global-search-trigger")).toHaveClass("left-1/2", "-translate-x-1/2");
    fireEvent.focus(screen.getByTestId("global-search-input"));
    expect(props.onOpenSearch).toHaveBeenCalledOnce();
  });

  it("shows the organization and workspace context", () => {
    renderBar({ organizationName: "DocSys Demo", workspaceName: "Main Workspace" });
    expect(screen.getByText("DocSys Demo")).toBeInTheDocument();
    expect(screen.getByText("Main Workspace")).toBeInTheDocument();
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
    const props = renderBar({ onOpenOnboarding: vi.fn(), onOpenPilotChecklist: vi.fn(), onOpenFeedback: vi.fn() });
    fireEvent.click(screen.getByTestId("appbar-help"));
    fireEvent.click(screen.getByTestId("menuitem-pilot-checklist"));
    expect(props.onOpenPilotChecklist).toHaveBeenCalledOnce();
  });

  it("opens profile and signs out from the account menu", () => {
    const props = renderBar();
    fireEvent.click(screen.getByTestId("open-profile"));
    fireEvent.click(screen.getByTestId("menuitem-profile"));
    expect(props.onOpenProfile).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId("open-profile"));
    fireEvent.click(screen.getByTestId("menuitem-logout"));
    expect(props.onLogout).toHaveBeenCalledOnce();
  });

  it("writes the workspace query directly in the top search field", () => {
    const props = renderBar();
    fireEvent.change(screen.getByTestId("global-search-input"), { target: { value: "REQ-42" } });
    expect(props.onSearchQueryChange).toHaveBeenCalledWith("REQ-42");
  });
});
