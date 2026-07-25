import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import i18n from "../lib/i18n";
import { AppSidebar } from "./AppSidebar";

function renderSidebar(overrides: Partial<React.ComponentProps<typeof AppSidebar>> = {}) {
  const props: React.ComponentProps<typeof AppSidebar> = {
    view: "documents",
    collapsed: false,
    collapseDisabled: false,
    width: 288,
    canManage: true,
    profile: { displayName: "Ada Lovelace", email: "ada@example.com", isAdmin: true },
    onNavigate: vi.fn(),
    onToggleCollapse: vi.fn(),
    onOpenProfile: vi.fn(),
    onLogout: vi.fn(),
    ...overrides,
  };
  render(<AppSidebar {...props} />);
  return props;
}

describe("AppSidebar", () => {
  it("marks the active area and navigates between areas", () => {
    const props = renderSidebar({ view: "work" });
    expect(screen.getByTestId("nav-work")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("nav-documents")).not.toHaveAttribute("aria-current");
    fireEvent.click(screen.getByTestId("nav-documents"));
    expect(props.onNavigate).toHaveBeenCalledWith("documents");
  });

  it("hides administration from members who cannot manage the organization", () => {
    renderSidebar({ canManage: false });
    expect(screen.queryByTestId("nav-admin")).not.toBeInTheDocument();
    expect(screen.getByTestId("nav-settings")).toBeInTheDocument();
  });

  it("opens profile and signs out from the account card menu", () => {
    const props = renderSidebar();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText(i18n.t("administratorBadge"))).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("open-profile"));
    fireEvent.click(screen.getByTestId("menuitem-profile"));
    expect(props.onOpenProfile).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId("open-profile"));
    fireEvent.click(screen.getByTestId("menuitem-logout"));
    expect(props.onLogout).toHaveBeenCalledOnce();
  });

  it("keeps every area reachable with accessible names when collapsed", () => {
    renderSidebar({ collapsed: true });
    expect(screen.getByRole("button", { name: i18n.t("documents") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: i18n.t("trash") })).toBeInTheDocument();
    expect(screen.getByTestId("toggle-sidebar")).toBeInTheDocument();
  });

  it("renders the contextual section only when expanded", () => {
    renderSidebar({ context: <div data-testid="context-slot" />, contextLabel: "Explorer" });
    expect(screen.getByTestId("context-slot")).toBeInTheDocument();
    expect(screen.getByText("Explorer")).toBeInTheDocument();
  });
});
